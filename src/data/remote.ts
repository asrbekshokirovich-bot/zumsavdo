import { createClient } from "@supabase/supabase-js";
import { rangeKeys, toKey } from "@/lib/dates";
import type { Dataset } from "./dataset";
import type { Category, Product, ProductDay, Shop, ShopDay, SweepStatus } from "./types";

/**
 * Ombordan oʻqish.
 *
 * Yozuvchi (`ingest/`) xom oʻlchovlarni yigʻadi va bazada kunlik yigʻindiga
 * aylantiradi; bu yerda faqat oʻsha yigʻindi oʻqiladi. Panel hech qachon xom
 * hisoblagichni koʻrmaydi — kunlik raqam har doim bazada hisoblanadi, aks holda
 * bir xil raqam ikki joyda ikki xil chiqishi mumkin.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Panel qancha kunni yuklaydi. Oʻrin 30 kunlik oynada hisoblanadi. */
const WINDOW_DAYS = 45;

export function isRemoteConfigured(): boolean {
  return Boolean(URL && KEY);
}

function client() {
  if (!URL || !KEY) throw new Error("VITE_SUPABASE_URL yoki VITE_SUPABASE_ANON_KEY berilmagan.");
  return createClient(URL, KEY, { auth: { persistSession: false } });
}

type Db = ReturnType<typeof client>;

/**
 * PostgREST bir soʻrovda 1000 qatorgacha qaytaradi — qolgani sahifalab olinadi.
 *
 * `orderBy` majburiy: tartibsiz sahifalashda baza qatorlarni istalgan ketma-
 * ketlikda berishi mumkin, natijada ikkinchi sahifada bir qator takrorlanib,
 * boshqasi umuman tushmay qolardi. Bu 1000 qatordan oshgandagina koʻrinadi,
 * yaʻni aynan maʻlumot koʻpayganda.
 */
async function selectAll<T>(
  db: Db,
  table: string,
  columns: string,
  orderBy: string[],
  filter?: (q: any) => any,
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    let query = db.from(table).select(columns);
    for (const column of orderBy) query = query.order(column, { ascending: true });
    query = query.range(from, from + page - 1);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table} oʻqilmadi: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function loadRemoteDataset(): Promise<Dataset> {
  const db = client();

  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);
  const sinceKey = toKey(since);

  const [
    categoryRows,
    shopRows,
    productRows,
    shopDayRows,
    productDayRows,
    feedbackDayRows,
    feedbackSpanRows,
    sweepRows,
  ] = await Promise.all([
      selectAll<{ id: number; name: string }>(db, "zs_category", "id,name", ["id"]),
      selectAll<{ id: number; name: string; category_id: number | null; official: boolean }>(
        db,
        "zs_shop",
        "id,name,category_id,official",
        ["id"],
      ),
      selectAll<{ id: number; title: string; shop_id: number | null; category_id: number | null }>(
        db,
        "zs_product",
        "id,title,shop_id,category_id",
        ["id"],
      ),
      selectAll<{
        shop_id: number;
        date: string;
        orders: number | null;
        orders_certain: boolean;
        avg_price: number | null;
        sweeps: number;
        sweeps_expected: number;
      }>(
        db,
        "zs_shop_day",
        "shop_id,date,orders,orders_certain,avg_price,sweeps,sweeps_expected",
        ["shop_id", "date"],
        (q) => q.gte("date", sinceKey),
      ),
      selectAll<{
        product_id: number;
        date: string;
        price: number | null;
        discount_percent: number | null;
        stock: number | null;
        reviews: number | null;
        buyers_per_week: number | null;
        sold_units: number | null;
        restocked_units: number | null;
        out_of_stock: boolean;
        sweeps: number;
      }>(
        db,
        "zs_product_day",
        "product_id,date,price,discount_percent,stock,reviews,buyers_per_week,sold_units,restocked_units,out_of_stock,sweeps",
        ["product_id", "date"],
        (q) => q.gte("date", sinceKey),
      ),
      // Sharh kunlari — yagona qator oʻlchovsiz ham tarix beradi.
      selectAll<{
        product_id: number;
        date: string;
        feedbacks: number;
        avg_rating: number | null;
      }>(
        db,
        "zs_feedback_day",
        "product_id,date,feedbacks,avg_rating",
        ["product_id", "date"],
        (q) => q.gte("date", sinceKey),
      ),
      // Tarix qaysi sanadan boshlanishi — "nol" bilan "nomaʻlum" ni ajratish uchun.
      selectAll<{ product_id: number; first_date: string }>(
        db,
        "zs_feedback_span",
        "product_id,first_date",
        ["product_id"],
      ),
      selectAll<{
        source: string;
        started_at: string;
        finished_at: string | null;
        targets: number;
        captured: number;
        errors: number;
      }>(db, "zs_sweep", "source,started_at,finished_at,targets,captured,errors", [], (q) =>
        q.order("started_at", { ascending: false }).limit(1),
      ),
    ]);

  if (!shopDayRows.length && !feedbackDayRows.length) {
    throw new Error(
      "Omborda hali kunlik oʻlchov yoʻq. Avval sweep ishga tushirilishi kerak: " +
        "ingest/ → npm run sweep",
    );
  }

  // Vaqt oʻqiga sharh kunlari ham kiradi. Sabab: oʻlchov bugundan boshlanadi,
  // sharh esa oylar orqaga boradi — oʻqni faqat oʻlchovdan qursak, mavjud
  // tarix koʻrinmay qolardi.
  const dates = buildDateAxis([
    ...shopDayRows.map((r) => r.date),
    ...feedbackDayRows.map((r) => r.date),
  ]);

  const categories: Category[] = categoryRows.map((c) => ({ id: c.id, name: c.name }));
  const shops: Shop[] = shopRows.map((s) => ({
    id: s.id,
    name: s.name,
    categoryId: s.category_id ?? 0,
    official: s.official,
  }));
  const products: Product[] = productRows.map((p) => ({
    id: p.id,
    name: p.title,
    shopId: p.shop_id ?? 0,
    categoryId: p.category_id ?? 0,
  }));

  const index = new Map(dates.map((d, i) => [d, i]));

  // Har bir qator vaqt oʻqiga toʻliq tekislanadi: oʻlchov tushmagan kun
  // roʻyxatdan tushib qolsa, grafikdagi uzilish koʻrinmay qoladi.
  const shopDays = new Map<number, ShopDay[]>();
  for (const shop of shops) {
    shopDays.set(
      shop.id,
      dates.map((date) => ({
        shopId: shop.id,
        date,
        orders: null,
        ordersCertain: false,
        avgPrice: 0,
        sweeps: 0,
        sweepsExpected: 12,
      })),
    );
  }
  for (const row of shopDayRows) {
    const slot = index.get(row.date);
    const series = shopDays.get(row.shop_id);
    if (slot === undefined || !series) continue;
    series[slot] = {
      shopId: row.shop_id,
      date: row.date,
      orders: row.orders,
      ordersCertain: row.orders_certain,
      avgPrice: row.avg_price ?? 0,
      sweeps: row.sweeps,
      sweepsExpected: row.sweeps_expected,
    };
  }

  const productDays = new Map<number, ProductDay[]>();
  for (const product of products) {
    productDays.set(
      product.id,
      dates.map((date) => ({
        productId: product.id,
        date,
        price: 0,
        discountPercent: 0,
        stock: 0,
        reviews: 0,
        buyersPerWeek: 0,
        soldUnits: 0,
        restockedUnits: 0,
        outOfStock: false,
        measured: false,
        newFeedbacks: null,
        feedbackRating: null,
      })),
    );
  }
  for (const row of productDayRows) {
    const slot = index.get(row.date);
    const series = productDays.get(row.product_id);
    if (slot === undefined || !series) continue;
    series[slot] = {
      ...series[slot],
      productId: row.product_id,
      date: row.date,
      price: row.price ?? 0,
      discountPercent: row.discount_percent ?? 0,
      stock: row.stock ?? 0,
      reviews: row.reviews ?? 0,
      buyersPerWeek: row.buyers_per_week ?? 0,
      soldUnits: row.sold_units ?? 0,
      restockedUnits: row.restocked_units ?? 0,
      outOfStock: row.out_of_stock,
      measured: true,
    };
  }

  // Sharhlar oʻlchovdan mustaqil: oʻsha kuni sweep boʻlmagan boʻlsa ham
  // sharh sanasi maʻlum, shuning uchun `measured` ga tegilmaydi.
  //
  // Tarix boshlangan kundan keyin sharhsiz kun — NOL, chunki roʻyxat toʻliq.
  // Undan oldingi kun esa NOMAʻLUM: biz shunchaki u qadar orqaga olmaganmiz.
  for (const span of feedbackSpanRows) {
    const series = productDays.get(span.product_id);
    if (!series) continue;
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] >= span.first_date) series[i] = { ...series[i], newFeedbacks: 0 };
    }
  }
  for (const row of feedbackDayRows) {
    const slot = index.get(row.date);
    const series = productDays.get(row.product_id);
    if (slot === undefined || !series) continue;
    series[slot] = {
      ...series[slot],
      newFeedbacks: row.feedbacks,
      feedbackRating: row.avg_rating,
    };
  }

  const productsByShop = groupBy(products, (p) => p.shopId);
  const productsByCategory = groupBy(products, (p) => p.categoryId);
  const shopsByCategory = groupBy(shops, (s) => s.categoryId);

  return {
    categories,
    shops,
    products,
    shopDays,
    productDays,
    productsByShop,
    productsByCategory,
    shopsByCategory,
    dates,
    status: buildStatus(sweepRows[0], shopDayRows, dates[dates.length - 1]),
    sweepsPerDay: shopDayRows[0]?.sweeps_expected ?? 12,
  };
}

/** Eng eski oʻlchovdan bugungacha — uzilishsiz kunlar qatori. */
function buildDateAxis(observed: string[]): string[] {
  const sorted = [...observed].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const now = toKey(new Date());
  return rangeKeys(first, last > now ? last : now);
}

/**
 * Holat satri uchun raqamlar.
 *
 * Qamrov — oxirgi kunda oʻlchov tushgan sotuvchilar ulushi. Bu sunʻiy emas:
 * qamrov pasaysa, panelning barcha yigʻindilari ham pasayadi.
 */
function buildStatus(
  sweep:
    | { source: string; started_at: string; finished_at: string | null; errors: number }
    | undefined,
  shopDayRows: { date: string; sweeps: number }[],
  lastDate: string,
): SweepStatus {
  const todayRows = shopDayRows.filter((r) => r.date === lastDate);
  const covered = todayRows.filter((r) => r.sweeps > 0).length;
  const total = new Set(shopDayRows.map((r) => `${r.date}`)).size ? todayRows.length : 0;

  return {
    lastSweepAt: sweep?.finished_at ?? sweep?.started_at ?? new Date().toISOString(),
    coveragePercent: total ? Math.round((covered / total) * 1000) / 10 : 0,
    errors: sweep?.errors ?? 0,
    source: sweep?.source ?? "nomaʻlum",
  };
}

function groupBy<T extends { id: number }>(items: T[], key: (item: T) => number): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item.id);
    else map.set(k, [item.id]);
  }
  return map;
}
