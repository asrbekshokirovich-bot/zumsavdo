#!/usr/bin/env node
/**
 * Kuzatiladigan mahsulotlarni topish va turkum daraxtini yigʻish.
 *
 * Nega alohida buyruq: kashfiyot oʻlchov emas. U kuniga bir marta ham
 * yetarli, sweep esa har ikki soatda ishlaydi. Ikkalasini qoʻshib yuborish
 * har sweepda keraksiz soʻrov degani.
 *
 * Ishlatish:
 *   node discover.mjs                 # mahsulot + turkum
 *   node discover.mjs --products      # faqat mahsulot
 *   node discover.mjs --categories    # faqat turkum
 *   node discover.mjs --pages 5       # nechta karusel sahifasi
 */

import { loadConfig } from "./config.mjs";
import { createStore } from "./lib/store.mjs";
import { createCatalogSource } from "./sources/catalog.mjs";

function log(message) {
  process.stdout.write(`${new Date().toISOString()}  ${message}\n`);
}

function flagValue(args, name, fallback) {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return fallback;
  const value = Number(args[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const args = process.argv.slice(2);
const only = args.includes("--products")
  ? "products"
  : args.includes("--categories")
    ? "categories"
    : "both";

const config = loadConfig();
const source = createCatalogSource(config, {
  onWait: (ms, attempt) => log(`Tezlik chegarasi — ${ms / 1000}s kutilyapti (${attempt}-urinish)...`),
});
const store = createStore(config);

if (only !== "categories") {
  const pages = flagValue(args, "--pages", 3);
  const cards = await source.discoverProducts({ pages });
  log(`Bosh sahifadan ${cards.length} ta mahsulot topildi.`);

  if (cards.length) {
    const added = await store.trackProducts(cards.map((c) => c.productId), "main-page");
    log(`Kuzatuvga qoʻshildi: ${added} ta yangi (qolgani allaqachon roʻyxatda).`);
  }
}

if (only !== "products") {
  const maxNodes = flagValue(args, "--categories-max", 400);
  const { categories, remaining } = await source.collectCategories({ maxNodes });
  log(`Turkum daraxti: ${categories.length} ta tugun olindi, ${remaining} ta navbatda qoldi.`);

  if (categories.length) {
    // Turkumlar oʻlchov emas — ular lugʻat, shuning uchun sweepsiz yoziladi.
    const sweepId = await store.openSweep("uzum-catalog", "turkum daraxti");
    await store.saveBatch(sweepId, { categories });
    await store.closeSweep(sweepId, {
      targets: categories.length,
      captured: categories.length,
      errors: 0,
      note: remaining ? `${remaining} ta tugun olinmadi (chegara)` : null,
    });
    log(`Turkumlar bazaga yozildi.`);
  }
}

log("Tayyor. Endi: npm run sweep");
