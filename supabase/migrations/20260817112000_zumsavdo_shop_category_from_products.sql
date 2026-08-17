-- Doʻkonning turkumi mahsulotlaridan chiqariladi.
--
-- Uzum doʻkon uchun turkum bermaydi — u faqat mahsulotda bor. Shu sababli
-- `shop.category_id` doim boʻsh qolardi va panelda "Top turkumlar" butunlay
-- boʻsh chiqardi: bironta doʻkon hech qaysi turkumga tegishli emas edi.
--
-- Bu toʻqima emas, hosila: doʻkonning eng koʻp mahsuloti qaysi turkumda
-- boʻlsa, oʻsha turkum olinadi. Teng boʻlsa kichik id — natija barqaror
-- boʻlishi uchun. Saqlanmaydi ham: koʻrinishda hisoblanadi, ya'ni yangi
-- mahsulot qoʻshilishi bilan oʻzi yangilanadi.
create or replace view public.zs_shop as
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
  ) d on true;

grant select on public.zs_shop to anon, authenticated;
