import { useEffect, useState } from "react";
import { type FrontierRate, type Growth, fetchFrontierRate, fetchGrowth } from "@/data/remote";
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
 *   chegarasining ikki **oʻlchangan** kun orasidagi farqi kuniga nechta
 *   mahsulot yaratilganini kuzatuvdan mustaqil koʻrsatadi.
 *
 *   Bu ustun ilgari perepis qayerga yetganidan hisoblanardi. Oʻtgan
 *   kunlarning hammasiga bitta xil qiymat yozilgani uchun ular orasidagi
 *   farq 0 chiqardi, birinchi haqiqiy oʻlchov kuni esa 938 430 — yaʻni
 *   crawlerning sakrashi bozor oʻsishi boʻlib koʻrinardi. Endi chegara
 *   faqat zonddan yoziladi va oʻlchanmagan kun boʻsh qoladi.
 * - **Mahsulot / Doʻkon** — bular faqat boshlangʻich sanadan keyin maʻnoli.
 *   Undan oldin ular "perepis nimani topdi" degani edi: crawler bir kunda
 *   630 743 mahsulot koʻrgan, Uzum ularni oʻsha kuni qoʻshgani yoʻq.
 *   Ishonchsiz kunga raqam emas, chiziqcha qoʻyiladi.
 */
export function GrowthPanel({ period }: { period: Period }) {
  const [data, setData] = useState<Growth | null>(null);
  const [rate, setRate] = useState<FrontierRate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useDataVersion();

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchGrowth(period.from, period.to), fetchFrontierRate()])
      .then(([g, r]) => {
        if (cancelled) return;
        setData(g);
        setRate(r);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [period.from, period.to, version]);

  const rows = [...(data?.rows ?? [])].reverse();

  return (
    <Panel title="Kunlik oʻsish" hint="Bozorga nima qoʻshilyapti">
      {error && <p className="note-inline">Oʻsish olinmadi: {error}</p>}

      {/*
        Tezlik jadvaldan alohida turadi: u kun chegarasiga bogʻlanmagan va
        ikki oʻlchov bir necha soat oraliqda boʻlsa oʻsha kuniyoq chiqadi.
      */}
      <p className="note-inline">
        {rate?.ids_per_day != null ? (
          <>
            Hozirgi tezlik: <b>kuniga ~{formatInt(rate.ids_per_day)} yangi id</b>
            {rate.hours != null && <> ({rate.hours} soatlik oraliqdan)</>}. Chegara{" "}
            <b>{formatInt(rate.frontier ?? 0)}</b>.
          </>
        ) : (
          <>
            Tezlik hali oʻlchanmagan
            {rate?.frontier != null && (
              <>
                {" "}— chegara <b>{formatInt(rate.frontier)}</b> deb oʻlchandi, lekin
                tezlik uchun <b>ikki</b> nuqta kerak
              </>
            )}
            . Kamida ikki soat oraliqdagi ikkinchi oʻlchovdan keyin chiqadi:{" "}
            <code>npm run frontier</code>.
          </>
        )}
      </p>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Kun</th>
              <th className="num">Chegara</th>
              <th className="num">Yangi id / kun</th>
              <th className="num">Mahsulot</th>
              <th className="num">Doʻkon</th>
              <th className="num">Sharh</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={6} className="empty">
                  Bu davrda yozuv yoʻq.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.date}>
                <td>{formatDayMonth(r.date)}</td>
                <td className="num">{orDash(r.id_frontier, formatInt)}</td>
                <td className="num">
                  {orDash(r.id_per_day, formatInt)}
                  {r.id_per_day !== null && r.gap_days !== null && r.gap_days > 1 && (
                    <span className="sub"> ({r.gap_days} kun oʻrtachasi)</span>
                  )}
                </td>
                <td className="num">{orDash(r.trusted ? r.new_products : null, formatInt)}</td>
                <td className="num">{orDash(r.trusted ? r.new_shops : null, formatInt)}</td>
                <td className="num">{orDash(r.new_feedbacks, formatInt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note-inline">
        <b>Chegara</b> — oʻsha kuni oʻlchangan eng katta tirik mahsulot id si.
        Faqat zond ishlagan kunda toʻladi. <b>Yangi id / kun</b> — ikki
        oʻlchov orasidagi farq, oradagi kunlarga boʻlingan; shuning uchun u
        birinchi oʻlchovdan keyin, <b>ikkinchisidan boshlab</b> paydo
        boʻladi. Id lar ketma-ket berilgani uchun bu raqam kuzatuvdan
        mustaqil, lekin ularning hammasi tirik mahsulot boʻlmaydi:
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
