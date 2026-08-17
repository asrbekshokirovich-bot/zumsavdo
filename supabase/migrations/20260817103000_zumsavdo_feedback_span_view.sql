-- Har mahsulot uchun sharh tarixi qaysi sanadan boshlanadi.
--
-- Kerak, chunki "sharh boʻlmagan kun" ikki xil boʻladi:
--   - tarix ichida  → shu kuni sharh yozilmagan, javob NOL;
--   - tarixdan oldin → biz u qadar orqaga olmaganmiz, javob NOMAʻLUM.
-- Bu ikkisini farqlamasak, grafik "sharh boʻlmagan" deb yolgʻon aytadi.
create or replace view public.zs_feedback_span as
  select product_id,
         min(created_at at time zone 'Asia/Tashkent')::date as first_date,
         max(created_at at time zone 'Asia/Tashkent')::date as last_date,
         count(*)::integer                                   as total
  from zumsavdo.feedback
  group by product_id;

grant select on public.zs_feedback_span to anon, authenticated;
