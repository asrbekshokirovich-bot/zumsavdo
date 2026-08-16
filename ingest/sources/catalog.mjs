import {
  AccessDeniedError,
  RateLimitedError,
  SourceError,
  createLimiter,
  fetchJson,
  looksRateLimited,
} from "../lib/http.mjs";
import { createTokenProvider } from "../lib/token.mjs";
import {
  CATEGORY_PRODUCTS_QUERY,
  FEEDBACKS_QUERY,
  PRODUCT_PAGE_QUERY,
  SHOP_PRODUCTS_QUERY,
  parse,
} from "./catalog-queries.mjs";

/**
 * Uzum katalogidan oʻlchov olish.
 *
 * Uch qoida yigʻuvchining shaklini belgilaydi:
 *
 *   1. Bitta soʻrovga 100 tagacha element sigʻadi — koʻproq boʻlsa rad etiladi.
 *   2. `offset` 10 000 dan oshsa roʻyxat ishlamaydi — katta turkum boʻlinadi.
 *   3. Bitta oʻlik id butun guruhni oʻldiradi — guruh ikkiga boʻlib qidiriladi.
 */

/** Bitta soʻrovdagi eng koʻp element. Uzumning qatʻiy chegarasi. */
const PAGE_LIMIT = 100;

/** `offset` shu qiymatdan oshsa Uzum boʻsh javob qaytaradi. */
const OFFSET_CEILING = 10_000;

export function createCatalogSource(config, { onWait } = {}) {
  const limit = createLimiter(config.rateLimit.perSecond);
  const tokens = createTokenProvider(config);
  const options = {
    limit,
    maxRetries: config.rateLimit.maxRetries,
    timeoutMs: config.rateLimit.timeoutMs,
  };

  async function gql(query, variables, { retryOn401 = true } = {}) {
    const token = await tokens.get();
    let body;

    try {
      body = await fetchJson(
        config.catalog.endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": config.catalog.userAgent,
            "x-iid": config.catalog.installationId,
            "Accept-Language": config.catalog.language,
            Origin: "https://uzum.uz",
            Referer: "https://uzum.uz/",
            Authorization: `Bearer ${token}`,
            ...config.catalog.headers,
          },
          body: JSON.stringify({ query, variables }),
        },
        options,
      );
    } catch (error) {
      // Token muddati tugagan boʻlishi mumkin — bir marta yangilab koʻramiz.
      if (error instanceof AccessDeniedError && retryOn401) {
        tokens.invalidate();
        return gql(query, variables, { retryOn401: false });
      }
      throw error;
    }

    // 200 OK ichidagi xato — eng xavfli holat. Faqat statusga qaralmaydi.
    if (body.errors?.length) {
      if (looksRateLimited(body.errors)) {
        throw new RateLimitedError(body.errors[0]?.message ?? "429");
      }
      throw new SourceError(body.errors.map((e) => e.message).join("; "));
    }
    return body.data ?? {};
  }

  /**
   * Tezlik chegarasiga tushsa kutib qayta uradi.
   *
   * Uzumning qidiruv uchi bir necha daqiqa sovushi mumkin, shuning uchun
   * kutish uzoq: 30s, 60s, 120s, 240s. Bu ataylab sabrli — hujjat "tez
   * boʻlsa bloklaydi" deydi, demak shoshilishning maʻnosi yoʻq.
   */
  async function gqlPatient(query, variables) {
    const waits = [30_000, 60_000, 120_000, 240_000];
    for (let attempt = 0; ; attempt++) {
      try {
        return await gql(query, variables);
      } catch (error) {
        if (!(error instanceof RateLimitedError) || attempt >= waits.length) {
          if (error instanceof RateLimitedError) {
            throw new SourceError(
              `Uzum tezlik chegarasi: ${waits.length} marta kutildi, hamon 429. ` +
                "Keyinroq qayta urining.",
            );
          }
          throw error;
        }
        const ms = waits[attempt];
        onWait?.(ms, attempt + 1);
        await new Promise((r) => setTimeout(r, ms));
      }
    }
  }

  /**
   * Roʻyxatni sahifalab oʻqiydi.
   *
   * `offset` shifti chegarasiga yetganda toʻxtaydi va nechta element qolgani
   * yoziladi — jimgina kesish "hammasi olindi" degan yolgʻon beradi.
   */
  async function listCards(query, variableName, id) {
    const cards = [];
    let total = 0;
    let truncated = 0;

    for (let offset = 0; ; offset += PAGE_LIMIT) {
      if (offset >= OFFSET_CEILING) {
        truncated = Math.max(0, total - cards.length);
        break;
      }
      const data = await gqlPatient(query, { [variableName]: String(id), offset, limit: PAGE_LIMIT });
      const page = parse.searchCards(data, offset);
      total = page.total;
      cards.push(...page.cards);
      if (page.cards.length < PAGE_LIMIT) break;
    }

    return { cards, total, truncated };
  }

  /**
   * Mahsulot sahifalarini oladi.
   *
   * Bitta oʻlik id butun guruhni yiqitadi, shuning uchun guruh xato bergan
   * joyda ikkiga boʻlinadi va oʻlik id yakka qolganda chetga qoʻyiladi.
   */
  async function fetchProducts(ids, observedAt, dead) {
    if (!ids.length) return [];

    if (ids.length === 1) {
      try {
        const data = await gqlPatient(PRODUCT_PAGE_QUERY, { id: ids[0] });
        const parsed = parse.productPage(data.productPage, observedAt);
        return parsed ? [parsed] : [];
      } catch (error) {
        if (error instanceof AccessDeniedError) throw error;
        dead.push({ id: ids[0], reason: error.message.slice(0, 120) });
        return [];
      }
    }

    const out = [];
    for (const id of ids) {
      const one = await fetchProducts([id], observedAt, dead);
      out.push(...one);
    }
    return out;
  }

  return {
    name: "uzum-catalog",

    describe() {
      return `Uzum katalogi (${config.catalog.endpoint}) — anonim token bilan`;
    },

    /**
     * Ulanishni tekshiradi: token olinadimi va sxema javob beradimi.
     */
    async preflight() {
      await tokens.get();
      const data = await gqlPatient(SHOP_PRODUCTS_QUERY, {
        shopId: String(config.track.shops[0] ?? 1),
        offset: 0,
        limit: 1,
      });
      return { total: data?.makeSearch?.total ?? 0 };
    },

    /** Javobni oʻzgartirmasdan qaytaradi — sxemani tekshirish uchun. */
    async probe() {
      const shopId = config.track.shops[0];
      const out = { token: Boolean(await tokens.get()) };
      if (shopId) {
        out.shopProducts = await gql(SHOP_PRODUCTS_QUERY, {
          shopId: String(shopId),
          offset: 0,
          limit: 3,
        });
        const first = parse.searchCards(out.shopProducts, 0).cards[0];
        if (first) {
          out.productPage = await gql(PRODUCT_PAGE_QUERY, { id: first.productId });
          out.feedbacks = await gql(FEEDBACKS_QUERY, {
            id: first.productId,
            page: 0,
            size: 3,
          });
        }
      }
      return out;
    },

    /** Jonli manba bir onda oʻlchaydi — oʻtmishni qayta oʻlchab boʻlmaydi. */
    slots() {
      const at = new Date().toISOString();
      return [{ key: at, observedAt: at }];
    },

    async *collect(slot) {
      const observedAt = slot.observedAt;
      const shopIds = config.track.shops;

      if (!shopIds.length && !config.track.categories.length) {
        throw new SourceError(
          "ZUMSAVDO_TRACK_SHOPS va ZUMSAVDO_TRACK_CATEGORIES boʻsh — nima kuzatilishi koʻrsatilmagan.",
        );
      }

      for (const shopId of shopIds) {
        const dead = [];
        let listing;

        try {
          listing = await listCards(SHOP_PRODUCTS_QUERY, "shopId", shopId);
        } catch (error) {
          if (error instanceof AccessDeniedError) throw error;
          yield emptyBatch(1, `doʻkon ${shopId} roʻyxati olinmadi: ${error.message}`);
          continue;
        }

        const ids = config.track.products.length
          ? listing.cards.map((c) => c.productId).filter((id) => config.track.products.includes(id))
          : listing.cards.map((c) => c.productId);

        const pages = await fetchProducts(ids, observedAt, dead);

        const shops = new Map();
        const categories = new Map();
        const products = [];
        const productObservations = [];
        const skuObservations = [];

        for (const page of pages) {
          if (page.shop) shops.set(page.shop.id, page.shop);
          if (page.category) categories.set(page.category.id, page.category);
          products.push(page.product);
          productObservations.push(page.observation);
          skuObservations.push(...page.skus);
        }

        // Doʻkon hisoblagichi har bir mahsulot sahifasida takrorlanadi —
        // bittasi yetarli, lekin u har sweepda yozilishi shart.
        const shopObservations = [...shops.values()].map((shop) => ({
          shopId: shop.id,
          observedAt,
          ordersQuantity: shop.ordersQuantity,
          reviews: shop.feedbackQuantity,
          rating: shop.rating,
        }));

        yield {
          categories: [...categories.values()],
          shops: [...shops.values()].map((s) => ({
            id: s.id,
            name: s.name,
            categoryId: null,
            official: s.official,
          })),
          products,
          shopObservations,
          productObservations,
          skuObservations,
          positions: listing.cards.map((c) => ({
            productId: c.productId,
            shopId,
            position: c.position,
            observedAt,
          })),
          errors: dead.length,
          // Qamrov tekshiruvi uchun: Uzum nechta deb aytdi, biz nechtasini oldik.
          coverage: {
            scope: `shop:${shopId}`,
            reported: listing.total,
            listed: listing.cards.length,
            captured: pages.length,
            truncated: listing.truncated,
            dead,
          },
        };
      }
    },

    /**
     * Sharhlar tarixi.
     *
     * Alohida oqim: u kunlik oʻlchovga bogʻliq emas va bir marta olinsa
     * yetarli — sharh oʻzgarmaydi, faqat yangisi qoʻshiladi.
     */
    async *collectFeedbacks(productIds, { pages = 5, size = 100 } = {}) {
      for (const productId of productIds) {
        const all = [];
        for (let page = 0; page < pages; page++) {
          let data;
          try {
            data = await gql(FEEDBACKS_QUERY, { id: productId, page, size });
          } catch (error) {
            if (error instanceof AccessDeniedError) throw error;
            break;
          }
          const batch = parse.feedbacks(data.productPage, productId);
          all.push(...batch);
          if (batch.length < size) break;
        }
        if (all.length) yield { productId, feedbacks: all };
      }
    },
  };
}

function emptyBatch(errors, note) {
  return {
    categories: [],
    shops: [],
    products: [],
    shopObservations: [],
    productObservations: [],
    skuObservations: [],
    positions: [],
    errors,
    note,
  };
}
