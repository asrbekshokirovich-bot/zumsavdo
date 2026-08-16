import { SourceError } from "./http.mjs";

/**
 * Uzum uchun anonim token.
 *
 * `graphql.uzum.uz` tokensiz soʻrovni 401 bilan rad etadi. Token
 * `id.uzum.uz/api/auth/token` dan olinadi — bu ochiq uch, saytning oʻzi ham
 * shu yoʻldan foydalanadi.
 *
 * Uch talab qiladigan sarlavhalar tajribada aniqlangan:
 *   - `Origin` va `Referer` boʻlmasa → `insufficient_headers`
 *   - `App-Version`/`Version` yuborilsa → `unallowed_app` (ularni yubormaslik kerak)
 *
 * Token javob tanasida emas, `set-cookie: access_token=` da keladi va JWT
 * ichida `exp` bor — taxminan uch soat.
 */

const TOKEN_URL = "https://id.uzum.uz/api/auth/token";

/** Muddati tugashidan shuncha oldin yangilanadi. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function decodeExpiry(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function createTokenProvider(config) {
  let token = null;
  let expiresAt = 0;
  let inFlight = null;

  async function fetchToken() {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": config.catalog.userAgent,
        "x-iid": config.catalog.installationId,
        "Accept-Language": config.catalog.language,
        Origin: "https://uzum.uz",
        Referer: "https://uzum.uz/",
      },
      body: "{}",
    });

    if (!response.ok && response.status !== 204) {
      const body = await response.text();
      throw new SourceError(
        `Token olinmadi (HTTP ${response.status}): ${body.slice(0, 200)}`,
      );
    }

    // Node getSetCookie() bir nechta Set-Cookie sarlavhasini alohida beradi.
    const cookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of cookies) {
      const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
      if (match) return match[1];
    }

    throw new SourceError(
      "Token javobida access_token cookie yoʻq. Uch sarlavha talabini oʻzgartirgan boʻlishi mumkin.",
    );
  }

  return {
    /** Amaldagi tokenni qaytaradi, kerak boʻlsa yangilaydi. */
    async get() {
      if (token && Date.now() < expiresAt - REFRESH_MARGIN_MS) return token;
      // Bir vaqtda bir nechta soʻrov token soʻrasa, bittasi olib qolganlariga
      // ulashadi — aks holda har biri alohida token oladi.
      if (!inFlight) {
        inFlight = fetchToken()
          .then((fresh) => {
            token = fresh;
            expiresAt = decodeExpiry(fresh) || Date.now() + 60 * 60 * 1000;
            return fresh;
          })
          .finally(() => {
            inFlight = null;
          });
      }
      return inFlight;
    },

    /** 401 kelganda majburiy yangilash uchun. */
    invalidate() {
      token = null;
      expiresAt = 0;
    },
  };
}
