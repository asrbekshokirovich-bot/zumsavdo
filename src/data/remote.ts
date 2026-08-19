import { createClient } from "@supabase/supabase-js";
import { addDays, rangeKeys, toKey } from "@/lib/dates";
import type { Dataset } from "./dataset";
import type { Category, Product, ProductDay, Shop, ShopDay } from "./types";

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

/**
 * Panel qaysi qismni oʻqishi.
 *
 * Ilgari bunday tanlov yoʻq edi: ochilishda **butun** lugʻat va barcha
 * kunlik qatorlar yuklanardi. 81 mahsulotda bu sezilmasdi. Sweep 50 000 ga
 * chiqqach esa oʻn minglab qator degani boʻldi, ular 1000 tadan sahifalanib
 * oʻnlab soʻrovga boʻlindi va brauzer ularning bir qismini yuborishdan bosh
 * tortdi — ekranda bu "TypeError: Failed to fetch" va butunlay boʻsh panel
 * boʻlib koʻrindi.
 *
 * Endi har sahifa oʻziga keragini oladi. Bosh sahifaga umuman qator kerak
 * emas: uning hamma raqami bazada hisoblanadi.
 */
export type DatasetScope =
  | { kind: "status" }
  | { kind: "shop"; id: number }
  | { kind: "category"; id: number }
  | { kind: "product"; id: number };

/**
 * Bitta turkumdan koʻpi bilan shuncha mahsulot oʻqiladi.
 *
 * Cheklov jimgina qoʻyilmaydi: kesilgan boʻlsa `truncated` bayrogʻi koʻtariladi
 * va sahifa buni yozib qoʻyadi. Jimgina kesish "turkumda shuncha mahsulot bor"
 * degan yolgʻon javob berardi.
 */
const CATEGORY_PRODUCT_CAP = 1000;

/**
 * Turkumdoshlar chegarasi — sotuvchi sahifasidagi punktir chiziq uchun.
 *
 * Oʻrtacha sotuvchini hisoblash uchun turkumdagi hamma sotuvchi kerak, lekin
 * yirik turkumda ular minglab boʻlishi mumkin. Shuncha sotuvchining kunlik
 * qatorini tortish sahifani oʻldiradi; oʻrtacha esa 500 tadan keyin sezilarli
 * oʻzgarmaydi.
 */
const SIBLING_CAP = 500;

interface Bounds {
  source: string | null;
  last_sweep_at: string | null;
  errors: number;
  coverage_percent: number;
  first_day: string | null;
  last_day: string | null;
  sweeps_per_day: number | null;
  measured: { shops: number; products: number };
}

/** Ochilish uchun kerak boʻlgan eng kichik maʻlumot — bitta soʻrov. */
export async function fetchBounds(): Promise<Bounds> {
  const data = await callRpc<Bounds | null>("zs_panel_bounds", {});
  return {
    source: data?.source ?? null,
    last_sweep_at: data?.last_sweep_at ?? null,
    errors: data?.errors ?? 0,
    coverage_percent: data?.coverage_percent ?? 0,
    first_day: data?.first_day ?? null,
    last_day: data?.last_day ?? null,
    sweeps_per_day: data?.sweeps_per_day ?? null,
    measured: data?.measured ?? { shops: 0, products: 0 },
  };
}

export async function loadRemoteDataset(scope: DatasetScope = { kind: "status" }): Promise<Dataset> {
  const db = client();
  const bounds = await fetchBounds();

  if (!bounds.last_sweep_at) {
    throw new Error(
      "Omborda hali kunlik oʻlchov yoʻq. Avval sweep ishga tushirilishi kerak: " +
        "ingest/ → npm run sweep",
    );
  }

  // ------------------------------------------------------------- vaqt oʻqi
  //
  // Oʻq davr oynasi bilan chegaralanadi. `first_day` sharh tarixidan kelib
  // yillar orqaga ketishi mumkin va oʻsha uzunlikdagi oʻqni har sotuvchi
  // uchun massivga aylantirsak, 640 sotuvchida yuz minglab obyekt chiqadi.
  // Mahsulot sahifasi istisno: u sharh tarixini butunlay koʻrsatadi.
  const today = toKey(new Date());
  const windowStart = addDays(today, -WINDOW_DAYS);
  let axisFrom = windowStart;
  if (scope.kind === "product" && bounds.first_day && bounds.first_day < windowStart) {
    axisFrom = bounds.first_day;
  }
  const dates = rangeKeys(axisFrom, today);

  // ------------------------------------------------------------ qamrov
  //
  // Qaysi obyektlar oʻqilishi shu yerda hal boʻladi. Bosh sahifa hech
  // qanday obyekt soʻramaydi — undagi har bir raqam bazada hisoblanadi.
  let shopRows: PanelShopRow[] = [];
  let productRows: PanelProductRow[] = [];
  let truncated = false;

  if (scope.kind === "product") {
    productRows = await selectAll<PanelProductRow>(
      db, "zs_panel_product", "id,title,shop_id,category_id", ["id"],
      (q) => q.eq("id", scope.id),
    );
    const shopId = productRows[0]?.shop_id;
    if (shopId != null) {
      shopRows = await selectAll<PanelShopRow>(
        db, "zs_panel_shop", "id,name,category_id,official", ["id"],
        (q) => q.eq("id", shopId),
      );
    }
  } else if (scope.kind === "shop") {
    const self = await selectAll<PanelShopRow>(
      db, "zs_panel_shop", "id,name,category_id,official", ["id"],
      (q) => q.eq("id", scope.id),
    );
    // Turkumdagi qoʻshnilar ham kerak: sahifadagi punktir chiziq —
    // shu turkumdagi oʻrtacha sotuvchi. Ulardan faqat kunlik qatori
    // olinadi, mahsuloti emas.
    const categoryId = self[0]?.category_id;
    const siblings = categoryId == null ? [] : await selectAll<PanelShopRow>(
      db, "zs_panel_shop", "id,name,category_id,official", ["id"],
      (q) => q.eq("category_id", categoryId).limit(SIBLING_CAP),
    );
    if (siblings.length >= SIBLING_CAP) truncated = true;
    shopRows = dedupeById([...self, ...siblings]);
    productRows = await selectAll<PanelProductRow>(
      db, "zs_panel_product", "id,title,shop_id,category_id", ["id"],
      (q) => q.eq("shop_id", scope.id),
    );
  } else if (scope.kind === "category") {
    shopRows = await selectAll<PanelShopRow>(
      db, "zs_panel_shop", "id,name,category_id,official", ["id"],
      (q) => q.eq("category_id", scope.id),
    );
    productRows = await selectAll<PanelProductRow>(
      db, "zs_panel_product", "id,title,shop_id,category_id", ["id"],
      (q) => q.eq("category_id", scope.id).limit(CATEGORY_PRODUCT_CAP),
    );
    truncated = productRows.length >= CATEGORY_PRODUCT_CAP;
  }

  const shopIds = shopRows.map((s) => s.id);
  const productIds = productRows.map((p) => p.id);

  // ------------------------------------------------------------ turkumlar
  //
  // Faqat qamrovda uchraydigan turkumlar — butun lugʻat emas.
  const categoryIds = unique([
    ...shopRows.map((s) => s.category_id),
    ...productRows.map((p) => p.category_id),
    ...(scope.kind === "category" ? [scope.id] : []),
  ]);
  const categoryRows = categoryIds.length
    ? await selectAll<{ id: number; name: string }>(
        db, "zs_panel_category", "id,name", ["id"],
        (q) => q.in("id", categoryIds),
      )
    : [];

  // ------------------------------------------------------------ kunlik
  const [shopDayRows, productDayRows, feedbackDayRows, feedbackSpanRows] = await Promise.all([
    shopIds.length
      ? selectAll<ShopDayRow>(
          db, "zs_shop_day",
          "shop_id,date,orders,orders_certain,avg_price,sweeps,sweeps_expected,window_hours",
          ["shop_id", "date"],
          (q) => q.in("shop_id", shopIds).gte("date", axisFrom),
        )
      : Promise.resolve([]),
    productIds.length
      ? selectAll<ProductDayRow>(
          db, "zs_product_day",
          "product_id,date,price,discount_percent,stock,reviews,buyers_per_week,sold_units," +
            "restocked_units,out_of_stock,sweeps,observed_at,first_observed_at",
          ["product_id", "date"],
          (q) => q.in("product_id", productIds).gte("date", axisFrom),
        )
      : Promise.resolve([]),
    productIds.length
      ? selectAll<FeedbackDayRow>(
          db, "zs_feedback_day", "product_id,date,feedbacks,avg_rating",
          ["product_id", "date"],
          (q) => q.in("product_id", productIds).gte("date", axisFrom),
        )
      : Promise.resolve([]),
    productIds.length
      ? selectAll<{ product_id: number; first_date: string }>(
          db, "zs_feedback_span", "product_id,first_date", ["product_id"],
          (q) => q.in("product_id", productIds),
        )
      : Promise.resolve([]),
  ]);

  // ------------------------------------------------------------ yigʻish
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
        sweepsExpected: bounds.sweeps_per_day ?? 12,
        windowHours: null,
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
      windowHours: row.window_hours,
    };
  }

  // Kunlik qatorlar SIYRAK saqlanadi: faqat oʻlchovi bor kun/mahsulot.
  // Toʻliq massiv soʻralgan mahsulot uchun quriladi va keshlanadi.
  const sparse = new Map<number, Map<string, Partial<ProductDay>>>();
  const put = (productId: number, date: string, patch: Partial<ProductDay>) => {
    let byDate = sparse.get(productId);
    if (!byDate) sparse.set(productId, (byDate = new Map()));
    byDate.set(date, { ...byDate.get(date), ...patch });
  };

  for (const row of productDayRows) {
    put(row.product_id, row.date, {
      price: row.price ?? 0,
      discountPercent: row.discount_percent ?? 0,
      stock: row.stock ?? 0,
      reviews: row.reviews ?? 0,
      buyersPerWeek: row.buyers_per_week ?? 0,
      soldUnits: row.sold_units ?? 0,
      restockedUnits: row.restocked_units ?? 0,
      outOfStock: row.out_of_stock,
      measured: true,
      observedAt: row.observed_at,
      firstObservedAt: row.first_observed_at,
    });
  }

  // Sharh tarixi boshlangan kundan keyin sharhsiz kun — NOL, undan oldingisi
  // NOMAʻLUM. Ikkisini farqlamasak grafik "sharh boʻlmagan" deb yolgʻon aytadi.
  const firstFeedback = new Map(feedbackSpanRows.map((r) => [r.product_id, r.first_date]));
  for (const row of feedbackDayRows) {
    put(row.product_id, row.date, {
      newFeedbacks: row.feedbacks,
      feedbackRating: row.avg_rating,
    });
  }

  const blank = (productId: number, date: string): ProductDay => ({
    productId,
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
    observedAt: null,
    firstObservedAt: null,
  });

  const cache = new Map<number, ProductDay[]>();
  const getProductDays = (productId: number): ProductDay[] => {
    const hit = cache.get(productId);
    if (hit) return hit;

    const byDate = sparse.get(productId);
    const since = firstFeedback.get(productId);
    const series = dates.map((date) => {
      const day = blank(productId, date);
      // Sharh tarixi ichidagi kun — nol, undan oldingisi nomaʻlum.
      if (since && date >= since) day.newFeedbacks = 0;
      return Object.assign(day, byDate?.get(date));
    });

    cache.set(productId, series);
    return series;
  };

  return {
    categories,
    shops,
    products,
    shopDays,
    getProductDays,
    productsByShop: groupBy(products, (p) => p.shopId),
    productsByCategory: groupBy(products, (p) => p.categoryId),
    shopsByCategory: groupBy(shops, (s) => s.categoryId),
    dates,
    scope,
    truncated,
    measured: bounds.measured,
    firstDay: bounds.first_day,
    status: {
      lastSweepAt: bounds.last_sweep_at,
      coveragePercent: bounds.coverage_percent,
      errors: bounds.errors,
      source: bounds.source ?? "nomaʻlum",
    },
    sweepsPerDay: bounds.sweeps_per_day ?? 12,
  };
}

interface PanelShopRow {
  id: number;
  name: string;
  category_id: number | null;
  official: boolean;
}

interface PanelProductRow {
  id: number;
  title: string;
  shop_id: number | null;
  category_id: number | null;
}

interface ShopDayRow {
  shop_id: number;
  date: string;
  orders: number | null;
  orders_certain: boolean;
  avg_price: number | null;
  sweeps: number;
  sweeps_expected: number;
  window_hours: number | null;
}

interface ProductDayRow {
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
  observed_at: string | null;
  first_observed_at: string | null;
}

interface FeedbackDayRow {
  product_id: number;
  date: string;
  feedbacks: number;
  avg_rating: number | null;
}

function unique(values: (number | null)[]): number[] {
  return [...new Set(values.filter((v): v is number => v != null))];
}

function dedupeById<T extends { id: number }>(rows: T[]): T[] {
  const seen = new Map<number, T>();
  for (const row of rows) if (!seen.has(row.id)) seen.set(row.id, row);
  return [...seen.values()];
}

// `buildDateAxis` va `buildStatus` olib tashlandi. Ular vaqt oʻqini va
// qamrovni brauzerga tortilgan barcha qatorlardan hisoblardi — endi ikkisi
// ham `zs_panel_bounds` da, bitta soʻrovda keladi.

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

// ---------------------------------------------------------------- yigʻindilar
//
// Yigʻindi va reyting bazada hisoblanadi. Ilgari panel qatorlarni oʻqib
// brauzerda qoʻshardi — bir xil raqam ikki joyda hisoblansa, ikki xil
// chiqishi mumkin. Bu yerda faqat chaqiruv va oʻqish bor.

export interface MarketSummaryRow {
  orders: number | null;
  revenue: number | null;
  shops_measured: number;
  shop_days_missing: number;
  window_min_hours: number | null;
  window_max_hours: number | null;
  sweeps: number | null;
  sweeps_expected: number | null;
}

export interface RankRow {
  shop_id?: number;
  shop_name?: string;
  category_id: number | null;
  category_name: string | null;
  shop_count?: number;
  official?: boolean;
  value: number | null;
  orders?: number | null;
  revenue: number | null;
  // Mahsulot qatorlarida keladi.
  product_id?: number;
  title?: string;
  units?: number | null;
  buyers?: number | null;
  price?: number | null;
  stock?: number | null;
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw new Error(`${name} bajarilmadi: ${error.message}`);
  return data as T;
}

/**
 * Bozor sahifasining hamma raqami — **bitta** soʻrovda.
 *
 * Ilgari sahifa 10 ta RPC yuborardi: yigʻindi, grafik, ikki reyting va
 * "qaysi asosda maʻlumot bor" degan olti zondlovchi. Ularning ustiga har
 * daqiqada butun toʻplam qayta oʻqilardi. Brauzer bu portlashni koʻtara
 * olmay soʻrovlarning bir qismini serverga **yubormasdan** tashlardi va
 * panel `TypeError: Failed to fetch` deb yozardi. Server jurnalida esa
 * hammasi 200 boʻlib turardi — tashlangan soʻrov u yerga yetib bormagan,
 * shuning uchun bu xato bazaning hajmiga umuman bogʻliq emas edi.
 */
export interface PanelOverview {
  summary: MarketSummaryRow;
  daily: { date: string; value: number | null }[];
  shops: RankRow[];
  categories: RankRow[];
  products: RankRow[];
  rank_available: Record<string, boolean>;
  series_available: Record<string, boolean>;
  /** Roʻyxatlarda jami nechtadan bor — "hammasi" havolasi yonida turadi. */
  totals: { shops: number; categories: number; products: number };
}

const EMPTY_SUMMARY: MarketSummaryRow = {
  orders: null,
  revenue: null,
  shops_measured: 0,
  shop_days_missing: 0,
  window_min_hours: null,
  window_max_hours: null,
  sweeps: null,
  sweeps_expected: null,
};

export async function fetchPanelOverview(
  from: string,
  to: string,
  basis: string,
  series: string,
  limit = 5,
): Promise<PanelOverview> {
  const data = await callRpc<PanelOverview | null>("zs_panel_overview", {
    p_from: from,
    p_to: to,
    p_basis: basis,
    p_series: series,
    p_limit: limit,
  });
  // Bazadan boʻsh javob kelsa ham sahifa chizilishi kerak: ramka joyida
  // qoladi, raqam oʻrnida chiziqcha turadi.
  return {
    summary: data?.summary ?? EMPTY_SUMMARY,
    daily: data?.daily ?? [],
    shops: data?.shops ?? [],
    categories: data?.categories ?? [],
    products: data?.products ?? [],
    rank_available: data?.rank_available ?? {},
    series_available: data?.series_available ?? {},
    totals: data?.totals ?? { shops: 0, categories: 0, products: 0 },
  };
}

/**
 * Sahifalangan toʻliq roʻyxat.
 *
 * Panel faqat beshtasini koʻrsatardi va qolganiga yoʻl yoʻq edi: oʻlchangan
 * 76 doʻkonning 71 tasi, 81 mahsulotning 76 tasi ekranda umuman
 * koʻrinmasdi. Maʻlumot bor edi, chiqish joyi yoʻq edi.
 *
 * Sahifalash bazada: roʻyxat kuzatuv boʻyicha oʻsadi va uni butunlay
 * brauzerga tashlab boʻlmaydi.
 */
export interface RankPage {
  /** Roʻyxatdagi jami obyekt (oʻlchovsizlari ham). */
  total: number;
  /** Shundan raqami borlari. Qolganida chiziqcha turadi. */
  measured: number;
  offset: number;
  rows: RankRow[];
}

export type RankKind = "shop" | "category" | "product";

/**
 * Qidiruv bazada.
 *
 * Ilgari panel butun lugʻatni brauzerga yuklab olib oʻsha yerda qidirardi.
 * 81 mahsulotda bu sezilmasdi; 50 000 da esa lugʻatning oʻzi panelni
 * yiqitadigan hajmga aylanadi. Normalizatsiya (kirill → lotin, apostrof)
 * bazada ham xuddi shu qoida boʻyicha bajariladi — aks holda "Oʻzbekiston"
 * bir joyda topilib, boshqasida topilmasdi.
 */
export interface SearchRow {
  kind: string;
  id: number;
  name: string;
  context: string;
  orders: number;
  revenue: number;
}

export async function fetchSearch(
  kind: string,
  query: string,
  from: string,
  to: string,
  limit = 8,
): Promise<SearchRow[]> {
  return (
    (await callRpc<SearchRow[] | null>("zs_search", {
      p_kind: kind,
      p_query: query,
      p_from: from,
      p_to: to,
      p_limit: limit,
    })) ?? []
  );
}

export async function fetchRankPage(
  kind: RankKind,
  from: string,
  to: string,
  basis: string,
  limit: number,
  offset: number,
): Promise<RankPage> {
  const data = await callRpc<RankPage | null>("zs_rank_page", {
    p_kind: kind,
    p_from: from,
    p_to: to,
    p_basis: basis,
    p_limit: limit,
    p_offset: offset,
  });
  return {
    total: data?.total ?? 0,
    measured: data?.measured ?? 0,
    offset: data?.offset ?? offset,
    rows: data?.rows ?? [],
  };
}

// Ilgari bu yerda `fetchMarketSummary`, `fetchMarketDaily`, `fetchShopRank`
// va `fetchCategoryRank` alohida turardi. Ular endi `zs_panel_overview`
// ichida, bazada chaqiriladi. Brauzer tomonidagi nusxalari olib tashlandi:
// ishlatilmaydigan ikkinchi yoʻl vaqt oʻtib birinchisidan ajralib ketadi va
// qaysi biri toʻgʻri ekanini aytib boʻlmay qoladi.

/**
 * Bitta mahsulotning xom oʻlchovlari — har biri alohida qator.
 *
 * Kunlik jadval kunni yigʻadi va kun yakunini koʻrsatadi. Bu esa oʻlchov
 * jurnali: qaysi raqam aynan qachon koʻrilgani. Oʻlchov faqat oʻzgarganda
 * yoziladi (06.5), shuning uchun ikki qator orasidagi boʻshliq "oʻzgarmagan"
 * degani — maʻlumot yoʻqligi emas.
 */
export interface ObservationRow {
  observed_at: string;
  price: number | null;
  full_price: number | null;
  discount_percent: number | null;
  stock: number | null;
  reviews: number | null;
  buyers_per_week: number | null;
  available: boolean | null;
}

export async function fetchProductObservations(
  productId: number,
  from: string,
  to: string,
): Promise<ObservationRow[]> {
  const { data, error } = await client()
    .from("zs_product_observation")
    .select("observed_at,price,full_price,discount_percent,stock,reviews,buyers_per_week,available")
    .eq("product_id", productId)
    .gte("observed_at", `${from}T00:00:00+05:00`)
    // Kun oxirigacha: chegara sanasining ertasi, Toshkent zonasida.
    .lt("observed_at", `${to}T23:59:59.999+05:00`)
    .order("observed_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`zs_product_observation oʻqilmadi: ${error.message}`);
  return (data ?? []) as ObservationRow[];
}
