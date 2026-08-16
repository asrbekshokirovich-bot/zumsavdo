-- Faqat o'zgargan qatorlar yozilgani uchun kun yakunini "o'sha kun ichidan"
-- izlash yaramaydi: o'zgarmagan kunda qator bo'lmaydi. Endi kun yakuni
-- "shu kun oxirigacha bo'lgan oxirgi o'lchov" sifatida olinadi.

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
  -- Kun yakuni: shu kun oxirigacha bo'lgan oxirgi o'lchov (o'zgarmagan
  -- kunlarda oldingi kundan olib kelinadi).
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
  -- Qoldiqning ketma-ket o'lchovlar orasidagi pasayishlari. Faqat pasayish
  -- yig'iladi: o'sish — tovar keltirilgani, u sotuv emas.
  steps as (
    select product_id, d, stock,
           lag(stock) over (partition by product_id order by observed_at) as prev_stock,
           lag(d)     over (partition by product_id order by observed_at) as prev_d
    from obs
  ),
  drops as (
    select product_id, d, sum(greatest(0, prev_stock - stock))::integer as sold
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
         buyers_per_week, sold_units, out_of_stock, sweeps)
  select c.product_id, c.d, c.price, c.discount_percent, c.stock, c.reviews,
         c.buyers_per_week,
         dr.sold,
         coalesce(cnt.max_stock, c.stock, 0) = 0,
         coalesce(cnt.sweeps, 0)
  from closing c
  left join drops   dr  on dr.product_id  = c.product_id and dr.d  = c.d
  left join counted cnt on cnt.product_id = c.product_id and cnt.d = c.d
  on conflict (product_id, date) do update
     set price = excluded.price, discount_percent = excluded.discount_percent,
         stock = excluded.stock, reviews = excluded.reviews,
         buyers_per_week = excluded.buyers_per_week, sold_units = excluded.sold_units,
         out_of_stock = excluded.out_of_stock, sweeps = excluded.sweeps;

  get diagnostics touched = row_count;
  return touched;
end $$;


create or replace function zumsavdo.rollup_shop_days(from_date date, to_date date)
returns integer
language plpgsql
security definer
set search_path = zumsavdo, public
as $$
declare
  touched integer;
begin
  create temporary table if not exists _closing (
    shop_id bigint, d date, orders_quantity bigint
  ) on commit drop;
  delete from _closing;

  insert into _closing
  select distinct on (shop_id, d) shop_id,
         (observed_at at time zone 'Asia/Tashkent')::date,
         orders_quantity
  from zumsavdo.shop_observation
  where (observed_at at time zone 'Asia/Tashkent')::date between from_date - 8 and to_date
  order by shop_id, (observed_at at time zone 'Asia/Tashkent')::date, observed_at desc;

  -- 07-band: kümülativ hisoblagich kamaysa — yozib qo'y.
  -- Ilgari greatest(0, ...) buni jimgina yutib yuborardi; endi qayd etiladi.
  insert into zumsavdo.anomaly (kind, shop_id, observed_at, previous, current, note)
  select 'counter_decreased', c.shop_id, c.d::timestamptz, prev.orders_quantity,
         c.orders_quantity,
         'Shop.ordersQuantity kamaydi — kunlik farq hisoblanmadi'
  from _closing c
  join _closing prev on prev.shop_id = c.shop_id and prev.d = c.d - 1
  where c.d between from_date and to_date
    and c.orders_quantity < prev.orders_quantity
    and not exists (
      select 1 from zumsavdo.anomaly a
      where a.kind = 'counter_decreased' and a.shop_id = c.shop_id
        and a.observed_at = c.d::timestamptz
    );

  with counted as (
    select shop_id, (observed_at at time zone 'Asia/Tashkent')::date as d,
           count(distinct sweep_id)::integer as sweeps
    from zumsavdo.shop_observation
    where (observed_at at time zone 'Asia/Tashkent')::date between from_date - 8 and to_date
    group by 1, 2
  ),
  cadence as (
    select shop_id, d,
           coalesce(max(sweeps) over (partition by shop_id order by d
                                      rows between 7 preceding and 1 preceding), sweeps) as expected
    from counted
  ),
  priced as (
    select p.shop_id, pd.date as d, avg(pd.price)::bigint as avg_price
    from zumsavdo.product_day pd
    join zumsavdo.product p on p.id = pd.product_id
    where pd.date between from_date and to_date and pd.price is not null
    group by 1, 2
  )
  insert into zumsavdo.shop_day
        (shop_id, date, orders, orders_certain, avg_price, sweeps, sweeps_expected)
  select c.shop_id, c.d,
         -- Kamayish holatida farq hisoblanmaydi: raqam noto'g'ri bo'lardi.
         case when prev.orders_quantity is null then null
              when c.orders_quantity < prev.orders_quantity then null
              else (c.orders_quantity - prev.orders_quantity)::integer end,
         (prev.orders_quantity is not null and c.orders_quantity >= prev.orders_quantity),
         pr.avg_price,
         coalesce(cnt.sweeps, 0),
         greatest(coalesce(cad.expected, 1), coalesce(cnt.sweeps, 1))
  from _closing c
  left join _closing prev on prev.shop_id = c.shop_id and prev.d = c.d - 1
  left join counted cnt   on cnt.shop_id  = c.shop_id and cnt.d  = c.d
  left join cadence cad   on cad.shop_id  = c.shop_id and cad.d  = c.d
  left join priced  pr    on pr.shop_id   = c.shop_id and pr.d   = c.d
  where c.d between from_date and to_date
  on conflict (shop_id, date) do update
     set orders = excluded.orders, orders_certain = excluded.orders_certain,
         avg_price = excluded.avg_price, sweeps = excluded.sweeps,
         sweeps_expected = excluded.sweeps_expected;

  get diagnostics touched = row_count;
  return touched;
end $$;
