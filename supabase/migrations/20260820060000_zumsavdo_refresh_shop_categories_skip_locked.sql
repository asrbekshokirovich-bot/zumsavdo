-- Doʻkon turkumini yangilash: perepis bilan urishmaydi.
--
-- MUAMMO (2026-08-20 sweepda). Funksiya "statement timeout" bilan yiqildi.
-- Hisob ogʻirligida emas — oʻlchandi:
--   640 doʻkonni toʻliq yangilash → 146 ms
--   69 000 doʻkonning hammasi     → 12,6 s
--
-- Sabab ikkita, ikkalasi ham hujjatlashtirilmagan edi:
--
-- 1. PostgREST `authenticator` roli bilan ulanadi, unda
--    `statement_timeout=8s` va `lock_timeout=8s`. `service_role` da oʻz
--    sozlamasi yoʻq (`rolconfig` boʻsh), shuning uchun har RPC chaqiruvi
--    8 soniyalik byudjet bilan ishlaydi. Buni hech kim tanlamagan —
--    u Supabase sozlamasidan meros.
--
-- 2. Sweep paytida perepis ham ishlayotgan edi va u `zumsavdo.shop` ga
--    daqiqasiga ~2000 qator yozadi. UPDATE oʻsha qatorlarning qulfini
--    kutadi. Kutish 8 soniyadan oshsa — statement timeout.
--
--    Xato aynan "statement timeout" boʻlgani ham shuni tasdiqlaydi:
--    `lock_timeout` ham 8s, lekin u KUTISH boshlangandan sanaydi,
--    `statement_timeout` esa soʻrov boshidan — shuning uchun u oldin otadi.
--
-- YECHIM:
--
-- 1. Funksiya oʻz byudjetini eʼlon qiladi — PostgREST nikini meros
--    olmaydi. 120s hisob uchun emas, xavfsizlik toʻsigʻi uchun.
--
-- 2. `for update ... skip locked` — perepis yozayotgan qatorni KUTMAYDI,
--    oʻtkazib yuboradi. `main_category_id` — hisoblanadigan kesh, keyingi
--    yurishda olinadi. Kechikkani zarar emas; kutib turib butun bosqichni
--    yiqitgani — zarar.
--
-- 3. Qaytariladigan qiymat butun sondan jsonb ga oʻzgardi: oʻtkazib
--    yuborilganlar KOʻRINISHI shart. Jimgina oʻtkazish — QOIDALAR.md
--    8-boʻlimi taqiqlagan naqshning oʻzi.
--
-- SINALMAGAN QISM: haqiqiy qulf toʻqnashuvi. Bazada ikki fazali
-- tranzaksiya oʻchirilgan (`max_prepared_transactions = 0`), shuning
-- uchun bitta seansdan qulfni ushlab turib sinash imkoni boʻlmadi.
-- Haqiqiy dalil — perepis ishlab turgan paytdagi keyingi sweep:
-- logda `otkazildi` noldan katta chiqsa, mexanizm ishlagan boʻladi.

drop function if exists public.zs_refresh_shop_categories(boolean);
drop function if exists zumsavdo.refresh_shop_categories(boolean);

create function zumsavdo.refresh_shop_categories(p_only_measured boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'zumsavdo', 'public'
set statement_timeout to '120s'
set lock_timeout to '5s'
as $function$
declare
  n_yangilandi integer;
  n_kerak integer;
begin
  create temp table if not exists _rsc_band (shop_id bigint, category_id bigint)
    on commit drop;
  truncate _rsc_band;

  with target as (
    select distinct p.shop_id as id
    from zumsavdo.product_day d
    join zumsavdo.product p on p.id = d.product_id
    where p_only_measured and p.shop_id is not null
    union
    select s.id from zumsavdo.shop s where not p_only_measured
  ),
  best as (
    select t.id as shop_id, k.category_id
    from target t
    left join lateral (
      select p.category_id
      from zumsavdo.product p
      where p.shop_id = t.id and p.category_id is not null
      group by p.category_id
      order by count(*) desc, p.category_id
      limit 1
    ) k on true
  )
  insert into _rsc_band (shop_id, category_id)
  select b.shop_id, b.category_id
  from best b
  join zumsavdo.shop s on s.id = b.shop_id
  where s.main_category_id is distinct from b.category_id;

  select count(*) into n_kerak from _rsc_band;

  with qulfi_bosh as (
    select s.id, b.category_id
    from _rsc_band b
    join zumsavdo.shop s on s.id = b.shop_id
    for update of s skip locked
  )
  update zumsavdo.shop s
     set main_category_id = q.category_id
    from qulfi_bosh q
   where s.id = q.id;
  get diagnostics n_yangilandi = row_count;

  return jsonb_build_object(
    'yangilandi', n_yangilandi,
    'otkazildi', n_kerak - n_yangilandi,
    'kerak_edi', n_kerak
  );
end;
$function$;

create function public.zs_refresh_shop_categories(p_only_measured boolean default true)
returns jsonb
language sql
security definer
set search_path to 'zumsavdo', 'public'
set statement_timeout to '120s'
as $function$ select zumsavdo.refresh_shop_categories(p_only_measured); $function$;

revoke all on function public.zs_refresh_shop_categories(boolean) from public, anon, authenticated;
grant execute on function public.zs_refresh_shop_categories(boolean) to service_role;
