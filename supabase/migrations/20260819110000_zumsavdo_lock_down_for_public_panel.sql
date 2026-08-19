-- Panel ochiq internetga chiqarilishidan oldingi yopish.
--
-- Anon kalit brauzerga tushadi va u yashirin emas — istagan odam uni
-- devtools dan olib PostgREST ga to'g'ridan-to'g'ri so'rov yubora oladi.
-- Yozish allaqachon yopiq edi (anon uchun INSERT/UPDATE/DELETE yo'q), lekin
-- O'QISH butun `zumsavdo` sxemasiga ochiq edi: perepisning 595 ming qatori,
-- kuzatuv ro'yxati, xom o'lchovlar — hammasi.
--
-- Ya'ni panelni ochiq qo'yish butun bazani ochiq qo'yish degani bo'lardi.
--
-- Panelga xom jadvallar kerak emas: u faqat `zs_panel_*` ko'rinishlari va
-- `zs_*` funksiyalari bilan ishlaydi. Ko'rinishlar `postgres` egaligida va
-- `security_invoker = off`, shuning uchun sxema yopilgach ham ishlayveradi.
revoke usage on schema zumsavdo from anon, authenticated;
revoke all on all tables in schema zumsavdo from anon, authenticated;
revoke all on all sequences in schema zumsavdo from anon, authenticated;
revoke all on all functions in schema zumsavdo from anon, authenticated;
alter default privileges in schema zumsavdo revoke all on tables from anon, authenticated;

-- Panelga kerak bo'lmagan, lekin xom ma'lumotni ochib turadigan
-- ko'rinishlar ham yopiladi. Ular yig'uvchi uchun edi va u `service_role`
-- bilan ishlaydi — undan hech narsa tortib olinmaydi.
revoke all on
  public.zs_product, public.zs_shop, public.zs_category, public.zs_feedback,
  public.zs_sku, public.zs_tracked_product, public.zs_census_status,
  public.zs_anomaly, public.zs_listing_position, public.zs_sweep_coverage,
  public.zs_stock_movement_day
from anon, authenticated;

-- Panel aynan shularni o'qiydi — boshqa hech narsani.
grant select on
  public.zs_panel_category, public.zs_panel_shop, public.zs_panel_product,
  public.zs_shop_day, public.zs_product_day, public.zs_feedback_day,
  public.zs_feedback_span, public.zs_product_observation, public.zs_sweep
to anon, authenticated;

alter table zumsavdo.market_day      enable row level security;
alter table zumsavdo.market_baseline enable row level security;
alter table zumsavdo.frontier_probe  enable row level security;

-- Yozadigan funksiyalarni RO'YXAT bo'yicha emas, XOSSASI bo'yicha yopamiz.
--
-- Avval `revoke ... from anon, authenticated` yozgandim va bu yetarli deb
-- o'ylagandim. Yetarli emas ekan: Supabase `public` sxemasidagi yangi
-- funksiyalarga anon va authenticated ga ALOHIDA grant beradi, PUBLIC ham
-- avtomatik EXECUTE oladi. Tekshirilganda anon kalit bilan
-- `zs_record_frontier` 200 qaytardi — ya'ni istagan odam katalog
-- chegarasini xohlagan raqamga o'zgartira olardi.
--
-- Ro'yxat yozib chiqish ham yetarli emas: keyingi safar yangi funksiyani
-- ro'yxatga qo'shishni unutish mumkin. Shart funksiyaning o'zidan olinadi:
-- `provolatile = 'v'` — ma'lumotni o'zgartira oladigan funksiya. Panelning
-- hamma so'rovi `stable`, yig'uvchiniki esa `volatile`.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'zs\_%' and p.provolatile = 'v'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- O'zgartirmaydi, lekin faqat yig'uvchiga kerak.
revoke all on function public.zs_frontier_start() from public, anon, authenticated;
grant execute on function public.zs_frontier_start() to service_role;

-- Bundan keyin yangi funksiya o'zi ochilib qolmasin. Panelga kerakli
-- funksiya har safar ataylab `grant` qilinadi — unutilsa panel darhol
-- ishlamay qoladi va bu ko'rinadi. Teskarisi esa ko'rinmaydi: ochiq qolgan
-- yozish funksiyasi hech qanday belgi bermaydi.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

notify pgrst, 'reload schema';
