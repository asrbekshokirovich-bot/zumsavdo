-- `totals` ni `zs_panel_overview` dan ajratish.
--
-- MUAMMO (oʻlchandi 2026-09-02)
-- -----------------------------
-- Panel ochilmay qoldi:
--
--   Yigʻindi olinmadi: zs_panel_overview bajarilmadi:
--   canceling statement due to statement timeout
--
-- `anon` roliga `statement_timeout = 3s` qoʻyilgan (pg_roles bilan
-- tasdiqlandi), funksiya esa STANDART davr — bitta bugungi kun —
-- uchun **5 226 ms** ishlaydi. Yaʼni panel har ochilganda yiqiladi,
-- sanani oʻzgartirish yordam bermaydi.
--
-- Vaqt qayerga ketadi (current_date…current_date, har biri alohida
-- oʻlchandi):
--
--   summary        66 ms
--   daily          37 ms
--   shops         646 ms
--   categories    794 ms
--   products    1 946 ms
--   available      89 ms
--   totals      1 778 ms   <-- shu blok
--   ------------------
--   jami        5 356 ms
--
-- NEGA `totals` eng nomunosib xarajat
-- -----------------------------------
-- Uchala hisob ham SANAGA BOGʻLIQ EMAS: `zs_panel_shop`,
-- `zs_panel_category` va `zs_panel_product` `current_date - 60`
-- oynasi ustida qurilgan va `p_from`/`p_to` ga umuman qaramaydi.
-- Yaʼni foydalanuvchi qaysi kunni tanlasa ham javob bir xil, lekin u
-- har chaqiruvda qaytadan hisoblanadi.
--
-- Ustiga-ustak uchalasi BIR XIL ogʻir ishni uch marta bajaradi:
-- `zs_panel_category` `zs_panel_product` ga tayanadi, `zs_panel_shop`
-- ham unga tayanadi, va `zs_panel_product` ning oʻzi
-- `product_day` (553 595 qator) boʻyicha Seq Scan qilib `product`
-- (50 038 qator) ga nested loop bilan kiradi. 761 135 bufer, uch marta.
--
-- QAROR
-- -----
-- Hisob materiallashtirilgan koʻrinishga koʻchiriladi va supurish
-- oxirida yangilanadi (kuniga uch marta: 02, 10, 18 UTC). Panel uni
-- oʻqiydi — hisob emas, tayyor qator.
--
-- Panel javobining SHAKLI OʻZGARMAYDI: `totals.shops`,
-- `totals.categories`, `totals.products` oʻsha joyida qoladi, yaʼni
-- `src/pages/Home.tsx` ga tegilmaydi. Ustiga `measured_at` qoʻshiladi
-- — bu ortiqcha maydon emas, KAFOLAT: materiallashtirilgan koʻrinish
-- yangilanmay qolsa raqam jimgina eskiradi, va eskirganini faqat shu
-- maydon koʻrsatadi (QOIDALAR.md 8-boʻlim, "jim nol").
--
-- BU YETARLI EMAS — buni ochiq yozib qoʻyamiz. `totals` siz funksiya
-- **3 340 ms** ishlaydi, yaʼni 3 soniyalik chegaradan hali ham oʻtmaydi.
-- Keyingi qadam `zs_product_rank` (1 946 ms) va `zs_category_rank`
-- (794 ms) — alohida ish.

create materialized view zumsavdo.panel_totals as
select
  -- `bir` — CONCURRENTLY uchun kerak boʻlgan yagona kalit. Koʻrinishda
  -- doim bitta qator boʻladi, lekin `refresh … concurrently` unikal
  -- indekssiz ishlamaydi.
  1::smallint                                     as bir,
  (select count(*) from public.zs_panel_shop)     as shops,
  (select count(*) from public.zs_panel_category) as categories,
  (select count(*) from public.zs_panel_product)  as products,
  now()                                           as measured_at;

create unique index panel_totals_bir_uniq on zumsavdo.panel_totals (bir);

-- Yangilash uchi. Faqat yigʻuvchi chaqiradi, `anon` uchun yopiq.
create or replace function public.zs_refresh_panel_totals()
returns jsonb
language plpgsql
security definer
set search_path to 'zumsavdo', 'public'
as $$
declare
  q record;
begin
  -- Ikkita supurish ustma-ust tushsa ikkinchisi KUTMAYDI. Kutish
  -- foydasiz: birinchisi ayni shu raqamni hisoblab boʻlyapti.
  -- 2026-08-20 dagi doʻkon turkumi voqeasi shuni oʻrgatgan — bitta
  -- bloklangan yordamchi qadam undan keyingi butun zanjirni olib
  -- ketgan edi.
  if pg_try_advisory_xact_lock(hashtext('zs_refresh_panel_totals')) then
    refresh materialized view concurrently zumsavdo.panel_totals;
  end if;
  select * into q from zumsavdo.panel_totals;
  return to_jsonb(q) - 'bir';
end $$;

-- Hisob ~1,8 soniya. `service_role` byudjeti boʻsh, lekin PostgREST
-- `authenticator` dan 8 soniya meros qolishi mumkin — aniq yozamiz.
alter function public.zs_refresh_panel_totals() set statement_timeout = '120s';

revoke all on function public.zs_refresh_panel_totals() from public;
grant execute on function public.zs_refresh_panel_totals() to service_role;

-- Endi panel funksiyasi hisoblamaydi, oʻqiydi.
create or replace function public.zs_panel_overview(
  p_from date, p_to date,
  p_basis text default 'orders',
  p_series text default 'orders',
  p_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path to 'zumsavdo', 'public'
as $function$
  select jsonb_build_object(
    'summary', (
      select to_jsonb(s) from public.zs_market_summary(p_from, p_to) s
    ),
    'daily', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.date)
      from public.zs_market_daily(p_from, p_to, p_series) d
    ), '[]'::jsonb),
    'shops', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.zs_shop_rank(p_from, p_to, p_basis, p_limit) r
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.zs_category_rank(p_from, p_to, p_basis, p_limit) r
    ), '[]'::jsonb),
    -- Mahsulot doʻkon buyurtmasi boʻyicha saralanmaydi — `ordersQuantity`
    -- doʻkon oʻlchovi. Shuning uchun "buyurtma" tanlanganda dona boʻyicha
    -- saralanadi va bu sahifada shunday deb yozib qoʻyilgan.
    'products', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.zs_product_rank(
        p_from, p_to,
        case p_basis when 'buyers' then 'buyers' else 'units' end,
        p_limit, 0
      ) r
    ), '[]'::jsonb),
    -- Qaysi tugma yonishi. Reyting hisoblanmaydi — faqat "bittasi bormi"
    -- deb soʻraladi, shuning uchun narxi deyarli nol.
    'rank_available', (
      select jsonb_build_object(
        'orders', exists (select 1 from zumsavdo.shop_day sd
                           where sd.date between p_from and p_to and sd.orders is not null),
        'buyers', exists (select 1 from zumsavdo.product_day pd
                           where pd.date between p_from and p_to and pd.buyers_per_week is not null),
        'units',  exists (select 1 from zumsavdo.product_day pd
                           where pd.date between p_from and p_to and pd.sold_units is not null)
      )
    ),
    'series_available', (
      select jsonb_build_object(
        'orders', exists (select 1 from zumsavdo.shop_day sd
                           where sd.date between p_from and p_to and sd.orders is not null),
        'feedbacks', exists (select 1 from public.zs_feedback_day fd
                              where fd.date between p_from and p_to),
        'units',  exists (select 1 from zumsavdo.product_day pd
                           where pd.date between p_from and p_to and pd.sold_units is not null)
      )
    ),
    -- Roʻyxatlarda nechtadan bor — "hammasi" havolasi yonida turadi va
    -- foydalanuvchi beshtadan tashqarida yana nima borligini biladi.
    --
    -- Sanaga bogʻliq emas, shuning uchun bu yerda HISOBLANMAYDI.
    -- Supurish oxirida `zs_refresh_panel_totals()` yozib qoʻyadi.
    'totals', (
      select jsonb_build_object(
        'shops',       t.shops,
        'categories',  t.categories,
        'products',    t.products,
        -- Qachon oʻlchangani. Yigʻuvchi toʻxtasa raqam eskiradi va
        -- buni faqat shu maydon koʻrsatadi.
        'measured_at', t.measured_at
      )
      from zumsavdo.panel_totals t
    )
  );
$function$;
