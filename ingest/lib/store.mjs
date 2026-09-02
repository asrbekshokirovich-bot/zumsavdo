import { createClient } from "@supabase/supabase-js";

/**
 * Supabase ga yozish.
 *
 * Ma'lumot `zumsavdo` sxemasida turadi, PostgREST esa faqat `public` ni
 * ko'radi — shuning uchun yozish `public.zs_*` funksiyalari orqali boradi.
 * Bir partiya bitta chaqiruv: lug'atlar va o'lchovlar bir tranzaksiyada
 * yoziladi, yarim yozilgan sweep qolmaydi.
 *
 * Har bir yozuv idempotent: kalit (sweep_id, obyekt_id), shuning uchun sweep
 * qayta ishga tushsa ham o'lchov takrorlanmaydi.
 */

/** Bir chaqiruvdagi eng ko'p o'lchov soni. */
const CHUNK = 400;

export function createStore(config) {
  const db = createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: { persistSession: false },
  });

  async function rpc(name, args) {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(`${name} bajarilmadi: ${error.message}`);
    return data;
  }

  return {
    async openSweep(source, note) {
      return rpc("zs_open_sweep", { p_source: source, p_note: note ?? null });
    },

    async closeSweep(id, { targets, captured, errors, note }) {
      await rpc("zs_close_sweep", {
        p_sweep_id: id,
        p_targets: targets,
        p_captured: captured,
        p_errors: errors,
        p_note: note ?? null,
      });
    },

    /**
     * Partiyani yozadi. O'lchovlar ko'p bo'lsa bo'laklarga bo'linadi, lug'at
     * esa har bo'lakda takrorlanadi — u idempotent, zarari yo'q.
     */
    async saveBatch(sweepId, batch) {
      const shopObs = batch.shopObservations ?? [];
      const productObs = batch.productObservations ?? [];
      const steps = Math.max(1, Math.ceil(productObs.length / CHUNK));
      let written = 0;

      for (let i = 0; i < steps; i++) {
        const payload = {
          categories: i === 0 ? dedupe(batch.categories ?? []) : [],
          shops: i === 0 ? batch.shops ?? [] : [],
          products: i === 0 ? batch.products ?? [] : [],
          shopObservations: i === 0 ? shopObs : [],
          productObservations: productObs.slice(i * CHUNK, (i + 1) * CHUNK),
          skuObservations: i === 0 ? batch.skuObservations ?? [] : [],
          feedbacks: i === 0 ? batch.feedbacks ?? [] : [],
          positions: i === 0 ? batch.positions ?? [] : [],
          ...(i === 0 && batch.coverage ? { coverage: batch.coverage } : {}),
        };
        written += (await rpc("zs_ingest_batch", {
          p_sweep_id: sweepId,
          p_payload: payload,
        })) ?? 0;
      }

      return written;
    },

    /**
     * Kuzatiladigan mahsulotlar roʻyxatiga qoʻshadi.
     *
     * Roʻyxat bazada turadi, `.env` da emas — u oʻsadi va har mashinada
     * qoʻlda takrorlanmasligi kerak.
     */
    async trackProducts(productIds, source) {
      if (!productIds.length) return 0;
      return (await rpc("zs_track_products", { p_ids: productIds, p_source: source })) ?? 0;
    },

    /**
     * Kuzatiladigan mahsulot id lari.
     *
     * Sahifalab oʻqiladi. Bu shart, chunki PostgREST bir soʻrovda eng koʻpi
     * 1000 qator qaytaradi va **xato bermaydi** — roʻyxat shunchaki
     * kesiladi. Aynan shu sodir boʻlgan edi: bazada 50 075 ta faol tovar
     * turgan, sweep esa har safar 1000 tasini olib, "hammasi" deb
     * oʻlchagan. 2026-08-23 gacha 50 075 tadan atigi 1 005 tasi hech
     * boʻlmasa bir marta oʻlchangan. Xato jurnalda ham, natijada ham
     * koʻrinmagan (QOIDALAR.md §8 — jim oʻlim).
     *
     * `count` bilan solishtirish shuning uchun turibdi: sahifalash
     * kelajakda buzilsa, roʻyxat jimgina qisqarmaydi, sweep toʻxtaydi.
     */
    async trackedProducts() {
      const sahifa = 1000;
      const out = [];
      let kutilgan = null;
      for (let from = 0; ; from += sahifa) {
        const { data, error, count } = await db
          .from("zs_tracked_product")
          .select("product_id", { count: from === 0 ? "exact" : undefined })
          .eq("active", true)
          .order("product_id", { ascending: true })
          .range(from, from + sahifa - 1);
        if (error) throw new Error(`zs_tracked_product oʻqilmadi: ${error.message}`);
        if (from === 0 && typeof count === "number") kutilgan = count;
        out.push(...(data ?? []).map((row) => Number(row.product_id)));
        if (!data || data.length < sahifa) break;
      }
      if (kutilgan !== null && out.length !== kutilgan) {
        throw new Error(
          `zs_tracked_product toʻliq oʻqilmadi: ${out.length}/${kutilgan}. ` +
            "Sahifalash buzilgan — kam maʼlumot bilan sweep qilinmaydi.",
        );
      }
      return out;
    },

    /**
     * Sharhi hali yigʻilmagan kuzatuv mahsulotlari.
     *
     * Sharh oʻzgarmaydi — bir marta yigʻilsa yetarli. 50 000 mahsulotdan
     * har sweepda qayta soʻrash 150 000 keraksiz soʻrov degani.
     */
    async feedbackBacklog(limit) {
      const rows = await rpc("zs_feedback_backlog", { p_limit: limit });
      return (rows ?? []).map((r) => Number(r.product_id));
    },

    /**
     * Sharhlarni yozadi.
     *
     * Alohida yo'l: sharh o'lchov emas, u tarix. Bir mahsulotda minglab
     * sharh bo'lishi mumkin, shuning uchun bo'laklab yuboriladi. Kalit —
     * sharh id si, ya'ni takroriy sweep hech narsani ikkilantirmaydi.
     */
    async saveFeedbacks(sweepId, feedbacks) {
      let written = 0;
      for (let i = 0; i < feedbacks.length; i += CHUNK) {
        written += (await rpc("zs_ingest_batch", {
          p_sweep_id: sweepId,
          p_payload: {
            categories: [],
            shops: [],
            products: [],
            shopObservations: [],
            productObservations: [],
            skuObservations: [],
            positions: [],
            feedbacks: feedbacks.slice(i, i + CHUNK),
          },
        })) ?? 0;
      }
      return written;
    },

    // ------------------------------------------------------------ perepis

    /**
     * Keyingi id boʻlagini band qiladi.
     *
     * Bandlash bazada atomar boʻlgani uchun bir necha ishchi bir vaqtda
     * ishlashi mumkin — ular bir xil boʻlakni olmaydi.
     */
    async censusClaim(size) {
      const rows = await rpc("zs_census_claim", { p_size: size });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw new Error("zs_census_claim boʻsh javob qaytardi.");
      return row;
    },

    /** Perepis boʻlagini yozadi va nechta tirik mahsulot tushganini qaytaradi. */
    async censusBatch(pass, payload) {
      return (await rpc("zs_census_batch", { p_pass: pass, p_payload: payload })) ?? 0;
    },

    async censusStatus() {
      const { data, error } = await db.from("zs_census_status").select("*").limit(1);
      if (error) throw new Error(`zs_census_status oʻqilmadi: ${error.message}`);
      return data?.[0] ?? null;
    },

    /** Perepisdan 2-qatlamni tanlaydi. */
    async selectTracked(limit) {
      const rows = await rpc("zs_select_tracked", { p_limit: limit });
      return Array.isArray(rows) ? rows[0] : rows;
    },

    /** Kunlik yig'indini qayta hisoblash. */
    async rollup(fromDate, toDate) {
      const rows = await rpc("zs_rollup_days", { from_date: fromDate, to_date: toDate });
      return Array.isArray(rows) ? rows[0] : rows;
    },

    /**
     * Do'konning asosiy turkumi — mahsulotlaridan aniqlanadi va saqlanadi.
     *
     * Uzum do'kon uchun turkum bermaydi. Ilgari bu har panel so'rovida
     * qaytadan hisoblanardi va bitta reyting so'rovining uchdan ikki qismi
     * aynan shunga ketardi. Endi u o'lchov bilan birga yangilanadi.
     *
     * `{yangilandi, otkazildi, kerak_edi}` qaytaradi. `otkazildi` — perepis
     * o'sha qatorni yozayotgani uchun kutmasdan tashlab ketilganlari.
     * Ular keyingi yurishda olinadi; sonini KO'RSATISH shart, aks holda
     * to'liq bajarilmagani jimgina yo'qoladi.
     */
    async refreshShopCategories() {
      const rows = await rpc("zs_refresh_shop_categories", { p_only_measured: true });
      return Array.isArray(rows) ? rows[0] : rows;
    },

    /**
     * Panel yigʻindisi — doʻkon, turkum va mahsulot soni.
     *
     * Uchala hisob sanaga umuman bogʻliq emas, lekin ilgari har panel
     * soʻrovida qaytadan hisoblanardi va yolgʻiz oʻzi 1 778 ms olardi.
     * `anon` roliga 3 soniyalik chegara qoʻyilgan — panel shu tufayli
     * ochilmay qolgan edi. Endi hisob shu yerda, supurish oxirida bir
     * marta bajariladi, panel esa tayyor qatorni oʻqiydi.
     *
     * `{shops, categories, products, measured_at}` qaytaradi.
     * `measured_at` KERAK: yigʻuvchi toʻxtasa raqam jimgina eskiradi va
     * eskirganini faqat shu maydon koʻrsatadi.
     */
    async refreshPanelTotals() {
      return rpc("zs_refresh_panel_totals", {});
    },

    /** Chegara zondi qayerdan boshlashi — eng katta ma'lum id. */
    async frontierStart() {
      return rpc("zs_frontier_start", {});
    },

    /** O'lchangan katalog chegarasini yozadi. */
    async recordFrontier(frontier) {
      return rpc("zs_record_frontier", { p_frontier: frontier });
    },

    /**
     * Kunlik o'sish qatorini yozadi.
     *
     * `first_seen_at` bu savolga o'zi javob bermaydi — u crawler qachon
     * ko'rganini bildiradi. Shuning uchun raqam alohida jadvalga, boshlang'ich
     * sanadan keyingi kunlar uchungina yoziladi.
     */
    async recordMarketDay(date = null) {
      return rpc("zs_record_market_day", { p_date: date });
    },
  };
}

/** Bir partiyada turkum bir necha marta uchraydi — takrorlari olib tashlanadi. */
function dedupe(items) {
  const seen = new Map();
  for (const item of items) seen.set(item.id, item);
  return [...seen.values()];
}
