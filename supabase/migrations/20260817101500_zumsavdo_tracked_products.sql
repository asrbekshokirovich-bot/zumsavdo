-- Kuzatiladigan mahsulotlar roʻyxati bazada turadi, `.env` da emas.
--
-- Sabab: roʻyxat oʻsadi. Yuzlab id ni muhit oʻzgaruvchisiga tiqish mumkin
-- emas, va u har mashinada qoʻlda takrorlanardi. Bazada turgani uchun
-- kashfiyot (discover) va yigʻish (sweep) bir xil roʻyxatni koʻradi.
create table if not exists zumsavdo.tracked_product (
  product_id bigint primary key,
  source     text        not null default 'discover',
  added_at   timestamptz not null default now(),
  active     boolean     not null default true
);
create index if not exists tracked_active_idx on zumsavdo.tracked_product (active);

alter table zumsavdo.tracked_product enable row level security;
drop policy if exists read_tracked_product on zumsavdo.tracked_product;
create policy read_tracked_product on zumsavdo.tracked_product for select using (true);

grant select on zumsavdo.tracked_product to anon, authenticated;
grant all on zumsavdo.tracked_product to service_role;

create or replace view public.zs_tracked_product as
  select product_id, source, added_at, active from zumsavdo.tracked_product;
grant select on public.zs_tracked_product to anon, authenticated;

-- Roʻyxatga qoʻshadi va nechtasi yangi ekanini qaytaradi.
create or replace function public.zs_track_products(p_ids bigint[], p_source text default 'discover')
returns integer
language plpgsql
security definer
set search_path = zumsavdo, public
as $$
declare n integer;
begin
  insert into zumsavdo.tracked_product (product_id, source)
  select distinct unnest(p_ids), coalesce(p_source, 'discover')
  on conflict (product_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.zs_track_products(bigint[], text) from public, anon, authenticated;
grant execute on function public.zs_track_products(bigint[], text) to service_role;
