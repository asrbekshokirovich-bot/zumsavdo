import type { Category, ChangeEvent, Product, ProductDay, Shop, ShopDay, SweepStatus } from "./types";
import type { DatasetScope } from "./remote";

/**
 * Faol maʻlumot toʻplami va undan hodisa ajratish.
 *
 * Bu yerda maʻlumot **yaratilmaydi**. Ilgari ombor boʻsh boʻlganda ishlaydigan
 * namuna generatori bor edi va u toʻqilgan raqamlarni panelga chiqarardi —
 * foydalanuvchi ularni haqiqiy oʻlchov deb oʻqib qolgani uchun olib tashlandi.
 *
 * Endi toʻplam faqat ombordan keladi. Oʻlchov boʻlmasa panel raqam emas,
 * holatni koʻrsatadi.
 */

export interface Dataset {
  categories: Category[];
  shops: Shop[];
  products: Product[];
  shopDays: Map<number, ShopDay[]>;
  /**
   * Mahsulotning kunlik qatori — **talab boʻyicha** quriladi.
   *
   * Ilgari bu tayyor Map edi va yuklashda har mahsulot uchun butun vaqt
   * oʻqi boʻylab massiv yasalardi. 81 mahsulotda bu sezilmasdi; 50 000 da
   * esa 2,3 million obyekt degani va brauzer koʻtarmaydi.
   *
   * Endi xom qatorlar siyrak saqlanadi, toʻliq massiv esa faqat soʻralgan
   * mahsulot uchun yasaladi va keshlanadi. Panel bir vaqtda bir necha
   * oʻnta mahsulotga qaraydi, mingtasiga emas.
   */
  getProductDays: (productId: number) => ProductDay[];
  productsByShop: Map<number, number[]>;
  productsByCategory: Map<number, number[]>;
  shopsByCategory: Map<number, number[]>;
  dates: string[];
  /**
   * Toʻplam qaysi qism uchun oʻqilgani.
   *
   * Panel butun bazani yuklamaydi: bosh sahifaga qator kerak emas, sotuvchi
   * sahifasiga esa faqat oʻsha sotuvchi va turkumdoshlari kerak. Sahifa
   * oʻzinikini soʻraganini bilishi uchun qamrov shu yerda yozib qoʻyiladi.
   */
  scope: DatasetScope;
  /** Roʻyxat cheklovga urilganmi — sahifa buni yozib qoʻyadi, jimgina kesilmaydi. */
  truncated: boolean;
  /** Butun bazada nechta obyekt oʻlchangani — qamrovdagisi emas. */
  measured: { shops: number; products: number };
  /**
   * Eng eski oʻlchov sanasi — davr tanlagichning chegarasi.
   *
   * Bu vaqt oʻqining boshi emas: oʻq 45 kun bilan chegaralangan, chunki uzun
   * oʻqni har sotuvchi uchun massivga aylantirish brauzerni bosadi. Tanlagich
   * esa undan orqaga chiqa oladi — bosh sahifadagi raqamlar bazada
   * hisoblanadi va u yerda cheklov yoʻq.
   */
  firstDay: string | null;
  status: SweepStatus;
  /** Bir kunda kutilayotgan sweeplar soni. */
  sweepsPerDay: number;
}

let active: Dataset | null = null;

export function setDataset(dataset: Dataset): void {
  active = dataset;
}

export function hasDataset(): boolean {
  return active !== null;
}

/**
 * Toʻplam yuklanmagan boʻlsa bu funksiya chaqirilmasligi kerak — sahifalar
 * umuman chizilmaydi. Chaqirilsa, jimgina boʻsh natija qaytarish oʻrniga
 * xato beriladi: boʻsh panel "sotuv yoʻq" deb oʻqiladi.
 */
export function getDataset(): Dataset {
  if (!active) {
    throw new Error("Maʻlumot toʻplami yuklanmagan — ombordan oʻqilmagan.");
  }
  return active;
}

// ---------------------------------------------------------------- hodisalar

const PRICE_EVENT_THRESHOLD = 0.05;
const REVIEW_JUMP_THRESHOLD = 12;

/**
 * Mahsulot qatoridan "nima oʻzgardi" roʻyxatini yigʻadi.
 *
 * Faqat ketma-ket **oʻlchangan** kunlar solishtiriladi. Oʻlchov tushmagan kun
 * qatorda nol boʻlib turadi va uni oldingi kun bilan solishtirish "narx 100%
 * tushdi" degan soxta hodisa yasardi.
 */
export function productEvents(days: ProductDay[]): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  let previousMeasured: ProductDay | null = null;

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (!day.measured) continue;

    const prev = previousMeasured;
    previousMeasured = day;
    if (!prev) continue;

    const priceDelta = (day.price - prev.price) / (prev.price || 1);
    if (Math.abs(priceDelta) >= PRICE_EVENT_THRESHOLD) {
      const down = priceDelta < 0;
      events.push({
        date: day.date,
        kind: down ? "price_down" : "price_up",
        label: down ? "Narx tushdi" : "Narx koʻtarildi",
        amount: `${Math.abs(priceDelta * 100).toFixed(0)}%`,
        followUp: followUpUnits(days, i),
      });
    }

    if (!prev.outOfStock && day.outOfStock) {
      events.push({
        date: day.date,
        kind: "out_of_stock",
        label: "Tovar tugadi",
        amount: "qoldiq 0",
      });
    }

    if (prev.outOfStock && !day.outOfStock) {
      events.push({
        date: day.date,
        kind: "restock",
        label: "Tovar keltirildi",
        amount: `+${day.stock} dona`,
      });
    }

    const reviewDelta = day.reviews - prev.reviews;
    if (reviewDelta >= REVIEW_JUMP_THRESHOLD) {
      events.push({
        date: day.date,
        kind: "reviews_jump",
        label: "Sharhlar koʻpaydi",
        amount: `+${reviewDelta}`,
      });
    }
  }

  return events.reverse();
}

/**
 * Hodisadan keyingi 14 kunda dona qanday oʻzgargani.
 *
 * Bu **kuzatuv**, sabab emas — matnda hech qachon "sababi shu" deb yozilmaydi.
 */
function followUpUnits(days: ProductDay[], at: number): string | undefined {
  const beforeFrom = Math.max(0, at - 14);
  const afterTo = Math.min(days.length - 1, at + 14);
  if (at - beforeFrom < 3 || afterTo - at < 3) return undefined;

  const before = average(days.slice(beforeFrom, at).map((d) => d.soldUnits));
  const after = average(days.slice(at, afterTo + 1).map((d) => d.soldUnits));
  if (before <= 0) return undefined;

  const change = (after - before) / before;
  if (Math.abs(change) < 0.15) return undefined;

  const days_ = afterTo - at;
  const dir = change > 0 ? "oshdi" : "kamaydi";
  return `Keyingi ${days_} kunda dona ${Math.abs(change * 100).toFixed(0)}% ${dir}`;
}

/** Sotuvchi qatoridan sezilarli buyurtma sakrashlarini yigʻadi. */
export function shopEvents(days: ShopDay[]): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  for (let i = 3; i < days.length; i++) {
    // Oʻlchovi yoʻq kun hodisa yaratmaydi: yoʻq maʻlumot tushish emas.
    const today = days[i].orders;
    if (today === null) continue;
    const window = days
      .slice(Math.max(0, i - 4), i)
      .map((d) => d.orders)
      .filter((n): n is number => n !== null);
    if (window.length < 3) continue;

    const baseline = average(window);
    if (baseline < 4) continue;
    const change = (today - baseline) / baseline;
    if (Math.abs(change) < 0.35) continue;
    const up = change > 0;
    events.push({
      date: days[i].date,
      kind: up ? "orders_jump" : "orders_drop",
      label: up ? "Buyurtma koʻpaydi" : "Buyurtma kamaydi",
      amount: `${up ? "+" : "−"}${Math.abs(change * 100).toFixed(0)}%`,
      followUp: `Oldingi 4 kun oʻrtachasi ${baseline.toFixed(0)} ta edi`,
    });
  }
  return events.reverse();
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}


