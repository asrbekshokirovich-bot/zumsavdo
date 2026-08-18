-- Bozor sahifasi uchun BITTA soʻrov.
--
-- Ilgari sahifa har ochilganda 10 ta RPC yuborardi: yigʻindi, grafik, ikki
-- reyting va "qaysi asosda maʻlumot bor" degan 6 ta zondlovchi. Ularning
-- ustiga har daqiqada butun toʻplam qayta oʻqilardi. Brauzer bu portlashni
-- koʻtara olmay soʻrovlarning bir qismini serverga yubormasdan tashlab
-- yuborardi va panelda "TypeError: Failed to fetch" chiqardi — jurnalda esa
-- hammasi 200 boʻlib turardi, chunki tashlangan soʻrov serverga yetib ham
-- bormagan.
--
-- Zondlovchilarning oʻzi ham notoʻgʻri edi: "buyurtma boʻyicha maʻlumot
-- bormi?" degan savolga javob berish uchun butun reyting hisoblanardi.
-- Bu — bitta `exists` bilan aytiladigan narsa.
create or replace function public.zs_panel_overview(
  p_from date,
  p_to date,
  p_basis text default 'orders',
  p_series text default 'orders',
  p_limit integer default 5
) returns jsonb
language sql stable security definer
set search_path to 'zumsavdo', 'public'
as $$
  select jsonb_build_object(
    'summary', (
      select to_jsonb(s) from public.zs_market_summary(p_from, p_to) s
    ),
    'daily', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.date)
      from public.zs_market_daily(p_from, p_to, p_series) d
    ), '[]'::jsonb),
    'shops', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.zs_shop_rank(p_from, p_to, p_basis, p_limit) r
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.zs_category_rank(p_from, p_to, p_basis, p_limit) r
    ), '[]'::jsonb),
    -- Qaysi tugma yonishi. Reyting hisoblanmaydi — faqat "bittasi bormi"
    -- deb soʻraladi, shuning uchun narxi deyarli nol.
    'rank_available', (
      select jsonb_build_object(
        'orders', exists (select 1 from zumsavdo.shop_day sd
                           where sd.date between p_from and p_to and sd.orders is not null),
        'buyers', exists (select 1 from zumsavdo.product_day pd
                           where pd.date between p_from and p_to and pd.buyers_per_week is not null),
        'units',  exists (select 1 from zumsavdo.product_day pd
                           where pd.date between p_from and p_to and pd.sold_units is not null)
      )
    ),
    'series_available', (
      select jsonb_build_object(
        'orders', exists (select 1 from zumsavdo.shop_day sd
                           where sd.date between p_from and p_to and sd.orders is not null),
        'feedbacks', exists (select 1 from public.zs_feedback_day fd
                              where fd.date between p_from and p_to),
        'units',  exists (select 1 from zumsavdo.product_day pd
                           where pd.date between p_from and p_to and pd.sold_units is not null)
      )
    )
  );
$$;

grant execute on function public.zs_panel_overview(date, date, text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
