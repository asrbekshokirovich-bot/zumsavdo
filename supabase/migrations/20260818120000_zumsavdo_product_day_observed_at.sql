-- Kunlik qator QAY VAQTDA oʻlchanganini olib yuradi.
--
-- Muammo: panel "18.08.2026" deb koʻrsatadi, holbuki oʻlchov oʻsha kuni
-- 03:06 da olingan va soat 13:19 da ekranda turgan raqam 10 soatlik. Sana
-- kunni bildiradi, oʻlchov vaqtini emas — foydalanuvchi esa ekrandagi
-- raqamni "hozirgi" deb oʻqiydi.
--
-- `observed_at` — kun yakunidagi oʻlchov vaqti (narx va qoldiq aynan qachon
-- koʻrilgani). `first_observed_at` — kunning birinchi oʻlchovi: sotuv shu
-- ikkisi orasidagi oraliqda toʻplangan.
alter table zumsavdo.product_day
  add column if not exists observed_at       timestamptz,
  add column if not exists first_observed_at timestamptz;

comment on column zumsavdo.product_day.observed_at is
  'Kun yakunidagi oʻlchov vaqti — narx va qoldiq aynan shunda koʻrilgan.';
comment on column zumsavdo.product_day.first_observed_at is
  'Kunning birinchi oʻlchovi. Sotuv shu ikki vaqt orasida toʻplangan.';

drop view if exists public.zs_product_day;
create view public.zs_product_day as
  select product_id, date, price, discount_percent, stock, reviews,
         buyers_per_week, sold_units, restocked_units, out_of_stock, sweeps,
         observed_at, first_observed_at
  from zumsavdo.product_day;
grant select on public.zs_product_day to anon, authenticated;

-- rollup_product_days ham yangilandi: closing oʻlchovining vaqtini va kunning
-- birinchi oʻlchovini yozadi (toʻliq matn oʻsha koʻchirmada qoʻllangan).
