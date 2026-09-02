-- `zs_shop_rank` kerak boʻlmagan ikkita skanni ham bajarardi.
--
-- Funksiya uchta CTE quradi: `ord` (buyurtma, `shop_day` dan),
-- `demand` (haftalik xaridor, `product_day` × `product`) va `sold`
-- (sotilgan dona, `product_day` × `product`). Keyin `p_basis` ga
-- qarab ULARDAN BITTASINI tanlaydi.
--
-- Yaʼni "buyurtma" tanlanganda ham `demand` va `sold` toʻliq
-- hisoblanardi va natijasi tashlab yuborilardi. Panelning STANDART
-- asosi esa aynan "buyurtma" (`src/lib/period.ts`), yaʼni bu ish
-- deyarli har soʻrovda bekorga bajarilardi.
--
-- Narxi kichik emas: ikkalasi ham `product_day` ni davr boʻyicha
-- skanlab, 2 218 695 qatorli `product` ga kiradi.
--
-- Oʻlchandi 2026-09-02, 30 kunlik davr, uch martadan:
--   hozirgi (uchala CTE)   403–429 ms
--   faqat kerakligi        127–169 ms
--
-- Tuzatish: har CTE ga oʻz asosining sharti qoʻyiladi. Shart
-- doimiy (`p_basis` — argument), shuning uchun rejalashtiruvchi
-- keraksiz shoxni umuman bajarmaydi.
--
-- MANTIQ OʻZGARMAYDI: tanlash ifodasi allaqachon `p_basis` ga
-- qarab bitta ustunni oladi, qolgan ikkitasi javobga CHIQMAYDI.
-- Boʻsh CTE `left join` orqali NULL beradi va u ifodada
-- oʻqilmaydi.
--
-- ESLATMA: `orders` va `revenue` ustunlari ASOSDAN QATʼI NAZAR
-- qaytariladi (ular javobning oʻz maydonlari), shuning uchun `ord`
-- shartsiz qoladi.

create or replace function public.zs_shop_rank(
  p_from date, p_to date,
  p_basis text default 'orders',
  p_limit integer default 5
)
returns table(shop_id bigint, shop_name text, category_id bigint, category_name text,
              official boolean, value bigint, orders bigint, revenue bigint)
language sql
stable
security definer
set search_path to 'zumsavdo', 'public'
as $function$
  with base as (
    select s.id, s.name, s.category_id, s.official
    from public.zs_panel_shop s
  ),
  -- Shartsiz: `orders` va `revenue` javobning doimiy maydonlari.
  ord as (
    select sd.shop_id,
           sum(sd.orders) filter (where sd.orders is not null)::bigint as orders,
           sum(sd.orders * sd.avg_price) filter (where sd.orders is not null)::bigint as revenue
    from zumsavdo.shop_day sd
    where sd.date between p_from and p_to
    group by sd.shop_id
  ),
  demand as (
    select p.shop_id,
           sum(pd.buyers_per_week)::bigint as buyers
    from zumsavdo.product_day pd
    join zumsavdo.product p on p.id = pd.product_id
    where p_basis = 'buyers'
      and pd.date = (select max(date) from zumsavdo.product_day
                      where date between p_from and p_to)
    group by p.shop_id
  ),
  sold as (
    select p.shop_id, sum(pd.sold_units)::bigint as units
    from zumsavdo.product_day pd
    join zumsavdo.product p on p.id = pd.product_id
    where p_basis = 'units'
      and pd.date between p_from and p_to and pd.sold_units is not null
    group by p.shop_id
  )
  select b.id, b.name, b.category_id, c.name, b.official,
         case p_basis when 'buyers' then d.buyers
                      when 'units'  then sl.units
                      else o.orders end,
         o.orders, o.revenue
  from base b
  left join ord    o  on o.shop_id  = b.id
  left join demand d  on d.shop_id  = b.id
  left join sold   sl on sl.shop_id = b.id
  left join zumsavdo.category c on c.id = b.category_id
  order by case p_basis when 'buyers' then d.buyers
                        when 'units'  then sl.units
                        else o.orders end desc nulls last
  limit p_limit;
$function$;
