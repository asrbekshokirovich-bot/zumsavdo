/**
 * Anon kaliti bilan yozib bo'lmasligini tekshiradi.
 *
 * Nega kerak. Panel ochiq: anon kaliti brauzerda, demak u dunyoga ma'lum.
 * Shu kalit bilan faqat o'qish mumkin bo'lishi shart. 2026-08-23 da
 * teshik topildi: `public` sxemasidagi ko'rinishlarga `anon` ga `SELECT`
 * emas, `ALL` berilgan edi — beshtasi avtomatik yangilanuvchi, ya'ni
 * har kim perepis ma'lumotini o'chira olardi. Sabab Supabase'ning
 * zavod `alter default privileges` sozlamasi, ya'ni yangi ko'rinish
 * yaratilganda teshik o'zidan qaytadi. Shuning uchun tekshiruv qo'lda
 * emas, shu skriptda.
 *
 * Bu qora quti tekshiruvi: bazaga emas, panel yuradigan HTTP yo'liga
 * murojaat qiladi. Ya'ni "grantlar to'g'ri ko'rinadi" emas, "yozib
 * bo'lmadi" degan javobni oladi.
 *
 * Ishlatish:  npm run xavfsizlik
 */

const URL_ = process.env.ZUMSAVDO_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const ANON = process.env.ZUMSAVDO_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

if (!URL_ || !ANON) {
  console.error(
    "ZUMSAVDO_SUPABASE_URL va VITE_SUPABASE_ANON_KEY (yoki ZUMSAVDO_SUPABASE_ANON_KEY) kerak.\n" +
      "Anon kalit sir emas — u baribir brauzerda turadi.",
  );
  process.exit(2);
}

const OQILADIGAN = [
  "zs_panel_product", "zs_panel_shop", "zs_panel_category",
  "zs_product_observation", "zs_product_day", "zs_shop_day",
  "zs_feedback_day", "zs_feedback_span", "zs_sweep",
];

// Yozib bo'lmasligi kerak. Shart hech bir qatorga tegmaydi; ruxsat
// bo'lsa 2xx, bo'lmasa 401/403 qaytadi.
//
// Shart ustun turiga mos bo'lishi shart. Birinchi urinishda bu ikki
// jadvalga `id=eq.-1` qo'yilgan edi, ular esa uuid — PostgREST ruxsatni
// tekshirmasdan oldin 400 (22P02) qaytardi va tekshiruv "ochiq" deb
// o'yladi. Ya'ni tekshiruvning o'zi yolg'on xavotir bergan. Shuning
// uchun uuid jadvallariga haqiqiy uuid beriladi.
const NOL_UUID = "00000000-0000-0000-0000-000000000000";
const YOZILMAYDIGAN = [
  ["zs_product_observation", "DELETE", "product_id=eq.-1"],
  ["zs_sweep", "DELETE", "id=eq.-1"],
  ["zs_product_day", "DELETE", "product_id=eq.-1"],
  ["zs_shop_day", "DELETE", "shop_id=eq.-1"],
  ["zs_panel_product", "DELETE", "id=eq.-1"],
  ["marketplaces", "DELETE", `id=eq.${NOL_UUID}`],
  ["user_accounts", "DELETE", `id=eq.${NOL_UUID}`],
];

// Bu ikkitasini anon umuman o'qiy olmasligi kerak — panel ularga
// tegmaydi, ichi bo'sh, Lovable'dan qolgan.
const OQILMAYDIGAN = ["marketplaces", "products", "product_stats", "user_accounts"];

const bosh = { apikey: ANON, Authorization: `Bearer ${ANON}` };
let xato = 0;

for (const jadval of OQILADIGAN) {
  const r = await fetch(`${URL_}/rest/v1/${jadval}?select=*&limit=1`, { headers: bosh });
  if (r.ok) {
    console.log(`  o'qish  ${jadval.padEnd(24)} ishlaydi`);
  } else {
    console.error(`  O'QISH  ${jadval.padEnd(24)} SINDI — ${r.status}: ${(await r.text()).slice(0, 120)}`);
    xato++;
  }
}

for (const jadval of OQILMAYDIGAN) {
  const r = await fetch(`${URL_}/rest/v1/${jadval}?select=*&limit=1`, { headers: bosh });
  if (r.status === 401 || r.status === 403) {
    console.log(`  o'qish  ${jadval.padEnd(24)} yopiq (${r.status})`);
  } else {
    console.error(`  O'QISH  ${jadval.padEnd(24)} OCHIQ — ${r.status}. Bu xavf.`);
    xato++;
  }
}

for (const [jadval, usul, shart] of YOZILMAYDIGAN) {
  const r = await fetch(`${URL_}/rest/v1/${jadval}?${shart}`, { method: usul, headers: bosh });
  if (r.status === 401 || r.status === 403) {
    console.log(`  yozish  ${jadval.padEnd(24)} yopiq (${r.status})`);
  } else {
    const tan = await r.text();
    console.error(
      `  YOZISH  ${jadval.padEnd(24)} yopiq emas — ${usul} ${r.status}: ${tan.slice(0, 140)}`,
    );
    xato++;
  }
}

if (xato) {
  console.error(`\n${xato} ta muammo. Panel ochiq bo'lgani uchun bu darhol tuzatilishi kerak.`);
  process.exit(1);
}
console.log("\nHammasi joyida: o'qish ochiq, yozish yopiq.");
