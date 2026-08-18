import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Chart } from "@/components/Chart";
import { PeriodPicker } from "@/components/PeriodPicker";
import { SearchPanel } from "@/components/SearchPanel";
import { BasisPicker, resolveBasis } from "@/components/BasisPicker";
import { MetricCard, Panel, PlaceholderRows } from "@/components/ui";
import { MARKET_SERIES, type MarketSeries, RANK_BASES, type RankBasis } from "@/data/api";
import { type MarketSummaryRow, type RankRow, fetchPanelOverview } from "@/data/remote";
import { useDataVersion } from "@/data/refresh";
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
  rankAvailable: Set<RankBasis>;
  seriesAvailable: Set<MarketSeries>;
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
          daily: o.daily.map((r) => ({ date: r.date, value: r.value })),
          shops: o.shops,
          categories: o.categories,
          rankAvailable: availableSet(RANK_BASES, o.rank_available),
          seriesAvailable: availableSet(MARKET_SERIES, o.series_available),
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

      <div className="grid-2">
        <Panel title="Top sotuvchilar" hint={`${basisLabel.label} boʻyicha`}>
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

        <Panel title="Top turkumlar" hint={`${basisLabel.label} boʻyicha`}>
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
