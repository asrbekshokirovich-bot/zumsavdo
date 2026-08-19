-- Kunlik o'sish: nechta mahsulot, do'kon va sharh qo'shildi.
--
-- Nega alohida jadval kerak: `first_seen_at` savolga javob bermaydi. U MEN
-- qachon ko'rganimni yozadi, Uzum qachon qo'shganini emas. Perepis 18.08 da
-- ishlagani uchun o'sha kunga 630 743 mahsulot va 54 130 do'kon "qo'shilgan"
-- bo'lib chiqadi — bu bozor raqami emas, crawler raqami.
--
-- To'g'ri o'lchov ikki kun orasidagi farq. Birinchi to'liq perepisdan keyin
-- `first_seen_at` ma'noga ega bo'ladi: undan keyin birinchi marta ko'ringan
-- obyekt haqiqatan yangi. Shuning uchun boshlang'ich sana alohida saqlanadi
-- va undan oldingi kunlar hech qachon o'sish deb ko'rsatilmaydi.
create table if not exists zumsavdo.market_day (
  date            date primary key,
  new_products    integer,
  new_shops       integer,
  new_feedbacks   integer,
  -- Uzum id larni ketma-ket beradi. Eng katta tirik id — katalog chegarasi;
  -- ikki kunlik farqi kuniga nechta mahsulot yaratilganini kuzatuvdan
  -- mustaqil ko'rsatadi.
  id_frontier     bigint,
  measured_at     timestamptz not null default now()
);

create table if not exists zumsavdo.market_baseline (
  id     boolean primary key default true check (id),
  since  date not null,
  note   text
);

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
  insert into zumsavdo.market_day as m (date, new_products, new_shops, new_feedbacks, id_frontier)
  select d,
    case when base is not null and d > base then (
      select count(*) from zumsavdo.product
       where (first_seen_at at time zone 'Asia/Tashkent')::date = d) end,
    case when base is not null and d > base then (
      select count(*) from zumsavdo.shop
       where (first_seen_at at time zone 'Asia/Tashkent')::date = d) end,
    -- Sharh sanasi Uzumdan keladi: kashfiyotdan mustaqil.
    (select count(*) from zumsavdo.feedback
      where (created_at at time zone 'Asia/Tashkent')::date = d),
    (select max(product_id) from zumsavdo.product_census)
  on conflict (date) do update set
    new_products  = excluded.new_products,
    new_shops     = excluded.new_shops,
    new_feedbacks = excluded.new_feedbacks,
    id_frontier   = greatest(coalesce(m.id_frontier, 0), coalesce(excluded.id_frontier, 0)),
    measured_at   = now()
  returning * into row;
  return row;
end;
$$;

create or replace function public.zs_record_market_day(p_date date default null)
returns jsonb language sql security definer
set search_path to 'zumsavdo', 'public'
as $$ select to_jsonb(zumsavdo.record_market_day(p_date)); $$;

revoke execute on function public.zs_record_market_day(date) from anon, authenticated;
grant execute on function public.zs_record_market_day(date) to service_role;

-- Chegara zondi qayerdan boshlashi.
create or replace function public.zs_frontier_start()
returns bigint language sql stable security definer
set search_path to 'zumsavdo', 'public'
as $$
  select greatest(
    coalesce((select max(id_frontier) from zumsavdo.market_day), 0),
    coalesce((select max(product_id) from zumsavdo.product_census), 0),
    coalesce((select max(id) from zumsavdo.product), 0),
    1);
$$;

-- Chegara faqat o'sadi: pastga tushgan qiymat o'lchov xatosi (bloklangan
-- so'rov, tarmoq uzilishi) bo'ladi, katalogning qisqarishi emas. Uni yozib
-- qo'ysak, ertangi farq manfiy chiqib "kuniga minus 40 000 mahsulot" degan
-- ma'nosiz raqam berardi.
create or replace function public.zs_record_frontier(p_frontier bigint, p_date date default null)
returns jsonb
language plpgsql security definer
set search_path to 'zumsavdo', 'public'
as $$
declare
  d date := coalesce(p_date, (now() at time zone 'Asia/Tashkent')::date);
  row zumsavdo.market_day;
begin
  perform zumsavdo.record_market_day(d);
  update zumsavdo.market_day m
     set id_frontier = greatest(coalesce(m.id_frontier, 0), p_frontier), measured_at = now()
   where m.date = d
  returning * into row;
  return to_jsonb(row);
end;
$$;

revoke execute on function public.zs_record_frontier(bigint, date) from anon, authenticated;
grant execute on function public.zs_record_frontier(bigint, date) to service_role;
grant execute on function public.zs_frontier_start() to service_role;

-- Panel uchun: kunlik o'sish qatori. `trusted` — shu kun boshlang'ichdan
-- keyingi kunmi. Panel undan oldingi kunga raqam emas, chiziqcha qo'yadi.
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
           m.id_frontier - lag(m.id_frontier) over (order by d.date) as id_added
    from days d left join zumsavdo.market_day m on m.date = d.date
  )
  select jsonb_build_object(
    'baseline', (select since from base),
    'note',     (select note from zumsavdo.market_baseline),
    'rows', coalesce((select jsonb_agg(to_jsonb(j) order by j.date) from joined j), '[]'::jsonb));
$$;

grant execute on function public.zs_market_growth(date, date) to anon, authenticated;

notify pgrst, 'reload schema';
