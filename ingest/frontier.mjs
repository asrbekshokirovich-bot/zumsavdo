#!/usr/bin/env node
/**
 * Katalog chegarasini o'lchaydi va bazaga yozadi.
 *
 * Mantiq `lib/frontier.mjs` da — sweep ham o'shani chaqiradi, shuning
 * uchun ikki joyda ikki xil javob chiqishi mumkin emas.
 *
 * Ishlatish:
 *   node frontier.mjs             # o'lchaydi va bazaga yozadi
 *   node frontier.mjs --dry       # faqat ko'rsatadi, bazaga tegmaydi
 *   node frontier.mjs --from N    # boshlang'ich id ni qo'lda berish
 */

import { loadConfig } from "./config.mjs";
import { createStore } from "./lib/store.mjs";
import { createTokenProvider } from "./lib/token.mjs";
import { createFrontierProbe } from "./lib/frontier.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");

function flag(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return fallback;
  const value = Number(args[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function log(message) {
  process.stdout.write(`${new Date().toISOString()}  ${message}\n`);
}

const config = loadConfig();
const store = createStore(config);
const measure = createFrontierProbe(config, createTokenProvider(config), log);

// `--from` berilsa bazaga umuman murojaat qilinmaydi: zondni bazasiz ham
// ishlatib ko'rish mumkin bo'lsin.
const given = flag("--from", null);
const known = given ?? (await store.frontierStart());
log(`Ma'lum chegara: ${known}${given ? " (qo'lda berilgan)" : ""}`);

const frontier = await measure(known);
log(`Katalog chegarasi: ${frontier}`);

if (dry) {
  log("--dry — bazaga yozilmadi.");
} else {
  log(`Yozildi: ${JSON.stringify(await store.recordFrontier(frontier))}`);
}
