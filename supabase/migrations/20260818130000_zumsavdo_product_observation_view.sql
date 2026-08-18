-- Xom oʻlchovlar jurnali — har bir oʻlchov alohida qator.
--
-- Kunlik jadval kunni yigʻadi: 17-avgustda uchta oʻlchov boʻlgan (15:09,
-- 16:16, 16:44), lekin kunlik qatorda faqat bittasi — kun yakuni — koʻrinadi.
-- "Qaysi maʻlumot qachon olingan boʻlsa oʻshani koʻrsat" degan talabga
-- aynan shu koʻrinish javob beradi.
--
-- Diqqat: oʻlchov faqat OʻZGARGANDA yoziladi (06.5). Demak jurnaldagi ikki
-- qator orasida narx va qoldiq oʻzgarmagan — bu boʻshliq emas, javob.
create or replace view public.zs_product_observation as
  select o.product_id,
         o.observed_at,
         o.price,
         o.full_price,
         o.discount_percent,
         o.stock,
         o.reviews,
         o.buyers_per_week,
         o.available
  from zumsavdo.product_observation o
  where exists (select 1 from public.zs_panel_product p where p.id = o.product_id);

grant select on public.zs_product_observation to anon, authenticated;
