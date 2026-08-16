create or replace view public.zs_sku as
  select id, product_id, title from zumsavdo.sku;

create or replace view public.zs_feedback as
  select id, product_id, sku_id, rating, created_at, has_content from zumsavdo.feedback;

create or replace view public.zs_listing_position as
  select product_id, scope, observed_at, position from zumsavdo.listing_position;

create or replace view public.zs_sweep_coverage as
  select sweep_id, scope, reported, listed, captured, truncated, dead
  from zumsavdo.sweep_coverage;

create or replace view public.zs_anomaly as
  select id, kind, shop_id, product_id, observed_at, previous, current, note, created_at
  from zumsavdo.anomaly;

-- Sharh sanalaridan kunlik tarix. Bu yagona qator o'lchovsiz ham tarix beradi:
-- sharh sanasi 2024-yilgacha orqaga ma'lum.
create or replace view public.zs_feedback_day as
  select product_id,
         (created_at at time zone 'Asia/Tashkent')::date as date,
         count(*)::integer                                as feedbacks,
         round(avg(rating)::numeric, 2)                   as avg_rating
  from zumsavdo.feedback
  group by 1, 2;

grant select on public.zs_sku, public.zs_feedback, public.zs_listing_position,
                public.zs_sweep_coverage, public.zs_anomaly, public.zs_feedback_day
  to anon, authenticated;
