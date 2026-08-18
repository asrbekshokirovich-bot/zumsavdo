import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PeriodPicker } from "@/components/PeriodPicker";
import { BasisPicker, resolveBasis } from "@/components/BasisPicker";
import { Crumb, Panel, PlaceholderRows } from "@/components/ui";
import { RANK_BASES, type RankBasis } from "@/data/api";
import { type RankKind, type RankPage, fetchRankPage } from "@/data/remote";
import { useDataVersion } from "@/data/refresh";
import { formatInt, formatMoney, orDash } from "@/lib/format";
import { usePeriod } from "@/lib/usePeriod";

/**
 * Toʻliq roʻyxat — "top 5" dan tashqarisi.
 *
 * Bosh sahifada beshta doʻkon va beshta turkum koʻrinardi, qolganiga esa
 * hech qanday yoʻl yoʻq edi. Oʻlchangan 76 doʻkonning 71 tasi bazada turib
 * ekranga umuman chiqmasdi va bu "boshqa doʻkon yoʻq" boʻlib oʻqilardi.
 *
 * Sahifalash bazada bajariladi: roʻyxat kuzatuv kengaygani sari oʻsadi va
 * uni butunlay brauzerga tashlash mumkin emas.
 */

const PER_PAGE = 50;

/** Mahsulotni doʻkon boʻyicha saralab boʻlmaydi — buyurtma doʻkon oʻlchovi. */
const PRODUCT_BASES = RANK_BASES.filter((b) => b.id !== "orders");

const KINDS: Record<RankKind, { title: string; unit: string; note: string }> = {
  shop: {
    title: "Sotuvchilar",
    unit: "sotuvchi",
    note: "Buyurtma soni Shop.ordersQuantity hisoblagichining kunlik farqi — aniq raqam.",
  },
  category: {
    title: "Turkumlar",
    unit: "turkum",
    note: "Turkum raqami — ichidagi kuzatilayotgan sotuvchilar yigʻindisi.",
  },
  product: {
    title: "Mahsulotlar",
    unit: "mahsulot",
    note:
      "Sotilgan dona qoldiq kamayishidan hisoblanadi — taxminiy. Tovar oraliqda " +
      "keltirilsa sotuvning bir qismi koʻrinmay qoladi.",
  },
};

export function RankingPage() {
  const { kind: raw } = useParams();
  const kind = (raw === "turkum" ? "category" : raw === "mahsulot" ? "product" : "shop") as RankKind;
  const meta = KINDS[kind];
  const options = kind === "product" ? PRODUCT_BASES : RANK_BASES;

  const [period, setPeriod] = usePeriod();
  const [params, setParams] = useSearchParams();
  const [chosen, setChosen] = useState<RankBasis | null>(null);
  const [page, setPage] = useState<RankPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useDataVersion();

  const offset = Math.max(0, Number(params.get("dan") ?? 0) || 0);
  const basis = resolveBasis(options, new Set(options.map((o) => o.id)), chosen);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchRankPage(kind, period.from, period.to, basis, PER_PAGE, offset)
      .then((p) => !cancelled && setPage(p))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [kind, period.from, period.to, basis, offset, version]);

  // Turi yoki davri almashsa birinchi sahifadan boshlanadi — aks holda
  // foydalanuvchi boʻsh sahifaga tushib "maʻlumot yoʻq" deb oʻylardi.
  //
  // Birinchi chizishda bajarilmaydi: `?dan=50` bilan ochilgan havola darhol
  // birinchi sahifaga otib yuborilardi va "orqaga" tugmasi ishlamasdi.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setParams({}, { replace: true });
  }, [kind, period.from, period.to, basis]);

  const basisLabel = options.find((o) => o.id === basis)!;
  const shown = page?.rows.length ?? 0;
  const hasNext = page ? offset + shown < page.total : false;

  const go = (to: number) => setParams(to > 0 ? { dan: String(to) } : {});

  return (
    <>
      <Crumb items={[{ label: "Bozor", to: "/" }, { label: meta.title }]} />

      <div className="page-head">
        <h1>{meta.title}</h1>
        <div className="subline">
          {page
            ? `${formatInt(page.total)} ta ${meta.unit} · shundan ${formatInt(page.measured)} tasida raqam bor · ${period.label}`
            : `${period.label}`}
        </div>
      </div>

      <PeriodPicker period={period} onChange={setPeriod} />

      {error && (
        <div className="callout warn" style={{ marginBottom: 12 }}>
          Roʻyxat olinmadi: {error}
        </div>
      )}

      <Panel title={`${basisLabel.label} boʻyicha`} hint={meta.note}>
        <BasisPicker
          options={options}
          value={basis}
          onChange={setChosen}
          available={new Set(options.map((o) => o.id))}
        />

        <div className="rows">
          {!page && <PlaceholderRows count={10} />}
          {page?.rows.map((row, i) => {
            const id = kind === "product" ? row.product_id : kind === "category" ? row.category_id : row.shop_id;
            const to =
              kind === "product"
                ? `/mahsulot/${id}`
                : kind === "category"
                  ? `/turkum/${id}`
                  : `/sotuvchi/${id}`;
            const name = kind === "product" ? row.title : kind === "category" ? row.category_name : row.shop_name;
            const context =
              kind === "product"
                ? [row.shop_name, row.category_name].filter(Boolean).join(" · ")
                : kind === "category"
                  ? `${row.shop_count} sotuvchi kuzatilyapti`
                  : [row.category_name, row.official ? "rasmiy doʻkon" : null].filter(Boolean).join(" · ");

            return (
              <Link className="row-link" to={to} key={`${id}-${i}`}>
                <span className="n">{offset + i + 1}</span>
                <span>
                  <span className="name">{name}</span>
                  <span className="ctx" style={{ display: "block" }}>{context}</span>
                </span>
                <span className="figures">
                  {orDash(row.value, formatInt)}
                  <span className="sub">
                    {row.value === null
                      ? " oʻlchov yoʻq"
                      : row.revenue != null
                        ? ` ${basisLabel.unit} · ~${formatMoney(row.revenue)}`
                        : ` ${basisLabel.unit}`}
                  </span>
                </span>
              </Link>
            );
          })}
          {page && !page.rows.length && (
            <p className="note-inline">Bu davrda bu roʻyxat boʻsh — oʻlchov yigʻilmagan.</p>
          )}
        </div>

        {page && page.total > PER_PAGE && (
          <div className="pager">
            <button type="button" disabled={offset === 0} onClick={() => go(Math.max(0, offset - PER_PAGE))}>
              ← Oldingi
            </button>
            <span className="pager-at">
              {formatInt(offset + 1)}–{formatInt(offset + shown)} / {formatInt(page.total)}
            </span>
            <button type="button" disabled={!hasNext} onClick={() => go(offset + PER_PAGE)}>
              Keyingi →
            </button>
          </div>
        )}
      </Panel>
    </>
  );
}
