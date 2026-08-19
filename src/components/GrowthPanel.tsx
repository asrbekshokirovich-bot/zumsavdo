import { useEffect, useState } from "react";
import { type Growth, fetchGrowth } from "@/data/remote";
import { useDataVersion } from "@/data/refresh";
import { formatDayMonth } from "@/lib/dates";
import { formatInt, orDash } from "@/lib/format";
import { Panel } from "@/components/ui";
import type { Period } from "@/lib/period";

/**
 * Kunlik oʻsish.
 *
 * Bu jadvalda uch xil ishonchlilikdagi raqam bor va ular aralashtirilmaydi:
 *
 * - **Sharh** — sanasi Uzumning oʻzidan keladi, shuning uchun orqaga qarab
 *   ham toʻgʻri. Lekin u faqat sharhi yigʻilgan mahsulotlar boʻyicha:
 *   bozorning hammasi emas, namunasi.
 * - **Yangi id** — Uzum id larni ketma-ket beradi, shuning uchun katalog
 *   chegarasining ikki kunlik farqi kuniga nechta mahsulot yaratilganini
 *   kuzatuvdan mustaqil koʻrsatadi. Bu eng ishonchli oʻsish raqami.
 * - **Mahsulot / Doʻkon** — bular faqat boshlangʻich sanadan keyin maʻnoli.
 *   Undan oldin ular "perepis nimani topdi" degani edi: crawler bir kunda
 *   630 743 mahsulot koʻrgan, Uzum ularni oʻsha kuni qoʻshgani yoʻq.
 *   Ishonchsiz kunga raqam emas, chiziqcha qoʻyiladi.
 */
export function GrowthPanel({ period }: { period: Period }) {
  const [data, setData] = useState<Growth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useDataVersion();

  useEffect(() => {
    let cancelled = false;
    fetchGrowth(period.from, period.to)
      .then((g) => !cancelled && setData(g))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [period.from, period.to, version]);

  const rows = [...(data?.rows ?? [])].reverse();

  return (
    <Panel title="Kunlik oʻsish" hint="Bozorga nima qoʻshilyapti">
      {error && <p className="note-inline">Oʻsish olinmadi: {error}</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Kun</th>
              <th className="num">Yangi id</th>
              <th className="num">Mahsulot</th>
              <th className="num">Doʻkon</th>
              <th className="num">Sharh</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={5} className="empty">
                  Bu davrda yozuv yoʻq.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.date}>
                <td>{formatDayMonth(r.date)}</td>
                <td className="num">{orDash(r.id_added, formatInt)}</td>
                <td className="num">{orDash(r.trusted ? r.new_products : null, formatInt)}</td>
                <td className="num">{orDash(r.trusted ? r.new_shops : null, formatInt)}</td>
                <td className="num">{orDash(r.new_feedbacks, formatInt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note-inline">
        <b>Yangi id</b> — Uzum bergan mahsulot id lari soni. Id lar ketma-ket
        beriladi, shuning uchun katalog chegarasining ikki kunlik farqi
        kuzatuvdan mustaqil. Ularning hammasi ham tirik mahsulot boʻlmaydi:
        oʻlchandi — id larning <b>~30%</b> i ochiladi.
        {data?.baseline && (
          <>
            {" "}
            <b>Mahsulot</b> va <b>Doʻkon</b> ustunlari{" "}
            {formatDayMonth(data.baseline)} dan keyingi kunlar uchun toʻldiriladi.
            Undan oldingi kunlarda ular perepis nimani topganini bildirardi —
            bozor oʻsishini emas — shuning uchun chiziqcha turadi.
          </>
        )}{" "}
        <b>Sharh</b> sanasi Uzumdan keladi, lekin faqat sharhi yigʻilgan
        mahsulotlar boʻyicha — bozorning namunasi, hammasi emas.
      </p>
    </Panel>
  );
}
