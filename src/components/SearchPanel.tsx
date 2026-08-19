import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { type SearchRow, fetchSearch } from "@/data/remote";
import type { SearchKind } from "@/data/types";
import { MIN_QUERY_LENGTH } from "@/lib/normalize";
import { rankPeriodRange } from "@/lib/period";
import { formatInt, formatMoney } from "@/lib/format";

const KINDS: { id: SearchKind; label: string; path: string }[] = [
  { id: "shop", label: "Sotuvchi", path: "/sotuvchi" },
  { id: "product", label: "Mahsulot", path: "/mahsulot" },
  { id: "category", label: "Turkum", path: "/turkum" },
];

/** Yozishni toʻxtatgandan keyin shuncha kutiladi. */
const DEBOUNCE_MS = 250;

/**
 * Qidiruv.
 *
 * Avval tur tanlanadi — "iPhone" soʻzi sotuvchi nomida ham, mahsulot nomida
 * ham uchraydi va aralash roʻyxat foydasiz boʻladi.
 *
 * Qidiruv **bazada** bajariladi. Ilgari panel butun lugʻatni brauzerga
 * yuklab olib oʻsha yerda qidirardi; kuzatuv 50 000 ga chiqqach lugʻatning
 * oʻzi panelni yiqitadigan hajmga aylandi. Lotin/kirill va apostrofning
 * toʻrt koʻrinishini bir xillashtirish bazada ham aynan shu qoida boʻyicha
 * bajariladi.
 */
export function SearchPanel() {
  const [kind, setKind] = useState<SearchKind>("shop");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = query.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH;
  const basePath = KINDS.find((k) => k.id === kind)!.path;

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setHits([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    // Har harfda soʻrov yubormaslik uchun: yozish tugagandan keyin bittasi.
    const timer = setTimeout(() => {
      const { from, to } = rankPeriodRange();
      fetchSearch(kind, trimmed, from, to)
        .then((rows) => {
          if (cancelled) return;
          setHits(rows);
          setError(null);
        })
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !cancelled && setBusy(false));
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, trimmed]);

  return (
    <div className="panel">
      <header>
        <h2>Qidiruv</h2>
        <span className="hint">Lotin ham, kirill ham — "Oʻzbekiston" va "Узбекистон" bir xil.</span>
      </header>
      <div className="body">
        <div className="chips" role="group" aria-label="Qidiruv turi">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className="chip"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="chips" style={{ marginTop: 10 }}>
          <input
            type="search"
            value={query}
            placeholder={`${KINDS.find((k) => k.id === kind)!.label} nomi...`}
            aria-label="Qidirish"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {tooShort && <p className="note-inline">Kamida {MIN_QUERY_LENGTH} ta harf kiriting.</p>}

        {error && <p className="note-inline">Qidiruv bajarilmadi: {error}</p>}

        {!tooShort && !error && trimmed.length >= MIN_QUERY_LENGTH && (
          <div className="results">
            {busy && !hits.length ? (
              <p className="empty" style={{ padding: 12 }}>
                Qidirilmoqda…
              </p>
            ) : hits.length === 0 ? (
              <p className="empty" style={{ padding: 12 }}>
                Hech narsa topilmadi.
              </p>
            ) : (
              <div className="rows">
                {hits.map((hit, i) => (
                  <Link className="row-link" to={`${basePath}/${hit.id}`} key={hit.id}>
                    <span className="n">{i + 1}</span>
                    <span>
                      <span className="name">{hit.name}</span>
                      <span className="ctx" style={{ display: "block" }}>
                        {hit.context}
                      </span>
                    </span>
                    <span className="figures">
                      {formatInt(hit.orders)}
                      <span className="sub"> ta · ~{formatMoney(hit.revenue)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <p className="note-inline" style={{ padding: "0 12px 10px" }}>
              Raqamlar 30 kunlik oyna uchun. Buyurtma — aniq, aylanma — taxminiy.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
