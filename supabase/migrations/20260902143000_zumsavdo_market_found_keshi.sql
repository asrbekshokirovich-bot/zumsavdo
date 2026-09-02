-- Oʻsish grafigi 2 million qatorni har safar qayta sanamaydi.
--
-- MUAMMO
-- ------
-- `zs_market_growth` 30 va 45 kunlik davrda 3 890–4 032 ms ishlardi,
-- yaʼni `anon` ning 3 soniyalik chegarasidan oshardi va panelning
-- "30 kun" tugmasi ham xato berardi.
--
-- Indeks (`20260902142000`) bitta kunni tuzatdi, keng davrni yoʻq:
-- 45 kunlik oynada mahsulotlarning deyarli hammasi filtrdan oʻtadi
-- (2 018 822 qator), ustiga `group by` ni bajarish uchun ~45 MB lik
-- external merge sort DISKKA toʻkilardi (temp read 11 275 blok).
--
-- KUZATUV
-- -------
-- `first_seen_at` — birinchi koʻrilgan payt. U mavjud qator uchun
-- HECH QACHON oʻzgarmaydi. Demak "falon kuni nechta yangi mahsulot
-- koʻrildi" degan javob oʻtgan kunlar uchun QOTGAN — uni har panel
-- soʻrovida qayta hisoblashning maʼnosi yoʻq.
--
-- QAROR
-- -----
-- Kunlik hisob `zumsavdo.market_found` materiallashtirilgan
-- koʻrinishida saqlanadi va supurish oxirida yangilanadi.
--
-- ESKIRISH: bugungi kunning hisobi oxirgi supurish paytidagi holatni
-- koʻrsatadi. Bu grafikning qolgan ustunlari bilan bir xil qoida —
-- `market_day` dagi `new_products`/`new_shops` ham supurishda
-- yoziladi, yaʼni yonma-yon turgan ikki raqam bir xil paytga tegishli.
--
-- `first_seen_at is null` qatorlar tashlanadi: ular sana bermaydi va
-- eski taʼrifda ham hisobga kirmasdi (`between` NULL ni rad etadi).
--
-- OʻLCHOV (`zs_market_growth`, HTTP orqali, `anon` kaliti bilan)
--   davr     avval        keyin
--   1 kun    1 380–2 200  758–868 ms
--   30 kun   3 916–3 963  495–860 ms
--   45 kun   3 890–4 032  846–898 ms

create materialized view zumsavdo.market_found as
select (x.first_seen_at at time zone 'Asia/Tashkent')::date as date,
       count(*) filter (where x.kind = 'product')::integer as products,
       count(*) filter (where x.kind = 'shop')::integer    as shops
from (select first_seen_at, 'product' as kind from zumsavdo.product
      union all
      select first_seen_at, 'shop'    from zumsavdo.shop) x
where x.first_seen_at is not null
group by 1;

create unique index market_found_date_uniq on zumsavdo.market_found (date);

-- `found` bloki endi hisob emas, qidiruv. Qolgan hammasi oʻzgarmadi.
create or replace function public.zs_market_growth(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path to 'zumsavdo', 'public'
as $function$
  with base as (select since from zumsavdo.market_baseline),
  days as (select g.d::date as date from generate_series(p_from, p_to, interval '1 day') g(d)),
  found as (
    select f.date, f.products, f.shops
    from zumsavdo.market_found f
    where f.date between p_from and p_to
  ),
  joined as (
    select d.date, m.new_products, m.new_shops, m.new_feedbacks, m.id_frontier,
           (select since from base) as baseline,
           d.date > (select since from base) as trusted,
           coalesce(f.products, 0) as found_products,
           coalesce(f.shops, 0)    as found_shops,
           prev.date as prev_date, prev.frontier as prev_frontier
    from days d
    left join zumsavdo.market_day m on m.date = d.date
    left join found f on f.date = d.date
    left join lateral (
      select p.date, p.id_frontier as frontier
      from zumsavdo.market_day p
      where p.id_frontier is not null and p.date < d.date
      order by p.date desc limit 1
    ) prev on m.id_frontier is not null
  ),
  rated as (
    select j.date, j.new_products, j.new_shops, j.new_feedbacks, j.id_frontier,
           j.baseline, j.trusted, j.found_products, j.found_shops,
           case when j.id_frontier is not null and j.prev_frontier is not null
                     and j.date - j.prev_date between 1 and 7
                then round((j.id_frontier - j.prev_frontier)::numeric / (j.date - j.prev_date))::bigint
           end as id_per_day,
           case when j.id_frontier is not null and j.prev_date is not null
                then (j.date - j.prev_date) end as gap_days
    from joined j
  )
  select jsonb_build_object(
    'baseline', (select since from base),
    'note',     (select note from zumsavdo.market_baseline),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.date) from rated r), '[]'::jsonb));
$function$;

-- Uchinchi kesh shu yerga qoʻshiladi. Tartib: `panel_product` avval
-- (yigʻindi shuni sanaydi), `market_found` mustaqil.
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
    refresh materialized view concurrently zumsavdo.market_found;
  end if;
  select * into q from zumsavdo.panel_totals;
  return to_jsonb(q) - 'bir';
end $$;

alter function public.zs_refresh_panel_totals() set statement_timeout = '300s';
