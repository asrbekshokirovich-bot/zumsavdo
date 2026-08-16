-- 06.5: faqat o'zgarganini yozish. 07: monotonlik va qamrov.

-- Bitta partiya: lug'atlar, SKU, o'lchovlar, sharhlar, o'rin, qamrov.
create or replace function public.zs_ingest_batch(p_sweep_id bigint, p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = zumsavdo, public
as $$
declare
  written integer := 0;
  n integer;
begin
  insert into zumsavdo.category (id, name, parent_id, updated_at)
  select x.id, x.name, x."parentId", now()
  from jsonb_to_recordset(coalesce(p_payload->'categories', '[]'::jsonb))
       as x(id bigint, name text, "parentId" bigint)
  on conflict (id) do update
     set name = excluded.name,
         parent_id = coalesce(excluded.parent_id, zumsavdo.category.parent_id),
         updated_at = now();

  insert into zumsavdo.shop (id, name, category_id, official, updated_at)
  select x.id, x.name, x."categoryId", coalesce(x.official, false), now()
  from jsonb_to_recordset(coalesce(p_payload->'shops', '[]'::jsonb))
       as x(id bigint, name text, "categoryId" bigint, official boolean)
  on conflict (id) do update
     set name = excluded.name,
         category_id = coalesce(excluded.category_id, zumsavdo.shop.category_id),
         official = excluded.official,
         updated_at = now();

  insert into zumsavdo.product (id, title, shop_id, category_id, updated_at)
  select x.id, x.title, x."shopId", x."categoryId", now()
  from jsonb_to_recordset(coalesce(p_payload->'products', '[]'::jsonb))
       as x(id bigint, title text, "shopId" bigint, "categoryId" bigint)
  on conflict (id) do update
     set title = excluded.title,
         shop_id = coalesce(excluded.shop_id, zumsavdo.product.shop_id),
         category_id = coalesce(excluded.category_id, zumsavdo.product.category_id),
         updated_at = now();

  insert into zumsavdo.sku (id, product_id, title, updated_at)
  select distinct on (x.id) x.id, x."productId", x.title, now()
  from jsonb_to_recordset(coalesce(p_payload->'skuObservations', '[]'::jsonb))
       as x(id bigint, "productId" bigint, title text)
  on conflict (id) do update
     set product_id = coalesce(excluded.product_id, zumsavdo.sku.product_id),
         title = coalesce(excluded.title, zumsavdo.sku.title),
         updated_at = now();

  -- Do'kon hisoblagichi HAR sweepda yoziladi: kunlik sotuv aynan uning
  -- farqidan chiqadi, shuning uchun o'zgarmagan bo'lsa ham kerak.
  insert into zumsavdo.shop_observation
        (sweep_id, shop_id, observed_at, orders_quantity, reviews, rating)
  select p_sweep_id, x."shopId", x."observedAt", x."ordersQuantity", x.reviews, x.rating
  from jsonb_to_recordset(coalesce(p_payload->'shopObservations', '[]'::jsonb))
       as x("shopId" bigint, "observedAt" timestamptz, "ordersQuantity" bigint,
            reviews bigint, rating numeric)
  on conflict (sweep_id, shop_id) do update
     set observed_at = excluded.observed_at,
         orders_quantity = excluded.orders_quantity,
         reviews = excluded.reviews,
         rating = excluded.rating;
  get diagnostics n = row_count;
  written := written + n;

  -- Mahsulot va SKU o'lchovlari faqat O'ZGARGANDA yoziladi.
  -- Sabab (06.5): o'zgarmagan qatorlar yiliga 460 GB, o'zgarganlari 14 GB.
  -- Sotuv hisobiga zarari yo'q: qoldiq pasayishi faqat o'zgarish nuqtalarida
  -- bo'ladi, ular esa saqlanadi.
  insert into zumsavdo.product_observation
        (sweep_id, product_id, observed_at, price, full_price, discount_percent,
         stock, reviews, rating, buyers_per_week, available)
  select p_sweep_id, x."productId", x."observedAt", x.price, x."fullPrice",
         x."discountPercent", x.stock, x.reviews, x.rating, x."buyersPerWeek", x.available
  from jsonb_to_recordset(coalesce(p_payload->'productObservations', '[]'::jsonb))
       as x("productId" bigint, "observedAt" timestamptz, price bigint,
            "fullPrice" bigint, "discountPercent" integer, stock integer,
            reviews integer, rating numeric, "buyersPerWeek" integer, available boolean)
  where not exists (
    select 1 from zumsavdo.product_observation prev
    where prev.product_id = x."productId"
      and prev.observed_at = (
        select max(o2.observed_at) from zumsavdo.product_observation o2
        where o2.product_id = x."productId"
      )
      and prev.price is not distinct from x.price
      and prev.stock is not distinct from x.stock
      and prev.reviews is not distinct from x.reviews
      and prev.buyers_per_week is not distinct from x."buyersPerWeek"
      and prev.discount_percent is not distinct from x."discountPercent"
  )
  on conflict (sweep_id, product_id) do update
     set observed_at = excluded.observed_at,
         price = excluded.price,
         stock = excluded.stock,
         reviews = excluded.reviews,
         buyers_per_week = excluded.buyers_per_week;
  get diagnostics n = row_count;
  written := written + n;

  insert into zumsavdo.sku_observation
        (sweep_id, sku_id, observed_at, sell_price, full_price, available_amount)
  select p_sweep_id, x.id, x."observedAt", x."sellPrice", x."fullPrice", x."availableAmount"
  from jsonb_to_recordset(coalesce(p_payload->'skuObservations', '[]'::jsonb))
       as x(id bigint, "observedAt" timestamptz, "sellPrice" bigint,
            "fullPrice" bigint, "availableAmount" integer)
  where not exists (
    select 1 from zumsavdo.sku_observation prev
    where prev.sku_id = x.id
      and prev.observed_at = (
        select max(o2.observed_at) from zumsavdo.sku_observation o2 where o2.sku_id = x.id
      )
      and prev.sell_price is not distinct from x."sellPrice"
      and prev.available_amount is not distinct from x."availableAmount"
  )
  on conflict (sweep_id, sku_id) do update
     set observed_at = excluded.observed_at,
         sell_price = excluded.sell_price,
         available_amount = excluded.available_amount;
  get diagnostics n = row_count;
  written := written + n;

  -- Sharhlar o'zgarmaydi — bir marta yozilsa yetarli.
  insert into zumsavdo.feedback (id, product_id, sku_id, rating, created_at, has_content)
  select x.id, x."productId", x."skuId", x.rating, x."createdAt", coalesce(x."hasContent", false)
  from jsonb_to_recordset(coalesce(p_payload->'feedbacks', '[]'::jsonb))
       as x(id bigint, "productId" bigint, "skuId" bigint, rating integer,
            "createdAt" timestamptz, "hasContent" boolean)
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  written := written + n;

  insert into zumsavdo.listing_position (product_id, scope, observed_at, position)
  select x."productId", 'shop:' || x."shopId", x."observedAt", x.position
  from jsonb_to_recordset(coalesce(p_payload->'positions', '[]'::jsonb))
       as x("productId" bigint, "shopId" bigint, "observedAt" timestamptz, position integer)
  on conflict (product_id, scope, observed_at) do nothing;

  insert into zumsavdo.sweep_coverage (sweep_id, scope, reported, listed, captured, truncated, dead)
  select p_sweep_id, x.scope, x.reported, x.listed, x.captured,
         coalesce(x.truncated, 0), coalesce(x.dead, 0)
  from jsonb_to_recordset(
         case when p_payload ? 'coverage'
              then jsonb_build_array(p_payload->'coverage')
              else '[]'::jsonb end)
       as x(scope text, reported integer, listed integer, captured integer,
            truncated integer, dead integer)
  on conflict (sweep_id, scope) do update
     set reported = excluded.reported, listed = excluded.listed,
         captured = excluded.captured, truncated = excluded.truncated,
         dead = excluded.dead;

  return written;
end $$;

revoke all on function public.zs_ingest_batch(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.zs_ingest_batch(bigint, jsonb) to service_role;
