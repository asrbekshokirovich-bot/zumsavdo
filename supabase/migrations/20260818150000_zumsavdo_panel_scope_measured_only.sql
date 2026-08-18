-- Panel qamrovi: OʻLCHANGAN obyektlar, kuzatuvga olinganlar emas.
--
-- Ilgari `zs_panel_product` ga `tracked_product` ham kirardi. Kuzatuv
-- roʻyxati perepisdan 50 075 ga toʻlgach panel qamrovi ham 50 076 ga
-- chiqdi — holbuki oʻlchov atigi 162 qator edi. Natijada `zs_shop_rank`
-- 50 ming mahsulot va ularning doʻkonlari boʻylab yurib, statement
-- timeout ga tushdi va panel butunlay boʻshab qoldi.
--
-- Toʻgʻri chegara: kunlik yigʻindisi bor obyektlar. Kuzatuvga olingan
-- mahsulot birinchi sweepdan keyin oʻzi qoʻshiladi.
create or replace view public.zs_panel_product as
  select p.id, p.title, p.shop_id, p.category_id
  from zumsavdo.product p
  where exists (
    select 1 from zumsavdo.product_day d
    where d.product_id = p.id and d.date >= current_date - 60
  );

-- Reyting soʻrovlari shu ustunlar boʻyicha yuradi.
create index if not exists product_shop_idx      on zumsavdo.product (shop_id);
create index if not exists product_category_idx  on zumsavdo.product (category_id);
create index if not exists product_day_date_idx  on zumsavdo.product_day (date);
create index if not exists shop_day_date_idx     on zumsavdo.shop_day (date);
create index if not exists tracked_product_idx   on zumsavdo.tracked_product (product_id) where active;
