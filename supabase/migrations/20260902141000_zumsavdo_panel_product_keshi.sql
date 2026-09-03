-- Panel roʻyxati — hisoblanadigan emas, saqlanadigan.
--
-- NIMA QOLGAN EDI
-- ---------------
-- `20260902133000` `zs_panel_product` ni teskari yoʻnalishga oʻgirdi
-- va u 1 800 ms dan 776 ms ga tushdi. Lekin 776 ms bitta chaqiruv
-- narxi, va `zs_panel_overview` uni bir soʻrovda UCH marta toʻlaydi:
--
--   `zs_shop_rank`      → `zs_panel_shop`  → `zs_panel_product`
--   `zs_category_rank`  → `zs_shop_rank`   → yana oʻsha zanjir
--   `zs_panel_totals`   → uchalasi
--
-- Yaʼni yigʻindini materiallashtirish yetarli emas edi: ogʻirlik
-- yigʻindida emas, uning ILDIZIDA — "qaysi mahsulot panelda
-- koʻrinadi" degan savolda. U savol ham SANAGA BOGʻLIQ EMAS
-- (`current_date - 60`), yaʼni har soʻrovda qayta hisoblanishi shart
-- emas.
--
-- QAROR
-- -----
-- Javobning oʻzi saqlanadi. `zumsavdo.panel_product` — 50 038 qatorli
-- materiallashtirilgan koʻrinish; `zs_panel_product` endi shunchaki
-- undan oʻqiydi. `shop_id` va `category_id` ga indeks qoʻyiladi —
-- `zs_panel_shop` va `zs_panel_category` aynan shu ustunlar boʻyicha
-- guruhlaydi.
--
-- Yangilanish `zs_refresh_panel_totals()` ichida, yigʻindidan OLDIN
-- (yigʻindi shu koʻrinishni sanaydi). Supurish oxirida, kuniga uch
-- marta.
--
-- ESKIRISH XAVFI QAYERDA: yangi oʻlchangan mahsulot panelga darhol
-- emas, keyingi supurishdan keyin chiqadi. Bu xavf kichik, chunki
-- oʻlchovni yaratadigan ham, keshni yangilaydigan ham AYNAN OʻSHA
-- supurish — ular bir yurishda ketma-ket bajariladi.
--
-- OʻLCHOV (`zs_panel_overview`, har davr 4 marta)
--   davr     boshida    totals dan keyin   hammasidan keyin
--   1 kun    5 226 ms   3 583 ms           702–1 386 ms
--   7 kun    8 826 ms   —                  1 544–3 108 ms
--   45 kun   —          6 362–6 505 ms     2 143–2 638 ms
--
-- `anon` roli ostida, haqiqiy 3 soniyalik chegara bilan sinaldi:
-- 1 kun ham, 45 kun ham xatosiz oʻtdi.

create materialized view zumsavdo.panel_product as
select p.id, p.title, p.shop_id, p.category_id
from zumsavdo.product p
join (
  select distinct d.product_id
  from zumsavdo.product_day d
  where d.date >= current_date - 60
) k on k.product_id = p.id;

-- Unikal indeks CONCURRENTLY uchun shart, qolgan ikkitasi
-- `zs_panel_shop` va `zs_panel_category` uchun.
create unique index panel_product_id_uniq on zumsavdo.panel_product (id);
create index panel_product_shop_idx on zumsavdo.panel_product (shop_id);
create index panel_product_category_idx on zumsavdo.panel_product (category_id);

create or replace view public.zs_panel_product as
select id, title, shop_id, category_id from zumsavdo.panel_product;

-- Endi funksiya ikkita keshni yangilaydi. Tartib MUHIM: yigʻindi
-- `panel_product` ni sanaydi, demak u avval yangilanishi kerak.
create or replace function public.zs_refresh_panel_totals()
returns jsonb
language plpgsql
security definer
set search_path to 'zumsavdo', 'public'
as $$
declare
  q record;
begin
  if pg_try_advisory_xact_lock(hashtext('zs_refresh_panel_totals')) then
    refresh materialized view concurrently zumsavdo.panel_product;
    refresh materialized view concurrently zumsavdo.panel_totals;
  end if;
  select * into q from zumsavdo.panel_totals;
  return to_jsonb(q) - 'bir';
end $$;

alter function public.zs_refresh_panel_totals() set statement_timeout = '300s';
