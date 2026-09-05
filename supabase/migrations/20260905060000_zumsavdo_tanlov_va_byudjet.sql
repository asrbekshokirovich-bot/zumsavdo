-- Ikki tuzatish: kuzatuv roʻyxatini xavfsiz qayta tanlash va
-- yigʻuvchiga yetarli vaqt byudjeti.
--
--
-- 1. `zs_select_tracked` — FAQAT TUGAGAN OʻTISHDAN TANLAYDI
-- ================================================================
-- MUAMMO. Funksiya joriy oʻtishdan (`crawl_cursor.pass`) tanlardi.
-- Lekin oʻtish tugagach `zs_census_claim` darhol keyingisiga oʻtadi
-- va uni BOʻSH holda boshlaydi. Yaʼni "tanlashning eng toʻgʻri
-- payti" — oʻtish tugagan on — bilan "joriy oʻtish" bir-biriga
-- toʻgʻri kelmaydi.
--
-- Bugungi holat aynan shunday edi: `pass` = 4, unda atigi 221 932
-- qator (toʻliq oʻtishda 2,5 mln), chunki 4-oʻtish katalogning
-- birinchi 400 000 id sidagina yurgan. Shu holda funksiya
-- chaqirilsa, roʻyxat katalogning oʻsha kichik boʻlagidan
-- tanlanardi — va hech qanday xato chiqmasdi.
--
-- BU YOZILGANDA HAQIQATAN SODIR BOʻLDI. 2026-09-05 da men avval
-- sanoqqa asoslangan pol qoʻydim ("nomzod soni chegaradan kam
-- boʻlsa toʻxta") va uni sinab koʻrmoqchi boʻlib `p_pass = 4`
-- bilan chaqirdim. Pol OʻTIB KETDI: toʻliq boʻlmagan 4-oʻtishda
-- ham 158 658 nomzod bor edi — chegaradan besh barobar koʻp.
-- Natijada roʻyxatning 41 769 tasi almashdi. Roʻyxat 3-oʻtishdan
-- (toʻliq, 2 516 629 tovar) qayta tanlanib tiklandi.
--
-- Darsi: SANOQ toʻliqlikni oʻlchamaydi. Katalogning 8% i ham
-- 50 000 nomzod berishga yetadi.
--
-- YECHIM — TUZILISH boʻyicha tekshirish:
--   oʻtgan oʻtishlar taʼrifan tugagan (`target < joriy`);
--   joriysi esa faqat kursor oxiriga yetgan boʻlsa
--   (`next_id > max_id`).
-- Tugamagan boʻlsa roʻyxat UMUMAN oʻzgarmaydi va sabab qaytariladi.
--
-- Ikkinchi himoya: tugagan oʻtish ham boʻsh chiqishi mumkin
-- (maʼlumot oʻchirilgan boʻlsa). Boʻsh tanlov roʻyxatni butunlay
-- oʻchirib yuborardi — bu ham toʻxtatiladi.
--
-- Javobga uchta ustun qoʻshildi: `tanlandi`, `ishlatilgan_pass`,
-- `sabab`. Ularsiz "0 qoʻshildi" degan javobni "hammasi joyida"
-- deb oʻqish mumkin edi — QOIDALAR.md 8-boʻlimidagi jim nol.

create or replace function public.zs_select_tracked(
  p_limit integer default 50000,
  p_pass integer default null
)
returns table(
  qoshildi integer,
  ochirildi integer,
  jami integer,
  tanlandi integer,
  ishlatilgan_pass integer,
  sabab text
)
language plpgsql
security definer
set search_path to 'zumsavdo', 'public'
as $function$
declare
  c           zumsavdo.crawl_cursor;
  target_pass integer;
  tugagan     boolean;
  picked      integer;
  added       integer;
  removed     integer;
begin
  select * into c from zumsavdo.crawl_cursor where name = 'census';
  if c.name is null then
    raise exception 'Perepis hali boshlanmagan.';
  end if;

  target_pass := coalesce(p_pass, c.pass);

  tugagan := (target_pass < c.pass)
          or (target_pass = c.pass and c.next_id > c.max_id);

  if not tugagan then
    return query select
      0, 0,
      (select count(*)::integer from zumsavdo.tracked_product where active),
      (select count(*)::integer from zumsavdo.product_census
        where pass = target_pass and buyers_per_week is not null),
      target_pass,
      format('oʻtish %s hali tugamagan (id %s / %s) — roʻyxat oʻzgarmadi',
             target_pass, c.next_id, c.max_id);
    return;
  end if;

  create temporary table _pick on commit drop as
  select product_id
  from zumsavdo.product_census
  where pass = target_pass and buyers_per_week is not null
  order by buyers_per_week desc, reviews desc nulls last
  limit p_limit;

  select count(*)::integer into picked from _pick;

  if picked = 0 then
    return query select
      0, 0,
      (select count(*)::integer from zumsavdo.tracked_product where active),
      0, target_pass,
      format('oʻtish %s da nomzod yoʻq — roʻyxat oʻzgarmadi', target_pass);
    return;
  end if;

  insert into zumsavdo.tracked_product (product_id, source, active)
  select product_id, 'census', true from _pick
  on conflict (product_id) do update set active = true;
  get diagnostics added = row_count;

  update zumsavdo.tracked_product t
     set active = false
   where t.active
     and t.source = 'census'
     and not exists (select 1 from _pick p where p.product_id = t.product_id);
  get diagnostics removed = row_count;

  return query select
    added, removed,
    (select count(*)::integer from zumsavdo.tracked_product where active),
    picked, target_pass, null::text;
end $function$;

revoke all on function public.zs_select_tracked(integer, integer) from public;
grant execute on function public.zs_select_tracked(integer, integer) to service_role;

-- Eski bir argumentli taʼrif olib tashlanadi: ikkitasi yonma-yon
-- tursa PostgREST argument nomiga qarab tanlaydi va jimgina eski
-- (himoyasiz) yoʻlga tushib ketishi mumkin edi.
drop function if exists public.zs_select_tracked(integer);


-- 2. `service_role` — 8 soniya emas, 120
-- ================================================================
-- MUAMMO oʻlchandi 2026-09-02 23:35: perepis yugurishi shu bilan
-- yiqildi —
--
--   Error: zs_census_batch bajarilmadi:
--          canceling statement due to statement timeout
--
-- 48 348 id tekshirilgan edi, yugurish `exit 1` bilan tugadi va
-- qolgan ~4 soatlik oyna yoʻqoldi.
--
-- SABAB: `service_role` ning oʻz sozlamasi yoʻq (`rolconfig` null),
-- shuning uchun u `authenticator` dan 8 soniyani meros oladi. Baza
-- oʻsgani sari 2 000 qatorlik partiyani yozish shunga sigʻmay
-- qolyapti: `product` bugun 2,78 mln qator.
--
-- NEGA FUNKSIYA DARAJASIDAGI `SET` YARAMAYDI: 2026-09-02 da sinaldi
-- va oʻlchandi — taymer bayonot boshlanishida qurollanadi, funksiya
-- ichida GUC oʻzgargani uni qayta qurollantirmaydi
-- (`20260902140000` migratsiyasiga qarang). Yagona ishlaydigan yoʻl
-- — ROL sozlamasi.
--
-- XAVFI KICHIK: `service_role` kaliti brauzerga hech qachon
-- tushmaydi (QOIDALAR.md 3-qoida) — u faqat yigʻuvchida va GitHub
-- sirlarida. `anon` dan farqli, bu uch ommaviy emas.
--
-- 120 soniya: eng ogʻir yozuv (`zs_ingest_batch`, 87 000 oʻlchov)
-- bugungi hajmda ~20 soniya. Olti barobar zaxira.
alter role service_role set statement_timeout = '120s';

-- `alter role` ning oʻzi YETMAYDI — PostgREST rol sozlamalarini
-- keshlaydi. 2026-09-02 da `anon` bilan aynan shu boʻlgan: sozlama
-- qoʻyilgan, lekin xato oʻsha-oʻsha qolgan va vaqt eski chegarada
-- qotib turgan. Xabar shart.
notify pgrst, 'reload config';
