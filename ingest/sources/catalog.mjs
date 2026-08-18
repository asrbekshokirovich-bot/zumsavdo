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
  CATEGORY_QUERY,
  FEEDBACKS_QUERY,
  MAIN_PAGE_QUERY,
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

/**
 * Bir partiyada nechta mahsulot oʻlchanadi.
 *
 * Partiya bazaga bir chaqiruvda yoziladi, shuning uchun u juda katta
 * boʻlmasligi kerak: yigʻish oʻrtasida uzilsa, yozilmagan qism shuncha
 * boʻladi.
 */
const PRODUCTS_PER_BATCH = 40;

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

  /** Bitta mahsulot sahifasi. Oʻlik id butun sweepni toʻxtatmaydi. */
  async function fetchOne(id, observedAt, dead) {
    try {
      const data = await gqlPatient(PRODUCT_PAGE_QUERY, { id });
      return parse.productPage(data.productPage, observedAt);
    } catch (error) {
      if (error instanceof AccessDeniedError) throw error;
      dead.push({ id, reason: error.message.slice(0, 120) });
      return null;
    }
  }

  /**
   * Mahsulot sahifalarini oladi — parallel.
   *
   * Nega parallel: kuzatuv roʻyxati perepisdan toʻlgach 50 000 ga chiqdi.
   * Ketma-ket, sekundiga bitta soʻrov bilan bu 14 soat degani — sweep
   * hech qachon tugamasdi. 12 parallel soʻrovda ~26 soʻrov/sek chiqadi va
   * oʻsha ish 35 daqiqaga tushadi. 12 raqami oʻlchangan: shu darajada
   * Uzum 429 qaytarmadi.
   */
  async function fetchProducts(ids, observedAt, dead) {
    const out = [];
    for (let i = 0; i < ids.length; i += config.concurrency) {
      const chunk = ids.slice(i, i + config.concurrency);
      const results = await Promise.all(chunk.map((id) => fetchOne(id, observedAt, dead)));
      for (const r of results) if (r) out.push(r);
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

      // Mahsulotlar aniq berilgan boʻlsa qidiruv umuman ishlatilmaydi —
      // uni tekshirish ham shart emas.
      if (config.track.products.length) {
        const data = await gqlPatient(PRODUCT_PAGE_QUERY, {
          id: config.track.products[0],
        });
        return { product: data?.productPage?.product?.id ?? null };
      }

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

      if (
        !config.track.products.length &&
        !config.track.shops.length &&
        !config.track.categories.length
      ) {
        throw new SourceError(
          "Kuzatiladigan hech narsa yoʻq. `npm run discover` bilan mahsulot toping " +
            "yoki ZUMSAVDO_TRACK_SHOPS ni toʻldiring.",
        );
      }

      // Mahsulotlar roʻyxati boʻlsa — asosiy yoʻl shu.
      //
      // Doʻkonlar mahsulot sahifasidan **kelib chiqadi**, oldindan berilmaydi:
      // bitta roʻyxat oʻnlab doʻkonni qamrab olishi mumkin. Ilgari bu tsikl
      // har doʻkon uchun bir xil mahsulotlarni qayta olardi — bir doʻkonda
      // ishlagan, koʻpida notoʻgʻri boʻlardi.
      if (config.track.products.length) {
        for (const chunk of chunks(config.track.products, PRODUCTS_PER_BATCH)) {
          const dead = [];
          const pages = await fetchProducts(chunk, observedAt, dead);
          yield toBatch(pages, observedAt, dead, {
            scope: `products:${chunk[0]}…`,
            reported: chunk.length,
            listed: chunk.length,
          });
        }
        return;
      }

      // Roʻyxat berilmagan — doʻkon mahsulotlari qidiruv orqali olinadi.
      for (const shopId of config.track.shops) {
        const dead = [];
        let listing;
        try {
          listing = await listCards(SHOP_PRODUCTS_QUERY, "shopId", shopId);
        } catch (error) {
          if (error instanceof AccessDeniedError) throw error;
          yield emptyBatch(1, `doʻkon ${shopId} roʻyxati olinmadi: ${error.message}`);
          continue;
        }

        const pages = await fetchProducts(
          listing.cards.map((c) => c.productId),
          observedAt,
          dead,
        );

        const batch = toBatch(pages, observedAt, dead, {
          scope: `shop:${shopId}`,
          reported: listing.total,
          listed: listing.cards.length,
          truncated: listing.truncated,
        });
        // Roʻyxatdagi oʻrin faqat shu yoʻlda maʻlum — qidiruv tartibi bilan.
        batch.positions = listing.cards.map((c) => ({
          productId: c.productId,
          shopId,
          position: c.position,
          observedAt,
        }));
        yield batch;
      }
    },

    /**
     * Yangi mahsulot topish — qidiruvsiz.
     *
     * Bosh sahifa karusellari boshqa subgrafdan keladi, shuning uchun
     * `search-gateway` bloklangan boʻlsa ham ishlaydi. Bu butun katalog
     * emas va shunday deb koʻrsatilmaydi ham: nechta topilgani aynan
     * qaytariladi, "hammasi" degan daʻvo qilinmaydi.
     */
    async discoverProducts({ pages = 3, size = 50 } = {}) {
      const found = new Map();
      for (let page = 0; page < pages; page++) {
        const data = await gqlPatient(MAIN_PAGE_QUERY, { page, size });
        const cards = parse.mainCards(data);
        if (!cards.length) break;
        for (const card of cards) {
          if (!found.has(card.productId)) found.set(card.productId, card);
        }
      }
      return [...found.values()];
    },

    /**
     * Turkum daraxti — ildizdan pastga.
     *
     * `category(id)` har chaqiruvda faqat bir qavat bolani beradi, shuning
     * uchun daraxt kenglik boʻyicha aylanib chiqiladi. `maxNodes` ataylab
     * majburiy chegara: daraxt bir necha mingta va uni toʻliq aylanish
     * uzoq — nechtasi olingani chaqiruvchiga qaytariladi.
     */
    async collectCategories({ rootId = 1, maxNodes = 400 } = {}) {
      const seen = new Map();
      const queue = [{ id: rootId, parentId: null }];

      while (queue.length && seen.size < maxNodes) {
        const { id, parentId } = queue.shift();
        if (seen.has(id)) continue;

        let node;
        try {
          const data = await gqlPatient(CATEGORY_QUERY, { id });
          node = parse.category(data, parentId);
        } catch (error) {
          if (error instanceof AccessDeniedError) throw error;
          continue;
        }
        if (!node) continue;

        seen.set(node.id, { id: node.id, name: node.name, parentId: node.parentId });
        for (const child of node.children) {
          if (!seen.has(child.id)) queue.push({ id: child.id, parentId: node.id });
        }
      }

      return { categories: [...seen.values()], remaining: queue.length };
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
            data = await gqlPatient(FEEDBACKS_QUERY, { id: productId, page, size });
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

/**
 * Mahsulot sahifalarini bazaga tushadigan partiyaga aylantiradi.
 *
 * Doʻkon, turkum va SKU hammasi shu sahifalardan chiqadi — alohida soʻrov
 * kerak emas.
 */
function toBatch(pages, observedAt, dead, coverage) {
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

  return {
    categories: [...categories.values()],
    shops: [...shops.values()].map((s) => ({
      id: s.id,
      name: s.name,
      categoryId: null,
      official: s.official,
    })),
    products,
    // Doʻkon hisoblagichi har mahsulot sahifasida takrorlanadi — bittasi
    // yetarli, lekin u har sweepda yozilishi shart (kunlik sotuv shundan).
    shopObservations: [...shops.values()].map((shop) => ({
      shopId: shop.id,
      observedAt,
      ordersQuantity: shop.ordersQuantity,
      reviews: shop.feedbackQuantity,
      rating: shop.rating,
    })),
    productObservations,
    skuObservations,
    positions: [],
    errors: dead.length,
    // Qamrov tekshiruvi uchun. `dead` — son: bazadagi ustun butun son.
    coverage: {
      truncated: 0,
      ...coverage,
      captured: pages.length,
      dead: dead.length,
    },
    // Qaysi id lar oʻlgani — faqat log uchun, bazaga yozilmaydi.
    deadIds: dead,
  };
}

/** Roʻyxatni teng boʻlaklarga boʻladi. */
function* chunks(items, size) {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
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
