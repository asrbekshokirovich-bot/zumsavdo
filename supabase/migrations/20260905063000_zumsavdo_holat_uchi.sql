-- `zs_holat()` — yigʻuvchining bir qarashdagi holati.
--
-- NEGA KERAK. Bu loyihada bir xil nosozlik uch marta takrorlandi va
-- har safar UZOQ sezilmadi:
--
--   2026-08-20  doʻkon turkumi timeout — 3 kun
--   2026-08-24  perepis darvozasi yopiq — 9 kun
--   2026-09-03  perepis darvozasi yopiq — 54 soat
--
-- Uchalasida ham yugurishlar YASHIL edi. Nosozlikni koʻrsatadigan
-- yagona narsa bazadagi sana edi, lekin unga hech kim qaramasdi.
--
-- Bu uch shuni bitta chaqiruvga yigʻadi va supurish har yurishida
-- (kuniga uch marta) chop etadi. Eskirgan qism ogohlantirish beradi.
-- Yaʼni "yashil, lekin jim" holati endi yashil boʻlmaydi.
--
-- Nimalar qaraladi:
--   perepis        — qaysi oʻtish, foiz, oxirgi qimirlagani
--   kuzatuv        — nechta tovar faol (sweep shuni oʻlchaydi)
--   olchov         — `product_day` da oxirgi kun
--   supurish       — oxirgi sweep qachon
--   sharh          — nechta sharh, oxirgi qachon olingan
--   panel_yigindi  — panel keshi qachon yangilangan
--   katalog        — `product` va `shop` hajmi
--
-- `yosh_soat` maydonlari ataylab hisoblab beriladi: qobiqda sana
-- ayirish qiyin va xatoga moyil.
--
-- 60 soniyalik byudjet: ichida bir nechta `count(*)` bor, eng ogʻiri
-- `product` (2,78 mln). Oʻlchandi — 1,5 soniya.

create or replace function public.zs_holat()
returns jsonb
language sql
stable
security definer
set search_path to 'zumsavdo', 'public'
set statement_timeout to '60s'
as $function$
  select jsonb_build_object(
    'hozir', now(),
    'perepis', (
      select jsonb_build_object(
        'pass', c.pass,
        'next_id', c.next_id,
        'max_id', c.max_id,
        'foiz', round(100.0 * least(c.next_id - 1, c.max_id) / nullif(c.max_id, 0), 2),
        'seen', c.seen,
        'live', c.live,
        'updated_at', c.updated_at,
        'yosh_soat', round(extract(epoch from now() - c.updated_at) / 3600.0, 1),
        'otish_tugagan', c.next_id > c.max_id
      ) from zumsavdo.crawl_cursor c where c.name = 'census'
    ),
    'kuzatuv', (
      select jsonb_build_object(
        'faol', count(*) filter (where active),
        'faol_emas', count(*) filter (where not active)
      ) from zumsavdo.tracked_product
    ),
    'olchov', (
      select jsonb_build_object(
        'oxirgi_kun', max(date),
        'oxirgi_kun_qatorlar', count(*) filter (where date = (select max(date) from zumsavdo.product_day))
      ) from zumsavdo.product_day
    ),
    'supurish', (
      select jsonb_build_object(
        'oxirgi', max(started_at),
        'yosh_soat', round(extract(epoch from now() - max(started_at)) / 3600.0, 1)
      ) from zumsavdo.sweep
    ),
    'sharh', (
      select jsonb_build_object(
        'jami', count(*),
        'mahsulot', count(distinct product_id),
        'oxirgi_korilgan', max(seen_at)
      ) from zumsavdo.feedback
    ),
    'panel_yigindi', (
      select jsonb_build_object(
        'shops', t.shops, 'categories', t.categories, 'products', t.products,
        'measured_at', t.measured_at,
        'yosh_soat', round(extract(epoch from now() - t.measured_at) / 3600.0, 1)
      ) from zumsavdo.panel_totals t
    ),
    'katalog', (
      select jsonb_build_object(
        'mahsulot', (select count(*) from zumsavdo.product),
        'dokon', (select count(*) from zumsavdo.shop)
      )
    )
  );
$function$;

comment on function public.zs_holat() is
  'Yigʻuvchining bir qarashdagi holati. Supurish har yurishida chop etadi va eskirganini ogohlantiradi.';

-- Ommaviy emas: ichida kuzatuv roʻyxati hajmi va katalog raqamlari bor.
revoke all on function public.zs_holat() from public;
grant execute on function public.zs_holat() to service_role;
