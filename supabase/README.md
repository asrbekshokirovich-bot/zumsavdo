# Ombor migratsiyalari

Bu papkadagi fayllar Supabase loyihasiga qoʻllangan migratsiyalarning nusxasi —
sxema faqat bazada emas, omborda ham versiyalangan boʻlishi uchun.

Tartib bilan qoʻllanadi:

| Fayl | Nima qiladi |
|---|---|
| `20260816102505_zumsavdo_core_schema.sql` | `zumsavdo` sxemasi: lugʻatlar, sweep, xom oʻlchov, kunlik yigʻindi, RLS |
| `20260816102710_zumsavdo_rollup_functions.sql` | xom oʻlchovdan kunlik yigʻindi hisoblash |
| `20260816102855_zumsavdo_public_api.sql` | `public.zs_*` koʻrinishlari va yozish funksiyalari |
| `20260816104821_zumsavdo_expected_sweeps_from_cadence.sql` | kutilayotgan oʻlchov sonini haqiqiy ritmdan olish |
| … | qolgan migratsiyalar — har biri nima qilgani va NEGA qilingani faylning oʻz izohida |
| `20260902130000_zumsavdo_panel_totals_matview.sql` | `zumsavdo.panel_totals` materiallashtirilgan koʻrinishi va `public.zs_refresh_panel_totals()`; `zs_panel_overview` yigʻindini endi hisoblamaydi, oʻqiydi |
| `20260902133000_zumsavdo_panel_product_teskari.sql` | `zs_panel_product` 2 013 213 qatorli `product` boʻylab yurmaydi — `product_day` dan `distinct product_id` (50 038) olib pkey boʻyicha qoʻshiladi |
| `20260902134000_zumsavdo_product_rank_avval_qirq.sql` | `zs_product_rank` avval saralab kesadi, nomni faqat qolgan qatorlarga qidiradi |
| `20260902140000_zumsavdo_panel_vaqt_byudjeti.sql` | sinalgan va ishlamagan yoʻlni yozib qoldiradi: funksiya darajasidagi `statement_timeout` bayonot chegarasini uzaytirmaydi |
| `20260902141000_zumsavdo_panel_product_keshi.sql` | `zumsavdo.panel_product` materiallashtirilgan koʻrinishi; `zs_panel_product` endi shundan oʻqiydi |
| `20260902142000_zumsavdo_first_seen_tashkent_indeks.sql` | `(first_seen_at at time zone 'Asia/Tashkent')::date` ifodasiga indeks — oʻsish grafigi 274 MB seq scan qilmaydi |
| `20260902143000_zumsavdo_market_found_keshi.sql` | `zumsavdo.market_found` — kunlik "birinchi koʻrildi" hisobi keshga oʻtdi; `zs_market_growth` endi sanamaydi, qidiradi |
| `20260902144000_zumsavdo_overview_dokon_reytingi_bir_marta.sql` | `zs_panel_overview` doʻkon reytingini bir marta quradi, turkum yigʻindisini oʻshandan oladi |

Supabase CLI bilan:

```bash
supabase link --project-ref <ref>
supabase db push
```
