-- Ustun oʻrtaga qoʻshilgani uchun koʻrinishni almashtirib boʻlmaydi —
-- avval tashlab, keyin qayta yaratiladi.
drop view if exists public.zs_product_day;

create view public.zs_product_day as
  select product_id, date, price, discount_percent, stock, reviews,
         buyers_per_week, sold_units, restocked_units, out_of_stock, sweeps
  from zumsavdo.product_day;

grant select on public.zs_product_day to anon, authenticated;

-- Bozor boʻyicha kunlik harakat: nechta sotilgan, nechta keltirilgan.
create or replace view public.zs_stock_movement_day as
  select date,
         sum(sold_units)      filter (where sold_units is not null)      as sotilgan,
         sum(restocked_units) filter (where restocked_units is not null) as keltirilgan,
         sum(stock)                                                      as qoldiq,
         count(*)             filter (where out_of_stock)                as tovari_tugagan,
         count(*)                                                        as mahsulot
  from zumsavdo.product_day
  group by date;

grant select on public.zs_stock_movement_day to anon, authenticated;
