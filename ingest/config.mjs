/**
 * Yig'uvchi sozlamalari.
 *
 * Hech qanday kalit kodda saqlanmaydi — hammasi muhit o'zgaruvchisidan.
 * `.env.example` da har biri izohlangan.
 */

/**
 * Ombor manzili va kaliti.
 *
 * `ZUMSAVDO_` prefiksli nom ustun turadi. Sabab amalda chiqdi: umumiy
 * muhitda `SUPABASE_URL` boshqa loyihaga qo'yilgan bo'lishi mumkin va
 * yig'uvchi jimgina begona bazaga yozishga urinadi. Prefiksli nom shu
 * chalkashlikni butunlay yo'q qiladi.
 */
function supabaseSetting(suffix) {
  return process.env[`ZUMSAVDO_SUPABASE_${suffix}`] || process.env[`SUPABASE_${suffix}`] || "";
}

function requiredSupabase(suffix) {
  const value = supabaseSetting(suffix);
  if (!value) {
    throw new Error(
      `ZUMSAVDO_SUPABASE_${suffix} (yoki SUPABASE_${suffix}) berilmagan. ` +
        "ingest/.env.example dan nusxa oling va to'ldiring.",
    );
  }
  return value;
}

function optionalJson(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${name} JSON emas: ${raw.slice(0, 60)}…`);
  }
}

function list(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

export function loadConfig({ requireSupabase = true } = {}) {
  return {
    supabase: {
      // find-shops kabi yordamchilar bazaga tegmaydi — kalit talab qilinmaydi.
      url: requireSupabase ? requiredSupabase("URL") : supabaseSetting("URL"),
      // Yozish RLS dan o'tishi kerak, shuning uchun service role.
      // Bu kalit hech qachon brauzerga tushmasligi kerak.
      serviceKey: requireSupabase
        ? requiredSupabase("SERVICE_ROLE_KEY")
        : supabaseSetting("SERVICE_ROLE_KEY"),
    },

    /**
     * Yagona manba — Uzum katalogi.
     *
     * Ilgari standart qiymat "sample" edi va u toʻqilgan oʻlchov yasardi.
     * `.env` boʻlmagan muhitda (masalan bulutdagi Routine) sweep jimgina
     * shu generatorni ishga tushirib, haqiqiy bazaga 12 000 dan ortiq soxta
     * oʻlchov yozib qoʻydi. Generator butunlay olib tashlandi; standart
     * qiymat endi hech qachon maʻlumot yasamaydi.
     */
    source: process.env.ZUMSAVDO_SOURCE || "uzum-catalog",

    catalog: {
      endpoint: process.env.UZUM_CATALOG_ENDPOINT || "https://graphql.uzum.uz/",
      /**
       * Qo'shimcha sarlavhalar. Odatda kerak emas: token va standart
       * sarlavhalar `lib/token.mjs` da avtomatik qo'yiladi.
       */
      headers: optionalJson("UZUM_CATALOG_HEADERS", {}),
      language: process.env.UZUM_LANGUAGE || "uz-UZ",
      /**
       * Token uchi bu ikkisisiz `insufficient_headers` qaytaradi.
       * `App-Version`/`Version` esa yuborilmasligi kerak — `unallowed_app`.
       */
      userAgent:
        process.env.UZUM_USER_AGENT ||
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      /** Oʻrnatma identifikatori — har ishchi uchun barqaror boʻlishi kerak. */
      installationId:
        process.env.UZUM_INSTALLATION_ID || "3f1a9c22-7b64-4d18-9f0e-2c5a8e1b4d70",
    },

    seller: {
      endpoint: process.env.UZUM_SELLER_ENDPOINT || "https://api-seller.uzum.uz",
      token: process.env.UZUM_SELLER_TOKEN || "",
      shopId: process.env.UZUM_SELLER_SHOP_ID || "",
    },

    /** Qaysi obyektlar kuzatiladi. Bo'sh bo'lsa — manba o'zi hal qiladi. */
    track: {
      shops: list("ZUMSAVDO_TRACK_SHOPS"),
      categories: list("ZUMSAVDO_TRACK_CATEGORIES"),
      products: list("ZUMSAVDO_TRACK_PRODUCTS"),
    },

    /**
     * Soʻrov tezligining YUQORI chegarasi.
     *
     * Ilgari standart 1 edi va u parallellikni butunlay bekor qilardi:
     * 12 ta soʻrov bir vaqtda yuborilsa ham limiter ularni sekundiga
     * bittaga tushirardi. 30 — oʻlchangan 26 soʻrov/sek dan biroz yuqori,
     * yaʻni haqiqiy tezlikni `ZUMSAVDO_CONCURRENCY` belgilaydi, bu esa
     * faqat xavfsizlik toʻsigʻi boʻlib qoladi.
     */
    rateLimit: {
      perSecond: Number(process.env.ZUMSAVDO_RPS || 30),
      maxRetries: Number(process.env.ZUMSAVDO_MAX_RETRIES || 4),
      timeoutMs: Number(process.env.ZUMSAVDO_TIMEOUT_MS || 20000),
    },

    /**
     * Har mahsulot uchun nechta sharh sahifasi olinadi (100 tadan).
     *
     * Sharh oʻzgarmaydi — bir marta yigʻilsa yetarli. Birinchi toʻldirishdan
     * keyin buni 0 ga qoʻyib soʻrovlarni tejash mumkin.
     */
    feedbackPages: Number(process.env.ZUMSAVDO_FEEDBACK_PAGES ?? 3),

    /**
     * Bir sweepda nechta mahsulotdan sharh olinadi.
     *
     * Roʻyxat 50 000 boʻlgani uchun hammasini birdan olish mumkin emas.
     * Har sweep navbatdan shuncha oladi, roʻyxat asta toʻladi va toʻlgach
     * qayta soʻralmaydi.
     *
     * 300 dan 1000 ga oshirildi (2026-09-05). Sabab oʻlchandi: 300 tada
     * navbat 40 370 dan 37 070 ga besh kunda tushdi — shu tezlikda
     * qolgani ~31 kun. 1000 tada ~9 kun.
     *
     * Uzumga qoʻshimcha yuk sezilmas: har sweep 3 sahifadan soʻraydi,
     * yaʼni +2 100 soʻrov. Oʻsha sweep allaqachon 87 000 soʻrov
     * yuboradi — bu 2,4% qoʻshimcha.
     */
    feedbackBatch: Number(process.env.ZUMSAVDO_FEEDBACK_BATCH ?? 1000),

    /**
     * Bir vaqtda nechta mahsulot soʻraladi.
     *
     * Kuzatuv roʻyxati 50 000 ga chiqqach ketma-ket yigʻish 14 soat boʻldi.
     * 12 parallel soʻrov ~26 soʻrov/sek beradi va bu daraja oʻlchab
     * koʻrilgan: Uzum 429 qaytarmadi.
     */
    concurrency: Number(process.env.ZUMSAVDO_CONCURRENCY || 12),

    /** Sweepdan keyin nechta kunni qayta hisoblash. */
    rollbackDays: Number(process.env.ZUMSAVDO_ROLLUP_DAYS || 2),

    dryRun: process.env.ZUMSAVDO_DRY_RUN === "1",
  };
}
