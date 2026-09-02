-- SINALDI VA ISHLAMADI: funksiya darajasidagi vaqt byudjeti.
--
-- Bu migratsiya ATAYLAB deyarli boʻsh. U bitta topilmani yozib
-- qoldiradi, chunki repoda shu haqda NOTOʻGʻRI daʼvo turibdi va
-- keyingi safar kimdir shu yoʻldan yana ketishi mumkin.
--
-- NIMA SINALDI
-- ------------
-- Panel `anon` roli ostida ishlaydi, uning `statement_timeout` i 3
-- soniya. Keng davrda `zs_panel_overview` undan oshardi. Yechim deb
-- funksiyaga oʻz byudjetini berish oʻylandi:
--
--   alter function public.zs_panel_overview(...) set statement_timeout = '20s';
--
-- NATIJA: XATO OʻSHA-OʻSHA QOLDI.
--
--   set local statement_timeout = '1s';
--   select public.zs_panel_overview(current_date-44, current_date, ...);
--   -- ERROR: canceling statement due to statement timeout
--   -- CONTEXT: SQL function "zs_shop_rank" statement 1
--
-- SABABI: taymer BAYONOT BOSHLANISHIDA qurollanadi. Funksiya ichida
-- GUC oʻzgargani uni qayta qurollantirmaydi, yaʼni funksiya darajasidagi
-- `SET` allaqachon boshlangan bayonotni UZAYTIRA OLMAYDI.
--
-- REPODAGI NOTOʻGʻRI DAʼVO
-- ------------------------
-- `20260824090000_zumsavdo_rollup_vaqt_byudjeti.sql` da shunday
-- yozilgan: "funksiya darajasidagi `SET` seans byudjetini bosib
-- oʻtadi". Bugungi oʻlchov buni tasdiqlamadi. Oʻsha migratsiyadagi
-- `alter function ... set statement_timeout` satrlari zarar qilmaydi,
-- lekin ular `zs_rollup_days` ni tuzatgan deb hisoblamang — u
-- ishlayotgan boʻlsa, boshqa sabab bilan ishlayapti.
--
-- NIMA QILINDI OʻRNIGA
-- --------------------
-- Chegarani aylanib oʻtish emas, soʻrovni chegaraga sigʻdirish:
-- `20260902130000`, `20260902133000`, `20260902134000` va
-- `20260902141000`. Natijada 45 kunlik davr ham `anon` ostida,
-- haqiqiy 3 soniyalik chegara bilan xatosiz oʻtadi.
--
-- Quyidagi satrlar — tozalash. Byudjet jonli bazaga qoʻyilgan edi va
-- olib tashlandi; toza bazada bu shunchaki hech nima qilmaydi.

alter function public.zs_panel_overview(date, date, text, text, integer) reset statement_timeout;
alter function public.zs_product_rank(date, date, text, integer, integer) reset statement_timeout;
alter function public.zs_shop_rank(date, date, text, integer) reset statement_timeout;
alter function public.zs_category_rank(date, date, text, integer) reset statement_timeout;
