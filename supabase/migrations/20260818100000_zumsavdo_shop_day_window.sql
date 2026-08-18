-- Kunlik farq QAYSI ORALIQNI qamragani yozib boriladi.
--
-- Muammo: "kunlik buyurtma" — ikki kun yakunidagi hisoblagich farqi. Kun
-- yakuni esa yarim tun emas, oʻsha kundagi OXIRGI oʻlchov. Amalda 17-avgust
-- yakuni 16:44 da, 18-avgust yakuni 03:06 da olindi — oraliq 10,4 soat, va
-- uning 7 soati aslida 17-avgustga tegishli.
--
-- Raqamning oʻzi haqiqiy (Uzum hisoblagichining oʻlchangan farqi), lekin uni
-- "kunlik" deb atash aniqlikni oshirib koʻrsatadi. Oraliq saqlansa panel
-- buni ochiq ayta oladi.
alter table zumsavdo.shop_day
  add column if not exists window_from timestamptz,
  add column if not exists window_to   timestamptz;

comment on column zumsavdo.shop_day.window_from is
  'Farq hisoblangan oraliqning boshi — oldingi kunning oxirgi oʻlchovi.';
comment on column zumsavdo.shop_day.window_to is
  'Oraliq oxiri — shu kunning oxirgi oʻlchovi.';

drop view if exists public.zs_shop_day;
create view public.zs_shop_day as
  select shop_id, date, orders, orders_certain, avg_price, sweeps, sweeps_expected,
         window_from, window_to,
         case when window_from is null or window_to is null then null
              else round(extract(epoch from (window_to - window_from)) / 3600.0, 1) end as window_hours
  from zumsavdo.shop_day;
grant select on public.zs_shop_day to anon, authenticated;

-- rollup_shop_days endi oraliq chegaralarini ham yozadi (toʻliq matni
-- 20260817115000 dagi bilan bir xil, faqat window_from/window_to qoʻshildi).
