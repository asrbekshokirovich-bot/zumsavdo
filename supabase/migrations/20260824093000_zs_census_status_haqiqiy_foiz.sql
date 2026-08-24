-- Perepis holatiga HAQIQIY bajarilish foizi.
--
-- `foiz` `next_id / max_id` dan hisoblanadi, `next_id` esa boʻlak
-- BAND QILINGANDA siljiydi (`zs_census_claim` ichida
-- `set next_id = to_id + 1`), bajarilganda emas. Yaʼni u ishlab
-- boʻlingan ishni emas, OLINGAN ishni oʻlchaydi.
--
-- 2026-08-24 da farq oʻlchandi: `foiz` 90,91% koʻrsatgan payt
-- haqiqatan tekshirilgani 70,28% edi — 20 punkt farq. Bitta boʻlak
-- 200 000 id va u band qilingan zahoti foiz 6 punktga sakraydi.
--
-- Ikkalasi ham qoladi va nomlari maʼnosiga mos:
--   foiz           — qayerdan davom etadi
--   olchangan_foiz — qancha ish bajarilgan

drop view if exists public.zs_census_status;

create view public.zs_census_status as
select
  c.name,
  c.pass,
  c.next_id,
  c.max_id,
  c.seen,
  c.live,
  round(100.0 * (c.next_id - 1) / nullif(c.max_id, 0), 2) as foiz,
  round(100.0 * c.seen / nullif(c.max_id, 0), 2) as olchangan_foiz,
  c.started_at,
  c.updated_at
from zumsavdo.crawl_cursor c;

comment on view public.zs_census_status is
  '`foiz` — qayerdan davom etadi (boʻlak BAND QILINGANDA siljiydi). '
  '`olchangan_foiz` — qancha id haqiqatan tekshirilgan.';

revoke all on public.zs_census_status from anon, authenticated;
grant select on public.zs_census_status to service_role;
