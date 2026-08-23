-- Anon faqat oʻqiydi — yoza olmaydi.
--
-- Nima topildi
-- ------------
-- `20260819110000_..._lock_down_for_public_panel.sql` sxema darajasini
-- yopgan edi: `anon` uchun `zumsavdo` sxemasiga USAGE yoʻq. Lekin `public`
-- dagi koʻrinishlar (`zs_panel_*`, `zs_product_observation`, `zs_sweep` …)
-- `security_invoker` siz, egasi `postgres`. Ular sxema devoridan oshib
-- oʻtadi — bu panel uchun ataylab shunday.
--
-- Kamchilik shundaki, ularga berilgan huquq `SELECT` emas, `ALL` edi
-- (`anon=arwdDxtm`). Beshtasi avtomatik yangilanuvchi koʻrinish:
--   zs_panel_product, zs_product_day, zs_product_observation,
--   zs_shop_day, zs_sweep
-- Yaʼni ochiq `anon` kaliti bilan har kim perepis maʼlumotini
-- oʻchirib yoki buzib yubora olardi. Oʻlchab tasdiqlandi: `anon` roli
-- ostida `delete … where false` va `update … where false` xatosiz oʻtdi.
--
-- Nima qilinadi
-- -------------
-- Yozish huquqi olib tashlanadi, `SELECT` qoladi. Panel faqat oʻqiydi
-- (`src/data/remote.ts` — `selectAll` va `fetchProductObservations`),
-- shuning uchun panelda hech narsa oʻzgarmaydi.

do $$
declare k text;
begin
  foreach k in array array[
    'zs_feedback_day','zs_feedback_span','zs_panel_category',
    'zs_panel_product','zs_panel_shop','zs_product_day',
    'zs_product_observation','zs_shop_day','zs_sweep'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', k);
    execute format('grant select on public.%I to anon, authenticated', k);
  end loop;
end $$;

-- Bu toʻrttasi Lovable'dan qolgan boʻsh jadval: kodda ishlatilmaydi,
-- ichida maʼlumot yoʻq (marketplaces=2, qolgani 0). Bugun ularni RLS
-- ushlab turibdi — siyosat yoʻq, demak hamma narsa taqiq. Lekin huquq
-- `anon=arwdDxtm` boʻlib turishi tuzoq: ertaga kimdir bitta ruxsat
-- beruvchi siyosat qoʻshsa yoki RLS ni oʻchirsa, jadval ochilib qoladi.
-- Himoya bitta emas, ikkita boʻlsin.
revoke all on public.marketplaces, public.products,
                public.product_stats, public.user_accounts
  from anon, authenticated;

-- Ildiz sabab. Supabase'ning zavod sozlamasi `public` sxemasida
-- `postgres` yaratgan har bir jadval/koʻrinishga `anon=arwdDxtm` beradi
-- (pg_default_acl bilan oʻlchandi). Yaʼni yuqoridagi toʻqqizta koʻrinish
-- xato tufayli emas, shu boshlangʻich huquq tufayli ochiq edi — va biz
-- bugun tuzatmasak, ertaga yaratilgan koʻrinish yana ochiq boʻlardi.
-- Boshlangʻich huquqning oʻzini toraytiramiz: yozish emas, faqat oʻqish.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  grant select on tables to anon, authenticated;
