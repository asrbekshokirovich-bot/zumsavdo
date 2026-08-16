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

const url = await ask("1) Supabase URL", current.SUPABASE_URL || DEFAULT_URL);

stdout.write(
  "\n2) service_role kaliti\n" +
    "   Bu yerdan oling: " +
    url.replace("https://", "https://supabase.com/dashboard/project/").replace(".supabase.co", "") +
    "/settings/api\n" +
    "   'service_role' qatorida Reveal bosing.\n" +
    "   DIQQAT: kalit manzil EMAS. U 'eyJ' bilan boshlanadi va juda uzun.\n",
);

let key = "";
for (let attempt = 0; attempt < 3; attempt++) {
  key = await ask("   Kalit", current.SUPABASE_SERVICE_ROLE_KEY);
  if (key.startsWith("http")) {
    stdout.write("   ✗ Bu manzil, kalit emas. Qaytadan urining.\n");
    key = "";
    continue;
  }
  if (key && !key.startsWith("eyJ")) {
    stdout.write("   ⚠ Odatda kalit 'eyJ' bilan boshlanadi. Shunga qaramay yozaymi? (ha/yoʻq) ");
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

const lines = [
  "# ZumSavdo yigʻuvchisi. Bu fayl hech qachon GitHubga tushmaydi (.gitignore).",
  `SUPABASE_URL=${url}`,
  `SUPABASE_SERVICE_ROLE_KEY=${key}`,
  "",
  "ZUMSAVDO_SOURCE=uzum-catalog",
  `ZUMSAVDO_TRACK_SHOPS=${shops}`,
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
