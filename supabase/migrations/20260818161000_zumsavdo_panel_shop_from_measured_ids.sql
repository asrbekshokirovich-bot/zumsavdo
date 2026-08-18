-- `zs_panel_shop` 46 000 doʻkonni ketma-ket oʻqib 76 tasini topardi.
--
-- Sabab yozilish tartibida edi: "hamma doʻkon, ichidan oʻlchovi borlarini
-- filtrla". Perepis doʻkon jadvalini 46 mingga toʻldirgach har reyting
-- soʻrovi 700 MB sahifa oʻqiy boshladi. Kesh iliq boʻlganda bu 40 ms
-- koʻrinadi, lekin kesh sovushi bilan bir necha soniyaga aylanadi va
-- oʻshanda soʻrov shlyuzda uziladi.
--
-- Toʻgʻri tartib teskarisi: avval oʻlchovi bor id larni ol, keyin faqat
-- oʻshalarni jadvaldan qidir. Oʻlchangan: 87 254 sahifa → 6 921.
create or replace view public.zs_panel_shop as
with ids as (
  select distinct sd.shop_id as id
  from zumsavdo.shop_day sd
  where sd.date >= current_date - 60
  union
  select distinct p.shop_id
  from public.zs_panel_product p
  where p.shop_id is not null
)
select s.id,
       s.name,
       coalesce(s.category_id, d.category_id) as category_id,
       s.official
from ids
join zumsavdo.shop s on s.id = ids.id
left join lateral (
  select p.category_id
  from zumsavdo.product p
  where p.shop_id = s.id and p.category_id is not null
  group by p.category_id
  order by count(*) desc, p.category_id
  limit 1
) d on true;

-- Turkum roʻyxati ham xuddi shu kasallikka chalingan edi: 4 764 turkumni
-- aylanib har biri uchun ikkita exists.
create or replace view public.zs_panel_category as
with ids as (
  select distinct p.category_id as id from public.zs_panel_product p where p.category_id is not null
  union
  select distinct s.category_id from public.zs_panel_shop s where s.category_id is not null
)
select c.id, c.name
from ids
join zumsavdo.category c on c.id = ids.id;

create index if not exists shop_day_shop_date_idx on zumsavdo.shop_day (shop_id, date);
analyze zumsavdo.shop;
analyze zumsavdo.category;

notify pgrst, 'reload schema';
