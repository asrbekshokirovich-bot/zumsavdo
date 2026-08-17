import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Chart } from "@/components/Chart";
import { PeriodPicker } from "@/components/PeriodPicker";
import { SearchPanel } from "@/components/SearchPanel";
import { BasisPicker, resolveBasis } from "@/components/BasisPicker";
import { MetricCard, Panel, PlaceholderRows } from "@/components/ui";
import {
  MARKET_SERIES,
  type MarketSeries,
  RANK_BASES,
  type RankBasis,
  categoriesRanked,
  marketDaily,
  marketSummary,
  shopsRanked,
} from "@/data/api";
import { formatInt, formatMoney, orDash } from "@/lib/format";
import { usePeriod } from "@/lib/usePeriod";

export function HomePage() {
  const [period, setPeriod] = usePeriod();
  const summary = marketSummary(period);

  // Qaysi asosda maʻlumot bor. Buyurtma birinchi kuni boʻsh boʻladi, shuning
  // uchun tanlov qoʻlda emas — mavjudi oʻzi tanlanadi.
  const available = useMemo(() => {
    const set = new Set<RankBasis>();
    for (const b of RANK_BASES) {
      if (shopsRanked(period, b.id).some((r) => r.value !== null)) set.add(b.id);
    }
    return set;
  }, [period]);

  const [chosen, setChosen] = useState<RankBasis | null>(null);
  const basis = resolveBasis(RANK_BASES, available, chosen);
  const label = RANK_BASES.find((b) => b.id === basis)!;

  const topShops = shopsRanked(period, basis).slice(0, 5);
  const topCategories = categoriesRanked(period, basis).slice(0, 5);

  // Kunlik grafik alohida tanlovga ega: vaqt qatori uchun maʻnoli oʻlchovlar
  // roʻyxatnikidan farq qiladi (masalan "xaridor / hafta" bu yerda yaramaydi).
  const seriesAvailable = useMemo(() => {
    const set = new Set<MarketSeries>();
    for (const m of MARKET_SERIES) {
      if (marketDaily(period, m.id).some((p) => p.value !== null)) set.add(m.id);
    }
    return set;
  }, [period]);

  const [chosenSeries, setChosenSeries] = useState<MarketSeries | null>(null);
  const series = resolveBasis(MARKET_SERIES, seriesAvailable, chosenSeries);
  const seriesLabel = MARKET_SERIES.find((m) => m.id === series)!;
  const dailyPoints = marketDaily(period, series);

  return (
    <>
      <div className="page-head">
        <h1>Bozor</h1>
        <div className="subline">
          Uzum boʻyicha kuzatilayotgan sotuvchilar yigʻindisi · {period.label}
        </div>
      </div>

      <PeriodPicker period={period} onChange={setPeriod} />

      <div className="metrics">
        <MetricCard label="Buyurtmalar" metric={summary.orders} />
        <MetricCard
          label="Aylanma"
          metric={summary.revenue}
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
          value={series}
          onChange={setChosenSeries}
          available={seriesAvailable}
        />
        <Chart
          series={[{ key: series, label: seriesLabel.label, points: dailyPoints }]}
          height={190}
          format={formatInt}
        />
        <p className="note-inline">
          {series === "feedbacks" && (
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
        <Panel title="Top sotuvchilar" hint={`${label.label} boʻyicha`}>
          <BasisPicker
            options={RANK_BASES}
            value={basis}
            onChange={setChosen}
            available={available}
          />
          <div className="rows">
            {topShops.length === 0 && <PlaceholderRows count={5} />}
            {topShops.map((row, i) => (
              <Link className="row-link" to={`/sotuvchi/${row.shop.id}`} key={row.shop.id}>
                <span className="n">{i + 1}</span>
                <span>
                  <span className="name">{row.shop.name}</span>
                  <span className="ctx" style={{ display: "block" }}>
                    {row.categoryName}
                    {row.shop.official ? " · rasmiy doʻkon" : ""}
                  </span>
                </span>
                <span className="figures">
                  {orDash(row.value, formatInt)}
                  <span className="sub">
                    {row.value === null
                      ? " oʻlchov yoʻq"
                      : basis === "orders"
                        ? ` ta · ~${formatMoney(row.revenue ?? 0)}`
                        : ` ${label.unit}`}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="Top turkumlar" hint={`${label.label} boʻyicha`}>
          <div className="rows">
            {topCategories.length === 0 && <PlaceholderRows count={5} />}
            {topCategories.map((row, i) => (
              <Link className="row-link" to={`/turkum/${row.category.id}`} key={row.category.id}>
                <span className="n">{i + 1}</span>
                <span>
                  <span className="name">{row.category.name}</span>
                  <span className="ctx" style={{ display: "block" }}>
                    {row.shopCount} sotuvchi kuzatilyapti
                  </span>
                </span>
                <span className="figures">
                  {orDash(row.value, formatInt)}
                  <span className="sub">
                    {row.value === null
                      ? " oʻlchov yoʻq"
                      : basis === "orders"
                        ? ` ta · ~${formatMoney(row.revenue ?? 0)}`
                        : ` ${label.unit}`}
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
