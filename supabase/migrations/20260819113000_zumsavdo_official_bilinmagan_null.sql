-- `official` — "yoʻq" bilan "bilmadim" ni ajratamiz.
--
-- Muammo. Ustun `boolean not null default false` edi va yozish uchlarida
-- `coalesce(x.official, false)` turardi. Shuning uchun uch xil holat
-- bazada bir xil koʻrinardi:
--   Uzum "rasmiy emas" dedi   → false
--   Uzum hech narsa demadi    → false
--   biz umuman soʻramadik     → false
--
-- Oʻlchov (2026-08-19). Uzum GraphQL `Shop.official` maydoni mavjud,
-- lekin toʻldirilmaydi. Jonli tekshirildi:
--   Artel Brand Shop        → false
--   Artel Uzbekistan        → false
--   ARTEL_OFFICIAL          → false
--   ARTEL • STORE           → false
--   Яшкино (207 847 sharh)  → false
-- 59 995 doʻkonning 59 995 tasi `false` edi — bu oʻlchov emas, boʻshliq.
--
-- Qaror. Ustun saqlanadi (Uzum toʻldira boshlasa tayyor boʻlamiz), lekin
-- endi NULL boʻla oladi. Panelda "rasmiy doʻkon" yorligʻi endi hech kimga
-- chiqmaydi — bu toʻgʻri: oʻlchov yoʻq boʻlsa yorliq ham boʻlmasligi kerak.

alter table zumsavdo.shop alter column official drop default;
alter table zumsavdo.shop alter column official drop not null;

update zumsavdo.shop set official = null where official is not null;

comment on column zumsavdo.shop.official is
  'Rasmiy brend doʻkoni. Uzum bu maydonni toʻldirmaydi (2026-08-19 da '
  'tekshirilgan) — amalda doim NULL.';

-- Yozish uchlari. `coalesce(x.official, false)` aynan "bilmadim" ni
-- "yoʻq" ga aylantirayotgan satr edi. Endi nomaʼlum qiymat NULL boʻlib
-- qoladi, va yangi NULL eski bilimni oʻchirmaydi.

create or replace function public.zs_census_batch(p_pass integer, p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'zumsavdo', 'public'
as $function$
declare n integer;
begin
  insert into zumsavdo.category (id, name, updated_at)
  select distinct on (x.id) x.id, x.name, now()
  from jsonb_to_recordset(coalesce(p_payload->'categories','[]'::jsonb)) as x(id bigint, name text)
  on conflict (id) do update set name = excluded.name, updated_at = now();

  insert into zumsavdo.shop (id, name, official, updated_at)
  select distinct on (x.id) x.id, x.name, x.official, now()
  from jsonb_to_recordset(coalesce(p_payload->'shops','[]'::jsonb)) as x(id bigint, name text, official boolean)
  on conflict (id) do update
     set name = excluded.name,
         official = coalesce(excluded.official, zumsavdo.shop.official),
         updated_at = now();

  insert into zumsavdo.product (id, title, shop_id, category_id, updated_at)
  select distinct on (x.id) x.id, x.title, x."shopId", x."categoryId", now()
  from jsonb_to_recordset(coalesce(p_payload->'products','[]'::jsonb))
       as x(id bigint, title text, "shopId" bigint, "categoryId" bigint)
  on conflict (id) do update
     set title = excluded.title,
         shop_id = coalesce(excluded.shop_id, zumsavdo.product.shop_id),
         category_id = coalesce(excluded.category_id, zumsavdo.product.category_id),
         updated_at = now();

  insert into zumsavdo.product_census
        (pass, product_id, observed_at, price, full_price, reviews, rating,
         buyers_per_week, shop_orders)
  select p_pass, x.id, x."observedAt", x.price, x."fullPrice", x.reviews, x.rating,
         x."buyersPerWeek", x."shopOrders"
  from jsonb_to_recordset(coalesce(p_payload->'census','[]'::jsonb))
       as x(id bigint, "observedAt" timestamptz, price bigint, "fullPrice" bigint,
            reviews integer, rating numeric, "buyersPerWeek" integer, "shopOrders" bigint)
  on conflict (pass, product_id) do update
     set observed_at = excluded.observed_at, price = excluded.price,
         reviews = excluded.reviews, rating = excluded.rating,
         buyers_per_week = excluded.buyers_per_week, shop_orders = excluded.shop_orders;
  get diagnostics n = row_count;

  update zumsavdo.crawl_cursor
     set seen = seen + coalesce((p_payload->>'seen')::bigint, 0),
         live = live + n,
         updated_at = now()
   where name = 'census';

  return n;
end $function$;

-- `zs_ingest_batch` uzun; faqat doʻkon bloki oʻzgaradi, shuning uchun uni
-- oʻrnidan almashtiramiz. Kutilgan satr topilmasa — xato, jimgina emas.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'zs_ingest_batch';

  if position('coalesce(x.official, false)' in src) = 0 then
    if position('official = coalesce(excluded.official' in src) > 0 then
      return;  -- allaqachon tuzatilgan
    end if;
    raise exception 'zs_ingest_batch kutilgan koʻrinishda emas';
  end if;

  src := replace(src, 'coalesce(x.official, false)', 'x.official');
  src := replace(src,
    'official = excluded.official,',
    'official = coalesce(excluded.official, zumsavdo.shop.official),');
  execute src;
end $$;

-- QOʻSHIMCHA (oʻsha kuni, kechroq). Yuqoridagi xulosa toʻgʻri, lekin
-- yetarli emas edi: Uzum maydonni boʻsh qoldirmaydi — haqiqiy `false`
-- yuboradi. 63 113 doʻkonda 0 ta `true`. Yaʼni bu `false` oʻlchov emas,
-- doimiy. Shuning uchun yigʻuvchi endi bu ustunga umuman yozmaydi
-- (`official: null`). Baza tomonida qoʻshimcha oʻzgarish kerak emas:
-- `coalesce(excluded.official, eski)` NULL kelganda eskisini saqlaydi,
-- demak bir marta tozalangandan keyin toza qoladi.
