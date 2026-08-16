-- Vaqtinchalik jadval o'rniga CTE.
--
-- Ilgari `_closing` vaqtinchalik jadvali ishlatilardi va uni tozalash uchun
-- `delete from _closing` yozilgan edi. Supabase WHERE'siz DELETE ni to'sadi,
-- shuning uchun rollup butunlay ishlamadi. Vaqtinchalik jadval aslida kerak
-- emas: CTE ni bir necha marta ishlatish mumkin.

create or replace function zumsavdo.rollup_shop_days(from_date date, to_date date)
returns integer
language plpgsql
security definer
set search_path = zumsavdo, public
as $$
declare
  touched integer;
begin
  -- 07-band: kümülativ hisoblagich kamaysa — yozib qo'y.
  with closing as (
    select distinct on (shop_id, (observed_at at time zone 'Asia/Tashkent')::date)
           shop_id,
           (observed_at at time zone 'Asia/Tashkent')::date as d,
           orders_quantity
    from zumsavdo.shop_observation
    where (observed_at at time zone 'Asia/Tashkent')::date between from_date - 8 and to_date
    order by shop_id, (observed_at at time zone 'Asia/Tashkent')::date, observed_at desc
  )
  insert into zumsavdo.anomaly (kind, shop_id, observed_at, previous, current, note)
  select 'counter_decreased', c.shop_id, c.d::timestamptz,
         prev.orders_quantity, c.orders_quantity,
         'Shop.ordersQuantity kamaydi — kunlik farq hisoblanmadi'
  from closing c
  join closing prev on prev.shop_id = c.shop_id and prev.d = c.d - 1
  where c.d between from_date and to_date
    and c.orders_quantity < prev.orders_quantity
    and not exists (
      select 1 from zumsavdo.anomaly a
      where a.kind = 'counter_decreased'
        and a.shop_id = c.shop_id
        and a.observed_at = c.d::timestamptz
    );

  with closing as (
    select distinct on (shop_id, (observed_at at time zone 'Asia/Tashkent')::date)
           shop_id,
           (observed_at at time zone 'Asia/Tashkent')::date as d,
           orders_quantity
    from zumsavdo.shop_observation
    where (observed_at at time zone 'Asia/Tashkent')::date between from_date - 8 and to_date
    order by shop_id, (observed_at at time zone 'Asia/Tashkent')::date, observed_at desc
  ),
  counted as (
    select shop_id, (observed_at at time zone 'Asia/Tashkent')::date as d,
           count(distinct sweep_id)::integer as sweeps
    from zumsavdo.shop_observation
    where (observed_at at time zone 'Asia/Tashkent')::date between from_date - 8 and to_date
    group by 1, 2
  ),
  -- Ritm: so'nggi 7 to'liq kundagi eng ko'p o'lchov soni.
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
  from closing c
  left join closing prev on prev.shop_id = c.shop_id and prev.d = c.d - 1
  left join counted cnt  on cnt.shop_id  = c.shop_id and cnt.d  = c.d
  left join cadence cad  on cad.shop_id  = c.shop_id and cad.d  = c.d
  left join priced  pr   on pr.shop_id   = c.shop_id and pr.d   = c.d
  where c.d between from_date and to_date
  on conflict (shop_id, date) do update
     set orders = excluded.orders,
         orders_certain = excluded.orders_certain,
         avg_price = excluded.avg_price,
         sweeps = excluded.sweeps,
         sweeps_expected = excluded.sweeps_expected;

  get diagnostics touched = row_count;
  return touched;
end $$;
