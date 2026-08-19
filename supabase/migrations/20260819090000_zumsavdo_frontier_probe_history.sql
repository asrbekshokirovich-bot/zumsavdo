-- Chegara o'lchovlari VAQTI bilan saqlanadi.
--
-- Ilgari kuniga bitta qiymat yozilardi va tezlik faqat ertangi o'lchovdan
-- keyin chiqardi. Holbuki chegara uzluksiz siljiydi: kuniga bir necha marta
-- o'lchansa, tezlik o'sha kuniyoq ma'lum bo'ladi.
create table if not exists zumsavdo.frontier_probe (
  measured_at timestamptz primary key default now(),
  frontier    bigint not null,
  -- Zond aniqligi. Birinchi zond ±1000 edi: binar qidiruvni 1000 id
  -- oralig'ida to'xtatib "oxirgi tirik + 40" qaytarardi. Aniqroq zond
  -- o'sha paytdayoq 3 224 863 berdi — eskisi 705 ga past edi.
  exact       boolean not null default true
);

create index if not exists frontier_probe_at_idx on zumsavdo.frontier_probe (measured_at desc);

-- Chegara faqat o'sadi: pastga tushgan qiymat o'lchov xatosi (bloklangan
-- so'rov, tarmoq uzilishi) bo'ladi, katalogning qisqarishi emas.
create or replace function public.zs_record_frontier(p_frontier bigint, p_date date default null)
returns jsonb
language plpgsql security definer
set search_path to 'zumsavdo', 'public'
as $$
declare
  d date := coalesce(p_date, (now() at time zone 'Asia/Tashkent')::date);
  best bigint := (select max(frontier) from zumsavdo.frontier_probe);
  row zumsavdo.market_day;
begin
  if best is not null and p_frontier < best then
    raise notice 'Chegara pasaydi (% < %) — o''lchov xatosi deb tashlandi.', p_frontier, best;
  else
    insert into zumsavdo.frontier_probe (measured_at, frontier) values (now(), p_frontier)
    on conflict (measured_at) do nothing;
  end if;

  perform zumsavdo.record_market_day(d);
  update zumsavdo.market_day m
     set id_frontier = (select max(frontier) from zumsavdo.frontier_probe
                         where (measured_at at time zone 'Asia/Tashkent')::date = d),
         measured_at = now()
   where m.date = d
  returning * into row;
  return to_jsonb(row);
end;
$$;

revoke execute on function public.zs_record_frontier(bigint, date) from anon, authenticated;
grant execute on function public.zs_record_frontier(bigint, date) to service_role;

-- Tezlik faqat ANIQ o'lchovlardan hisoblanadi.
--
-- Agar ±1000 aniqlikdagi eski o'lchov aniq o'lchov bilan solishtirilsa,
-- yarim soatda "705 yangi id" chiqadi — kuniga ~34 000. Bu bozor emas,
-- o'lchov usulining o'zgarishi.
--
-- Juda yaqin ikki o'lchov ham shovqin beradi: 3 daqiqalik oraliqdan
-- "kuniga 10 301" chiqqani o'lchandi. Shuning uchun eng kamida
-- `p_min_hours` oraliq talab qilinadi va oraliq javob bilan birga
-- qaytariladi — raqam qanchalik ishonchli ekani ko'rinsin.
create or replace function public.zs_frontier_rate(p_min_hours numeric default 2)
returns jsonb
language sql stable security definer
set search_path to 'zumsavdo', 'public'
as $$
  with ex as (select measured_at, frontier from zumsavdo.frontier_probe where exact),
  latest as (select measured_at, frontier from ex order by measured_at desc limit 1),
  earlier as (
    select p.measured_at, p.frontier
    from ex p, latest l
    where p.measured_at <= l.measured_at - make_interval(mins => (p_min_hours * 60)::integer)
    order by p.measured_at desc limit 1
  )
  select jsonb_build_object(
    'frontier',    (select frontier from latest),
    'measured_at', (select measured_at from latest),
    'from_at',     (select measured_at from earlier),
    'hours',       (select round(extract(epoch from (l.measured_at - e.measured_at)) / 3600.0, 1)
                      from latest l, earlier e),
    'ids_per_day', (select round((l.frontier - e.frontier)
                      / (extract(epoch from (l.measured_at - e.measured_at)) / 86400.0))::bigint
                      from latest l, earlier e),
    'probes',      (select count(*) from ex));
$$;

grant execute on function public.zs_frontier_rate(numeric) to anon, authenticated;

notify pgrst, 'reload schema';
