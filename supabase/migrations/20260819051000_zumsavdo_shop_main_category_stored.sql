-- Do'konning turkumi endi saqlanadi, har so'rovda hisoblanmaydi.
--
-- Uzum do'kon uchun turkum bermaydi, shuning uchun u do'konning mahsulotlari
-- bo'yicha aniqlanardi — LATERAL bilan, har so'rovda, har do'kon uchun.
-- 55 266 do'konning HAMMASIDA `category_id` bo'sh bo'lgani uchun bu hisob
-- hech qachon tashlanmasdi: bitta reyting so'rovining 21 564 sahifasi
-- (jami 31 238 dan) aynan shu joyga ketardi.
--
-- Bu ma'lumot deyarli o'zgarmaydi: do'konning asosiy turkumi mahsulot
-- qo'shilgandagina siljiydi. Uni o'lchov bilan birga yangilash to'g'ri.
alter table zumsavdo.shop add column if not exists main_category_id bigint;
create index if not exists shop_main_category_idx on zumsavdo.shop (main_category_id);

create or replace function zumsavdo.refresh_shop_categories(p_only_measured boolean default true)
returns integer
language plpgsql security definer
set search_path to 'zumsavdo', 'public'
as $$
declare n integer;
begin
  with target as (
    select s.id from zumsavdo.shop s
    where not p_only_measured
       or exists (select 1 from zumsavdo.product p
                   join zumsavdo.product_day d on d.product_id = p.id
                  where p.shop_id = s.id)
  ),
  best as (
    select t.id as shop_id,
           (select p.category_id from zumsavdo.product p
             where p.shop_id = t.id and p.category_id is not null
             group by p.category_id order by count(*) desc, p.category_id limit 1) as category_id
    from target t
  )
  update zumsavdo.shop s set main_category_id = b.category_id
    from best b where s.id = b.shop_id and s.main_category_id is distinct from b.category_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.zs_refresh_shop_categories(p_only_measured boolean default true)
returns integer language sql security definer
set search_path to 'zumsavdo', 'public'
as $$ select zumsavdo.refresh_shop_categories(p_only_measured); $$;

revoke execute on function public.zs_refresh_shop_categories(boolean) from anon, authenticated;
grant execute on function public.zs_refresh_shop_categories(boolean) to service_role;

-- Endi LATERAL yo'q: saqlangan qiymat o'qiladi.
create or replace view public.zs_panel_shop as
with ids as (
  select distinct sd.shop_id as id from zumsavdo.shop_day sd where sd.date >= current_date - 60
  union
  select distinct p.shop_id from public.zs_panel_product p where p.shop_id is not null
)
select s.id, s.name, coalesce(s.category_id, s.main_category_id) as category_id, s.official
from ids join zumsavdo.shop s on s.id = ids.id;

-- Reyting so'rovlari `product_day` dan `product` ga faqat `shop_id` va
-- `category_id` uchun boradi. Birlamchi kalit bu ustunlarni saqlamaydi,
-- shuning uchun har qator uchun jadvalning o'zi ham o'qilardi.
create index if not exists product_id_shop_category_idx
  on zumsavdo.product (id) include (shop_id, category_id);
create index if not exists product_day_date_product_idx
  on zumsavdo.product_day (date) include (product_id, sold_units, buyers_per_week, price);

analyze zumsavdo.product;
analyze zumsavdo.product_day;
analyze zumsavdo.shop;

notify pgrst, 'reload schema';
