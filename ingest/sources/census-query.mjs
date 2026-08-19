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
      # official soʻraladi, lekin YOZILMAYDI — Uzum uni doim false
      # qaytaradi. Soʻrovda qoldirilgan sababi: Uzum toʻldira boshlasa,
      # bir marta tekshirib bilamiz. (Bu yerda backtick ishlatib
      # boʻlmaydi: soʻrov JS shablon satri ichida.)
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
        // Uzum bu maydonni ISHLATMAYDI. 63 113 doʻkondan birortasi ham
        // `true` emas — ARTEL_OFFICIAL, Artel Brand Shop, Яшкино ham `false`.
        // Yaʼni Uzumning `false` i "rasmiy emas" degani emas: u doimiy.
        // Doimiyni oʻlchov deb yozsak, boʻshliq oʻlchov boʻlib koʻrinadi.
        // Boshqa bozor (WB, Yandex) haqiqiy belgi bersa — oʻsha manba yozadi.
        official: null,
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
