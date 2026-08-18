-- PANEL QAMROVI — panel butun katalogni emas, faqat oʻlchanganini yuklaydi.
--
-- Perepis lugʻatni millionlab qatorga oʻstiradi (bu uning vazifasi), lekin
-- panel faqat oʻlchovi bor obyektlarni koʻrsatadi. Ilgari u `zs_product` ni
-- toʻliq oʻqirdi va 30 ming mahsulotdayoq 31 ta ketma-ket soʻrovga aylanib,
-- yuklash chegarasidan oshib ketdi — natijada panel "oʻlchov yoʻq" deb
-- boʻshab qoldi, holbuki maʻlumot joyida edi.
--
-- Qamrov: oxirgi 60 kunda kunlik yigʻindisi bor yoki kuzatuvda turgan
-- mahsulotlar. 60 — panelning 45 kunlik oynasidan biroz keng, chegarada
-- qator tushib qolmasligi uchun.

create or replace view public.zs_panel_product as
  select p.id, p.title, p.shop_id, p.category_id
  from zumsavdo.product p
  where exists (
          select 1 from zumsavdo.product_day d
          where d.product_id = p.id and d.date >= current_date - 60)
     or exists (
          select 1 from zumsavdo.tracked_product t
          where t.product_id = p.id and t.active);

create or replace view public.zs_panel_shop as
  select s.id,
         s.name,
         coalesce(s.category_id, d.category_id) as category_id,
         s.official
  from zumsavdo.shop s
  left join lateral (
    select p.category_id
    from zumsavdo.product p
    where p.shop_id = s.id and p.category_id is not null
    group by p.category_id
    order by count(*) desc, p.category_id
    limit 1
  ) d on true
  where exists (
          select 1 from zumsavdo.shop_day sd
          where sd.shop_id = s.id and sd.date >= current_date - 60)
     or exists (
          select 1 from public.zs_panel_product pp where pp.shop_id = s.id);

create or replace view public.zs_panel_category as
  select c.id, c.name
  from zumsavdo.category c
  where exists (select 1 from public.zs_panel_product p where p.category_id = c.id)
     or exists (select 1 from public.zs_panel_shop   s where s.category_id = c.id);

grant select on public.zs_panel_product, public.zs_panel_shop, public.zs_panel_category
  to anon, authenticated;
