import type { Metric } from "@/data/types";

export interface BasisOption<Id extends string> {
  id: Id;
  label: string;
  hint: string;
  certainty: Metric["certainty"];
}

/**
 * Nima boʻyicha koʻrsatilishini tanlash.
 *
 * Nega kerak: "Buyurtma" eng ishonchli asos, lekin u ikki kun chegarasi
 * farqidan chiqadi va birinchi kuni hech kimda boʻlmaydi — panel butunlay
 * chiziqchalarga toʻlib qoladi. Qolgan asoslar birinchi oʻlchovdanoq
 * ishlaydi.
 *
 * Maʻlumoti yoʻq asos yashirilmaydi, oʻchirilgan holda turadi va sababi
 * yozilib qoladi. Yashirib qoʻyilsa foydalanuvchi u oʻlchov umuman yoʻq deb
 * oʻylardi — holbuki u shunchaki hali yigʻilmagan.
 */
export function BasisPicker<Id extends string>({
  options,
  value,
  onChange,
  available,
}: {
  options: readonly BasisOption<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  available: Set<Id>;
}) {
  return (
    <div className="basis">
      {options.map((option) => {
        const has = available.has(option.id);
        return (
          <button
            key={option.id}
            type="button"
            className={option.id === value ? "on" : undefined}
            disabled={!has}
            title={has ? option.hint : `${option.hint} — hali oʻlchov yigʻilmagan`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
            {option.certainty === "approx" && <span className="tilde">~</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Maʻlumoti bor asoslardan birinchisini tanlaydi.
 *
 * Qoʻlda tanlangani ustun turadi, lekin u boʻshab qolsa (masalan davr
 * almashganda) tanlov oʻzi mavjudiga qaytadi — aks holda panel sababsiz
 * boʻsh koʻrinardi.
 */
export function resolveBasis<Id extends string>(
  options: readonly BasisOption<Id>[],
  available: Set<Id>,
  chosen: Id | null,
): Id {
  if (chosen && available.has(chosen)) return chosen;
  return options.find((o) => available.has(o.id))?.id ?? options[0].id;
}
