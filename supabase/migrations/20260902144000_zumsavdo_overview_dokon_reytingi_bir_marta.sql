-- Doʻkon reytingi bir soʻrovda IKKI marta hisoblanardi.
--
-- `zs_panel_overview` ikkalasini ham chaqiradi:
--   'shops'      → zs_shop_rank(p_from, p_to, p_basis, p_limit)
--   'categories' → zs_category_rank(...)
--
-- `zs_category_rank` esa ichida AYNAN OʻSHA `zs_shop_rank` ni
-- chaqiradi, faqat `limit 100000` bilan, va natijasini turkum
-- boʻyicha yigʻadi. Yaʼni bitta panel soʻrovida doʻkon reytingi
-- toʻliq ikki marta qurilardi: 45 kunlik davrda ~1 040 ms + ~1 060 ms.
--
-- Endi u bir marta quriladi (`sr` — MATERIALIZED CTE, yaʼni
-- rejalashtiruvchi uni ikki marta bajarmaydi), soʻng:
--   'shops'      — oʻsha roʻyxatning yuqori beshtasi;
--   'categories' — oʻsha roʻyxatning turkum boʻyicha yigʻindisi,
--                  `zs_category_rank` dagi ifodalarning aynan oʻzi.
--
-- `zs_category_rank` va `zs_shop_rank` OʻZGARMAYDI va oʻchirilmaydi:
-- ular `zs_rank_page` va qidiruv orqali alohida chaqiriladi.
--
-- TOʻGʻRILIK: 7 kunlik davr uchun yangi 'categories' bloki va eski
-- `zs_category_rank` bir xil beshta qator qaytardi — `category_id`,
-- `shop_count`, `value` boʻyicha `except` ikki tomonga ham boʻsh.
--
-- OʻLCHOV (HTTP, `anon` kaliti, tarmoq vaqti bilan birga)
--   davr     avval           keyin
--   1 kun    1 531–3 120 ms  945–1 857 ms
--   7 kun    2 132 ms / 500  1 612–2 410 ms
--   30 kun   3 185–3 236 ms  2 106–2 888 ms
--   45 kun   2 757–3 263 ms  2 289–2 509 ms
--
-- Panelning bosh sahifasi beshta soʻrovni PARALLEL yuboradi. Shu
-- holatda ham sinaldi: hammasi 200, eng sekini 3 077 ms (tarmoq bilan).

create or replace function public.zs_panel_overview(
  p_from date, p_to date,
  p_basis text default 'orders',
  p_series text default 'orders',
  p_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path to 'zumsavdo', 'public'
as $function$
  with sr as materialized (
    select * from public.zs_shop_rank(p_from, p_to, p_basis, 100000)
  )
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
      from (select * from sr order by sr.value desc nulls last limit p_limit) r
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c))
      from (
        select sr.category_id,
               max(sr.category_name)  as category_name,
               count(*)::integer      as shop_count,
               sum(sr.value)::bigint  as value,
               sum(sr.orders)::bigint as orders,
               sum(sr.revenue)::bigint as revenue
        from sr
        where sr.category_id is not null
        group by sr.category_id
        order by sum(sr.value) desc nulls last
        limit p_limit
      ) c
    ), '[]'::jsonb),
    -- Mahsulot doʻkon buyurtmasi boʻyicha saralanmaydi — `ordersQuantity`
    -- doʻkon oʻlchovi. Shuning uchun "buyurtma" tanlanganda dona boʻyicha
    -- saralanadi va bu sahifada shunday deb yozib qoʻyilgan.
    'products', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.zs_product_rank(
        p_from, p_to,
        case p_basis when 'buyers' then 'buyers' else 'units' end,
        p_limit, 0
      ) r
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
    ),
    -- Roʻyxatlarda nechtadan bor. Sanaga bogʻliq emas, shuning uchun
    -- bu yerda hisoblanmaydi — supurish yozib qoʻyadi.
    'totals', (
      select jsonb_build_object(
        'shops',       t.shops,
        'categories',  t.categories,
        'products',    t.products,
        'measured_at', t.measured_at
      )
      from zumsavdo.panel_totals t
    )
  );
$function$;
