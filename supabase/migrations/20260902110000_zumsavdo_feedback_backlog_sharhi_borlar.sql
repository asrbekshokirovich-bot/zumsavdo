-- Sharh navbati sharhi YOʻQ mahsulotlarda qotib qolgan edi.
--
-- BELGISI. `zumsavdo.sweep` da note='sharh tarixi' boʻlgan oxirgi
-- toʻqqizta yozuv: targets 300, captured **0**, errors **0**. Undan
-- oldingilari 1123 → 407 → 245 → 177 → 148 → 36 → 5 → 0 deb tushib
-- kelgan. Yaʼni ish yiqilmagan, xato bermagan — shunchaki hech nima
-- yigʻmay qoʻygan va buni hech kim sezmagan (2026-08-31 dan 09-02 ga
-- qadar).
--
-- SABABI. Navbat "sharhi hali yigʻilmaganlar" deb aniqlangan:
--
--     not exists (select 1 from feedback f where f.product_id = ...)
--
-- Mahsulotda Uzumda sharh BOʻLMASA bu shart hech qachon yolgʻon
-- boʻlmaydi: soʻraymiz, hech narsa kelmaydi, jadvalga qator
-- yozilmaydi, keyingi safar oʻsha mahsulot yana navbatda. Roʻyxat
-- `product_id` boʻyicha tartiblangani uchun bunday mahsulotlar
-- boshiga toʻplanib boradi — mahsuldorlari yigʻilib navbatdan
-- chiqadi, sharhsizlari esa qoladi. Oxiri 300 lik oynani toʻliq
-- ular egallagan.
--
-- Oʻlchandi (2026-09-02, butun navbat boʻyicha):
--
--     navbat jami          48 600
--     sharhi bor (>0)      40 370   ← soʻrashga arziydi
--     sharhi nol            8 192   ← hech qachon qator bermaydi
--     hech oʻlchanmagan        38
--
-- Navbat boshidagi 300 tadan 299 tasida sharh nol edi. Ya'ni ish
-- 300 ta mahsulotdan 3 sahifadan soʻrab, 900 ta bekor soʻrov
-- yuborib, nol qator yozardi — va buni kuniga uch marta takrorlardi.
--
-- TUZATISH. Faqat sharhi BOR mahsulot soʻraladi. Shart oxirgi
-- oʻlchovga qaraydi, doimiy roʻyxatga emas: mahsulot keyin sharh
-- olsa navbatga OʻZI qaytadi. Yaʼni 8 192 tasi abadiy chiqarib
-- tashlanmayapti, faqat soʻrashga arzimaydigan payti oʻtkazib
-- yuborilyapti.
--
-- `> 0` NULL da NULL beradi, NULL esa `where` da yolgʻon — shuning
-- uchun hech oʻlchanmagan 38 ta ham tushib qoladi. Bu ataylab:
-- ularda sharh bor-yoʻqligi BILINMAYDI, va bilinmagan narsa uchun
-- Uzumga soʻrov yuborilmaydi. Ular birinchi oʻlchovdan keyin
-- navbatga oʻzi kiradi.
--
-- Tartib `product_id` boʻyicha qoladi: u deterministik va navbat
-- boʻylab oldinga siljiydi.
--
-- QOLGAN XAVF, ochiq aytiladi. Sharhi bor, lekin Uzum baribir hech
-- narsa qaytarmaydigan mahsulot xuddi shunday qotib qoladi. Bunday
-- holat oʻlchanmagan va u yuz bersa belgisi bir xil boʻladi:
-- captured=0. Shuning uchun `run-sweep.mjs` shu holatni endi
-- sweep izohiga yozadi — keyingi safar 9 kun jim ketmasin.
--
-- Reja: `zs_feedback_backlog` chaqiruvi ~123 ms (oʻlchandi,
-- explain analyze, 300 qator). Sweep kuniga uch marta ishlaydi.

create or replace function public.zs_feedback_backlog(p_limit integer default 500)
returns table (product_id bigint)
language sql
stable
security definer
set search_path = zumsavdo, public
as $$
  select t.product_id
  from zumsavdo.tracked_product t
  where t.active
    and not exists (select 1 from zumsavdo.feedback f where f.product_id = t.product_id)
    -- Mahsulot lugʻatda boʻlishi shart: sharhning FK si shunga bogʻlangan.
    and exists (select 1 from zumsavdo.product p where p.id = t.product_id)
    -- Sharhi bor-yoʻqligi — oxirgi oʻlchovdan. Sharhsiz mahsulotni
    -- soʻrash bekor soʻrov va navbatni qotiradi (yuqoridagi izoh).
    and (
      select d.reviews
      from zumsavdo.product_day d
      where d.product_id = t.product_id
      order by d.date desc
      limit 1
    ) > 0
  order by t.product_id
  limit p_limit;
$$;

revoke all on function public.zs_feedback_backlog(integer) from public, anon, authenticated;
grant execute on function public.zs_feedback_backlog(integer) to service_role;
