-- Chiziqchaning yonida "men nima topganim" ham ko'rinsin.
--
-- Panel 16-18 avgustga chiziqcha qo'yardi va bu "hech narsa qo'shilmagan"
-- bo'lib o'qildi. Aslida chiziqcha "javob yo'q" degani: o'sha kunlarda
-- baza to'lgan, lekin u Uzum nimani qo'shgani emas, perepis nimani
-- topgani edi.
--
--   17.08   14 111 mahsulot,    282 do'kon   <- perepis boshlandi
--   18.08  630 743 mahsulot, 54 130 do'kon   <- to'liq aylanish
--   19.08   18 925 mahsulot,    854 do'kon
--
-- Bu raqamlarni "bozorga qo'shildi" deb ko'rsatish yolg'on bo'lardi. Lekin
-- ularni butunlay yashirish ham noto'g'ri: bo'sh qator "hech narsa
-- bo'lmagan" deb o'qiladi. Shuning uchun ikkalasi alohida ustunda turadi
-- va har biri o'z nomi bilan ataladi.
create or replace function public.zs_market_growth(p_from date, p_to date)
returns jsonb
language sql stable security definer
set search_path to 'zumsavdo', 'public'
as $$
  with base as (select since from zumsavdo.market_baseline),
  days as (select g.d::date as date from generate_series(p_from, p_to, interval '1 day') g(d)),
  found as (
    select (first_seen_at at time zone 'Asia/Tashkent')::date as date,
           count(*) filter (where kind = 'product')::integer as products,
           count(*) filter (where kind = 'shop')::integer    as shops
    from (select first_seen_at, 'product' as kind from zumsavdo.product
          union all
          select first_seen_at, 'shop'    from zumsavdo.shop) x
    where (first_seen_at at time zone 'Asia/Tashkent')::date between p_from and p_to
    group by 1
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
$$;

notify pgrst, 'reload schema';
