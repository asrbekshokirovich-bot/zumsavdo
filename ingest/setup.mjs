#!/usr/bin/env node
/**
 * `.env` ni interaktiv yaratadi.
 *
 * Sabab: Windows CMD da `echo KEY=...>> .env` yozish oson emas — `<`, `>` va
 * `&` belgilari yoʻnaltirish deb oʻqiladi va buyruq buziladi. Bu skript
 * qiymatni soʻrab oladi va faylni oʻzi yozadi, shuning uchun qavs ham,
 * qochirish ham kerak emas.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ENV_PATH = path.join(import.meta.dirname, ".env");
const DEFAULT_URL = "https://duequijnnzcngzzvjqst.supabase.co";

const rl = readline.createInterface({ input: stdin, output: stdout });

/** `https://abc.supabase.co` → `abc` */
function projectRef(url) {
  const match = String(url).match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : "<project>";
}

function readExisting() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function ask(question, fallback) {
  const shown = fallback ? ` [${fallback}]` : "";
  const answer = (await rl.question(`${question}${shown}: `)).trim();
  return answer || fallback || "";
}

const current = readExisting();
stdout.write("\nZumSavdo yigʻuvchisini sozlash\n\n");

/**
 * Manzilni tozalaydi.
 *
 * Supabase panelida koʻrinadigan manzil koʻpincha `/rest/v1/` bilan boʻladi,
 * lekin mijozga asosiy manzil kerak. Foydalanuvchi oʻshani qoʻyib yuborsa
 * baza ulanmaydi va sabab tushunarsiz boʻladi — shuning uchun bu yerda
 * kesiladi.
 */
function normalizeUrl(raw) {
  return String(raw)
    .trim()
    .replace(/\/(rest|auth|storage|realtime)\/v\d+\/?$/, "")
    .replace(/\/+$/, "");
}

const rawUrl = await ask("1) Supabase URL", current.SUPABASE_URL || DEFAULT_URL);
const url = normalizeUrl(rawUrl);
if (url !== rawUrl.trim()) {
  stdout.write(`   → tozalandi: ${url}\n`);
}

stdout.write(
  "\n2) service_role kaliti\n" +
    "   Bu yerdan oling: " +
    `https://supabase.com/dashboard/project/${projectRef(url)}/settings/api-keys\n` +
    "   'Secret keys' → Create new secret key, yoki 'Legacy API keys' → service_role.\n" +
    "   Kerak: 'sb_secret_...' yoki 'service_role' (eyJ... bilan boshlanadi).\n" +
    "   'sb_publishable_...' YARAMAYDI — u faqat oʻqiy oladi.\n",
);

let key = "";
for (let attempt = 0; attempt < 3; attempt++) {
  key = await ask("   Kalit", current.SUPABASE_SERVICE_ROLE_KEY);
  if (key.startsWith("http")) {
    stdout.write("   ✗ Bu manzil, kalit emas. Qaytadan urining.\n");
    key = "";
    continue;
  }
  // Ochiq kalit ham `sb_` bilan boshlanadi va oson chalkashadi, lekin unda
  // yozish huquqi yoʻq — sweep jimgina hech narsa saqlamasdi.
  if (key.startsWith("sb_publishable_")) {
    stdout.write(
      "   ✗ Bu ochiq kalit (publishable) — u faqat oʻqiy oladi.\n" +
        "     Kerak boʻlgani: 'sb_secret_...' yoki 'service_role' (eyJ...).\n",
    );
    key = "";
    continue;
  }
  if (key.startsWith("sb_secret_") || key.startsWith("eyJ")) {
    stdout.write("   ✓ Yozish huquqli kalit.\n");
  } else if (key) {
    stdout.write("   ⚠ Tanish shaklga oʻxshamadi. Shunga qaramay yozaymi? (ha/yoʻq) ");
    const yes = (await rl.question("")).trim().toLowerCase();
    if (!["ha", "h", "yes", "y"].includes(yes)) {
      key = "";
      continue;
    }
  }
  if (key) break;
}

if (!key) {
  stdout.write("\nKalit berilmadi — fayl yozilmadi.\n");
  rl.close();
  process.exit(1);
}

stdout.write(
  "\n3) Kuzatiladigan doʻkonlar (id, vergul bilan)\n" +
    "   Bilmasangiz boʻsh qoldiring va keyin quyidagini ishlating:\n" +
    '     npm run shops -- "https://uzum.uz/uz/product/...-560305"\n',
);
const shops = await ask("   ZUMSAVDO_TRACK_SHOPS", current.ZUMSAVDO_TRACK_SHOPS || "");

stdout.write(
  "\n4) Mahsulot id lari (ixtiyoriy, vergul bilan)\n" +
    "   Berilsa qidiruv uchi umuman ishlatilmaydi — u tez-tez bloklanadi.\n" +
    "   Havoladagi oxirgi raqam: uzum.uz/uz/product/nomi-560305 → 560305\n",
);
const products = await ask("   ZUMSAVDO_TRACK_PRODUCTS", current.ZUMSAVDO_TRACK_PRODUCTS || "");

const lines = [
  "# ZumSavdo yigʻuvchisi. Bu fayl hech qachon GitHubga tushmaydi (.gitignore).",
  `SUPABASE_URL=${url}`,
  `SUPABASE_SERVICE_ROLE_KEY=${key}`,
  "",
  "ZUMSAVDO_SOURCE=uzum-catalog",
  `ZUMSAVDO_TRACK_SHOPS=${shops}`,
  "",
  "# Berilsa doʻkon roʻyxati qidiruvsiz olinadi (qidiruv uchi bloklanuvchan).",
  `ZUMSAVDO_TRACK_PRODUCTS=${products}`,
  "",
  "# Sekundiga bitta soʻrov. Tez boʻlsa Uzum 429 qaytaradi.",
  "ZUMSAVDO_RPS=1",
  "",
];

fs.writeFileSync(ENV_PATH, lines.join("\n"), { mode: 0o600 });
stdout.write(`\n✓ Yozildi: ${ENV_PATH}\n`);
stdout.write(
  shops
    ? "\nKeyingi qadam:  npm run sweep\n"
    : "\nKeyingi qadam:  npm run shops -- \"<uzum havolasi>\"  keyin qayta:  npm run setup\n",
);
rl.close();
