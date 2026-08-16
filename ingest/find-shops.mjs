#!/usr/bin/env node
/**
 * Doʻkon id larini topish.
 *
 * `ZUMSAVDO_TRACK_SHOPS` ga nima yozishni bilish uchun. Uzumda doʻkon id si
 * hech qayerda koʻrinmaydi — u faqat mahsulot orqali olinadi, shuning uchun
 * bu yordamchi mahsulotdan doʻkonga chiqadi.
 *
 * Ishlatish:
 *   node find-shops.mjs https://uzum.uz/uz/product/...-560305
 *   node find-shops.mjs 560305 1234567
 *   node find-shops.mjs "simsiz quloqchin"
 *
 * Havola yoki raqam berilsa mahsulot sahifasi oʻqiladi (ishonchli yoʻl).
 * Matn berilsa qidiruv ishlatiladi — u tez soʻrovda 429 qaytarishi mumkin.
 */

import { loadConfig } from "./config.mjs";
import { createTokenProvider } from "./lib/token.mjs";
import { PRODUCT_PAGE_QUERY, SHOP_PRODUCTS_QUERY, parse } from "./sources/catalog-queries.mjs";

const config = loadConfig({ requireSupabase: false });
const tokens = createTokenProvider(config);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  const token = await tokens.get();
  const response = await fetch(config.catalog.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": config.catalog.userAgent,
      "x-iid": config.catalog.installationId,
      "Accept-Language": config.catalog.language,
      Origin: "https://uzum.uz",
      Referer: "https://uzum.uz/",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data ?? {};
}

/** Havoladan yoki oddiy raqamdan mahsulot id sini ajratadi. */
function productIdFrom(arg) {
  const direct = Number(arg);
  if (Number.isInteger(direct) && direct > 0) return direct;
  // https://uzum.uz/uz/product/nomi-560305
  const match = String(arg).match(/-(\d{4,})(?:\?|#|$)/) || String(arg).match(/(\d{5,})/);
  return match ? Number(match[1]) : null;
}

const args = process.argv.slice(2);
if (!args.length) {
  process.stdout.write(
    "Ishlatish:\n" +
      "  node find-shops.mjs <uzum havolasi>\n" +
      "  node find-shops.mjs <mahsulot id>\n" +
      '  node find-shops.mjs "qidiruv soʻzi"\n',
  );
  process.exit(1);
}

const found = new Map();

for (const arg of args) {
  const productId = productIdFrom(arg);

  if (productId) {
    try {
      const data = await gql(PRODUCT_PAGE_QUERY, { id: productId });
      const page = parse.productPage(data.productPage, new Date().toISOString());
      if (!page?.shop) {
        process.stdout.write(`${productId}: doʻkon topilmadi\n`);
      } else {
        found.set(page.shop.id, page.shop);
      }
    } catch (error) {
      process.stdout.write(`${productId}: ${error.message}\n`);
    }
    await wait(1500);
    continue;
  }

  // Matn — qidiruv orqali. Bu yoʻl tez soʻrovda 429 beradi.
  try {
    const data = await gql(SHOP_PRODUCTS_QUERY, { shopId: "0", offset: 0, limit: 1 });
    void data;
  } catch {
    /* shopId=0 ishlamasa ham zarari yoʻq — quyida qidiruv ishlatiladi */
  }
  process.stdout.write(
    `"${arg}": qidiruv orqali izlash uchun mahsulot havolasini bering — ` +
      "qidiruv uchi tez-tez 429 qaytaradi.\n",
  );
}

if (!found.size) process.exit(0);

process.stdout.write("\nTopilgan doʻkonlar:\n");
for (const shop of found.values()) {
  process.stdout.write(
    `  ${shop.id}  ${shop.name}` +
      `  · buyurtma ${shop.ordersQuantity ?? "—"}` +
      `  · sharh ${shop.feedbackQuantity ?? "—"}` +
      (shop.official ? "  · rasmiy" : "") +
      "\n",
  );
}

process.stdout.write(
  `\n.env ga qoʻying:\nZUMSAVDO_TRACK_SHOPS=${[...found.keys()].join(",")}\n`,
);
