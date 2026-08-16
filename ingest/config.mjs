/**
 * Yig'uvchi sozlamalari.
 *
 * Hech qanday kalit kodda saqlanmaydi — hammasi muhit o'zgaruvchisidan.
 * `.env.example` da har biri izohlangan.
 */

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} berilmagan. ingest/.env.example dan nusxa oling va to'ldiring.`,
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

export function loadConfig() {
  return {
    supabase: {
      url: required("SUPABASE_URL"),
      // Yozish RLS dan o'tishi kerak, shuning uchun service role.
      // Bu kalit hech qachon brauzerga tushmasligi kerak.
      serviceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    },

    source: process.env.ZUMSAVDO_SOURCE || "sample",

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
     * So'rov tezligi. Standart — sekundiga bitta.
     *
     * Bu chegara ataylab past: panel kuniga 12 marta o'lchaydi, shoshilishning
     * hojati yo'q, manbaga esa ortiqcha yuk tushmasligi kerak.
     */
    rateLimit: {
      // 33 751 do'kon / 100 = ~338 so'rov ≈ 6 daqiqa (hujjatdagi jadval).
      perSecond: Number(process.env.ZUMSAVDO_RPS || 1),
      maxRetries: Number(process.env.ZUMSAVDO_MAX_RETRIES || 4),
      timeoutMs: Number(process.env.ZUMSAVDO_TIMEOUT_MS || 20000),
    },

    /** Sweepdan keyin nechta kunni qayta hisoblash. */
    rollbackDays: Number(process.env.ZUMSAVDO_ROLLUP_DAYS || 2),

    dryRun: process.env.ZUMSAVDO_DRY_RUN === "1",
  };
}
