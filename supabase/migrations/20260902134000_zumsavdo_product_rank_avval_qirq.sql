-- `zs_product_rank` — beshta qator uchun 2 million qatorli jadval
-- ochilmaydi.
--
-- NIMA NOTOʻGʻRI EDI
-- ------------------
-- Funksiya avval `product_day` ni davr boʻyicha guruhlab `agg` yasardi
-- (bitta kun uchun 50 038 guruh), keyin `agg` ni `zs_panel_product`
-- bilan, `shop` bilan va `category` bilan QOʻSHARDI, va faqat shundan
-- keyin saralab `limit 5` qilardi.
--
-- Yaʼni 50 038 qatorning hammasi uchun nom, doʻkon nomi va turkum nomi
-- olib kelinardi — ekranga beshtasi chiqishini bilib turib.
--
-- YECHIM: TARTIB ALMASHTIRILADI
-- -----------------------------
-- Avval saralanadi va kesiladi (`top`), keyin faqat qolgan qatorlar
-- uchun nom qidiriladi. Saralash uchun kerak boʻlgan hamma narsa
-- (`units`, `buyers`) `agg` da allaqachon bor — nom saralashga
-- taʼsir qilmaydi.
--
-- PANEL FILTRI — MANTIQ OʻZGARMAYDI
-- ---------------------------------
-- Eski taʼrifdagi `join public.zs_panel_product` bitta shartni
-- bildirardi: mahsulotda oxirgi 60 kun ichida oʻlchov boʻlsin.
--
-- `agg` dagi har bir mahsulotda [p_from, p_to] oralinigʻida oʻlchov
-- BOR (aks holda u guruhga tushmasdi). Demak `p_from >= current_date
-- - 60` boʻlsa shart AVTOMATIK bajariladi va uni tekshirish shart
-- emas. Panel oynasi 45 kun (`src/lib/period.ts`, RANK_WINDOW_DAYS),
-- yaʼni amalda doim shu holat.
--
-- Undan eski davr soʻralsa shart `exists` bilan tekshiriladi —
-- yaʼni javob har qanday kiritmada eskisi bilan bir xil qoladi.
--
-- OʻLCHOV (2026-09-02, har biri ikki marta)
--   davr     eski ms        yangi ms
--   1 kun    873–1 009      121–179
--   7 kun    1 936–2 155    552–554
--   45 kun   1 462–2 776    899–950

create or replace function public.zs_product_rank(
  p_from date, p_to date,
  p_basis text default 'units',
  p_limit integer default 5,
  p_offset integer default 0
)
returns table(product_id bigint, title text, shop_id bigint, shop_name text,
              category_id bigint, category_name text, value bigint, units bigint,
              buyers bigint, revenue bigint, price bigint, stock integer)
language sql
stable
security definer
set search_path to 'zumsavdo', 'public'
as $function$
  with agg as (
    select pd.product_id,
           sum(pd.sold_units) filter (where pd.sold_units is not null)::bigint as units,
           max(pd.buyers_per_week)::bigint                                     as buyers,
           sum(pd.sold_units * pd.price) filter (where pd.sold_units is not null)::bigint as revenue,
           (array_agg(pd.price order by pd.date desc))[1]::bigint              as price,
           (array_agg(pd.stock order by pd.date desc))[1]                      as stock
    from zumsavdo.product_day pd
    where pd.date between p_from and p_to
    group by pd.product_id
  ),
  -- Avval kesiladi. `zs_panel_product` bilan qoʻshish oʻrniga
  -- oʻsha koʻrinishning shartining oʻzi yoziladi — natija bir xil,
  -- lekin u endi beshta qatorga qoʻllanadi, ellik mingtasiga emas.
  top as (
    select a.*,
           case p_basis when 'buyers' then a.buyers else a.units end as value
    from agg a
    where p_from >= current_date - 60
       or exists (select 1 from zumsavdo.product_day d
                   where d.product_id = a.product_id
                     and d.date >= current_date - 60)
    order by case p_basis when 'buyers' then a.buyers else a.units end desc nulls last,
             a.product_id
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 500)
  )
  select p.id, p.title, p.shop_id, s.name, p.category_id, c.name,
         t.value, t.units, t.buyers, t.revenue, t.price, t.stock
  from top t
  join zumsavdo.product p     on p.id = t.product_id
  left join zumsavdo.shop s     on s.id = p.shop_id
  left join zumsavdo.category c on c.id = p.category_id
  order by t.value desc nulls last, p.id;
$function$;
