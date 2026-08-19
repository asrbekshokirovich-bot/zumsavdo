-- Chegara faqat ZONDdan yoziladi.
--
-- `record_market_day` uni `max(product_id) from product_census` dan olardi.
-- Bu perepis qayerga yetgani — katalog chegarasi emas. Natijada o'tgan
-- kunlarning hammasiga bitta xil qiymat (2 285 728) yozildi va ular bugungi
-- haqiqiy o'lchov (3 224 158) bilan solishtirilib "19-avgustda 938 430
-- yangi id" degan raqam chiqdi. Uning ostidagi kunlarda esa bir xil
-- qiymatdan bir xil qiymat ayrilib 0 chiqdi.
--
-- Bu aynan `first_seen_at` dagi xatoning o'zi: crawler qayerga yetgani
-- bozor o'lchovi sifatida yozib qo'yilgan.
--
-- Endi chegara ustuni faqat `zs_record_frontier` orqali — ya'ni haqiqatan
-- Uzumdan o'lchangandagina — to'ladi. O'lchanmagan kun bo'sh qoladi.
create or replace function zumsavdo.record_market_day(p_date date default null)
returns zumsavdo.market_day
language plpgsql security definer
set search_path to 'zumsavdo', 'public'
as $$
declare
  d date := coalesce(p_date, (now() at time zone 'Asia/Tashkent')::date);
  base date := (select since from zumsavdo.market_baseline);
  row zumsavdo.market_day;
begin
  insert into zumsavdo.market_day as m (date, new_products, new_shops, new_feedbacks)
  select d,
    case when base is not null and d > base then (
      select count(*) from zumsavdo.product
       where (first_seen_at at time zone 'Asia/Tashkent')::date = d) end,
    case when base is not null and d > base then (
      select count(*) from zumsavdo.shop
       where (first_seen_at at time zone 'Asia/Tashkent')::date = d) end,
    (select count(*) from zumsavdo.feedback
      where (created_at at time zone 'Asia/Tashkent')::date = d)
  on conflict (date) do update set
    new_products  = excluded.new_products,
    new_shops     = excluded.new_shops,
    new_feedbacks = excluded.new_feedbacks,
    measured_at   = now()
  returning * into row;
  return row;
end;
$$;

-- Perepis holatidan yozilgan soxta chegaralarni tozalaymiz.
update zumsavdo.market_day set id_frontier = null where id_frontier = 2285728;

-- `id_per_day` — ikki HAQIQIY o'lchov orasidagi farq, oradagi kunlarga
-- bo'lingan. Oldingi o'lchov bo'lmasa yoki oraliq 7 kundan uzoq bo'lsa
-- qiymat bo'sh qoladi: bir necha kunlik farqni bitta kunga yozib qo'yish
-- o'sishni bir necha barobar katta ko'rsatardi.
create or replace function public.zs_market_growth(p_from date, p_to date)
returns jsonb
language sql stable security definer
set search_path to 'zumsavdo', 'public'
as $$
  with base as (select since from zumsavdo.market_baseline),
  days as (select g.d::date as date from generate_series(p_from, p_to, interval '1 day') g(d)),
  joined as (
    select d.date, m.new_products, m.new_shops, m.new_feedbacks, m.id_frontier,
           (select since from base) as baseline,
           d.date > (select since from base) as trusted,
           prev.date as prev_date, prev.frontier as prev_frontier
    from days d
    left join zumsavdo.market_day m on m.date = d.date
    left join lateral (
      select p.date, p.id_frontier as frontier
      from zumsavdo.market_day p
      where p.id_frontier is not null and p.date < d.date
      order by p.date desc limit 1
    ) prev on m.id_frontier is not null
  ),
  rated as (
    select j.date, j.new_products, j.new_shops, j.new_feedbacks, j.id_frontier,
           j.baseline, j.trusted,
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
