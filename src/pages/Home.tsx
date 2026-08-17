import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Chart } from "@/components/Chart";
import { PeriodPicker } from "@/components/PeriodPicker";
import { SearchPanel } from "@/components/SearchPanel";
import { BasisPicker } from "@/components/BasisPicker";
import { MetricCard, Panel, PlaceholderRows } from "@/components/ui";
import {
  RANK_BASES,
  type RankBasis,
  categoriesRanked,
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
  const basis: RankBasis =
    chosen && available.has(chosen)
      ? chosen
      : (RANK_BASES.find((b) => available.has(b.id))?.id ?? "orders");
  const label = RANK_BASES.find((b) => b.id === basis)!;

  const topShops = shopsRanked(period, basis).slice(0, 5);
  const topCategories = categoriesRanked(period, basis).slice(0, 5);

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

      <Panel title="Kunlik grafik" hint={`Butun bozor · ${period.label}`}>
        <Chart
          series={[{ key: "orders", label: "Buyurtmalar", points: summary.daily }]}
          height={190}
          format={formatInt}
        />
      </Panel>

      <div className="grid-2">
        <Panel title="Top sotuvchilar" hint={`${label.label} boʻyicha`}>
          <BasisPicker basis={basis} onChange={setChosen} available={available} />
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
