import { buyersFromActions } from "./catalog-queries.mjs";

/**
 * Perepis soʻrovi — ataylab yengil.
 *
 * `skuList` soʻralmaydi. Oʻlchandi: u bilan javob 5,0 KB, usiz 0,4 KB —
 * 16 barobar farq. 2,7 mln mahsulotda bu 13 GB va 1 GB oʻrtasidagi farq.
 * Variantlar 2-qatlamda, tanlangan mahsulotlar uchun olinadi.
 *
 * `actions` esa qoldirilgan: u atigi 0,1 KB qoʻshadi, evaziga haftalik
 * xaridorlar sonini beradi — 2-qatlamga kimni olishni aynan shu raqam
 * hal qiladi.
 *
 * `ordersQuantity` faqat doʻkonniki. Mahsulotniki yaxlitlangan va haqiqiy
 * sotuvning ~55% ini koʻrsatadi, shuning uchun hech qachon soʻralmaydi.
 */
export const CENSUS_QUERY = `
query zumsavdoCensus($id: Int!) {
  productPage(id: $id) {
    actions { __typename ... on MotivationAction { text } }
    product {
      id
      title
      rating
      feedbackQuantity
      minSellPrice
      minFullPrice
      category { id title }
      shop { id title official ordersQuantity }
    }
  }
}`;

/** Javobdan lugʻat va yengil oʻlchov ajratadi. `null` — mahsulot yoʻq. */
export function parseCensus(node, observedAt) {
  const product = node?.product;
  if (!product?.id) return null;

  const shop = product.shop
    ? {
        id: Number(product.shop.id),
        name: product.shop.title ?? `Sotuvchi ${product.shop.id}`,
        // Uzum bu maydonni toʻldirmaydi (2026-08-19 da jonli tekshirilgan:
        // Artel Brand Shop, ARTEL_OFFICIAL, Яшкино — hammasi false).
        // `Boolean(...)` boʻsh javobni `false` ga aylantirardi, yaʼni
        // "bilmadim" "yoʻq" boʻlib yozilardi. Xom holida uzatamiz.
        official: toBool(product.shop.official),
        ordersQuantity: toInt(product.shop.ordersQuantity),
      }
    : null;

  const category = product.category
    ? { id: Number(product.category.id), name: product.category.title }
    : null;

  return {
    shop,
    category,
    product: {
      id: Number(product.id),
      title: product.title ?? `Mahsulot ${product.id}`,
      shopId: shop?.id ?? null,
      categoryId: category?.id ?? null,
    },
    census: {
      id: Number(product.id),
      observedAt,
      price: toInt(product.minSellPrice),
      fullPrice: toInt(product.minFullPrice),
      reviews: toInt(product.feedbackQuantity),
      rating: toNumber(product.rating),
      buyersPerWeek: buyersFromActions(node.actions),
      shopOrders: shop?.ordersQuantity ?? null,
    },
  };
}

/**
 * "Yoʻq" bilan "bilmadim" ni ajratadi.
 *
 * `Boolean(undefined)` → `false`. Shu bitta jimgina almashtirish
 * oʻlchanmagan maydonni oʻlchangan qilib koʻrsatadi. Bunday qiymat
 * bazaga tushsa, keyin uni oʻlchovdan ajratib boʻlmaydi.
 */
function toBool(value) {
  return typeof value === "boolean" ? value : null;
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
