/**
 * `holat.mjs` — ogohlantirish chegaralari.
 *
 * NEGA BU TEST BOR. Kuzatuvchining oʻzi jimgina buzilishi mumkin: bitta
 * `>` belgisi `>=` ga aylansa yoki chegara raqami oʻzgarsa, u hech
 * qachon ogohlantirmaydigan boʻlib qoladi — va aynan shu holat bu
 * loyihada uch marta qimmatga tushgan (2026-08-20, 08-24, 09-03).
 * Kuzatuvchi buzilsa buni faqat test aytadi.
 *
 * Tarmoqqa chiqmaydi: `holat.mjs` faqat buyruq sifatida ishga
 * tushirilganda soʻrov yuboradi, import qilinganda emas.
 *
 *   node --test ingest/
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ogohlantirishlar } from "./holat.mjs";

/** Sogʻlom holat — hech qanday ogohlantirish boʻlmasligi kerak. */
const SOGLOM = {
  perepis: { pass: 4, next_id: 400001, max_id: 3300000, foiz: 12.12, yosh_soat: 2, otish_tugagan: false },
  kuzatuv: { faol: 50060, faol_emas: 81120 },
  panel_yigindi: { yosh_soat: 6, shops: 11946, categories: 3065, products: 50038 },
};

const perepis = (qism) => ({ ...SOGLOM, perepis: { ...SOGLOM.perepis, ...qism } });

test("sogʻlom holatda ogohlantirish yoʻq", () => {
  assert.deepEqual(ogohlantirishlar(SOGLOM), []);
});

test("oʻtish OʻRTASIDA toʻxtash koʻrinadi", () => {
  // 2026-09-03 dagi haqiqiy holat: 30,8 soat qimirlamagan.
  const r = ogohlantirishlar(perepis({ yosh_soat: 30.8 }));
  assert.equal(r.length, 1);
  assert.match(r[0], /OʻRTASIDA/);
});

test("oʻtish oʻrtasida 12 soatgacha — jim", () => {
  assert.deepEqual(ogohlantirishlar(perepis({ yosh_soat: 11.9 })), []);
});

test("oʻtishlar orasidagi tanaffus ogohlantirmaydi", () => {
  // Tanaffus 24 soat. 30 soat hali normal — chegara 48.
  assert.deepEqual(ogohlantirishlar(perepis({ otish_tugagan: true, yosh_soat: 30 })), []);
});

test("tanaffus 48 soatdan oshsa — keyingi oʻtish boshlanmagan", () => {
  const r = ogohlantirishlar(perepis({ otish_tugagan: true, yosh_soat: 60 }));
  assert.equal(r.length, 1);
  assert.match(r[0], /boshlanmagan/);
});

test("panel keshi eskirsa koʻrinadi", () => {
  const r = ogohlantirishlar({ ...SOGLOM, panel_yigindi: { ...SOGLOM.panel_yigindi, yosh_soat: 20 } });
  assert.equal(r.length, 1);
  assert.match(r[0], /zs_refresh_panel_totals/);
});

test("kuzatuv roʻyxati boʻshab qolsa koʻrinadi", () => {
  // Bu 2026-09-05 da haqiqatan boʻlishiga oz qoldi: toʻliq boʻlmagan
  // oʻtishdan tanlash roʻyxatni qisqartirardi.
  const r = ogohlantirishlar({ ...SOGLOM, kuzatuv: { faol: 12, faol_emas: 9 } });
  assert.equal(r.length, 1);
  assert.match(r[0], /sweep deyarli hech narsa/);
});

test("bir nechta muammo birdan sanaladi", () => {
  const r = ogohlantirishlar({
    perepis: { ...SOGLOM.perepis, yosh_soat: 99 },
    kuzatuv: { faol: 3, faol_emas: 0 },
    panel_yigindi: { yosh_soat: 99 },
  });
  assert.equal(r.length, 3);
});
