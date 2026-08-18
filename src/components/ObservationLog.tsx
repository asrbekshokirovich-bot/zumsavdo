import { useEffect, useState } from "react";
import { type ObservationRow, fetchProductObservations } from "@/data/remote";
import { useDataVersion } from "@/data/refresh";
import { formatDateTime } from "@/lib/dates";
import { formatInt, formatPercent, formatPrice } from "@/lib/format";

/**
 * Oʻlchovlar jurnali — har bir oʻlchov alohida qator.
 *
 * Nega kerak: kunlik jadval kunni yigʻadi va faqat kun yakunini koʻrsatadi.
 * 17-avgustda uchta oʻlchov boʻlgan (15:09, 16:16, 16:44), lekin kunlik
 * qatorda bittasi turadi. "Qaysi maʻlumot qachon olingan" degan savolga
 * javob aynan shu yerda.
 *
 * Muhim nozik joy: oʻlchov faqat OʻZGARGANDA yoziladi. Demak ikki qator
 * orasidagi vaqt — maʻlumot yoʻqligi emas, "oʻzgarmagan" degan javob.
 */
export function ObservationLog({
  productId,
  from,
  to,
}: {
  productId: number;
  from: string;
  to: string;
}) {
  const [rows, setRows] = useState<ObservationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useDataVersion();

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    fetchProductObservations(productId, from, to)
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [productId, from, to, version]);

  if (error) return <p className="note-inline">Jurnal olinmadi: {error}</p>;
  if (!rows) return <p className="note-inline">Yuklanmoqda…</p>;
  if (!rows.length) {
    return <p className="note-inline">Tanlangan davrda oʻlchov yoʻq.</p>;
  }

  return (
    <>
      <div className="table-scroll" style={{ maxHeight: 320, overflowY: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Oʻlchov vaqti</th>
              <th className="num">Narx</th>
              <th className="num">Chegirma</th>
              <th className="num">Qoldiq</th>
              <th className="num">Sharh</th>
              <th className="num">Xaridor / hafta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.observed_at}>
                <td>{formatDateTime(r.observed_at)}</td>
                <td className="num">{r.price == null ? "—" : formatPrice(r.price)}</td>
                <td className="num">
                  {r.discount_percent == null ? "—" : formatPercent(r.discount_percent)}
                </td>
                <td className="num">{r.stock == null ? "—" : formatInt(r.stock)}</td>
                <td className="num">{r.reviews == null ? "—" : formatInt(r.reviews)}</td>
                <td className="num">
                  {r.buyers_per_week == null ? "—" : formatInt(r.buyers_per_week)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note-inline">
        {rows.length} ta oʻlchov. Oʻlchov faqat <b>oʻzgarganda</b> yoziladi — ikki
        qator orasidagi vaqtda narx ham, qoldiq ham oʻzgarmagan. Bu boʻshliq
        emas, javob.
      </p>
    </>
  );
}
