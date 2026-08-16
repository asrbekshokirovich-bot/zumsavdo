-- Hujjatning 02/03/04/07-bandlari uchun jadvallar.

-- ---------------------------------------------------------------- SKU
-- Sotuv aynan variant qoldig'ining kamayishida ko'rinadi. Mahsulot darajasida
-- yig'ib yuborilsa, bir rang tugab boshqasi to'lgan holat ko'rinmay qoladi.
create table if not exists zumsavdo.sku (
  id            bigint primary key,
  product_id    bigint      references zumsavdo.product(id),
  title         text,
  first_seen_at timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists sku_product_idx on zumsavdo.sku (product_id);

create table if not exists zumsavdo.sku_observation (
  sweep_id         bigint      not null references zumsavdo.sweep(id) on delete cascade,
  sku_id           bigint      not null references zumsavdo.sku(id),
  observed_at      timestamptz not null,
  sell_price       bigint,
  full_price       bigint,
  available_amount integer,
  primary key (sweep_id, sku_id)
);
create index if not exists sku_obs_time_idx on zumsavdo.sku_observation (sku_id, observed_at desc);

-- ---------------------------------------------------------------- sharhlar
-- Yagona maydon tarixni kutmasdan beradi: hech qachon o'lchamagan
-- mahsulotning ham sanasi va bahosi 2024-yilgacha orqaga olinadi.
create table if not exists zumsavdo.feedback (
  id          bigint primary key,
  product_id  bigint      references zumsavdo.product(id),
  sku_id      bigint,
  rating      integer,
  created_at  timestamptz not null,
  has_content boolean     not null default false,
  seen_at     timestamptz not null default now()
);
create index if not exists feedback_product_time_idx on zumsavdo.feedback (product_id, created_at desc);
create index if not exists feedback_time_idx on zumsavdo.feedback (created_at);

-- ---------------------------------------------------------------- ro'yxatdagi o'rin
create table if not exists zumsavdo.listing_position (
  product_id  bigint      not null references zumsavdo.product(id),
  scope       text        not null,
  observed_at timestamptz not null,
  position    integer     not null,
  primary key (product_id, scope, observed_at)
);
create index if not exists listing_scope_idx on zumsavdo.listing_position (scope, observed_at desc);

-- ---------------------------------------------------------------- qamrov
-- Uzum nechta dedi ↔ biz nechtasini oldik. 07-band: qamrov ≥ 99%.
create table if not exists zumsavdo.sweep_coverage (
  sweep_id  bigint  not null references zumsavdo.sweep(id) on delete cascade,
  scope     text    not null,
  reported  integer not null default 0,
  listed    integer not null default 0,
  captured  integer not null default 0,
  truncated integer not null default 0,
  dead      integer not null default 0,
  primary key (sweep_id, scope)
);

-- ---------------------------------------------------------------- anomaliyalar
-- 07-band: kümülativ hisoblagich kamaysa — yozib qo'y.
-- Ilgari rollup uni greatest(0, ...) bilan jimgina yutib yuborardi.
create table if not exists zumsavdo.anomaly (
  id          bigserial primary key,
  kind        text        not null,
  shop_id     bigint,
  product_id  bigint,
  observed_at timestamptz,
  previous    bigint,
  current     bigint,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists anomaly_kind_idx on zumsavdo.anomaly (kind, created_at desc);

-- ---------------------------------------------------------------- huquqlar
do $$
declare t text;
begin
  foreach t in array array[
    'sku','sku_observation','feedback','listing_position','sweep_coverage','anomaly'
  ] loop
    execute format('alter table zumsavdo.%I enable row level security', t);
    execute format('drop policy if exists %I on zumsavdo.%I', 'read_' || t, t);
    execute format('create policy %I on zumsavdo.%I for select using (true)', 'read_' || t, t);
  end loop;
end $$;

grant select on all tables in schema zumsavdo to anon, authenticated;
grant all on all tables in schema zumsavdo to service_role;
grant all on all sequences in schema zumsavdo to service_role;
