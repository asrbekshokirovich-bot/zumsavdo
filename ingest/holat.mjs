#!/usr/bin/env node
/**
 * Yigʻuvchining bir qarashdagi holati.
 *
 * NEGA ALOHIDA SKRIPT. Bu loyihada bir xil nosozlik uch marta
 * takrorlandi va har safar uzoq sezilmadi:
 *
 *   2026-08-20  doʻkon turkumi timeout — 3 kun
 *   2026-08-24  perepis darvozasi yopiq — 9 kun
 *   2026-09-03  perepis darvozasi yopiq — 54 soat
 *
 * Uchalasida ham yugurishlar YASHIL edi. Nosozlikni koʻrsatadigan
 * yagona narsa bazadagi sana edi, lekin unga hech kim qaramasdi.
 *
 * Kuzatuvchi AYBDORDAN BOSHQA ishda turishi kerak: perepis
 * toʻxtaganda u umuman ishlamaydi, yaʼni oʻzini tekshira olmaydi.
 * Shuning uchun buni supurish chaqiradi — u kuniga uch marta yuradi
 * va perepisdan mustaqil.
 *
 * Ishlatish:
 *   node holat.mjs           # chop etadi va eskirganini ogohlantiradi
 *   node holat.mjs --json    # xom JSON
 *
 * Chiqish kodi HAR DOIM 0: supurishning oʻzi ishlagan boʻlishi
 * mumkin. Xato qilsak, perepis nosozligi supurishni ham qizil
 * koʻrsatardi va ikki muammo bir-birini yashirardi.
 */

import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.mjs";

/** Oʻtish OʻRTASIDA shuncha soat qimirlamasa — toʻxtash. */
const OTISH_ICHIDA_SOAT = 12;
/** Oʻtishlar ORASIDA shuncha soat — tanaffus 24 soat, ikki barobar zaxira. */
const OTISHLAR_ORASIDA_SOAT = 48;
/** Panel keshi har supurishda yangilanadi. */
const PANEL_SOAT = 12;
/** Kuzatuv roʻyxati shundan kam boʻlsa sweep deyarli hech narsa oʻlchamaydi. */
const KUZATUV_POLI = 1000;

/**
 * Holatni bazadan oladi.
 *
 * TARMOQ XATOSI YUTILADI. Bu qadam `if: always()` bilan ishlaydi va
 * hech qachon supurishni yiqitmasligi kerak: baza bir onda javob
 * bermagani — supurish oʻlchagan maʼlumotni yoʻqotish uchun sabab
 * emas. Birinchi yozuvda `fetch` himoyasiz edi va ulanmagan manzilda
 * butun qadam yiqilardi.
 */
async function holatniOl(config) {
  try {
    const javob = await fetch(`${config.supabase.url}/rest/v1/rpc/zs_holat`, {
      method: "POST",
      headers: {
        apikey: config.supabase.serviceRoleKey,
        Authorization: `Bearer ${config.supabase.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(90_000),
    });
    if (!javob.ok) {
      return { xato: `HTTP ${javob.status} ${(await javob.text()).slice(0, 200)}` };
    }
    return { holat: await javob.json() };
  } catch (e) {
    return { xato: e?.message ?? String(e) };
  }
}

/**
 * Buyruq sifatida ishga tushirilgandagina yuradi.
 *
 * Import qilinganda ishlamaydi — aks holda funksiyani sinab boʻlmasdi:
 * test faylni import qilishi bilanoq tarmoqqa chiqib ketardi.
 */
async function asosiy() {
  const { holat, xato } = await holatniOl(loadConfig());
  if (xato) {
    console.log(`::warning::Holat olinmadi: ${xato}`);
    return;
  }
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(holat, null, 2));
    return;
  }
  chop(holat);
  const ogoh = ogohlantirishlar(holat);
  for (const m of ogoh) console.log(`::warning::${m}`);
  if (ogoh.length === 0) console.log("Eskirgan qism yoʻq.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await asosiy();
}

/** Odam oʻqiydigan xulosa. */
function chop(h) {
  const { perepis: p, kuzatuv: k, olchov: o, supurish: s, sharh: f } = h;
  const pt = h.panel_yigindi;
  const kat = h.katalog;
  const chiziq = "=".repeat(58);
  console.log(chiziq);
  console.log(`  YIGʻUVCHI HOLATI  ${String(h.hozir).slice(0, 19).replace("T", " ")}`);
  console.log(chiziq);
  console.log(`  Perepis        ${p.pass}-oʻtish · ${p.foiz}% · id ${p.next_id} / ${p.max_id}`);
  console.log(`                 oxirgi qimirlashi: ${p.yosh_soat} soat oldin`);
  console.log(`  Kuzatuv        ${k.faol} faol / ${k.faol_emas} faol emas`);
  console.log(`  Oʻlchov        ${o.oxirgi_kun} · ${o.oxirgi_kun_qatorlar} qator`);
  console.log(`  Supurish       ${s.yosh_soat} soat oldin`);
  console.log(`  Sharh          ${f.jami} ta · ${f.mahsulot} mahsulot`);
  console.log(
    `  Panel yigʻindi ${pt.yosh_soat} soat oldin · ` +
      `${pt.shops} doʻkon / ${pt.categories} turkum / ${pt.products} tovar`,
  );
  console.log(`  Katalog        ${kat.mahsulot} tovar · ${kat.dokon} doʻkon`);
  console.log(chiziq);
}

/**
 * Eskirgan qismlar. Boʻsh roʻyxat — hammasi joyida degani.
 *
 * Ajratilgan funksiya: uni test chaqira oladi va chegaralar bitta
 * joyda turadi.
 */
export function ogohlantirishlar(h) {
  const p = h.perepis;
  const chiqdi = [];

  if (p.otish_tugagan) {
    if (p.yosh_soat > OTISHLAR_ORASIDA_SOAT) {
      chiqdi.push(
        `Perepis ${p.yosh_soat} soat qimirlamadi. ${p.pass}-oʻtish tugagan, ` +
          `keyingisi tanaffusdan keyin boshlanishi kerak edi — boshlanmagan.`,
      );
    }
  } else if (p.yosh_soat > OTISH_ICHIDA_SOAT) {
    chiqdi.push(
      `Perepis ${p.yosh_soat} soat qimirlamadi. ${p.pass}-oʻtish OʻRTASIDA ` +
        `(id ${p.next_id} / ${p.max_id}) — bu tanaffus emas, toʻxtash.`,
    );
  }

  if (h.panel_yigindi.yosh_soat > PANEL_SOAT) {
    chiqdi.push(
      `Panel yigʻindisi ${h.panel_yigindi.yosh_soat} soat eskirgan — ` +
        `zs_refresh_panel_totals() ishlamayapti.`,
    );
  }

  if (h.kuzatuv.faol < KUZATUV_POLI) {
    chiqdi.push(
      `Kuzatuv roʻyxatida atigi ${h.kuzatuv.faol} tovar faol — ` +
        `sweep deyarli hech narsa oʻlchamaydi.`,
    );
  }

  return chiqdi;
}
