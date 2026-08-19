-- Panel butun bazani yuklashdan to'xtaydi.
--
-- Ochilishda barcha lug'at va barcha kunlik qatorlar tortilardi. 81
-- mahsulotda sezilmasdi; sweep 1 000 dan o'tib 50 000 ga qarab ketgach
-- o'n minglab qator degani bo'ldi. Ular 1000 tadan sahifalanib o'nlab
-- so'rovga bo'linadi va brauzer bir qismini yuborishdan bosh tortadi —
-- ekranda bu "TypeError: Failed to fetch" va butunlay bo'sh panel.
--
-- Ochilish uchun aslida faqat shu kerak.
create or replace function public.zs_panel_bounds()
returns jsonb
language sql stable security definer
set search_path to 'zumsavdo', 'public'
as $$
  with last_sweep as (
    select source, started_at, finished_at, errors
    from zumsavdo.sweep order by started_at desc limit 1
  ),
  span as (select min(date) as first_day, max(date) as last_day from zumsavdo.shop_day),
  fb   as (select min(date) as first_day from public.zs_feedback_day),
  cover as (
    select count(*) filter (where sweeps > 0)::numeric as covered, count(*)::numeric as total
    from zumsavdo.shop_day where date = (select last_day from span)
  )
  select jsonb_build_object(
    'source',          (select source from last_sweep),
    'last_sweep_at',   (select coalesce(finished_at, started_at) from last_sweep),
    'errors',          (select coalesce(errors, 0) from last_sweep),
    'coverage_percent',(select case when total > 0 then round(covered / total * 100, 1) else 0 end from cover),
    -- Sharh tarixi o'lchovdan ancha orqaga boradi: davr tanlagich chegarasi
    -- shundan boshlanishi kerak, aks holda mavjud tarix ko'rinmay qoladi.
    'first_day',       (select least((select first_day from span), (select first_day from fb))),
    'last_day',        (select last_day from span),
    'sweeps_per_day',  (select max(sweeps_expected) from zumsavdo.shop_day
                         where date = (select last_day from span)),
    'measured', jsonb_build_object(
      'shops',    (select count(*) from public.zs_panel_shop),
      'products', (select count(*) from public.zs_panel_product))
  );
$$;

grant execute on function public.zs_panel_bounds() to anon, authenticated;

-- Qidiruv bazaga ko'chiriladi. Ilgari panel butun lug'atni brauzerga
-- yuklab olib o'sha yerda qidirardi.
--
-- Normalizatsiya brauzerdagi `normalize()` ning aynan o'zi: kirill lotinga,
-- apostrofning to'rt ko'rinishi olib tashlanadi. Ikki joyda ikki xil bo'lsa
-- "O'zbekiston" bir yerda topilib, boshqasida topilmasdi.
create or replace function zumsavdo.norm(t text)
returns text language sql immutable parallel safe as $$
  select regexp_replace(
    translate(
      replace(replace(replace(replace(replace(replace(replace(replace(
      replace(replace(replace(replace(replace(replace(
        lower(coalesce(t, '')),
        'ё', 'yo'), 'ж', 'j'), 'ц', 'ts'), 'ч', 'ch'), 'ш', 'sh'), 'щ', 'sh'),
        'ю', 'yu'), 'я', 'ya'), 'ъ', ''), 'ь', ''),
        'ʻ', ''), 'ʼ', ''), '‘', ''), '’', ''),
      'абвгдезийклмнопрстуфхыэўғқҳ`´''',
      'abvgdezijklmnoprstufxie' || 'ogqh'),
    '\s+', ' ', 'g');
$$;

create or replace function zumsavdo.match_score(haystack text, needle text)
returns integer language sql immutable parallel safe as $$
  select case
    when position(zumsavdo.norm(needle) in zumsavdo.norm(haystack)) = 0 then -1
    when position(zumsavdo.norm(needle) in zumsavdo.norm(haystack)) = 1 then 100
    when substr(zumsavdo.norm(haystack),
                position(zumsavdo.norm(needle) in zumsavdo.norm(haystack)) - 1, 1) = ' ' then 60
    else 20
  end;
$$;

create index if not exists shop_norm_idx     on zumsavdo.shop     (zumsavdo.norm(name)  text_pattern_ops);
create index if not exists product_norm_idx  on zumsavdo.product  (zumsavdo.norm(title) text_pattern_ops);
create index if not exists category_norm_idx on zumsavdo.category (zumsavdo.norm(name)  text_pattern_ops);

-- Qidiruv faqat o'lchangan obyektlar bo'yicha: kuzatuvga olingan, lekin
-- hali o'lchanmagan mahsulotni chiqarsak, bosilganda bo'sh sahifa ochiladi.
create or replace function public.zs_search(
  p_kind text, p_query text, p_from date, p_to date, p_limit integer default 8
) returns jsonb
language sql stable security definer
set search_path to 'zumsavdo', 'public'
as $$
  with hits as (
    select jsonb_build_object('kind','shop','id',r.shop_id,'name',r.shop_name,
             'context',coalesce(r.category_name,''),
             'orders',coalesce(r.orders,0),'revenue',coalesce(r.revenue,0)) as j,
           zumsavdo.match_score(r.shop_name, p_query) as score, coalesce(r.value,0) as val
    from public.zs_shop_rank(p_from, p_to, 'orders', 1000000) r
    where p_kind = 'shop' and zumsavdo.match_score(r.shop_name, p_query) >= 0
    union all
    select jsonb_build_object('kind','product','id',r.product_id,'name',r.title,
             'context',coalesce(r.shop_name,''),
             'orders',coalesce(r.units,0),'revenue',coalesce(r.revenue,0)),
           zumsavdo.match_score(r.title, p_query), coalesce(r.units,0)
    from public.zs_product_rank(p_from, p_to, 'units', 500, 0) r
    where p_kind = 'product' and zumsavdo.match_score(r.title, p_query) >= 0
    union all
    select jsonb_build_object('kind','category','id',r.category_id,'name',r.category_name,
             'context',r.shop_count || ' sotuvchi',
             'orders',coalesce(r.orders,0),'revenue',coalesce(r.revenue,0)),
           zumsavdo.match_score(r.category_name, p_query), coalesce(r.value,0)
    from public.zs_category_rank(p_from, p_to, 'orders', 1000000) r
    where p_kind = 'category' and zumsavdo.match_score(r.category_name, p_query) >= 0
  )
  select coalesce((select jsonb_agg(j order by score desc, val desc)
    from (select * from hits order by score desc, val desc
          limit least(greatest(p_limit,1), 50)) x), '[]'::jsonb);
$$;

grant execute on function public.zs_search(text, text, date, date, integer) to anon, authenticated;

notify pgrst, 'reload schema';
