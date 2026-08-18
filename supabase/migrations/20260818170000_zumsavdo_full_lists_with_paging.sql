-- Toʻliq roʻyxatlar: "top 5" dan tashqarisini ham koʻrish.
--
-- Panel faqat beshtasini koʻrsatardi va qolganiga yoʻl yoʻq edi. Oʻlchangan
-- 76 doʻkonning 71 tasi va 81 mahsulotning 76 tasi bazada turib ekranga
-- umuman chiqmasdi — bu "boshqa doʻkon yoʻq" boʻlib oʻqilardi.
--
-- Sahifalash bazada: roʻyxat kuzatuv kengaygani sari oʻsadi.
create or replace function public.zs_product_rank(
  p_from date, p_to date, p_basis text default 'units',
  p_limit integer default 5, p_offset integer default 0
) returns table(
  product_id bigint, title text, shop_id bigint, shop_name text,
  category_id bigint, category_name text,
  value bigint, units bigint, buyers bigint, revenue bigint,
  price bigint, stock integer
)
language sql stable security definer
set search_path to 'zumsavdo', 'public'
as $$
  with agg as (
    select pd.product_id,
           sum(pd.sold_units) filter (where pd.sold_units is not null)::bigint as units,
           max(pd.buyers_per_week)::bigint                                     as buyers,
           sum(pd.sold_units * pd.price) filter (where pd.sold_units is not null)::bigint as revenue,
           (array_agg(pd.price order by pd.date desc))[1]::bigint              as price,
           (array_agg(pd.stock order by pd.date desc))[1]                      as stock
    from zumsavdo.product_day pd
    where pd.date between p_from and p_to
    group by pd.product_id
  )
  select p.id, p.title, p.shop_id, s.name, p.category_id, c.name,
         case p_basis when 'buyers' then a.buyers else a.units end,
         a.units, a.buyers, a.revenue, a.price, a.stock
  from agg a
  join public.zs_panel_product p on p.id = a.product_id
  left join zumsavdo.shop s     on s.id = p.shop_id
  left join zumsavdo.category c on c.id = p.category_id
  order by case p_basis when 'buyers' then a.buyers else a.units end desc nulls last, p.id
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 500);
$$;

-- Sahifalangan roʻyxat: qatorlar + jami soni. Jami boʻlmasa "yana bormi"
-- degan savolga javob yoʻq va tugma qachon oʻchishini bilib boʻlmaydi.
create or replace function public.zs_rank_page(
  p_kind text, p_from date, p_to date, p_basis text default 'orders',
  p_limit integer default 25, p_offset integer default 0
) returns jsonb
language sql stable security definer
set search_path to 'zumsavdo', 'public'
as $$
  with rows_all as (
    select to_jsonb(r) as j, r.value from public.zs_shop_rank(p_from, p_to, p_basis, 1000000) r
    where p_kind = 'shop'
    union all
    select to_jsonb(r), r.value from public.zs_category_rank(p_from, p_to, p_basis, 1000000) r
    where p_kind = 'category'
    union all
    select to_jsonb(r), r.value from public.zs_product_rank(p_from, p_to, p_basis, 500, 0) r
    where p_kind = 'product'
  ),
  ordered as (
    select j, row_number() over (order by value desc nulls last) as n from rows_all
  )
  select jsonb_build_object(
    'total',    (select count(*) from rows_all),
    'measured', (select count(*) from rows_all where value is not null),
    'offset',   greatest(p_offset, 0),
    'rows', coalesce((
      select jsonb_agg(j order by n) from ordered
      where n > greatest(p_offset, 0)
        and n <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 200)
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.zs_product_rank(date, date, text, integer, integer) to anon, authenticated;
grant execute on function public.zs_rank_page(text, date, date, text, integer, integer) to anon, authenticated;

-- Overviewga mahsulot roʻyxati va jami sonlar qoʻshiladi. Bosh sahifada
-- mahsulot umuman yoʻq edi — holbuki sotuvchi uchun eng birinchi savol
-- qaysi mahsulot ketyapti. Alohida soʻrov qilinmaydi: u yana oʻsha
-- soʻrovlar portlashiga olib borardi.
create or replace function public.zs_panel_overview(
  p_from date, p_to date, p_basis text default 'orders',
  p_series text default 'orders', p_limit integer default 5
) returns jsonb
language sql stable security definer
set search_path to 'zumsavdo', 'public'
as $$
  select jsonb_build_object(
    'summary', (select to_jsonb(s) from public.zs_market_summary(p_from, p_to) s),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.date)
                       from public.zs_market_daily(p_from, p_to, p_series) d), '[]'::jsonb),
    'shops', coalesce((select jsonb_agg(to_jsonb(r))
                       from public.zs_shop_rank(p_from, p_to, p_basis, p_limit) r), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(r))
                       from public.zs_category_rank(p_from, p_to, p_basis, p_limit) r), '[]'::jsonb),
    -- Mahsulot doʻkon buyurtmasi boʻyicha saralanmaydi — `ordersQuantity`
    -- doʻkon oʻlchovi. "Buyurtma" tanlanganda dona boʻyicha saralanadi va
    -- sahifada shunday deb yozib qoʻyilgan.
    'products', coalesce((select jsonb_agg(to_jsonb(r))
                       from public.zs_product_rank(
                         p_from, p_to,
                         case p_basis when 'buyers' then 'buyers' else 'units' end,
                         p_limit, 0) r), '[]'::jsonb),
    'rank_available', (select jsonb_build_object(
        'orders', exists (select 1 from zumsavdo.shop_day sd
                           where sd.date between p_from and p_to and sd.orders is not null),
        'buyers', exists (select 1 from zumsavdo.product_day pd
                           where pd.date between p_from and p_to and pd.buyers_per_week is not null),
        'units',  exists (select 1 from zumsavdo.product_day pd
                           where pd.date between p_from and p_to and pd.sold_units is not null))),
    'series_available', (select jsonb_build_object(
        'orders', exists (select 1 from zumsavdo.shop_day sd
                           where sd.date between p_from and p_to and sd.orders is not null),
        'feedbacks', exists (select 1 from public.zs_feedback_day fd
                              where fd.date between p_from and p_to),
        'units',  exists (select 1 from zumsavdo.product_day pd
                           where pd.date between p_from and p_to and pd.sold_units is not null))),
    -- Roʻyxatlarda nechtadan bor — "hammasi" havolasi yonida turadi.
    'totals', (select jsonb_build_object(
        'shops',      (select count(*) from public.zs_panel_shop),
        'categories', (select count(*) from public.zs_panel_category),
        'products',   (select count(*) from public.zs_panel_product)))
  );
$$;

notify pgrst, 'reload schema';
