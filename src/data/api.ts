import { daysBetween } from "@/lib/dates";
import { type Period, rankPeriod } from "@/lib/period";
import { MIN_QUERY_LENGTH, matchScore } from "@/lib/normalize";
import { getDataset, productEvents, shopEvents } from "./dataset";
import type {
  Category,
  ChangeEvent,
  Metric,
  Product,
  ProductDay,
  Rank,
  SearchHit,
  SearchKind,
  SeriesPoint,
  Shop,
  ShopDay,
  SweepStatus,
} from "./types";

/**
 * Soʻrov qatlami.
 *
 * Sahifalar faqat shu funksiyalarni biladi. Sweep qiluvchi haqiqiy backend
 * ulanganda bu fayl HTTP chaqiruvlariga aylanadi, sahifalar oʻzgarmaydi.
 */

/**
 * Faol toʻplam har chaqiruvda oʻqiladi — ombor yuklangach u almashadi va
 * modul darajasidagi nusxa eskirib qolmasligi kerak.
 */
function db() {
  return getDataset();
}

/** Davr ichidagi kunlar indekslari. */
function sliceIndexes(period: Period): number[] {
  const first = daysBetween(db().dates[0], period.from);
  const last = daysBetween(db().dates[0], period.to);
  const out: number[] = [];
  for (let i = Math.max(0, first); i <= Math.min(db().dates.length - 1, last); i++) {
    out.push(i);
  }
  return out;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------- holat

export function getStatus(): SweepStatus {
  return db().status;
}

export function getDates(): string[] {
  return db().dates;
}

// ---------------------------------------------------------------- xomashyo

export function getShop(id: number): Shop | undefined {
  return db().shops.find((s) => s.id === id);
}

export function getProduct(id: number): Product | undefined {
  return db().products.find((p) => p.id === id);
}

export function getCategory(id: number): Category | undefined {
  return db().categories.find((c) => c.id === id);
}

export function shopProductCount(shopId: number): number {
  return db().productsByShop.get(shopId)?.length ?? 0;
}

export function categoryCounts(categoryId: number): { products: number; shops: number } {
  return {
    products: db().productsByCategory.get(categoryId)?.length ?? 0,
    shops: db().shopsByCategory.get(categoryId)?.length ?? 0,
  };
}

// ---------------------------------------------------------------- oʻlchovlar

/**
 * Buyurtmalar — ANIQ raqam. `Shop.ordersQuantity` hisoblagichining farqi.
 *
 * "Bugun" tanlanganda kun toʻliq emas: nechta oʻlchov tushgani izohda yoziladi,
 * aks holda tushib qolgan yarim kun oʻsish yoki pasayish deb oʻqiladi.
 */
function ordersMetric(days: ShopDay[], indexes: number[], period: Period): Metric {
  const known = indexes.filter((i) => days[i]?.orders != null);
  // Bitta ham oʻlchov boʻlmasa raqam yoʻq. Nol yozish "sotuv boʻlmagan" degan
  // javob beradi, holbuki javob nomaʻlum.
  const value = known.length ? sum(known.map((i) => ordersOf(days[i]))) : null;
  const notes: string[] = [];

  if (period.id === "today") {
    const last = days[indexes[indexes.length - 1]];
    if (last) notes.push(`${last.sweeps}/${last.sweepsExpected} oʻlchov tushgan`);
  }

  const missing = countMissing(days, indexes);
  if (missing > 0) {
    notes.push(`${missing} kun uchun oʻlchov yetmagan — u yigʻindiga kirmadi`);
  }

  return { value, certainty: "exact", note: notes.join(" · ") || undefined };
}

/**
 * Oʻlchovi yoʻq kun nol deb sanaladi, lekin bu izohda aytiladi.
 *
 * Nolni jimgina qoʻshish yigʻindini pasaytiradi va sotuvchi buni tushish deb
 * oʻqiydi — shuning uchun tushib qolgan kunlar soni har doim yoziladi.
 */
function ordersOf(day: ShopDay | undefined): number {
  return day?.orders ?? 0;
}

function countMissing(days: ShopDay[], indexes: number[]): number {
  return indexes.filter((i) => days[i] && days[i].orders === null).length;
}

/** Aylanma — TAXMINIY. Dona × narx, shuning uchun hech qachon aniq emas. */
function revenueMetric(days: ShopDay[], indexes: number[]): Metric {
  const known = indexes.filter((i) => days[i]?.orders != null);
  const value = known.length
    ? sum(known.map((i) => ordersOf(days[i]) * (days[i]?.avgPrice ?? 0)))
    : null;
  return { value, certainty: "approx" };
}

function shopDailyOrders(shopId: number, indexes: number[]): SeriesPoint[] {
  const days = db().shopDays.get(shopId) ?? [];
  // Grafikda nomaʻlum kun nol qilib chizilmaydi — chiziq uziladi.
  return indexes.map((i) => ({ date: db().dates[i], value: days[i]?.orders ?? null }));
}

// ---------------------------------------------------------------- bosh sahifa

export interface MarketSummary {
  orders: Metric;
  revenue: Metric;
  daily: SeriesPoint[];
}

export function marketSummary(period: Period): MarketSummary {
  const indexes = sliceIndexes(period);
  let orders = 0;
  let revenue = 0;
  const daily: SeriesPoint[] = indexes.map((i) => ({ date: db().dates[i], value: null }));
  let missing = 0;

  for (const shop of db().shops) {
    const days = db().shopDays.get(shop.id) ?? [];
    indexes.forEach((i, slot) => {
      const day = days[i];
      if (!day) return;
      if (day.orders === null) {
        missing++;
        return;
      }
      orders += day.orders;
      revenue += day.orders * day.avgPrice;
      // Bitta sotuvchida oʻlchov boʻlsa kun maʻlum: null dan songa oʻtadi.
      daily[slot].value = (daily[slot].value ?? 0) + day.orders;
    });
  }

  const lastIndex = indexes[indexes.length - 1];
  const anyShop = db().shopDays.get(db().shops[0]?.id ?? 0) ?? [];
  const notes: string[] = [];
  if (period.id === "today" && anyShop[lastIndex]) {
    notes.push(`${anyShop[lastIndex].sweeps}/${anyShop[lastIndex].sweepsExpected} oʻlchov tushgan`);
  }
  if (missing > 0) {
    notes.push(`${missing} sotuvchi-kun uchun oʻlchov yetmagan`);
  }

  const known = daily.some((d) => d.value !== null);

  return {
    orders: {
      value: known ? orders : null,
      certainty: "exact",
      note: notes.join(" · ") || undefined,
    },
    revenue: { value: known ? revenue : null, certainty: "approx" },
    daily,
  };
}

/**
 * Roʻyxat nima boʻyicha saralanadi.
 *
 * Buyurtma eng ishonchli, lekin u ikki kun chegarasi farqi — birinchi kuni
 * hech kimda boʻlmaydi va roʻyxat butunlay boʻsh chiqadi. Qolgan ikkitasi
 * birinchi oʻlchovdanoq ishlaydi, shuning uchun ular zaxira emas, teng
 * huquqli tanlov.
 */
export type RankBasis = "orders" | "buyers" | "units";

export const RANK_BASES: {
  id: RankBasis;
  label: string;
  /** Raqamdan keyingi birlik — "142 xaridor" kabi. */
  unit: string;
  hint: string;
  certainty: Metric["certainty"];
}[] = [
  {
    id: "orders",
    label: "Buyurtma",
    unit: "ta",
    hint: "Shop.ordersQuantity hisoblagichining kunlik farqi — ikki oʻlchov kerak",
    certainty: "exact",
  },
  {
    id: "buyers",
    label: "Xaridor / hafta",
    unit: "kishi · soʻnggi 7 kun",
    hint: 'Kartochkadagi "Bu haftada N kishi sotib oldi" — doim 7 kunlik oyna, davr tugmasi buni oʻzgartirmaydi',
    certainty: "exact",
  },
  {
    id: "units",
    label: "Sotilgan dona",
    unit: "dona · taxminiy",
    hint: "Qoldiq kamayishidan hisoblangan — oraliqda tovar keltirilsa bir qismi koʻrinmaydi",
    certainty: "approx",
  },
];

export interface RankedShop {
  shop: Shop;
  categoryName: string;
  /** `null` — davr ichida birorta ham kun uchun buyurtma farqi hisoblanmagan. */
  orders: number | null;
  revenue: number | null;
  /** Tanlangan asos boʻyicha qiymat — roʻyxat shu boʻyicha saralanadi. */
  value: number | null;
}

/**
 * Mahsulot qatorlaridan tanlangan asos boʻyicha qiymat.
 *
 * `buyers` yigʻindi emas, oxirgi kun qiymati: manba allaqachon 7 kunlik
 * oyna, kunlar boʻyicha qoʻshsak bir xaridorni yetti marta sanagan boʻlardik.
 */
function productMetric(productIds: number[], indexes: number[], basis: RankBasis): number | null {
  if (basis === "orders") return null;
  const last = indexes[indexes.length - 1];
  let total = 0;
  let known = false;
  for (const id of productIds) {
    const days = db().productDays.get(id) ?? [];
    if (basis === "buyers") {
      if (!days[last]?.measured) continue;
      total += days[last].buyersPerWeek;
      known = true;
    } else {
      for (const i of indexes) {
        if (!days[i]?.measured) continue;
        total += days[i].soldUnits;
        known = true;
      }
    }
  }
  return known ? total : null;
}

/**
 * Sotuvchilarni buyurtma boʻyicha saralaydi.
 *
 * Oʻlchovi yoʻq sotuvchi nolga tenglashtirilmaydi — u roʻyxat oxirida turadi
 * va raqami chiziqcha boʻlib koʻrinadi. Nol "sotuv boʻlmagan" degan javob,
 * bu yerda esa javob yoʻq.
 */
export function shopsRanked(period: Period, basis: RankBasis = "orders"): RankedShop[] {
  const indexes = sliceIndexes(period);
  return db()
    .shops.map((shop) => {
      const days = db().shopDays.get(shop.id) ?? [];
      const measured = indexes.filter((i) => days[i]?.orders != null);
      const orders = measured.length ? sum(measured.map((i) => ordersOf(days[i]))) : null;
      return {
        shop,
        categoryName: getCategory(shop.categoryId)?.name ?? "",
        orders,
        revenue: measured.length
          ? sum(measured.map((i) => ordersOf(days[i]) * (days[i]?.avgPrice ?? 0)))
          : null,
        value:
          basis === "orders"
            ? orders
            : productMetric(db().productsByShop.get(shop.id) ?? [], indexes, basis),
      };
    })
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
}

export interface RankedCategory {
  category: Category;
  /** `null` — davr ichida birorta ham oʻlchov yoʻq. */
  orders: number | null;
  revenue: number | null;
  shopCount: number;
  /** Tanlangan asos boʻyicha qiymat — roʻyxat shu boʻyicha saralanadi. */
  value: number | null;
}

/**
 * Turkumlarni buyurtma boʻyicha saralaydi.
 *
 * Kuzatilayotgan sotuvchisi yoʻq turkum roʻyxatga umuman kirmaydi. Turkum
 * daraxti Uzumdan toʻliq olinadi (yuzlab tugun), lekin ularning aksariyatida
 * bizda hali oʻlchov yoʻq — ularni "top" deb koʻrsatish maʻnosiz: roʻyxat
 * boshini boʻsh turkumlar egallab, haqiqiylarini pastga surib yuborardi.
 */
export function categoriesRanked(period: Period, basis: RankBasis = "orders"): RankedCategory[] {
  const indexes = sliceIndexes(period);
  return db()
    .categories.map((category) => {
      const shopIds = db().shopsByCategory.get(category.id) ?? [];
      let orders = 0;
      let revenue = 0;
      let measured = 0;
      for (const id of shopIds) {
        const days = db().shopDays.get(id) ?? [];
        for (const i of indexes) {
          const day = days[i];
          if (!day || day.orders === null) continue;
          measured++;
          orders += day.orders;
          revenue += day.orders * day.avgPrice;
        }
      }
      const ranked = measured ? orders : null;
      return {
        category,
        orders: ranked,
        revenue: measured ? revenue : null,
        shopCount: shopIds.length,
        value:
          basis === "orders"
            ? ranked
            : productMetric(db().productsByCategory.get(category.id) ?? [], indexes, basis),
      };
    })
    .filter((row) => row.shopCount > 0)
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
}

// ---------------------------------------------------------------- oʻrin

/**
 * Oʻrin doim 30 kunlik oynada va doim turkum ichida hisoblanadi.
 *
 * Uch narsa qaytariladi — nima boʻyicha, kimlar orasida, qaysi davrda. Ularsiz
 * "#3" raqami maʻnosiz. Oʻsish/tushish strelkasi yoʻq: ikkinchi oʻlchov
 * yigʻilmagan, shuning uchun oʻrin oʻzgarishini daʻvo qilib boʻlmaydi.
 */
export function shopRank(shopId: number): Rank | null {
  const shop = getShop(shopId);
  if (!shop) return null;
  const period = rankPeriod();
  const indexes = sliceIndexes(period);
  const siblings = db().shopsByCategory.get(shop.categoryId) ?? [];

  const scored = siblings
    .map((id) => {
      const days = db().shopDays.get(id) ?? [];
      return { id, orders: sum(indexes.map((i) => ordersOf(days[i]))) };
    })
    .sort((a, b) => b.orders - a.orders);

  const position = scored.findIndex((s) => s.id === shopId) + 1;
  if (!position) return null;

  return {
    position,
    outOf: scored.length,
    basis: "buyurtma boʻyicha",
    scope: `${getCategory(shop.categoryId)?.name} turkumidagi sotuvchilar`,
    period: "30 kun",
  };
}

export function productRank(productId: number): Rank | null {
  const product = getProduct(productId);
  if (!product) return null;
  const period = rankPeriod();
  const indexes = sliceIndexes(period);
  const siblings = db().productsByCategory.get(product.categoryId) ?? [];

  const scored = siblings
    .map((id) => {
      const days = db().productDays.get(id) ?? [];
      return { id, units: sum(indexes.map((i) => days[i]?.soldUnits ?? 0)) };
    })
    .sort((a, b) => b.units - a.units);

  const position = scored.findIndex((s) => s.id === productId) + 1;
  if (!position) return null;

  return {
    position,
    outOf: scored.length,
    basis: "sotilgan dona boʻyicha (taxminiy)",
    scope: `${getCategory(product.categoryId)?.name} turkumidagi mahsulotlar`,
    period: "30 kun",
  };
}

// ---------------------------------------------------------------- qidiruv

export function search(kind: SearchKind, query: string, limit = 8): SearchHit[] {
  if (query.trim().length < MIN_QUERY_LENGTH) return [];
  const period = rankPeriod();
  const indexes = sliceIndexes(period);

  if (kind === "shop") {
    return db().shops
      .map((shop) => ({ shop, score: matchScore(shop.name, query) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ shop }) => {
        const days = db().shopDays.get(shop.id) ?? [];
        return {
          kind,
          id: shop.id,
          name: shop.name,
          context: getCategory(shop.categoryId)?.name ?? "",
          orders: sum(indexes.map((i) => ordersOf(days[i]))),
          revenue: sum(indexes.map((i) => ordersOf(days[i]) * (days[i]?.avgPrice ?? 0))),
          rank: shopRank(shop.id),
        };
      });
  }

  if (kind === "product") {
    return db().products
      .map((product) => ({ product, score: matchScore(product.name, query) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ product }) => {
        const days = db().productDays.get(product.id) ?? [];
        const units = sum(indexes.map((i) => days[i]?.soldUnits ?? 0));
        const revenue = sum(indexes.map((i) => (days[i]?.soldUnits ?? 0) * (days[i]?.price ?? 0)));
        return {
          kind,
          id: product.id,
          name: product.name,
          context: getShop(product.shopId)?.name ?? "",
          orders: units,
          revenue,
          rank: productRank(product.id),
        };
      });
  }

  return db().categories
    .map((category) => ({ category, score: matchScore(category.name, query) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ category }) => {
      const ranked = categoriesRanked(period).find((c) => c.category.id === category.id);
      return {
        kind,
        id: category.id,
        name: category.name,
        context: `${categoryCounts(category.id).shops} sotuvchi`,
        orders: ranked?.orders ?? 0,
        revenue: ranked?.revenue ?? 0,
        rank: null,
      };
    });
}

// ---------------------------------------------------------------- sotuvchi

export interface ShopProductRow {
  product: Product;
  price: number;
  buyersPerWeek: number;
  units: number;
  stock: number;
  outOfStock: boolean;
}

export interface ShopView {
  shop: Shop;
  categoryName: string;
  productCount: number;
  orders: Metric;
  revenue: Metric;
  rank: Rank | null;
  daily: SeriesPoint[];
  /**
   * Turkumning oʻrtacha sotuvchisi — bir sotuvchi bilan solishtirish uchun
   * turkum yigʻindisi emas, aynan oʻrtachasi olinadi, aks holda ikki chiziq
   * turli kattalikda boʻlib, taqqoslash maʻnosini yoʻqotadi.
   */
  categoryDaily: SeriesPoint[];
  events: ChangeEvent[];
  products: ShopProductRow[];
}

export function shopView(shopId: number, period: Period): ShopView | null {
  const shop = getShop(shopId);
  if (!shop) return null;

  const indexes = sliceIndexes(period);
  const days = db().shopDays.get(shopId) ?? [];
  const siblings = db().shopsByCategory.get(shop.categoryId) ?? [];

  const categoryDaily: SeriesPoint[] = indexes.map((i) => {
    let total = 0;
    let known = 0;
    for (const id of siblings) {
      const value = db().shopDays.get(id)?.[i]?.orders;
      if (value == null) continue;
      total += value;
      known++;
    }
    // Oʻrtacha faqat oʻlchovi bor sotuvchilar boʻyicha — yoʻqlarini nol deb
    // sanash turkumni sunʻiy ravishda past koʻrsatadi.
    return { date: db().dates[i], value: known ? total / known : null };
  });

  const productIds = db().productsByShop.get(shopId) ?? [];
  const lastIndex = indexes[indexes.length - 1] ?? db().dates.length - 1;

  const products: ShopProductRow[] = productIds
    .map((id) => {
      const product = getProduct(id)!;
      const series = db().productDays.get(id) ?? [];
      const last = series[lastIndex];
      return {
        product,
        price: last?.price ?? 0,
        buyersPerWeek: last?.buyersPerWeek ?? 0,
        units: sum(indexes.map((i) => series[i]?.soldUnits ?? 0)),
        stock: last?.stock ?? 0,
        outOfStock: last?.outOfStock ?? false,
      };
    })
    .sort((a, b) => b.units - a.units);

  return {
    shop,
    categoryName: getCategory(shop.categoryId)?.name ?? "",
    productCount: productIds.length,
    orders: ordersMetric(days, indexes, period),
    revenue: revenueMetric(days, indexes),
    rank: shopRank(shopId),
    daily: shopDailyOrders(shopId, indexes),
    categoryDaily,
    events: shopEvents(days).filter((e) => e.date >= period.from && e.date <= period.to),
    products,
  };
}

// ---------------------------------------------------------------- mahsulot

export interface ProductView {
  product: Product;
  shop: Shop;
  categoryName: string;
  discountPercent: number;
  /** MotivationAction.text — ANIQ, doim 7 kunlik. */
  buyersPerWeek: Metric;
  /** Qoldiq kamayishidan — TAXMINIY. */
  units: Metric;
  /** Qoldiq oʻsishidan — TAXMINIY. Tovar keltirilgani. */
  restocked: Metric;
  rank: Rank | null;
  price: number;
  stock: number;
  series: {
    sold: SeriesPoint[];
    price: SeriesPoint[];
    stock: SeriesPoint[];
    reviews: SeriesPoint[];
    /** Kunlik tovar keltirilishi — sotuv bilan bir oʻqda. */
    restocked: SeriesPoint[];
    /** Kunlik yangi sharhlar — sanasi Uzumdan keladi, oʻlchov kutilmaydi. */
    feedbacks: SeriesPoint[];
  };
  /** Davr ichida nechta yangi sharh — ANIQ. */
  feedbacks: Metric;
  /** Tovar boʻlmagan kunlar — grafikda kulrang soya. */
  outOfStockDates: string[];
  events: ChangeEvent[];
}

export function productView(productId: number, period: Period): ProductView | null {
  const product = getProduct(productId);
  if (!product) return null;
  const shop = getShop(product.shopId);
  if (!shop) return null;

  const indexes = sliceIndexes(period);
  const series = db().productDays.get(productId) ?? [];
  const lastIndex = indexes[indexes.length - 1] ?? series.length - 1;
  const last = series[lastIndex];

  // Oʻlchov tushmagan kun `null` boʻladi — grafikda chiziq uziladi.
  // Ilgari bu yerda nol qaytarilardi va narx grafigi oʻlchovsiz kunlarda
  // nolga tushib ketardi; nol esa "narx nolga tushdi" degan javob.
  const pick = (read: (d: ProductDay) => number): SeriesPoint[] =>
    indexes.map((i) => ({
      date: db().dates[i],
      value: series[i]?.measured ? read(series[i]) : null,
    }));

  const feedbackPoints: SeriesPoint[] = indexes.map((i) => ({
    date: db().dates[i],
    value: series[i]?.newFeedbacks ?? null,
  }));
  const feedbackTotal = feedbackPoints.reduce<number | null>(
    (acc, p) => (p.value === null ? acc : (acc ?? 0) + p.value),
    null,
  );

  return {
    product,
    shop,
    categoryName: getCategory(product.categoryId)?.name ?? "",
    discountPercent: last?.discountPercent ?? 0,
    // Davr tugmasi buni oʻzgartirmaydi — manba doim 7 kunlik oyna.
    buyersPerWeek: { value: last?.buyersPerWeek ?? 0, certainty: "exact", note: "doim 7 kunlik" },
    units: { value: sum(indexes.map((i) => series[i]?.soldUnits ?? 0)), certainty: "approx" },
    restocked: {
      value: sum(indexes.map((i) => series[i]?.restockedUnits ?? 0)),
      certainty: "approx",
    },
    rank: productRank(productId),
    price: last?.price ?? 0,
    stock: last?.stock ?? 0,
    series: {
      sold: pick((d) => d.soldUnits),
      price: pick((d) => d.price),
      stock: pick((d) => d.stock),
      reviews: pick((d) => d.reviews),
      restocked: pick((d) => d.restockedUnits),
      feedbacks: feedbackPoints,
    },
    feedbacks: { value: feedbackTotal, certainty: "exact" },
    outOfStockDates: indexes
      .filter((i) => series[i]?.measured && series[i]?.outOfStock)
      .map((i) => db().dates[i]),
    events: productEvents(series).filter((e) => e.date >= period.from && e.date <= period.to),
  };
}

// ---------------------------------------------------------------- turkum

export type EntryDifficulty = "oson" | "oʻrtacha" | "qiyin" | "nomaʻlum";

export interface CategoryView {
  category: Category;
  productCount: number;
  shopCount: number;
  orders: Metric;
  revenue: Metric;
  /** Bitta mahsulotga necha buyurtma toʻgʻri keladi — TAXMINIY emas, boʻlinma. */
  competition: number;
  verdict: {
    difficulty: EntryDifficulty;
    topFiveShare: number | null;
    /** Xulosa chiqarilmagan boʻlsa — nega chiqarilmagani. */
    reason: string;
  };
  shops: RankedShop[];
  products: { product: Product; units: number; price: number; shopName: string }[];
  daily: SeriesPoint[];
}

/**
 * Xulosa uchun eng kam sotuvchi soni.
 *
 * Bundan kam sotuvchi kuzatilgan turkumda top-5 ulushi 100% ga yaqin chiqadi va
 * "kirish qiyin" degan notoʻgʻri xulosaga olib keladi. Shuning uchun bunday
 * holatda xulosa umuman chiqarilmaydi.
 */
const MIN_SHOPS_FOR_VERDICT = 5;

export function categoryView(categoryId: number, period: Period): CategoryView | null {
  const category = getCategory(categoryId);
  if (!category) return null;

  const indexes = sliceIndexes(period);
  const shopIds = db().shopsByCategory.get(categoryId) ?? [];
  const productIds = db().productsByCategory.get(categoryId) ?? [];

  let orders = 0;
  let revenue = 0;
  const daily: SeriesPoint[] = indexes.map((i) => ({ date: db().dates[i], value: null }));

  const shops: RankedShop[] = shopIds
    .map((id) => {
      const shop = getShop(id)!;
      const days = db().shopDays.get(id) ?? [];
      let shopOrders = 0;
      let shopRevenue = 0;
      let measured = false;
      indexes.forEach((i, slot) => {
        const day = days[i];
        if (!day) return;
        if (day.orders === null) return;
        measured = true;
        shopOrders += day.orders;
        shopRevenue += day.orders * day.avgPrice;
        daily[slot].value = (daily[slot].value ?? 0) + day.orders;
      });
      orders += shopOrders;
      revenue += shopRevenue;
      // Oʻlchovi yoʻq sotuvchi nolga tenglashtirilmaydi — chiziqcha koʻrsatiladi.
      const value = measured ? shopOrders : null;
      return {
        shop,
        categoryName: category.name,
        orders: value,
        revenue: measured ? shopRevenue : null,
        value,
      };
    })
    .sort((a, b) => (b.orders ?? -1) - (a.orders ?? -1));

  const lastIndex = indexes[indexes.length - 1] ?? db().dates.length - 1;
  const products = productIds
    .map((id) => {
      const product = getProduct(id)!;
      const series = db().productDays.get(id) ?? [];
      return {
        product,
        units: sum(indexes.map((i) => series[i]?.soldUnits ?? 0)),
        price: series[lastIndex]?.price ?? 0,
        shopName: getShop(product.shopId)?.name ?? "",
      };
    })
    .sort((a, b) => b.units - a.units);

  const topFive = shops.slice(0, 5).reduce((a, s) => a + (s.orders ?? 0), 0);
  const share = orders > 0 ? topFive / orders : null;

  let difficulty: EntryDifficulty = "nomaʻlum";
  let reason =
    `Faqat ${shopIds.length} ta sotuvchi kuzatilgan — xulosa chiqarish uchun kam. ` +
    "Qamrov kengaygach hisoblanadi.";

  if (shopIds.length >= MIN_SHOPS_FOR_VERDICT && share !== null) {
    if (share >= 0.7) {
      difficulty = "qiyin";
      reason = "Buyurtmalarning katta qismi bir necha sotuvchida toʻplangan.";
    } else if (share >= 0.45) {
      difficulty = "oʻrtacha";
      reason = "Yetakchilar bor, lekin bozor ular bilan tugamaydi.";
    } else {
      difficulty = "oson";
      reason = "Buyurtmalar koʻp sotuvchi orasida taqsimlangan.";
    }
  }

  const measured = daily.some((d) => d.value !== null);

  return {
    category,
    productCount: productIds.length,
    shopCount: shopIds.length,
    orders: { value: measured ? orders : null, certainty: "exact" },
    revenue: { value: measured ? revenue : null, certainty: "approx" },
    competition: productIds.length ? orders / productIds.length : 0,
    verdict: { difficulty, topFiveShare: share, reason },
    shops,
    products,
    daily,
  };
}
