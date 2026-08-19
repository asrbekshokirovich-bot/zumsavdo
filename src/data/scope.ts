import { useEffect, useState } from "react";
import { type DatasetScope } from "./remote";
import { loadScope, scopeKey, useDataVersion } from "./refresh";

/**
 * Sahifa oʻziga kerak boʻlgan qismni yuklaydi.
 *
 * Ilgari panel ochilishda **butun** bazani tortardi va hamma sahifa oʻshandan
 * oʻqirdi. Kuzatuv 50 000 ga chiqqach bu ishlamay qoldi: oʻn minglab qator
 * 1000 tadan sahifalanib oʻnlab soʻrovga boʻlinadi, brauzer bir qismini
 * yuborishdan bosh tortadi va butun panel boʻsh qoladi.
 *
 * Endi har sahifa faqat oʻzinikini soʻraydi: mahsulot sahifasi bitta
 * mahsulotni, sotuvchi sahifasi bitta sotuvchi va turkumdoshlarini.
 * Bosh sahifaga esa qator umuman kerak emas.
 */
export function useScope(scope: DatasetScope): { ready: boolean; error: string | null } {
  const key = scopeKey(scope);
  const [state, setState] = useState<{ key: string; error: string | null } | null>(null);
  // Yangilanish tushganda sahifa qayta chizilishi kerak.
  useDataVersion();

  useEffect(() => {
    let cancelled = false;
    setState(null);
    loadScope(scope)
      .then(() => !cancelled && setState({ key, error: null }))
      .catch(
        (e) => !cancelled && setState({ key, error: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ready: state?.key === key && !state.error, error: state?.key === key ? state.error : null };
}
