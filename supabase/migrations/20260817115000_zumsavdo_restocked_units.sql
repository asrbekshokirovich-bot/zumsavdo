-- Qoldiq kamayishi bilan bir qatorda OʻSISHI ham hisoblanadi.
--
-- Ilgari faqat kamayish yigʻilardi (sotuv), oʻsish esa jimgina tashlab
-- yuborilardi. Natijada "bugun 5 dona sotildi" koʻrinardi-yu, oʻsha kuni
-- 300 dona keltirilgani hech qayerda qolmasdi. Ikkalasi birga boʻlmasa
-- rasm chala: tovari tugab qolgan doʻkon ham, ombori toʻlgan doʻkon ham
-- bir xil koʻrinadi.
--
-- Ikkalasi ALOHIDA yigʻiladi va bir-biridan ayirilmaydi: amalda bir kunda
-- ikkalasi ham uchraydi (masalan 3 sotildi, 1 keltirildi) va ayirsak ikkala
-- raqam ham yoʻqoladi.
alter table zumsavdo.product_day
  add column if not exists restocked_units integer;

comment on column zumsavdo.product_day.sold_units is
  'Ketma-ket oʻlchovlar orasidagi qoldiq KAMAYISHLARI yigʻindisi — TAXMINIY.';
comment on column zumsavdo.product_day.restocked_units is
  'Ketma-ket oʻlchovlar orasidagi qoldiq OʻSISHLARI yigʻindisi — TAXMINIY. '
  'Tovar keltirilgani. Sotuv bilan aralashtirilmasligi kerak.';

create or replace function zumsavdo.rollup_product_days(from_date date, to_date date)
returns integer
language plpgsql
security definer
set search_path = zumsavdo, public
as $$
declare
  touched integer;
begin
  with days as (
    select d::date as d from generate_series(from_date, to_date, interval '1 day') d
  ),
  touched_products as (
    select distinct product_id
    from zumsavdo.product_observation
    where (observed_at at time zone 'Asia/Tashkent')::date <= to_date
  ),
  closing as (
    select tp.product_id, dd.d, o.price, o.discount_percent, o.stock,
           o.reviews, o.buyers_per_week
    from touched_products tp
    cross join days dd
    join lateral (
      select po.* from zumsavdo.product_observation po
      where po.product_id = tp.product_id
        and po.observed_at < ((dd.d + 1)::timestamp at time zone 'Asia/Tashkent')
      order by po.observed_at desc
      limit 1
    ) o on true
  ),
  obs as (
    select o.product_id,
           (o.observed_at at time zone 'Asia/Tashkent')::date as d,
           o.observed_at, o.stock, o.sweep_id
    from zumsavdo.product_observation o
    where (o.observed_at at time zone 'Asia/Tashkent')::date between from_date - 1 and to_date
  ),
  steps as (
    select product_id, d, stock,
           lag(stock) over (partition by product_id order by observed_at) as prev_stock,
           lag(d)     over (partition by product_id order by observed_at) as prev_d
    from obs
  ),
  moves as (
    select product_id, d,
           sum(greatest(0, prev_stock - stock))::integer as sold,
           sum(greatest(0, stock - prev_stock))::integer as restocked
    from steps
    where prev_stock is not null and (prev_d = d or prev_d = d - 1)
    group by 1, 2
  ),
  counted as (
    select product_id, d, count(distinct sweep_id) as sweeps, max(stock) as max_stock
    from obs group by 1, 2
  )
  insert into zumsavdo.product_day
        (product_id, date, price, discount_percent, stock, reviews,
         buyers_per_week, sold_units, restocked_units, out_of_stock, sweeps)
  select c.product_id, c.d, c.price, c.discount_percent, c.stock, c.reviews,
         c.buyers_per_week,
         m.sold,
         m.restocked,
         coalesce(cnt.max_stock, c.stock, 0) = 0,
         coalesce(cnt.sweeps, 0)
  from closing c
  left join moves   m   on m.product_id   = c.product_id and m.d   = c.d
  left join counted cnt on cnt.product_id = c.product_id and cnt.d = c.d
  on conflict (product_id, date) do update
     set price = excluded.price, discount_percent = excluded.discount_percent,
         stock = excluded.stock, reviews = excluded.reviews,
         buyers_per_week = excluded.buyers_per_week,
         sold_units = excluded.sold_units,
         restocked_units = excluded.restocked_units,
         out_of_stock = excluded.out_of_stock, sweeps = excluded.sweeps;

  get diagnostics touched = row_count;
  return touched;
end $$;
