-- `first_seen_at` boʻyicha qidiruv indekssiz edi.
--
-- `zs_market_growth` (oʻsish grafigi) har chaqiruvda shu filtrni
-- ishlatadi:
--
--   where (first_seen_at at time zone 'Asia/Tashkent')::date
--         between p_from and p_to
--
-- `zumsavdo.product` da (2 013 213 qator) `first_seen_at` boʻyicha
-- hech qanday indeks yoʻq edi — bor indekslar `id`, `category_id`,
-- `shop_id` va `norm(title)`. Ustiga ifoda `at time zone` ichida
-- boʻlgani uchun oddiy ustun indeksi baribir yaramasdi.
--
-- Natijada har chaqiruv toʻliq Seq Scan qilardi: 35 138 bufer
-- (~274 MB), shundan 33 860 tasi DISKDAN oʻqilardi.
--
-- Ifodaning oʻziga indeks qoʻyiladi. `timezone(text, timestamptz)`
-- IMMUTABLE, `::date` ham — demak ifoda indekslanadi.
--
-- Oʻlchov (`zs_market_growth`, bitta kun): 1 380–2 200 ms → 155–433 ms.
--
-- Keng davrga bu yetmaydi: 45 kunlik oynada mahsulotlarning deyarli
-- HAMMASI filtrdan oʻtadi (2 018 822 / 2 013 213), yaʼni kesadigan
-- narsa yoʻq. U keyingi migratsiyada hal qilinadi.

create index if not exists product_first_seen_tashkent_idx
  on zumsavdo.product (((first_seen_at at time zone 'Asia/Tashkent')::date));

create index if not exists shop_first_seen_tashkent_idx
  on zumsavdo.shop (((first_seen_at at time zone 'Asia/Tashkent')::date));

analyze zumsavdo.product;
analyze zumsavdo.shop;
