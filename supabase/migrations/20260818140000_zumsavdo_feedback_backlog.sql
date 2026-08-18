-- Sharhi hali yigʻilmagan kuzatuv mahsulotlari.
--
-- Nega kerak: kuzatuv roʻyxati 50 000 ga chiqdi. Har sweepda hammasidan
-- 3 sahifa sharh soʻrash — 150 000 soʻrov, yaʻni soatlar, va har safar
-- takrorlanadi. Holbuki sharh oʻzgarmaydi: bir marta yigʻilsa yetarli.
--
-- Shuning uchun sweep har safar faqat HALI YIGʻILMAGANLARIDAN bir boʻlagini
-- oladi. Roʻyxat asta toʻladi va toʻlgach qayta soʻralmaydi.
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
  order by t.product_id
  limit p_limit;
$$;

revoke all on function public.zs_feedback_backlog(integer) from public, anon, authenticated;
grant execute on function public.zs_feedback_backlog(integer) to service_role;
