/**
 * DEMO rejimi.
 *
 * Toʻqilgan maʻlumot hech qachon oʻz-oʻzidan yoqilmaydi — faqat foydalanuvchi
 * soʻraganda. Shuning uchun belgi URL da (`?demo=1`) va sahifalar orasida
 * yoʻqolmasligi uchun sessiyada saqlanadi.
 */

const KEY = "zumsavdo:demo";

export function isDemoEnabled(): boolean {
  const params = new URLSearchParams(window.location.search);
  const asked = params.get("demo");

  if (asked === "1") {
    sessionStorage.setItem(KEY, "1");
    return true;
  }
  if (asked === "0") {
    sessionStorage.removeItem(KEY);
    return false;
  }
  return sessionStorage.getItem(KEY) === "1";
}

export function enableDemo(): void {
  sessionStorage.setItem(KEY, "1");
  window.location.href = `${window.location.pathname}?demo=1`;
}

export function disableDemo(): void {
  sessionStorage.removeItem(KEY);
  window.location.href = window.location.pathname;
}
