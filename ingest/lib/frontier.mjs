/**
 * Katalog chegarasi — Uzumdagi eng katta tirik mahsulot id si.
 *
 * Nega kerak: "kuniga nechta mahsulot qo'shilyapti" degan savolga
 * `first_seen_at` javob bermaydi. U MEN qachon ko'rganimni yozadi, Uzum
 * qachon qo'shganini emas. Perepis 18.08 da ishlagani uchun o'sha kunga
 * 630 743 mahsulot "qo'shilgan" bo'lib chiqadi — bu crawler raqami.
 *
 * Id lar ketma-ket beriladi, shuning uchun chegara o'lchansa, ikki o'lchov
 * farqi qancha id berilganini ANIQ ko'rsatadi — o'sha mahsulotlar hali
 * kuzatuvga tushmagan bo'lsa ham.
 *
 * Usul uch bosqich:
 *   1. Oxirgi ma'lum chegaradan yuqoriga qadam tashlab tirik id qidiriladi.
 *   2. Oxirgi tirik va birinchi bo'sh oralig'i binar qidiruv bilan
 *      toraytiriladi.
 *   3. Qolgan oraliq YUQORIDAN PASTGA bittalab tekshiriladi.
 *
 * Uchinchi bosqichsiz javob taxminiy bo'lardi. O'lchandi: binar qidiruv
 * 1000 id aniqligida to'xtaganda javob 3 224 158 chiqdi, bittalab
 * tekshirilganda esa 3 224 863 — 705 ga past. Kunlik o'sish ~3 000 id
 * bo'lsa, bunday xato ikki o'lchov farqining chorak qismini yeydi.
 */

import { CENSUS_QUERY, parseCensus } from "../sources/census-query.mjs";

/** Har nuqtada shuncha ketma-ket id tekshiriladi. */
const PROBE_WIDTH = 40;

/** Yuqoriga qadam — kunlik o'sishdan ancha katta bo'lishi kerak. */
const STEP = 50_000;

/** Binar qidiruv shu oraliqqa tushgach bittalab tekshiruvga o'tadi. */
const PRECISION = 200;

/** Bir vaqtda nechta so'rov. 12 tada 429 chiqmagani o'lchangan. */
const BATCH = 12;

export function createFrontierProbe(config, tokens, log = () => {}) {
  /** Bitta id tirikmi. Xato "tirik emas" degani EMAS — u `null`. */
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
   * hammasi null bo'lsa o'lchov bekor qilinadi. Aks holda bloklangan so'rov
   * "katalog shu yerda tugagan" degan xulosaga olib borardi.
   */
  async function anyAlive(from) {
    const ids = Array.from({ length: PROBE_WIDTH }, (_, i) => from + i);
    let unknown = 0;
    for (let i = 0; i < ids.length; i += BATCH) {
      const results = await Promise.all(ids.slice(i, i + BATCH).map(alive));
      if (results.some((r) => r === true)) return true;
      unknown += results.filter((r) => r === null).length;
    }
    if (unknown === PROBE_WIDTH) {
      throw new Error(`${from} atrofida javob olinmadi — o'lchov bekor.`);
    }
    return false;
  }

  /**
   * `high` dan `low` gacha pastga qarab birinchi tirik id.
   *
   * Pastdan yuqoriga emas, aynan yuqoridan: id fazosi chekkasida bo'shliqlar
   * bor va pastdan borsak birinchi bo'shliqda noto'g'ri to'xtardik.
   */
  async function highestAlive(low, high) {
    for (let id = high; id > low; id -= BATCH) {
      const ids = [];
      for (let i = 0; i < BATCH && id - i > low; i++) ids.push(id - i);
      const results = await Promise.all(ids.map(alive));
      for (let i = 0; i < ids.length; i++) if (results[i] === true) return ids[i];
    }
    return null;
  }

  return async function measure(start) {
    let low = Math.max(start - STEP, 1);
    let high = null;

    for (let probe = low; probe < low + STEP * 60; probe += STEP) {
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

    while (high - low > PRECISION) {
      const mid = Math.floor((low + high) / 2);
      if (await anyAlive(mid)) low = mid;
      else high = mid;
    }
    log(`  oraliq [${low}, ${high}] — bittalab tekshirilyapti`);

    // `low` da tirik borligi yuqorida tasdiqlangan, shuning uchun
    // bittalab tekshiruv bo'sh qaytsa ham javob bor.
    return (await highestAlive(low, high)) ?? low;
  };
}
