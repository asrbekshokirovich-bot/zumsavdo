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
 * - **Qoʻshildi** — bozorga qoʻshilgani. Faqat boshlangʻich sanadan keyin
 *   maʻnoli, undan oldin chiziqcha turadi.
 * - **Topildi** — men nechta yangi obyekt koʻrganim. Bu bozor raqami emas
 *   va hech qachon oʻsish deb koʻrsatilmaydi, lekin yashirilmaydi ham.
 *
 * Nega ikkalasi kerak: avval faqat "Qoʻshildi" bor edi va boshlangʻichdan
 * oldingi kunlar butunlay chiziqcha boʻlib turardi. Bu "oʻsha kunlarda
 * hech narsa qoʻshilmagan" boʻlib oʻqildi — holbuki chiziqcha "javob
 * yoʻq" degani edi. Ikki ustun yonma-yon turganda farq oʻzi koʻrinadi.
 */
/**
 * Ikki raqam bitta katakda: mahsulot va doʻkon.
 *
 * Ilgari ular "18 925 · 854 doʻkon" koʻrinishida yozilardi va oʻrtadagi
 * nuqta koʻpaytirish deb oʻqildi. Endi har raqamning yonida oʻz soʻzi
 * turadi va ular alohida satrda — belgi talqin qilinmasin.
 */
function Pair({ products, shops }: { products: number | null; shops: number | null }) {
  if (!products && !shops) return <>{orDash(null, formatInt)}</>;
  return (
    <>
      <span className="pair-main">{formatInt(products ?? 0)} mahsulot</span>
      <span className="pair-sub">{formatInt(shops ?? 0)} doʻkon</span>
    </>
  );
}

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
              <th className="num">Qoʻshildi</th>
              <th className="num">Topildi</th>
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
                <td className="num">
                  <Pair
                    products={r.trusted ? r.new_products : null}
                    shops={r.trusted ? r.new_shops : null}
                  />
                </td>
                <td className="num">
                  <Pair products={r.found_products} shops={r.found_shops} />
                </td>
                <td className="num">{orDash(r.new_feedbacks, formatInt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note-inline">
        <b>Har katakda ikki raqam bor — mahsulot va doʻkon, alohida.</b>{" "}
        Bu koʻpaytirish emas.{" "}
        <b>Chiziqcha nol emas — javob yoʻq degani.</b> Masalan 18-avgustda
        baza toʻlgan, lekin u Uzum nimani qoʻshgani emas, perepis nimani
        topgani edi; shuning uchun u raqam "Topildi" ustunida turadi,
        "Qoʻshildi" da emas.{" "}
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
            <b>Qoʻshildi</b> ustuni {formatDayMonth(data.baseline)} dan keyingi
            kunlar uchun toʻldiriladi: shu kundan boshlab birinchi marta
            koʻringan obyekt haqiqatan yangi boʻladi. Undan oldingi kunlarda
            har qanday raqam perepis nimani topganini bildirardi.
          </>
        )}{" "}
        <b>Sharh</b> sanasi Uzumdan keladi, lekin faqat sharhi yigʻilgan
        mahsulotlar boʻyicha — bozorning namunasi, hammasi emas.
      </p>
    </Panel>
  );
}
