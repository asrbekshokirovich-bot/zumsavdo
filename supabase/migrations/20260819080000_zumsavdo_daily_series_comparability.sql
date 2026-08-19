-- Kunlik qatorga QAMROV va OYNA UZUNLIGI qo'shiladi.
--
-- Grafikda 18-avgust 4 779, 19-avgust 8 547 bo'lib turibdi va bu "sotuv
-- deyarli ikki barobar oshdi" bo'lib o'qiladi. Sotuvchilar to'plami esa
-- deyarli bir xil — 67 dan 66 tasi ikkala kunda ham bor, ya'ni qamrovga
-- qarab bu xatoni topib bo'lmasdi.
--
-- Haqiqiy sabab oyna uzunligi:
--
--   18.08  oyna 10,4 soat  (17.08 11:16 → 17.08 22:06)   4 779   soatiga 460
--   19.08  oyna 27,8 soat  (17.08 22:06 → 19.08 04:46)   8 547   soatiga 307
--
-- Ya'ni bozor aslida SEKINLASHGAN, grafik esa o'sish ko'rsatyapti. Buyurtma
-- hisoblagichning ikki o'lchov orasidagi farqi, shuning uchun raqam oyna
-- uzunligiga to'g'ridan-to'g'ri bog'liq — uni yozmasdan kunlarni
-- solishtirib bo'lmaydi.
drop function if exists public.zs_market_daily(date, date, text);

create function public.zs_market_daily(p_from date, p_to date, p_series text)
returns table(
  date date,
  value bigint,
  -- Nechta obyekt shu kunning raqamiga hissa qo'shgan.
  contributors integer,
  -- Shu kuni umuman nechtasi kuzatilgan. Farqi — hali raqami chiqmaganlar:
  -- buyurtma ikki o'lchov farqidan chiqadi, shuning uchun yangi qo'shilgan
  -- sotuvchida u birinchi kuni bo'sh bo'ladi.
  watched integer,
  -- O'lchov oynasi necha soat. Faqat `orders` uchun ma'lum. `feedbacks`
  -- uchun oyna tushunchasi yo'q — sana Uzumning o'zidan keladi.
  hours numeric
)
language sql stable security definer
set search_path to 'zumsavdo', 'public'
as $$
  select g.d,
         case p_series
           when 'orders' then
             (select sum(sd.orders)::bigint from zumsavdo.shop_day sd
               where sd.date = g.d and sd.orders is not null)
           when 'feedbacks' then
             (select sum(fd.feedbacks)::bigint from public.zs_feedback_day fd
               where fd.date = g.d)
           when 'units' then
             (select sum(pd.sold_units)::bigint from zumsavdo.product_day pd
               where pd.date = g.d and pd.sold_units is not null)
         end,
         case p_series
           when 'orders' then
             (select count(*)::integer from zumsavdo.shop_day sd
               where sd.date = g.d and sd.orders is not null)
           when 'feedbacks' then
             (select count(distinct fd.product_id)::integer from public.zs_feedback_day fd
               where fd.date = g.d)
           when 'units' then
             (select count(*)::integer from zumsavdo.product_day pd
               where pd.date = g.d and pd.sold_units is not null)
         end,
         case p_series
           when 'orders' then
             (select count(*)::integer from zumsavdo.shop_day sd where sd.date = g.d)
           when 'units' then
             (select count(*)::integer from zumsavdo.product_day pd where pd.date = g.d)
           else null
         end,
         case when p_series = 'orders' then
           (select round(avg(extract(epoch from (sd.window_to - sd.window_from)) / 3600.0)::numeric, 1)
              from zumsavdo.shop_day sd
             where sd.date = g.d and sd.orders is not null)
         end
  from generate_series(p_from, p_to, interval '1 day') g(d);
$$;

grant execute on function public.zs_market_daily(date, date, text) to anon, authenticated;

notify pgrst, 'reload schema';
