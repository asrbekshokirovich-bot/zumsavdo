import { useEffect, useState } from "react";
import { setDataStart } from "@/lib/dates";
import { type DatasetScope, loadRemoteDataset } from "./remote";
import { hasDataset, setDataset } from "./dataset";

/**
 * Panelni yangilab turish.
 *
 * Nega kerak: panel maʻlumotni faqat ochilganda bir marta yuklardi. Sweep
 * yangi oʻlchov yozsa ham ekranda eskisi turardi va foydalanuvchi buni
 * "yangilanmayapti" deb koʻrardi — u haq edi.
 *
 * Yangilanish ikki yoʻl bilan boshlanadi: davriy taymer va sahifa yana
 * koʻrinadigan boʻlganda. Ikkinchisi muhim — koʻpincha panel ochiq qoldirilib
 * boshqa oynaga oʻtiladi, qaytganda esa darhol yangi raqam kutiladi.
 *
 * Yashirin oynada yangilanmaydi: koʻrinmayotgan sahifa uchun soʻrov yuborish
 * bekorga trafik va bekorga baza yuki.
 */

/** Necha vaqtda bir yangilanadi. Sweep bir necha soatda tushadi, bu yetarli. */
const INTERVAL_MS = 60_000;

/**
 * Bitta yangilanish shuncha vaqtdan oshsa tashlab yuboriladi.
 *
 * Cheksiz kutish jim qotib qolishga olib keladi: osilib qolgan soʻrov
 * `refreshing` bayrogʻini abadiy koʻtarib turadi va keyingi urinishlarning
 * hammasi jimgina tashlanadi — panel yana "yangilanmayapti" holatiga
 * qaytadi, bu safar sababi koʻrinmay.
 */
const REFRESH_TIMEOUT_MS = 30_000;

/**
 * Ikki yangilanish orasidagi eng qisqa masofa.
 *
 * Sahifa fon oynasida ochilsa, dastlabki yuklash tugagan zahoti
 * `visibilitychange` kelib omborni **yana** oʻqitardi — ikkita bir xil
 * yuklash bir necha soniya ichida. Ular Bozor soʻrovi bilan qoʻshilib
 * brauzerni bosardi. Yangi maʻlumot bir necha soatda bir marta keladi,
 * shuning uchun besh soniyalik masofa hech narsani kechiktirmaydi.
 */
const MIN_GAP_MS = 5_000;

let lastAttemptAt = 0;

/**
 * Hozir qaysi qism yuklangani.
 *
 * Avtomatik yangilanish shuni qayta oʻqiydi. Ilgari u har safar butun bazani
 * tortardi — sotuvchi sahifasida turgan odam uchun ham, garchi unga faqat
 * bitta sotuvchi kerak boʻlsa ham.
 */
let currentScope: DatasetScope = { kind: "status" };

export function scopeKey(scope: DatasetScope): string {
  return scope.kind === "status" ? "status" : `${scope.kind}:${scope.id}`;
}

/**
 * Sahifa oʻz qismini yuklaydi va yangilanish ham oʻshanga bogʻlanadi.
 *
 * Ayni qism yaqinda yuklangan boʻlsa qayta soʻralmaydi: ochilishda
 * `bootstrap()` "status" ni oʻqiydi, keyin bosh sahifa yana oʻshani
 * soʻrardi — bir xil ikkita soʻrov va ular ortidan bosh sahifaning
 * yigʻindisi ham ikki marta.
 */
export async function loadScope(scope: DatasetScope): Promise<void> {
  const key = scopeKey(scope);
  const fresh = performance.now() - lastAttemptAt < MIN_GAP_MS;
  if (key === scopeKey(currentScope) && hasDataset() && fresh) return;

  currentScope = scope;
  const dataset = await withTimeout(loadRemoteDataset(scope), REFRESH_TIMEOUT_MS);
  setDataset(dataset);
  if (dataset.firstDay) setDataStart(dataset.firstDay);
  markRefreshed();
  notify();
}

let version = 0;
let refreshing = false;
let lastRefreshAt: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  version++;
  for (const listener of listeners) listener();
}

/**
 * Panel omborni oxirgi marta qachon oʻqigani.
 *
 * Bu sweep vaqti emas — panelning oʻzi qachon qaraganini bildiradi. Ikkalasi
 * ham koʻrinib tursin: sweep vaqti eski boʻlsa yigʻuvchi ishlamayapti, panel
 * oʻqishi eski boʻlsa yangilanishning oʻzi toʻxtagan. Bittasiga qarab
 * ikkinchisi haqida xulosa chiqarib boʻlmaydi.
 */
export function getLastRefreshAt(): string | null {
  return lastRefreshAt;
}

/** Dastlabki yuklash ham oʻqish — uni ham vaqt sifatida belgilaymiz. */
export function markRefreshed(): void {
  lastRefreshAt = new Date().toISOString();
  lastAttemptAt = performance.now();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Yangilash ${ms / 1000} soniyada tugamadi.`)), ms),
    ),
  ]);
}

/**
 * Omborni qayta oʻqiydi.
 *
 * Xato yutiladi: vaqtinchalik uzilishda ekrandagi maʻlumotni oʻchirib
 * tashlash — eng yomon javob. Eski raqam qolaveradi, keyingi urinishda
 * yangilanadi.
 */
export async function refreshNow(force = false): Promise<void> {
  if (refreshing) return;
  const now = performance.now();
  if (!force && lastAttemptAt && now - lastAttemptAt < MIN_GAP_MS) return;
  lastAttemptAt = now;
  refreshing = true;
  try {
    const dataset = await withTimeout(loadRemoteDataset(currentScope), REFRESH_TIMEOUT_MS);
    setDataset(dataset);
    // Yangi oʻlchov eskiroq sanadan boshlangan boʻlishi mumkin — davr
    // tanlagichning chegarasi ham u bilan birga siljisin.
    if (dataset.firstDay) setDataStart(dataset.firstDay);
    markRefreshed();
    notify();
  } catch {
    /* keyingi urinishda */
  } finally {
    refreshing = false;
  }
}

export function startAutoRefresh(): () => void {
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") void refreshNow();
  }, INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState === "visible") void refreshNow();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/**
 * Maʻlumot versiyasi — u oʻzgarsa komponent qayta chiziladi.
 *
 * Sahifalar `getDataset()` ni chizish paytida oʻqiydi, shuning uchun versiya
 * oʻzgarishi yetarli: yangi toʻplam avtomatik ishlatiladi. RPC bilan
 * ishlaydigan joylar esa buni `useEffect` bogʻlanishiga qoʻshadi.
 */
export function useDataVersion(): number {
  const [, setTick] = useState(version);
  useEffect(() => {
    const listener = () => setTick(version);
    listeners.add(listener);
    // Obuna boʻlgunimizcha yangilanish oʻtib ketgan boʻlishi mumkin.
    if (version !== 0) setTick(version);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return version;
}
