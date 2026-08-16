/**
 * Uzum katalogining GraphQL soʻrovlari.
 *
 * Maydonlar jonli sxemaga qarshi introspeksiya bilan tekshirilgan
 * (`__schema` / `__type`), taxmin qilinmagan. Tasdiqlanganlari:
 *
 *   Shop             → id, title, official, ordersQuantity, feedbackQuantity, rating
 *   Sku              → id, sellPrice, fullPrice, availableAmount, characteristicValues
 *   ProductPage      → actions, product, sortedFeedbacks
 *   MotivationAction → text  ("Bu haftada 772 kishi sotib oldi")
 *   Feedback         → id, rating, dateCreated, content
 *
 * Yuqori darajada `shop` soʻrovi **yoʻq** — doʻkon faqat mahsulot orqali
 * olinadi. Doʻkon mahsulotlari `makeSearch(shopId:)` bilan sahifalanadi.
 */

/**
 * Doʻkon mahsulotlari.
 *
 * `filters` va `sort` sxemada majburiy — ularsiz soʻrov validatsiyadan
 * oʻtmaydi. `limit` 100 dan oshsa Uzum rad etadi.
 */
export const SHOP_PRODUCTS_QUERY = `
query zumsavdoShopProducts($shopId: ID!, $offset: Int!, $limit: Int!) {
  makeSearch(query: {
    shopId: $shopId
    filters: []
    sort: BY_RELEVANCE_DESC
    pagination: { offset: $offset, limit: $limit }
    showAdultContent: TRUE
  }) {
    total
    items {
      catalogCard {
        __typename
        id
        title
        ... on SkuGroupCard { productId }
      }
    }
  }
}`;

/** Turkum roʻyxati — yangi mahsulot topish va roʻyxatdagi oʻrin uchun. */
export const CATEGORY_PRODUCTS_QUERY = `
query zumsavdoCategoryProducts($categoryId: ID!, $offset: Int!, $limit: Int!) {
  makeSearch(query: {
    categoryId: $categoryId
    filters: []
    sort: BY_RELEVANCE_DESC
    pagination: { offset: $offset, limit: $limit }
    showAdultContent: TRUE
  }) {
    total
    items {
      catalogCard {
        __typename
        id
        title
        ... on SkuGroupCard { productId }
      }
    }
  }
}`;

/**
 * Mahsulot sahifasi — bitta soʻrovda doʻkon, SKU va haftalik xaridorlar.
 *
 * `Product.ordersQuantity` ataylab soʻralmaydi: u yaxlitlangan va haqiqiy
 * sotuvning 54.9% ini beradi. Ishonchli raqam faqat `Shop.ordersQuantity`.
 *
 * `adMarker` ham soʻralmaydi — u butun soʻrovni buzadi.
 */
export const PRODUCT_PAGE_QUERY = `
query zumsavdoProductPage($id: Int!) {
  productPage(id: $id) {
    actions {
      __typename
      ... on MotivationAction { text type }
    }
    product {
      id
      title
      rating
      feedbackQuantity
      infoLabel { __typename }
      category { id title }
      shop {
        id
        title
        official
        ordersQuantity
        feedbackQuantity
        rating
      }
      skuList {
        id
        sellPrice
        fullPrice
        availableAmount
        characteristicValues { title value }
      }
    }
  }
}`;

/**
 * Sharhlar — 2024-yilgacha orqaga.
 *
 * Bu yagona maydon tarixni **kutmasdan** beradi: hech qachon oʻlchamagan
 * mahsulotning ham sanasi va bahosi bor. Qolgan hamma narsa uchun kamida ikki
 * oʻlchov kerak.
 */
export const FEEDBACKS_QUERY = `
query zumsavdoFeedbacks($id: Int!, $page: Int!, $size: Int!) {
  productPage(id: $id) {
    sortedFeedbacks(page: $page, size: $size) {
      feedbacks {
        id
        rating
        dateCreated
        content
        sku { id }
      }
    }
  }
}`;

/** Turkum daraxti — bolalari bilan. */
export const CATEGORY_QUERY = `
query zumsavdoCategory($id: Int!) {
  category(id: $id) {
    id
    title
    children { id title }
  }
}`;

// ---------------------------------------------------------------- ajratish

export const parse = {
  /** Mahsulot sahifasidan barcha kerakli oʻlchovlarni ajratadi. */
  productPage(node, observedAt) {
    const product = node?.product;
    if (!product) return null;

    const skus = (product.skuList ?? []).map((sku) => ({
      id: Number(sku.id),
      productId: Number(product.id),
      observedAt,
      sellPrice: toInt(sku.sellPrice),
      fullPrice: toInt(sku.fullPrice),
      availableAmount: toInt(sku.availableAmount),
      // "Rang: qora · Oʻlcham: M" — variantni odam oʻqiy oladigan nom.
      title:
        (sku.characteristicValues ?? [])
          .map((c) => `${c.title}: ${c.value}`)
          .join(" · ") || null,
    }));

    const stock = skus.reduce((sum, s) => sum + (s.availableAmount ?? 0), 0);
    const prices = skus.map((s) => s.sellPrice).filter((n) => n != null);

    return {
      shop: product.shop
        ? {
            id: Number(product.shop.id),
            name: product.shop.title ?? `Sotuvchi ${product.shop.id}`,
            official: Boolean(product.shop.official),
            ordersQuantity: toInt(product.shop.ordersQuantity),
            feedbackQuantity: toInt(product.shop.feedbackQuantity),
            rating: toNumber(product.shop.rating),
          }
        : null,
      category: product.category
        ? { id: Number(product.category.id), name: product.category.title }
        : null,
      product: {
        id: Number(product.id),
        title: product.title ?? `Mahsulot ${product.id}`,
        shopId: product.shop ? Number(product.shop.id) : null,
        categoryId: product.category ? Number(product.category.id) : null,
      },
      observation: {
        productId: Number(product.id),
        observedAt,
        price: prices.length ? Math.min(...prices) : null,
        fullPrice: skus.map((s) => s.fullPrice).find((n) => n != null) ?? null,
        discountPercent: discountPercent(skus),
        stock,
        reviews: toInt(product.feedbackQuantity),
        rating: toNumber(product.rating),
        buyersPerWeek: buyersFromActions(node.actions),
        available: stock > 0,
        priceDropped: Boolean(product.infoLabel),
      },
      skus,
    };
  },

  feedbacks(node, productId) {
    const list = node?.sortedFeedbacks?.feedbacks ?? [];
    return list
      .map((f) => ({
        id: Number(f.id),
        productId,
        skuId: f.sku?.id != null ? Number(f.sku.id) : null,
        rating: toInt(f.rating),
        // Timestamp millisekundda keladi.
        createdAt: f.dateCreated ? new Date(Number(f.dateCreated)).toISOString() : null,
        hasContent: Boolean(f.content),
      }))
      .filter((f) => Number.isFinite(f.id) && f.createdAt);
  },

  /** Roʻyxatdan mahsulot id larini ajratadi, oʻrni bilan birga. */
  searchCards(node, offset) {
    const items = node?.makeSearch?.items ?? [];
    return {
      total: toInt(node?.makeSearch?.total) ?? 0,
      cards: items
        .map((item, i) => {
          const card = item?.catalogCard;
          if (!card) return null;
          const productId = card.productId ?? card.id;
          return productId != null
            ? { productId: Number(productId), title: card.title, position: offset + i + 1 }
            : null;
        })
        .filter(Boolean),
    };
  },
};

/** Chegirma foizi SKU narxlaridan hisoblanadi — badge matni ishonchsiz. */
function discountPercent(skus) {
  for (const sku of skus) {
    if (sku.sellPrice != null && sku.fullPrice && sku.fullPrice > sku.sellPrice) {
      return Math.round(((sku.fullPrice - sku.sellPrice) / sku.fullPrice) * 100);
    }
  }
  return 0;
}

/**
 * "Bu haftada 772 kishi sotib oldi" → 772.
 *
 * Matn lotin va kirillda boʻlishi mumkin, raqam ichida boʻsh joy boʻlishi
 * mumkin. Mos kelmasa `null` — nol yozish "hech kim olmadi" degan yolgʻon.
 */
export function buyersFromActions(actions) {
  if (!Array.isArray(actions)) return null;
  for (const action of actions) {
    if (action?.__typename !== "MotivationAction") continue;
    const text = action.text;
    if (typeof text !== "string") continue;
    const match = text.replace(/[  ]/g, " ").match(/(\d[\d\s]*)\s*(kishi|человек)/i);
    if (match) {
      const n = Number(match[1].replace(/\s/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function toInt(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toNumber(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
