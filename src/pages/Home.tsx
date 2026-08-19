import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Chart } from "@/components/Chart";
import { PeriodPicker } from "@/components/PeriodPicker";
import { SearchPanel } from "@/components/SearchPanel";
import { BasisPicker, resolveBasis } from "@/components/BasisPicker";
import { GrowthPanel } from "@/components/GrowthPanel";
import { MetricCard, Panel, PlaceholderRows } from "@/components/ui";
import { MARKET_SERIES, type MarketSeries, RANK_BASES, type RankBasis } from "@/data/api";
import { type MarketSummaryRow, type RankRow, fetchPanelOverview } from "@/data/remote";
import { useDataVersion } from "@/data/refresh";
import { useScope } from "@/data/scope";
import { formatDayMonth } from "@/lib/dates";
import { formatInt, formatMoney, orDash } from "@/lib/format";
import { usePeriod } from "@/lib/usePeriod";
import type { Period } from "@/lib/period";
import type { SeriesPoint } from "@/data/types";

/**
 * Bozor sahifasi.
 *
 * Bu yerda hech narsa hisoblanmaydi. Yigʻindi, aylanma va reytinglar bazada
 * hisoblanadi va tayyor holda olinadi. Ilgari panel qatorlarni oʻqib
 * brauzerda qoʻshardi — bir xil raqam ikki joyda hisoblansa, ikki xil
 * chiqishi mumkin va qaysi biri toʻgʻri ekanini aytib boʻlmaydi.
 */

interface MarketData {
  summary: MarketSummaryRow;
  daily: SeriesPoint[];
  shops: RankRow[];
  categories: RankRow[];
  products: RankRow[];
  rankAvailable: Set<RankBasis>;
  seriesAvailable: Set<MarketSeries>;
  totals: { shops: number; categories: number; products: number };
}

/** `{orders: true, units: false}` → `Set(["orders"])`. */
function availableSet<T extends string>(
  options: readonly { id: T }[],
  flags: Record<string, boolean>,
): Set<T> {
  return new Set(options.filter((o) => flags[o.id]).map((o) => o.id));
}

/**
 * Yigʻindilarni bazadan oladi — **bitta** soʻrovda.
 *
 * Ilgari bu yerda 10 ta parallel soʻrov bor edi: toʻrttasi koʻrsatiladigan
 * raqamlar uchun, oltitasi esa "qaysi tugma yonsin" degan savol uchun.
 * Oxirgi oltitasi butun reytingni hisoblatib, javobidan faqat "boʻsh emasmi"
 * degan bitta bitni olardi.
 *
 * Bu portlash panelni buzardi: brauzer bir vaqtda kelgan soʻrovlarning bir
 * qismini serverga yubormasdan tashlab yuborardi va ekranda
 * `TypeError: Failed to fetch` chiqardi. Endi soʻrov bitta va tashlanadigan
 * narsaning oʻzi yoʻq.
 */
function useMarket(period: Period, basis: RankBasis, series: MarketSeries, version: number) {
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const o = await fetchPanelOverview(period.from, period.to, basis, series, 5);
        if (cancelled) return;
        setData({
          summary: o.summary,
          daily: o.daily.map((r) => ({
            date: r.date,
            value: r.value,
            contributors: r.contributors,
            watched: r.watched,
            hours: r.hours,
          })),
          shops: o.shops,
          categories: o.categories,
          products: o.products,
          rankAvailable: availableSet(RANK_BASES, o.rank_available),
          seriesAvailable: availableSet(MARKET_SERIES, o.series_available),
          totals: o.totals,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [period.from, period.to, basis, series, version]);

  return { data, error };
}

/**
 * Qoʻshni kunlar solishtirsa boʻladigan holdami — shuni tekshiradi.
 *
 * Ikki xil buzilish bor va ikkalasi ham grafikni yolgʻon qiladi.
 *
 * **Oyna uzunligi.** Buyurtma hisoblagichning ikki oʻlchov orasidagi farqi,
 * shuning uchun u oynaga toʻgʻridan-toʻgʻri bogʻliq. Aynan shu holat
 * kuzatildi: 18-avgust 4 779 (oyna 10,4 soat), 19-avgust 8 547 (oyna
 * 27,8 soat). Grafikda bu "sotuv ikki barobar oshdi" boʻlib koʻrinadi,
 * soatiga esa 460 dan 307 ga **tushgan**. Sotuvchilar toʻplami esa deyarli
 * bir xil — yaʻni qamrovga qarab bu xatoni topib boʻlmasdi.
 *
 * **Toʻplam.** Ikki kunda butunlay boshqa obyektlar oʻlchangan boʻlsa,
 * ularning yigʻindisini solishtirish maʻnosiz.
 *
 * Chegara 20%: kundan kunga kichik tebranish odatiy va har safar
 * ogohlantirish chiqaversa, u oʻqilmay qoladi.
 */
function comparabilityWarning(points: SeriesPoint[]): string | null {
  const measured = points.filter((p) => p.value !== null);
  if (measured.length < 2) return null;

  for (let i = 1; i < measured.length; i++) {
    const prev = measured[i - 1];
    const now = measured[i];

    const a = prev.hours;
    const b = now.hours;
    if (typeof a === "number" && typeof b === "number" && a > 0 && b > 0) {
      if (Math.abs(b - a) / a >= 0.2) {
        return (
          `Oynalar teng emas: ${formatDayMonth(prev.date)} — ${a} soat, ` +
          `${formatDayMonth(now.date)} — ${b} soat. Buyurtma ikki oʻlchov ` +
          `farqidan chiqadi, shuning uchun uzunroq oyna kattaroq raqam beradi. ` +
          `Soatiga: ${formatInt(Math.round((prev.value as number) / a))} va ` +
          `${formatInt(Math.round((now.value as number) / b))}.`
        );
      }
    }

    const pc = prev.contributors;
    const nc = now.contributors;
    if (typeof pc === "number" && typeof nc === "number" && pc > 0) {
      if (Math.abs(nc - pc) / pc >= 0.2) {
        return (
          `Qatorlar bir xil toʻplam emas: ${formatDayMonth(prev.date)} da ` +
          `${formatInt(pc)} obyekt, ${formatDayMonth(now.date)} da ${formatInt(nc)}. ` +
          `Oʻzgarish bozornikimi yoki qamrovnikimi — ayirib boʻlmaydi.`
        );
      }
    }
  }
  return null;
}

/** Izohlar bazadan kelgan qamrov raqamlaridan yigʻiladi. */
function summaryNote(s: MarketSummaryRow, period: Period): string | undefined {
  const notes: string[] = [];
  if (period.id === "today" && s.sweeps != null) {
    notes.push(`${s.sweeps}/${s.sweeps_expected ?? s.sweeps} oʻlchov tushgan`);
  }
  if (s.shop_days_missing > 0) {
    notes.push(`${s.shop_days_missing} sotuvchi-kun uchun oʻlchov yetmagan`);
  }
  // Oraliq 24 soatga yaqin boʻlsa aytilmaydi — kutilgan holat shu.
  const min = s.window_min_hours;
  const max = s.window_max_hours;
  if (min != null && max != null && !(min >= 22 && max <= 26)) {
    notes.push(`oraliq ${min === max ? min : `${min}–${max}`} soat, bir kun emas`);
  }
  return notes.join(" · ") || undefined;
}

export function HomePage() {
  const [period, setPeriod] = usePeriod();
  const [chosenBasis, setChosenBasis] = useState<RankBasis | null>(null);
  const [chosenSeries, setChosenSeries] = useState<MarketSeries | null>(null);

  // Birinchi soʻrovda nima borligini bilmaymiz, shuning uchun standart bilan
  // boshlanadi va javob kelgach mavjudiga oʻtiladi.
  const basis = resolveBasis(RANK_BASES, new Set(RANK_BASES.map((b) => b.id)), chosenBasis);
  const series = resolveBasis(
    MARKET_SERIES,
    new Set(MARKET_SERIES.map((m) => m.id)),
    chosenSeries,
  );

  // Bosh sahifaga qator kerak emas — undagi har bir raqam bazada
  // hisoblanadi. Qamrov "status" ga qaytariladi, aks holda sotuvchi
  // sahifasidan qaytgach avtomatik yangilanish oʻsha sotuvchini tortaverardi.
  useScope({ kind: "status" });
  const { data, error } = useMarket(period, basis, series, useDataVersion());

  const effectiveBasis = data ? resolveBasis(RANK_BASES, data.rankAvailable, chosenBasis) : basis;
  const effectiveSeries = data
    ? resolveBasis(MARKET_SERIES, data.seriesAvailable, chosenSeries)
    : series;

  // Mavjud boʻlmagan asos tanlangan boʻlsa — mavjudiga oʻtamiz.
  useEffect(() => {
    if (data && effectiveBasis !== basis) setChosenBasis(effectiveBasis);
  }, [data, effectiveBasis, basis]);
  useEffect(() => {
    if (data && effectiveSeries !== series) setChosenSeries(effectiveSeries);
  }, [data, effectiveSeries, series]);

  const basisLabel = RANK_BASES.find((b) => b.id === effectiveBasis)!;
  const seriesLabel = MARKET_SERIES.find((m) => m.id === effectiveSeries)!;

  return (
    <>
      <div className="page-head">
        <h1>Bozor</h1>
        <div className="subline">
          Uzum boʻyicha kuzatilayotgan sotuvchilar yigʻindisi · {period.label}
        </div>
      </div>

      <PeriodPicker period={period} onChange={setPeriod} />

      {error && (
        <div className="callout warn" style={{ marginBottom: 12 }}>
          Yigʻindi olinmadi: {error}
        </div>
      )}

      <div className="metrics">
        <MetricCard
          label="Buyurtmalar"
          metric={{
            value: data?.summary.orders ?? null,
            certainty: "exact",
            note: data ? summaryNote(data.summary, period) : undefined,
          }}
        />
        <MetricCard
          label="Aylanma"
          metric={{ value: data?.summary.revenue ?? null, certainty: "approx" }}
          format={formatMoney}
          small
          meta="Dona × narx — kartochkadagi narx boʻyicha hisoblangan."
        />
      </div>

      <SearchPanel />

      <Panel
        title="Kunlik grafik"
        hint={`Butun bozor · ${seriesLabel.label} · ${period.label}`}
      >
        <BasisPicker
          options={MARKET_SERIES}
          value={effectiveSeries}
          onChange={setChosenSeries}
          available={data?.seriesAvailable ?? new Set(MARKET_SERIES.map((m) => m.id))}
        />
        <Chart
          series={[
            { key: effectiveSeries, label: seriesLabel.label, points: data?.daily ?? [] },
          ]}
          height={190}
          format={formatInt}
        />
        {data && comparabilityWarning(data.daily) && (
          <p className="note-inline warn-inline">{comparabilityWarning(data.daily)}</p>
        )}
        {data?.daily.some((p) => p.watched != null && p.contributors != null
                                 && p.watched > p.contributors) && (
          <p className="note-inline">
            Kuzatilayotgan obyektlarning bir qismida raqam hali yoʻq: buyurtma
            ikki oʻlchov <b>farqidan</b> chiqadi, shuning uchun yangi
            qoʻshilganida u birinchi kuni boʻsh boʻladi va ikkinchi sweepdan
            keyin paydo boʻladi.
          </p>
        )}
        <p className="note-inline">
          {effectiveSeries === "feedbacks" && (
            <>
              Bu qator boshqalaridan uzoqroq orqaga boradi: sharh sanasi Uzumning
              oʻzidan keladi, shuning uchun u <b>oʻlchov boshlanishini kutmaydi</b>.
              Sharh — sotuvning oʻzi emas, uning izi: har xaridor sharh
              qoldirmaydi.{" "}
            </>
          )}
          Oxirgi nuqta har doim pastroq turadi — bugungi kun hali tugamagan,
          shuning uchun uni tushish deb oʻqish notoʻgʻri.
        </p>
      </Panel>

      <GrowthPanel period={period} />

      <Panel
        title="Eng koʻp sotilgan mahsulotlar"
        hint={effectiveBasis === "buyers" ? "Haftalik xaridor boʻyicha" : "Sotilgan dona boʻyicha"}
        action={
          <Link className="see-all" to="/royxat/mahsulot">
            hammasi{data ? ` (${formatInt(data.totals.products)})` : ""} →
          </Link>
        }
      >
        <div className="rows">
          {!data?.products.length && <PlaceholderRows count={5} />}
          {data?.products.map((row, i) => (
            <Link className="row-link" to={`/mahsulot/${row.product_id}`} key={row.product_id}>
              <span className="n">{i + 1}</span>
              <span>
                <span className="name">{row.title}</span>
                <span className="ctx" style={{ display: "block" }}>
                  {[row.shop_name, row.category_name].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="figures">
                {orDash(row.value, formatInt)}
                <span className="sub">
                  {row.value === null
                    ? " oʻlchov yoʻq"
                    : effectiveBasis === "buyers"
                      ? " xaridor / hafta"
                      : ` dona · ~${formatMoney(row.revenue ?? 0)}`}
                </span>
              </span>
            </Link>
          ))}
        </div>
        <p className="note-inline">
          Buyurtma <code>ordersQuantity</code> doʻkon oʻlchovi, shuning uchun
          mahsulot u boʻyicha saralanmaydi — bu roʻyxat qoldiq kamayishidan
          hisoblangan <b>taxminiy</b> dona boʻyicha.
        </p>
      </Panel>

      <div className="grid-2">
        <Panel
          title="Top sotuvchilar"
          hint={`${basisLabel.label} boʻyicha`}
          action={
            <Link className="see-all" to="/royxat/sotuvchi">
              hammasi{data ? ` (${formatInt(data.totals.shops)})` : ""} →
            </Link>
          }
        >
          <BasisPicker
            options={RANK_BASES}
            value={effectiveBasis}
            onChange={setChosenBasis}
            available={data?.rankAvailable ?? new Set(RANK_BASES.map((b) => b.id))}
          />
          <div className="rows">
            {!data?.shops.length && <PlaceholderRows count={5} />}
            {data?.shops.map((row, i) => (
              <Link className="row-link" to={`/sotuvchi/${row.shop_id}`} key={row.shop_id}>
                <span className="n">{i + 1}</span>
                <span>
                  <span className="name">{row.shop_name}</span>
                  <span className="ctx" style={{ display: "block" }}>
                    {row.category_name ?? ""}
                    {row.official ? " · rasmiy doʻkon" : ""}
                  </span>
                </span>
                <span className="figures">
                  {orDash(row.value, formatInt)}
                  <span className="sub">
                    {row.value === null
                      ? " oʻlchov yoʻq"
                      : effectiveBasis === "orders"
                        ? ` ta · ~${formatMoney(row.revenue ?? 0)}`
                        : ` ${basisLabel.unit}`}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel
          title="Top turkumlar"
          hint={`${basisLabel.label} boʻyicha`}
          action={
            <Link className="see-all" to="/royxat/turkum">
              hammasi{data ? ` (${formatInt(data.totals.categories)})` : ""} →
            </Link>
          }
        >
          <div className="rows">
            {!data?.categories.length && <PlaceholderRows count={5} />}
            {data?.categories.map((row, i) => (
              <Link className="row-link" to={`/turkum/${row.category_id}`} key={row.category_id}>
                <span className="n">{i + 1}</span>
                <span>
                  <span className="name">{row.category_name}</span>
                  <span className="ctx" style={{ display: "block" }}>
                    {row.shop_count} sotuvchi kuzatilyapti
                  </span>
                </span>
                <span className="figures">
                  {orDash(row.value, formatInt)}
                  <span className="sub">
                    {row.value === null
                      ? " oʻlchov yoʻq"
                      : effectiveBasis === "orders"
                        ? ` ta · ~${formatMoney(row.revenue ?? 0)}`
                        : ` ${basisLabel.unit}`}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
