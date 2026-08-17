-- PEREPIS — butun Uzum katalogini id boʻyicha aylanib chiqish.
--
-- Nega id boʻyicha: Uzumning qidiruv uchi (`search-gateway`) bu IP uchun
-- doimiy 429 qaytaradi, yaʻni turkum boʻyicha roʻyxat olish yoʻli yopiq.
-- `productPage(id:)` esa ishlaydi. Oʻlchandi: id fazosi 1…~3,2 mln, undan
-- pastda ~90% tirik (jonli sinovda 601 id dan 571 tasi).
--
-- Nega alohida jadval: perepis oʻlchov emas, roʻyxat. Unda qoldiq yoʻq
-- (SKU soʻralmaydi — u soʻrovni 16 barobar ogʻirlashtiradi), shuning uchun
-- uni product_observation ga qoʻshib yuborish sotuv hisobini buzardi:
-- rollup qoldiq kamayishini qidiradi, perepis qatorida esa qoldiq yoʻq.

create table if not exists zumsavdo.crawl_cursor (
  name       text primary key,
  next_id    bigint      not null,
  max_id     bigint      not null,
  pass       integer     not null default 1,
  seen       bigint      not null default 0,
  live       bigint      not null default 0,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists zumsavdo.product_census (
  pass            integer     not null,
  product_id      bigint      not null,
  observed_at     timestamptz not null,
  price           bigint,
  full_price      bigint,
  reviews         integer,
  rating          numeric,
  buyers_per_week integer,
  shop_orders     bigint,
  primary key (pass, product_id)
);
create index if not exists census_demand_idx
  on zumsavdo.product_census (pass, buyers_per_week desc nulls last);

alter table zumsavdo.crawl_cursor   enable row level security;
alter table zumsavdo.product_census enable row level security;
drop policy if exists read_crawl_cursor on zumsavdo.crawl_cursor;
drop policy if exists read_product_census on zumsavdo.product_census;
create policy read_crawl_cursor   on zumsavdo.crawl_cursor   for select using (true);
create policy read_product_census on zumsavdo.product_census for select using (true);
grant select on zumsavdo.crawl_cursor, zumsavdo.product_census to anon, authenticated;
grant all    on zumsavdo.crawl_cursor, zumsavdo.product_census to service_role;
