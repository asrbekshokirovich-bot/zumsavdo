#!/usr/bin/env node
/**
 * Perepis — butun Uzum katalogini id boʻyicha aylanib chiqish.
 *
 * Nega bu kerak: Uzumning qidiruv uchi bu IP uchun doimiy 429 qaytaradi,
 * yaʻni "turkumdagi mahsulotlar roʻyxati" yoʻli yopiq. `productPage(id:)`
 * esa ochiq. Oʻlchandi: id fazosi 1…~3,2 mln, undan pastda ~90% tirik.
 *
 * Nega boʻlaklab: bitta toʻliq aylanish ~34 soat. Bu bitta seansga
 * sigʻmaydi, shuning uchun holat bazada (`crawl_cursor`) saqlanadi va har
 * ishga tushish keyingi boʻlakni oladi. Uzilsa — yoʻqotish faqat oxirgi
 * yozilmagan boʻlak.
 *
 * Ishlatish:
 *   node census.mjs                 # bir boʻlak (standart 200 000 id)
 *   node census.mjs --size 50000    # boʻlak hajmi
 *   node census.mjs --minutes 100   # vaqt tugaguncha boʻlaklarni ketma-ket
 *   node census.mjs --status        # qay darajada bajarilgani
 *   node census.mjs --select 50000  # perepisdan 2-qatlamni tanlash
 */

import { loadConfig } from "./config.mjs";
import { createStore } from "./lib/store.mjs";
import { createTokenProvider } from "./lib/token.mjs";
import { CENSUS_QUERY, parseCensus } from "./sources/census-query.mjs";

/**
 * Bir vaqtda nechta soʻrov. Oʻlchandi: 12 tada 429 chiqmadi, tezlik
 * ~26 soʻrov/sek. Bundan yuqorisi sinalmagan — Uzum uzoq bloklashi mumkin,
 * u holda perepis tezlashmaydi, toʻxtaydi.
 */
const CONCURRENCY = Number(process.env.ZUMSAVDO_CENSUS_CONCURRENCY || 12);

/** Nechta natija toʻplangach bazaga yoziladi. */
const FLUSH_EVERY = 2000;

function log(message) {
  process.stdout.write(`${new Date().toISOString()}  ${message}\n`);
}

function flag(args, name, fallback) {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return fallback;
  const value = Number(args[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const args = process.argv.slice(2);
const config = loadConfig();
const store = createStore(config);

if (args.includes("--status")) {
  const status = await store.censusStatus();
  log(JSON.stringify(status));
  process.exit(0);
}

if (args.includes("--select")) {
  const limit = flag(args, "--select", 50000);
  const result = await store.selectTracked(limit);
  log(`2-qatlam tanlandi: ${JSON.stringify(result)}`);
  process.exit(0);
}

const tokens = createTokenProvider(config);

/**
 * Bitta id ni tekshiradi.
 *
 * Xato yutilmaydi, lekin toʻxtatmaydi ham: 2,7 mln id da bir nechtasi
 * javob bermasligi muqarrar. Ular sanaladi va oxirida yoziladi — jimgina
 * tashlab yuborilsa qamrov notoʻgʻri koʻrinardi.
 */
async function probe(id, observedAt) {
  const token = await tokens.get();
  try {
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
      body: JSON.stringify({ query: CENSUS_QUERY, variables: { id } }),
      signal: AbortSignal.timeout(config.rateLimit.timeoutMs),
    });

    if (response.status === 401) {
      tokens.invalidate();
      return { retry: true };
    }

    const body = await response.json();
    if (body.errors?.length) {
      const text = JSON.stringify(body.errors);
      if (/429|Too Many/i.test(text)) return { rateLimited: true };
      // Oʻchirilgan yoki mavjud boʻlmagan id — bu xato emas, javob.
      return { missing: true };
    }
    const parsed = parseCensus(body.data?.productPage, observedAt);
    return parsed ? { parsed } : { missing: true };
  } catch {
    return { failed: true };
  }
}

/** Toʻplangan natijalarni bazaga yozadi va toʻplamni boʻshatadi. */
async function flush(pass, batch, seen) {
  if (!batch.length && !seen) return 0;
  const shops = new Map();
  const categories = new Map();
  const products = [];
  const census = [];

  for (const item of batch) {
    if (item.shop) shops.set(item.shop.id, item.shop);
    if (item.category) categories.set(item.category.id, item.category);
    products.push(item.product);
    census.push(item.census);
  }

  return store.censusBatch(pass, {
    categories: [...categories.values()],
    shops: [...shops.values()],
    products,
    census,
    seen,
  });
}

const size = flag(args, "--size", 200000);
const minutes = flag(args, "--minutes", 0);
const deadline = minutes ? Date.now() + minutes * 60_000 : null;

let totalLive = 0;
let totalSeen = 0;
let totalMissing = 0;
let totalFailed = 0;
let rateLimitHits = 0;

for (;;) {
  const claim = await store.censusClaim(size);
  const { pass, from_id: fromId, to_id: toId } = claim;
  log(`Boʻlak: pass ${pass} · id ${fromId}…${toId} (${toId - fromId + 1} ta)`);

  const observedAt = new Date().toISOString();
  let batch = [];
  let seen = 0;
  const started = Date.now();

  for (let id = fromId; id <= toId; id += CONCURRENCY) {
    const ids = [];
    for (let k = 0; k < CONCURRENCY && id + k <= toId; k++) ids.push(id + k);

    const results = await Promise.all(ids.map((x) => probe(x, observedAt)));
    seen += ids.length;
    totalSeen += ids.length;

    for (const r of results) {
      if (r.parsed) batch.push(r.parsed);
      else if (r.missing) totalMissing++;
      else if (r.failed) totalFailed++;
      else if (r.rateLimited) rateLimitHits++;
    }

    // Uzum tezlik chegarasiga tushsa — sekinlashamiz. Bu yerda toʻxtash
    // notoʻgʻri boʻlardi: boʻlak yarim yozilgan holda qolib ketardi.
    if (results.some((r) => r.rateLimited)) {
      log(`Tezlik chegarasi — 30s kutilyapti (jami ${rateLimitHits} marta).`);
      await new Promise((r) => setTimeout(r, 30_000));
    }

    if (batch.length >= FLUSH_EVERY) {
      totalLive += await flush(pass, batch, seen);
      batch = [];
      seen = 0;
      const done = id - fromId + CONCURRENCY;
      const rate = done / ((Date.now() - started) / 1000);
      log(
        `  ${done}/${toId - fromId + 1} · tirik ${totalLive} · ` +
          `${rate.toFixed(1)} id/sek`,
      );
    }
  }

  totalLive += await flush(pass, batch, seen);
  log(
    `Boʻlak tugadi: ${totalSeen} tekshirildi · ${totalLive} tirik · ` +
      `${totalMissing} yoʻq · ${totalFailed} xato · ${rateLimitHits} marta 429`,
  );

  if (!deadline || Date.now() >= deadline) break;
}

const status = await store.censusStatus();
log(`Holat: ${status.foiz}% (pass ${status.pass}, ${status.next_id}/${status.max_id})`);
