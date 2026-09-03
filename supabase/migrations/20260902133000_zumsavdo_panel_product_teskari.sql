-- `zs_panel_product` — 2 million qatorli jadval boʻylab yurmaydi.
--
-- ILDIZ SABAB
-- -----------
-- Koʻrinishning eski taʼrifi shunday edi:
--
--   select id, title, shop_id, category_id
--   from zumsavdo.product p
--   where exists (select 1 from zumsavdo.product_day d
--                  where d.product_id = p.id and d.date >= current_date - 60)
--
-- Yaʼni HAR bir mahsulot uchun "oʻlchanganmi" deb soʻraladi. Bu
-- koʻrinish yozilganda `product` jadvalida oʻn minglab qator bor edi.
-- Bugun (2026-09-02 da oʻlchandi) unda **2 013 213** qator bor —
-- perepis butun katalogni yozib qoʻydi. `product_day` da esa atigi
-- 553 595 qator va 50 038 mahsulot: biz kuzatadiganlari.
--
-- Yaʼni soʻrov 2 million mahsulotni koʻrib chiqib, 50 mingtasini
-- qoldiradi. Rejalashtiruvchi buni Seq Scan + nested loop qilib
-- bajaradi va 761 135 bufer sarflaydi.
--
-- Bu narx bitta joyda emas, UCHTA joyda toʻlanadi: `zs_panel_shop`
-- va `zs_panel_category` ham shu koʻrinishga tayanadi, va uchalasi
-- ham `zs_panel_overview` ichida chaqiriladi.
--
-- YECHIM
-- ------
-- Yoʻnalish teskarisiga oʻgiriladi: kichigidan boshlanadi.
-- `product_day` dan `distinct product_id` olinadi (50 038) va
-- `product` ga BIRLAMCHI KALIT boʻyicha qoʻshiladi.
--
-- Natija bir xil — bu tezlashtirish, mantiq oʻzgarishi emas.
-- Oʻlchab tasdiqlandi: ikkala taʼrif ham 50 038 qator qaytardi.
--
-- Oʻlchov (zs_panel_overview, bitta kun):
--   avval          5 226 ms   (panel yiqilardi, anon chegarasi 3 s)
--   totals ajratilgach 3 583 ms
--   shu tuzatishdan keyin 2 177–3 284 ms
--
-- HALI HAM YETARLI EMAS — ochiq yozib qoʻyamiz: 7 kunlik davr
-- 3 155–5 331 ms, 45 kunlik davr 6 362–6 505 ms. Ular alohida ish
-- va bu migratsiya ularni hal qilmaydi.

create or replace view public.zs_panel_product as
select p.id, p.title, p.shop_id, p.category_id
from zumsavdo.product p
join (
  select distinct d.product_id
  from zumsavdo.product_day d
  where d.date >= current_date - 60
) k on k.product_id = p.id;
