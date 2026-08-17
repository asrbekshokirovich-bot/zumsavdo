import { RANK_BASES, type RankBasis } from "@/data/api";

/**
 * Roʻyxat nima boʻyicha saralanishini tanlash.
 *
 * Nega kerak: "Buyurtma" eng ishonchli asos, lekin u ikki kun chegarasi
 * farqidan chiqadi va birinchi kuni hech kimda boʻlmaydi — roʻyxat butunlay
 * chiziqchalarga toʻlib qoladi. Qolgan asoslar birinchi oʻlchovdanoq
 * ishlaydi.
 *
 * Maʻlumoti yoʻq asos oʻchirilgan holda turadi va nega oʻchirilgani
 * koʻrsatiladi — yashirib qoʻyilsa, foydalanuvchi uni umuman yoʻq deb
 * oʻylardi.
 */
export function BasisPicker({
  basis,
  onChange,
  available,
}: {
  basis: RankBasis;
  onChange: (basis: RankBasis) => void;
  available: Set<RankBasis>;
}) {
  return (
    <div className="basis">
      {RANK_BASES.map((b) => {
        const has = available.has(b.id);
        return (
          <button
            key={b.id}
            type="button"
            className={b.id === basis ? "on" : undefined}
            disabled={!has}
            title={has ? b.hint : `${b.hint} — hali oʻlchov yigʻilmagan`}
            onClick={() => onChange(b.id)}
          >
            {b.label}
            {b.certainty === "approx" && <span className="tilde">~</span>}
          </button>
        );
      })}
    </div>
  );
}
