import { setDataStart } from "@/lib/dates";
import { isDemoEnabled } from "@/lib/demo";
import { setDataset } from "./dataset";
import { buildDemoDataset } from "./demo";
import { isRemoteConfigured, loadRemoteDataset } from "./remote";

/**
 * Panel ochilishidan oldin ombor oʻqiladi.
 *
 * Maʻlumot boʻlmasa panel **hech qanday raqam koʻrsatmaydi**. Ilgari bu holatda
 * namuna toʻplami ishga tushardi va sahifa toʻqilgan raqamlar bilan toʻlardi;
 * ular haqiqiy oʻlchov deb oʻqilgani uchun butunlay olib tashlandi.
 *
 * Boʻsh sahifa ham yolgʻon — u "sotuv yoʻq" deb oʻqiladi. Shuning uchun bu
 * holatda raqam oʻrniga nima yetishmayotgani yoziladi.
 */
export type BootResult =
  | { mode: "ready" }
  | { mode: "demo" }
  | { mode: "empty"; reason: string; detail?: string };

/**
 * Ombor shuncha vaqtda javob bermasa kutish toʻxtatiladi.
 *
 * Cheklovsiz kutish eng yomon holat: soʻrov osilib qolsa, foydalanuvchi abadiy
 * yuklanish ekranini koʻradi va nima boʻlganini bilmaydi.
 */
const LOAD_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Ombor ${ms / 1000} soniyada javob bermadi.`)), ms),
    ),
  ]);
}

export async function bootstrap(): Promise<BootResult> {
  // Demo faqat ochiq soʻralganda. Ombordan oldin tekshiriladi, chunki bu
  // foydalanuvchining ataylab tanlovi va u ustunlik qiladi.
  if (isDemoEnabled()) {
    const dataset = buildDemoDataset();
    setDataset(dataset);
    if (dataset.dates.length) setDataStart(dataset.dates[0]);
    return { mode: "demo" };
  }

  if (!isRemoteConfigured()) {
    return {
      mode: "empty",
      reason: "Ombor sozlanmagan.",
      detail:
        "VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY berilmagan. " +
        ".env.example dan nusxa olib .env.local yarating.",
    };
  }

  try {
    const dataset = await withTimeout(loadRemoteDataset(), LOAD_TIMEOUT_MS);
    setDataset(dataset);
    // Davr tanlagich eng eski oʻlchovdan orqaga chiqmasligi kerak.
    if (dataset.dates.length) setDataStart(dataset.dates[0]);
    return { mode: "ready" };
  } catch (error) {
    return {
      mode: "empty",
      reason: "Omborda oʻlchov yoʻq.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
