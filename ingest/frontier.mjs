#!/usr/bin/env node
/**
 * Katalog chegarasi — Uzumdagi eng katta tirik mahsulot id si.
 *
 * Nega kerak: "kuniga nechta mahsulot qo'shilyapti" degan savolga
 * `first_seen_at` javob bermaydi. U MEN qachon ko'rganimni yozadi, Uzum
 * qachon qo'shganini emas. Perepis 18.08 da ishlagani uchun o'sha kunga
 * 630 743 mahsulot "qo'shilgan" bo'lib chiqadi — bu crawler raqami.
 *
 * Id lar ketma-ket beriladi, shuning uchun chegara har kuni o'lchansa,
 * ikki kun farqi kuniga nechta id berilganini ANIQ ko'rsatadi — o'sha
 * mahsulotlar hali kuzatuvga tushmagan bo'lsa ham.
 *
 * Usul: oxirgi ma'lum chegaradan yuqoriga qadam tashlab tirik id bor-yo'qligi
 * tekshiriladi, keyin oxirgi tirik va birinchi bo'sh oralig'i binar qidiruv
 * bilan toraytiriladi.
 *
 * Nega bitta id yetarli emas: id fazosida bo'shliqlar bor (o'chirilgan
 * mahsulotlar, band qilingan diapazonlar). Shuning uchun har nuqtada bitta
 * emas, PROBE_WIDTH ta ketma-ket id tekshiriladi va bittasi ham tirik
 * bo'lmasa "bu yerda katalog tugagan" deb hisoblanadi.
 *
 * Ishlatish:
 *   node frontier.mjs             # o'lchaydi va bazaga yozadi
 *   node frontier.mjs --dry       # faqat ko'rsatadi, bazaga tegmaydi
 *   node frontier.mjs --from N    # boshlang'ich id ni qo'lda berish
 */

import { loadConfig } from "./config.mjs";
import { createStore } from "./lib/store.mjs";
import { createTokenProvider } from "./lib/token.mjs";
import { CENSUS_QUERY, parseCensus } from "./sources/census-query.mjs";

/** Har nuqtada shuncha ketma-ket id tekshiriladi. */
const PROBE_WIDTH = 40;

/** Yuqoriga qadam — kunlik o'sishdan ancha katta bo'lishi kerak. */
const STEP = 50_000;

/** Binar qidiruv shu aniqlikda to'xtaydi. */
const PRECISION = 1000;

const args = process.argv.slice(2);
const dry = args.includes("--dry");

function flag(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return fallback;
  const value = Number(args[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}
const config = loadConfig();
const store = createStore(config);
const tokens = createTokenProvider(config);

function log(message) {
  process.stdout.write(`${new Date().toISOString()}  ${message}\n`);
}

/** Bitta id tirikmi. Xato "tirik emas" degani EMAS — u alohida qaytariladi. */
async function alive(id) {
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
      return null;
    }
    const body = await response.json();
    if (body.errors?.length) {
      if (/429|Too Many/i.test(JSON.stringify(body.errors))) return null;
      return false;
    }
    return Boolean(parseCensus(body.data?.productPage, new Date().toISOString()));
  } catch {
    return null;
  }
}

/**
 * `from` dan boshlab PROBE_WIDTH ta id da tirigi bormi.
 *
 * `null` javoblar (429, tarmoq) tirik ham, o'lik ham deb sanalmaydi:
 * ular sanaladi va hammasi null bo'lsa o'lchov bekor qilinadi. Aks holda
 * bloklangan so'rov "katalog shu yerda tugagan" degan xulosaga olib borardi.
 */
async function anyAlive(from) {
  const ids = Array.from({ length: PROBE_WIDTH }, (_, i) => from + i);
  let unknown = 0;
  for (let i = 0; i < ids.length; i += 8) {
    const results = await Promise.all(ids.slice(i, i + 8).map(alive));
    if (results.some((r) => r === true)) return true;
    unknown += results.filter((r) => r === null).length;
  }
  if (unknown === PROBE_WIDTH) throw new Error(`${from} atrofida javob olinmadi — o'lchov bekor.`);
  return false;
}

async function findFrontier(start) {
  // 1-bosqich: tirik topilmaguncha yuqoriga qadam.
  let low = start;
  let high = null;
  for (let probe = start; probe < start + STEP * 60; probe += STEP) {
    if (await anyAlive(probe)) {
      low = probe;
      log(`  ${probe} — tirik bor`);
    } else {
      high = probe;
      log(`  ${probe} — bo'sh`);
      break;
    }
  }
  if (high === null) throw new Error("Chegara topilmadi — boshlang'ich nuqta juda past.");

  // 2-bosqich: oxirgi tirik va birinchi bo'sh orasini toraytiramiz.
  while (high - low > PRECISION) {
    const mid = Math.floor((low + high) / 2);
    if (await anyAlive(mid)) low = mid;
    else high = mid;
  }
  return low + PROBE_WIDTH;
}

// `--from` berilsa bazaga umuman murojaat qilinmaydi: zondni bazasiz ham
// ishlatib ko'rish mumkin bo'lsin.
const given = flag("--from", null);
const known = given ?? (await store.frontierStart());
log(`Ma'lum chegara: ${known}${given ? " (qo'lda berilgan)" : ""}`);
const frontier = await findFrontier(Math.max(known - STEP, 1));
log(`Katalog chegarasi: ~${frontier}`);

if (dry) {
  log("--dry — bazaga yozilmadi.");
} else {
  const row = await store.recordFrontier(frontier);
  log(`Yozildi: ${JSON.stringify(row)}`);
}
