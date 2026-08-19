#!/usr/bin/env node
/**
 * Sweep — bitta yig'ish sessiyasi.
 *
 * Oqim: manba xom o'lchov beradi → o'lchovlar bazaga yoziladi → kunlik
 * yig'indi bazada qayta hisoblanadi. Kunlik raqam hech qachon manbadan
 * to'g'ridan-to'g'ri olinmaydi, u doim ikki o'lchov farqidan chiqadi.
 *
 * Ishga tushirish:
 *   node ingest/run-sweep.mjs              # ZUMSAVDO_SOURCE bo'yicha
 *   node ingest/run-sweep.mjs --probe      # manba javobini bosib chiqaradi
 *   node ingest/run-sweep.mjs --rollup-only
 */

import { loadConfig } from "./config.mjs";
import { createStore } from "./lib/store.mjs";
import { AccessDeniedError } from "./lib/http.mjs";
import { createCatalogSource } from "./sources/catalog.mjs";

/** 06.7 — bajarilish ulushi shundan past boʻlsa run "xato" deb belgilanadi. */
const MIN_COMPLETION = 0.9;

/** 07 — qamrov meʻyori. */
const MIN_COVERAGE = 0.99;

/**
 * Manbalar roʻyxati. Ataylab bitta: yigʻuvchi faqat oʻlchay oladi, yasay
 * olmaydi. Namuna generatori olib tashlangan — u haqiqiy bazaga toʻqilgan
 * oʻlchov yozib qoʻygan edi.
 */
const SOURCES = {
  "uzum-catalog": createCatalogSource,
};

function log(message) {
  process.stdout.write(`${new Date().toISOString()}  ${message}\n`);
}

/** Toshkent vaqti bo'yicha kun kaliti — rollup ham shu chegarani ishlatadi. */
function tashkentDate(iso) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const config = loadConfig();

  const factory = SOURCES[config.source];
  if (!factory) {
    throw new Error(
      `Noma'lum manba "${config.source}". Mavjud: ${Object.keys(SOURCES).join(", ")}`,
    );
  }

  const source = factory(config, {
    onWait: (ms, attempt) =>
      log(`Uzum tezlik chegarasi (429) — ${ms / 1000}s kutilyapti (${attempt}-urinish)...`),
  });
  const store = createStore(config);
  log(`Manba: ${source.describe()}`);

  if (args.has("--probe")) {
    if (!source.probe) throw new Error(`${source.name} manbasida --probe yo'q.`);
    const result = await source.probe();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (args.has("--rollup-only")) {
    const to = tashkentDate(new Date().toISOString());
    const from = shiftDate(to, -config.rollbackDays);
    const rows = await store.rollup(from, to);
    log(`Rollup ${from}…${to}: ${JSON.stringify(rows)}`);
    return;
  }

  // Kuzatuv ro'yxati bazada turadi (discover uni to'ldiradi). `.env` dagi
  // ro'yxat ham qo'shiladi — u qo'lda qo'yilgan, ya'ni ataylab tanlangan.
  if (!config.dryRun && config.source === "uzum-catalog") {
    const fromEnv = config.track.products.length;
    try {
      const tracked = await store.trackedProducts();
      if (tracked.length) {
        config.track.products = [...new Set([...config.track.products, ...tracked])];
        log(`Kuzatuvda ${config.track.products.length} ta mahsulot (${tracked.length} tasi bazadan).`);
      }
    } catch (error) {
      // Ro'yxat o'qilmasa sweep qidiruv yo'liga tushib ketardi — u Uzumda
      // tez-tez bloklanadi, natijada sabab "429" bo'lib ko'rinardi va asl
      // sabab (baza javob bermadi) yo'qolardi.
      if (!fromEnv) {
        throw new Error(
          `Kuzatuv ro'yxati o'qilmadi va .env da ham mahsulot yo'q: ${error.message}`,
        );
      }
      log(`OGOHLANTIRISH — kuzatuv ro'yxati o'qilmadi (${error.message}). ` +
          `Faqat .env dagi ${fromEnv} ta mahsulot olinadi.`);
    }
  }

  await source.preflight();
  log("Preflight o'tdi.");

  const slots = source.slots();
  log(`${slots.length} ta o'lchov oni.`);

  const touchedDates = new Set();
  /** Sharh tarixi uchun — sweepda koʻrilgan mahsulotlar. */
  const seenProducts = new Set();
  let totalMeasured = 0;
  let totalStored = 0;
  let totalErrors = 0;
  /** 07-band: Uzum nechta dedi ↔ biz nechtasini oldik. */
  const coverage = { reported: 0, captured: 0, truncated: 0, dead: 0 };

  for (const [index, slot] of slots.entries()) {
    // Dry run bazaga umuman tegmaydi — sweep ham ochilmaydi.
    const sweepId = config.dryRun ? null : await store.openSweep(source.name, `slot ${slot.key}`);
    let targets = 0;
    /** Nechta obyekt haqiqatan oʻlchandi. Bajarilish ulushi shundan chiqadi. */
    let measured = 0;
    /** Nechta qator bazaga tushdi. Oʻzgarmagan oʻlchov yozilmaydi (06.5). */
    let stored = 0;
    let errors = 0;

    try {
      for await (const batch of source.collect(slot)) {
        targets += batch.shops.length + batch.products.length;
        errors += batch.errors ?? 0;
        measured += batch.shopObservations.length + batch.productObservations.length;

        if (batch.coverage) {
          coverage.reported += batch.coverage.reported ?? 0;
          coverage.captured += batch.coverage.captured ?? 0;
          coverage.truncated += batch.coverage.truncated ?? 0;
          coverage.dead += batch.coverage.dead ?? 0;
        }

        if (config.dryRun) continue;

        stored += await store.saveBatch(sweepId, batch);

        for (const o of batch.shopObservations) touchedDates.add(tashkentDate(o.observedAt));
        for (const o of batch.productObservations) {
          touchedDates.add(tashkentDate(o.observedAt));
          seenProducts.add(o.productId);
        }
      }
    } catch (error) {
      errors++;
      if (!config.dryRun) {
        await store.closeSweep(sweepId, {
          targets,
          captured: measured,
          errors,
          note: `to'xtadi: ${error.message}`,
        });
      }
      throw error;
    }

    if (!config.dryRun) {
      // 06.7: rejalashtirilganning 90% idan kam OʻLCHANSA — run "xato".
      //
      // Bu yerda ataylab `measured` ishlatiladi, `stored` emas. Oʻlchov
      // oʻzgarmagan boʻlsa bazaga yozilmaydi (06.5), shuning uchun yozilgan
      // qator soni bajarilish oʻlchovi emas — narx bir hafta turgan doʻkon
      // "qamrov past" deb notoʻgʻri belgilanardi.
      const ratio = targets > 0 ? measured / targets : 1;
      const note =
        ratio < MIN_COMPLETION
          ? `qamrov past: ${(ratio * 100).toFixed(1)}% (${measured}/${targets})`
          : null;
      await store.closeSweep(sweepId, {
        targets,
        captured: measured,
        errors: note ? errors + 1 : errors,
        note,
      });
      if (note) log(`OGOHLANTIRISH — ${note}`);
    }

    totalMeasured += measured;
    totalStored += stored;
    totalErrors += errors;

    if (slots.length > 1 && (index + 1) % 20 === 0) {
      log(`${index + 1}/${slots.length} o'lchov oni yozildi.`);
    }
  }

  // Ikki raqam ataylab alohida: o'lchangan ≠ yozilgan. O'zgarmagan o'lchov
  // yozilmaydi, va bu xato emas — 06.5 shuni talab qiladi.
  log(
    `O'lchandi: ${totalMeasured}, bazaga yozildi: ${totalStored} ` +
      `(o'zgarmaganlari yozilmaydi), ${totalErrors} xato.`,
  );

  if (config.dryRun) {
    log("Dry run — bazaga hech narsa yozilmadi.");
    return;
  }

  await collectFeedbackHistory(config, source, store);

  // Yig'indi tegilgan kunlardan bir kun oldin boshlanadi: kunlik farq oldingi
  // kun yakuniga tayanadi.
  const dates = [...touchedDates].sort();
  const from = shiftDate(dates[0] ?? tashkentDate(new Date().toISOString()), -1);
  const to = dates[dates.length - 1] ?? from;
  const rows = await store.rollup(from, to);
  log(`Rollup ${from}…${to}: ${JSON.stringify(rows)}`);

  // Do'kon turkumi mahsulotlardan kelib chiqadi va yangi mahsulot qo'shilsa
  // siljiydi. Uni shu yerda — o'lchovdan keyin — yangilaymiz, panel so'rovi
  // paytida emas.
  const shops = await store.refreshShopCategories();
  log(`Do'kon turkumi yangilandi: ${shops} ta`);
}

/**
 * Sharh tarixi — o'lchovdan keyin, alohida sweepda.
 *
 * Nega alohida: sharh o'lchov emas. Qolgan hamma raqam kamida ikki o'lchov
 * farqidan chiqadi, ya'ni birinchi kuni bo'sh bo'ladi. Sharh esa sanasi bilan
 * keladi — u kutmasdan tarix beradi. Shuning uchun uni kunlik sweep ichida
 * emas, undan keyin yig'amiz: asosiy o'lchov sharh xatosidan yiqilmasin.
 *
 * Sharh o'zgarmaydi, faqat yangisi qo'shiladi — takroriy sweep hech narsani
 * ikkilantirmaydi (kalit — sharh id si).
 */
async function collectFeedbackHistory(config, source, store) {
  if (!config.feedbackPages || !source.collectFeedbacks) return;

  // Sweepda koʻrilganlar emas, SHARHI YOʻQLAR olinadi. Sabab: sharh
  // oʻzgarmaydi, bir marta yigʻilsa yetarli — har safar 50 000 mahsulotdan
  // qayta soʻrash 150 000 keraksiz soʻrov boʻlardi.
  const productIds = new Set(await store.feedbackBacklog(config.feedbackBatch));
  if (!productIds.size) {
    log("Sharh navbati boʻsh — hammasining tarixi yigʻilgan.");
    return;
  }
  log(`Sharh navbati: ${productIds.size} mahsulot.`);

  const sweepId = await store.openSweep(source.name, "sharh tarixi");
  let written = 0;
  let errors = 0;

  try {
    for await (const batch of source.collectFeedbacks([...productIds], {
      pages: config.feedbackPages,
    })) {
      written += await store.saveFeedbacks(sweepId, batch.feedbacks);
    }
    log(`Sharhlar: ${written} ta yangi (${productIds.size} mahsulot).`);
  } catch (error) {
    // Sharh tushmasa o'lchov baribir o'z joyida — sweep muvaffaqiyatsiz
    // deb belgilanadi, lekin butun run yiqilmaydi.
    errors = 1;
    log(`Sharhlar olinmadi: ${error.message}`);
  }

  await store.closeSweep(sweepId, {
    targets: productIds.size,
    captured: written,
    errors,
    note: errors ? "sharh tarixi to'liq emas" : null,
  });
}

function shiftDate(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

main().catch((error) => {
  if (error instanceof AccessDeniedError) {
    process.stderr.write(
      `\nMANBA RUXSAT BERMADI\n${error.message}\n\n` +
        `Uzum katalogi brauzerdan kelmagan so'rovni chekkasidayoq rad etadi.\n` +
        `Buni aylanib o'tish ularning himoyasini sindirish bo'ladi — yig'uvchi\n` +
        `bunday qilmaydi. Kirish huquqi Uzumdan rasmiy olinishi va\n` +
        `UZUM_CATALOG_HEADERS ga qo'yilishi kerak.\n`,
    );
    process.exit(2);
  }
  process.stderr.write(`\nXATO: ${error.message}\n`);
  process.exit(1);
});
