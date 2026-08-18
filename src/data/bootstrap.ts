import { addDays, setDataStart, toKey } from "@/lib/dates";
import { setDataset } from "./dataset";
import type { Dataset } from "./dataset";
import { isRemoteConfigured, loadRemoteDataset } from "./remote";

/**
 * Panel ochilishidan oldin ombor oʻqiladi.
 *
 * Oʻlchov boʻlmasa ham sahifa **toʻliq chiziladi** — sarlavha, davr tugmalari,
 * kartochkalar, qidiruv, grafik va roʻyxatlar joyida qoladi. Faqat raqam
 * oʻrnida chiziqcha turadi.
 *
 * Ikki narsa qilinmaydi: toʻqilgan raqam koʻrsatilmaydi va nol yozilmaydi.
 * Nol "sotuv boʻlmagan" degan javob, chiziqcha esa "javob yoʻq" degani.
 */
export type BootResult =
  | { mode: "ready" }
  | { mode: "empty"; reason: string; detail?: string };

/**
 * Obyektsiz toʻplam.
 *
 * Sanalar oʻqi saqlanadi (soʻnggi 30 kun), shunda davr tugmalari va grafik
 * ramkasi wireframedagidek koʻrinadi.
 */
function emptyDataset(): Dataset {
  const end = toKey(new Date());
  const dates: string[] = [];
  for (let i = 29; i >= 0; i--) dates.push(addDays(end, -i));

  return {
    categories: [],
    shops: [],
    products: [],
    shopDays: new Map(),
    productDays: new Map(),
    productsByShop: new Map(),
    productsByCategory: new Map(),
    shopsByCategory: new Map(),
    dates,
    status: {
      lastSweepAt: "",
      coveragePercent: 0,
      errors: 0,
      source: "yoʻq",
    },
    sweepsPerDay: 0,
  };
}

/**
 * Ombor shuncha vaqtda javob bermasa kutish toʻxtatiladi.
 *
 * Cheklovsiz kutish eng yomon holat: soʻrov osilib qolsa, foydalanuvchi abadiy
 * yuklanish ekranini koʻradi va nima boʻlganini bilmaydi.
 */
const LOAD_TIMEOUT_MS = 20_000;

/** Yuklash uzilganini "maʻlumot yoʻq" dan ajratish uchun. */
class LoadFailed extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new LoadFailed(`Ombor ${ms / 1000} soniyada javob bermadi.`)),
        ms,
      ),
    ),
  ]);
}

export async function bootstrap(): Promise<BootResult> {
  if (!isRemoteConfigured()) {
    setDataset(emptyDataset());
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
    setDataset(emptyDataset());
    const detail = error instanceof Error ? error.message : String(error);
    // "Yuklanmadi" bilan "maʻlumot yoʻq" ni aralashtirmaslik kerak. Ilgari
    // ikkalasi ham "Omborda oʻlchov yoʻq" deb koʻrsatilardi va yuklash
    // uzilganda foydalanuvchi maʻlumot yoʻqolgan deb oʻylardi — u esa
    // joyida turgan boʻlardi.
    if (error instanceof LoadFailed) {
      return {
        mode: "empty",
        reason: "Ombor javob bermadi — maʻlumot yoʻqolgani emas.",
        detail: `${detail} Sahifani yangilab koʻring.`,
      };
    }
    return { mode: "empty", reason: "Omborda oʻlchov yoʻq.", detail };
  }
}
