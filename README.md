# ZumSavdo

Uzum Market boʻyicha kunlik oʻlchovlarga asoslangan analitika paneli.
`design/wireframe.html` dagi wireframe asosida qurilgan.

## Ishga tushirish

```bash
npm install
npm run dev      # http://localhost:5180
```

Panel omborga ulanishi uchun `.env.local` yarating (`.env.example` dan nusxa
oling). Ulanmasa ham ochiladi — namuna maʻlumot bilan va yuqorida
ogohlantirish bilan.

Boshqa buyruqlar:

```bash
npm run build      # ishlab chiqarish uchun yigʻish (dist/)
npm run preview    # yigʻilgan versiyani koʻrish
npm run typecheck  # TypeScript tekshiruvi
```

### Qaysi buyruq qaysi papkada

Omborda ikkita `package.json` bor: ildizda — panel, `ingest/` da — yigʻuvchi.
Notoʻgʻri papkada `npm run build` yozilsa `Missing script: "build"` chiqadi va
bu xato buyruqni emas, papkani koʻrsatadi.

Shuning uchun **ikkala papkada ham hammasi ishlaydi** — har biri
ikkinchisiga yoʻnaltiradi:

| Buyruq | Asl joyi | Boshqa papkadan ham |
|---|---|---|
| `npm run build`, `npm run dev` | ildiz | `ingest/` dan |
| `npm run sweep`, `npm run census`, `npm run probe` | `ingest/` | ildizdan |

Bayroqlar ham oʻtadi: ildizdan `npm run census -- --minutes 60` yozsangiz,
u `ingest/` ichida oʻsha bayroq bilan ishga tushadi va `ingest/.env` oʻqiladi.

## Internetga chiqarish (GitHub Pages)

Panel `main` ga har surilganda avtomatik yigʻiladi va joylanadi.
Manzil: `https://<foydalanuvchi>.github.io/zumsavdo/`

Sozlash **talab qilinmaydi**: ombor manzili `.env.production` da, omborning
oʻzida turadi. Pages sozlamasini ham workflow oʻzi yoqadi
(`enablement: true`).

Kalitni omborni oʻzgartirmasdan almashtirish yoki boshqa bazaga ulash
kerak boʻlsa, Actions secrets qoʻyish mumkin — ular ustun turadi:

**Settings → Secrets and variables → Actions → New repository secret**

```
VITE_SUPABASE_URL       = https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY  = <publishable key>
```

Yigʻishdan keyin natija tekshiriladi: yigʻilgan JS ichida ombor manzili
boʻlmasa joylash **toʻxtatiladi**. Kalit borligini tekshirish yetarli
emas edi — u qoʻyilgan boʻlsa ham yigʻishga tushmay qolishi mumkin.

### Nega anon kalitni ochiq qoʻyish mumkin

U brauzerga baribir tushadi va yashirib boʻlmaydi. Xavfsizlik kalitda
emas, **huquqlarda**: baza shunday yopilganki, bu kalit bilan faqat
panelga kerakli yigʻindilarni oʻqish mumkin.

Tekshirilgan holat:

| | anon kalit bilan |
|---|---|
| `zumsavdo` xom jadvallari (perepis, kuzatuv roʻyxati, xom oʻlchov) | yopiq |
| Yozadigan funksiyalar (`zs_ingest_batch`, `zs_record_frontier`, …) | yopiq |
| Panel koʻrinishlari va yigʻindi funksiyalari | oʻqish uchun ochiq |

Yigʻuvchi `service_role` kaliti bilan ishlaydi va u **hech qachon**
brauzerga yoki GitHubga tushmaydi — faqat `ingest/.env` da.

Yangi **funksiya** qoʻshilganda u oʻzi ochilib qolmaydi: `public`
sxemasida funksiyalar uchun standart huquq olib tashlangan, har biriga
ataylab `grant` kerak. Unutilsa panel darhol ishlamay qoladi va bu
koʻrinadi — teskarisi esa koʻrinmasdi.

> **2026-08-23 da tuzatilgan kamchilik.** Yuqoridagi gap **jadval va
> koʻrinishlarga taalluqli emas edi**, lekin bu yerda shunday yozilgan
> edi. Supabase zavod sozlamasida `public` sxemasida `postgres` yaratgan
> har bir jadval/koʻrinishga `anon` uchun `SELECT` emas, **`ALL`** beradi.
> Shu sababli toʻqqizta panel koʻrinishiga anon kaliti bilan yozish ham
> mumkin edi; beshtasi avtomatik yangilanuvchi, yaʼni perepis maʼlumotini
> oʻchirish mumkin edi. Sxema devori (`zumsavdo` ga USAGE yoʻq) bunga
> toʻsqinlik qilmagan, chunki koʻrinishlar `security_invoker` siz va
> egasi `postgres`.
>
> Yozish huquqi olib tashlandi, oʻqish qoldi; standart huquqning oʻzi ham
> `SELECT` ga toraytirildi
> (`supabase/migrations/20260823090000_zumsavdo_anon_faqat_oqiydi.sql`).
> Xulosa: bu jadval ilgari oʻlchov bilan emas, ishonch bilan
> toʻldirilgan ekan. Endi uni buyruq oʻlchaydi:
>
> ```
> cd ingest && npm run xavfsizlik
> ```
>
> Anon kaliti bilan haqiqiy HTTP soʻrov yuboradi: oʻqilishi kerak
> boʻlgani oʻqiladimi, yozilmasligi kerak boʻlgani 401 qaytaradimi.
> Panelga tegadigan har bir oʻzgarishdan keyin shuni ishlating.

## Vercel'ga joylash

Vercel panelida: **Add New → Project** → shu omborni tanlang. Sozlamalarni
Vercel oʻzi aniqlaydi (Vite → `npm run build` → `dist`), Root Directory
oʻzgartirilmaydi — ilova omborning ildizida turadi.

Environment Variables (Production va Preview uchun ham):

```
VITE_SUPABASE_URL       = https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY  = <publishable-key>
```

Faqat shu ikkitasi. Service role kaliti bu yerga **hech qachon** qo'yilmaydi —
u brauzerga tushib, omborga yozish huquqini ochib yuboradi.

`vercel.json` dagi rewrite qoidasi shart: `/sotuvchi/9103` kabi manzil to'g'ridan
ochilganda statik hosting uni fayl deb izlab 404 qaytaradi.

## Manzillar

Har bir sahifa **id** boʻyicha ochiladi — nomga bogʻlanmaydi, chunki Uzumda nom
istalgan kuni oʻzgarishi mumkin, id esa yoʻq.

| Manzil | Sahifa |
|---|---|
| `/` | Bosh sahifa — butun bozor |
| `/sotuvchi/9127` | Sotuvchi |
| `/mahsulot/560816` | Mahsulot |
| `/turkum/1021` | Turkum |

Tanlangan davr URL da saqlanadi (`?davr=30d`, `?davr=custom&dan=…&gacha=…`),
shuning uchun sahifalar orasida oʻtganda u yoʻqolmaydi.

## Asosiy qoida — aniq va taxminiy

Panel hech qachon hisoblab chiqarilgan raqamni oʻlchangan raqam kabi
koʻrsatmaydi. Har bir raqam yonida belgisi bor:

| Raqam | Toifa | Manba |
|---|---|---|
| Buyurtmalar | **aniq** | `Shop.ordersQuantity` hisoblagichining farqi |
| Xaridorlar / hafta | **aniq** | `MotivationAction.text` — "Bu haftada N kishi sotib oldi" |
| Oʻrin | **aniq** | kuzatilayotgan obyektlar orasidagi saralash |
| Aylanma | taxminiy | dona × narx |
| Sotuv (dona) | taxminiy | qoldiq kamayishidan |
| Raqobat | taxminiy | buyurtma ÷ kuzatilayotgan mahsulot soni |

Taxminiy raqam oldiga `~` qoʻyiladi.

Boshqa qatʻiy qoidalar:

- **Maʻlumot 28.07.2026 dan boshlanadi.** Undan oldingi sanalar tanlanmaydi —
  aks holda "nol buyurtma" degan yolgʻon javob chiqadi.
- **"Bugun" toʻliq kun emas.** Nechta sweep tushgani yozib qoʻyiladi (masalan
  `7/12 oʻlchov tushgan`), aks holda tushmagan yarim kun pasayish deb oʻqiladi.
- **Oʻrin uch narsasiz koʻrsatilmaydi:** nima boʻyicha, kimlar orasida, qaysi
  davrda. Oʻsish/tushish strelkasi yoʻq — taqqoslash uchun ikkinchi oʻlchov
  yigʻilmagan.
- **Xaridorlar / hafta doim 7 kunlik.** Davr tugmasi buni oʻzgartirmaydi,
  chunki manba shunday.
- **"Nima oʻzgardi" sabab daʻvo qilmaydi.** Faqat bir vaqtda nima boʻlgani
  yoziladi; bogʻliqligini sotuvchining oʻzi baholaydi.
- **Kam sotuvchi kuzatilgan turkumda xulosa chiqarilmaydi** — top-5 ulushi
  100% ga yaqin chiqib, "kirish qiyin" degan notoʻgʻri javob beradi.
- **Qidiruv normalizatsiya bilan.** Lotin va kirill, apostrofning toʻrt xil
  koʻrinishi (`ʻ ʼ ' ` `) solishtirishdan oldin bitta shaklga keltiriladi.

## Tuzilma

```
src/
  data/
    types.ts      maʻlumot modeli — Metric aniq/taxminiy toifani tashiydi
    dataset.ts    namuna toʻplami (seed boʻyicha barqaror) + hodisa aniqlash
    api.ts        soʻrov qatlami — sahifalar faqat shuni biladi
  lib/
    dates.ts      sanalar, DATA_START
    period.ts     davr mantiqi, oʻrin oynasi
    usePeriod.ts  davrni URL da saqlash
    normalize.ts  lotin/kirill + apostrof normalizatsiyasi
    format.ts     raqam va pul formatlari
  components/
    Chart.tsx     chiziqli grafik: krossxair, tooltip, soya, jadval koʻrinishi
    ...
  pages/          Home, Shop, Product, Category, NotFound
```

## Maʻlumot oqimi

```
manba  →  xom oʻlchov  →  kunlik yigʻindi  →  panel
          (observation)   (bazada, SQL)      (faqat oʻqiydi)
```

Kunlik raqam **hech qachon** manbadan toʻgʻridan-toʻgʻri olinmaydi. Uzum
buyurtmani kümülativ hisoblagich sifatida beradi (`Shop.ordersQuantity`), kunlik
son esa ikki oʻlchov farqi. Farq bazada hisoblanadi — bitta joyda, bitta
qoida bilan.

Shu ajratishning natijasi: kun chegarasidagi oʻlchov tushmagan boʻlsa,
buyurtma `null` boʻlib qoladi va panel uni yigʻindiga qoʻshmaydi hamda nechta
kun tushib qolganini yozadi. Bunday kunga nol yozish "sotuv boʻlmagan" degan
yolgʻon javob beradi.

Sotuv (dona) esa qoldiqning **ketma-ket oʻlchovlar orasidagi pasayishlari**
yigʻindisi. Kun ichida bir necha marta oʻlchash shuning uchun muhim: kunlik
yagona farq olinsa, oraliqda keltirilgan tovar sotuvni butunlay yashiradi.

## Ombor (Supabase)

Jadvallar `zumsavdo` sxemasida; panel ularni `public.zs_*` koʻrinishlari orqali
oʻqiydi, yozuvchi esa `public.zs_ingest_batch` funksiyasi orqali yozadi.

| Jadval | Nima |
|---|---|
| `category`, `shop`, `product` | lugʻatlar |
| `sweep` | bitta yigʻish sessiyasi: qamrov, xato soni |
| `shop_observation` | kümülativ hisoblagichning bir ondagi holati |
| `product_observation` | narx, qoldiq, sharh, haftalik xaridor |
| `shop_day`, `product_day` | kunlik yigʻindi (`rollup_days` hisoblaydi) |

Panelga faqat oʻqish kaliti beriladi (`VITE_SUPABASE_ANON_KEY`) — yozish huquqi
yoʻq. Service role kaliti faqat `ingest/.env` da qoladi va brauzerga tushmaydi.

Ombor sozlanmagan boʻlsa panel namuna toʻplami bilan ochiladi va yuqorida
**"Bu namuna maʻlumot"** ogohlantirishi turadi — namuna raqami hech qachon
haqiqiy oʻlchov kabi koʻrinmasligi kerak.

## Yigʻuvchi (`ingest/`)

```bash
cd ingest
npm install
cp .env.example .env      # toʻldiring
npm run sweep             # oʻlchov oling va kunlik yigʻindini yangilang
npm run sweep -- --probe  # manba javobini oʻzgartirmasdan bosib chiqaradi
npm run rollup            # faqat qayta hisoblash
npm run census            # katalogni id boʻyicha aylanib chiqish
npm run census -- --status  # perepis qayerga yetgani
```

`sweep`, `census` va `probe` ni ildizdan ham chaqirsa boʻladi — ular oʻzi
`ingest/` ga oʻtadi.

### Sweep jadval boʻyicha ishlaydi

`.github/workflows/sweep.yml` — Toshkent vaqti bilan **07:00, 15:00,
23:00**. Qoʻlda ham ishga tushirsa boʻladi: Actions → Sweep (2-qatlam)
→ Run workflow.

Nega odamga tashlab qoʻyilmaydi. `sellersStableDays` 60 kunlik uzluksiz
tarix talab qiladi, sotuv esa `prev_stock − stock` farqidan chiqadi —
ikkalasi ham faqat real vaqtda toʻplanadi. 16–20 avgustda oʻlchov qoʻlda
qilingan va 20-avgustda jimgina toʻxtagan; uch kun qaytmasdan yoʻqolgan.

Ikkita sir kerak (`Settings → Secrets and variables → Actions`):
`ZUMSAVDO_SUPABASE_URL` va `ZUMSAVDO_SUPABASE_SERVICE_ROLE_KEY`.
Yoʻq boʻlsa ish birinchi qadamda balandan yiqiladi, jimgina oʻtib
ketmaydi. Oxirgi qadam esa "bugun bitta ham oʻlchov yozildimi" deb
soʻraydi: sweep xatosiz tugab nol qator yozsa, ish qizil boʻladi.

Bir aylanish ~60 daqiqa (50 075 tovar, ~13 oʻlchov/sek). Jadval 8
soatlik oraliq bilan qoʻyilgani shuning uchun.

> GitHub 60 kun davomida hech qanday harakat boʻlmagan omborda jadvalli
> ishlarni oʻchirib qoʻyadi. Ombor faol boʻlsa muammo yoʻq.

#### 2026-08-23 — nega bu ish qoʻshildi

Sweep uch kun toʻxtagani ustiga undan kattaroq narsa chiqdi: bazada
50 075 ta faol kuzatuv turgan, sweep esa har safar **1000 tasini**
olib "hammasini oʻlchadim" deb tugagan. Sabab `trackedProducts()` da
sahifalash yoʻqligi — PostgREST 1000 qatordan keyin kesadi va **xato
bermaydi**. Shu kunga qadar 50 075 tadan atigi 1 005 tasi hech
boʻlmasa bir marta oʻlchangan edi.

Tuzatilgach, birinchi jadvalli yugurishning natijasi:

| | oldin | keyin |
|---|---|---|
| Hech boʻlmasa bir marta oʻlchangan tovar | 1 005 | **50 019** |
| Bir sweepda oʻlchangani | 1 000 (shift) | 49 127 |
| `product_day` qatorlari | 2 172 | 53 196 |

Manba bitta: **`uzum-catalog`**.

Ilgari `sample` nomli namuna generatori ham bor edi va u standart qiymat
edi. `.env` boʻlmagan muhitda sweep jimgina oʻshani ishga tushirib, haqiqiy
omborga toʻqilgan oʻlchov yozib qoʻydi. Generator butunlay olib tashlandi:
yigʻuvchi endi faqat oʻlchay oladi, yasay olmaydi.

### Uzum katalogiga kirish — hozircha yopiq

`graphql.uzum.uz` brauzerdan kelmagan soʻrovni chekkasidayoq rad etadi:

```
HTTP/2 401
x-ext-authz-check-result: denied
```

Yigʻuvchi bu himoyani aylanib oʻtishga urinmaydi — rad javobi kelsa sweep
darhol toʻxtaydi va sababi yoziladi. Kirish huquqi Uzumdan **rasmiy** olinishi
va `UZUM_CATALOG_HEADERS` ga qoʻyilishi kerak.

`sources/catalog-queries.mjs` dagi GraphQL soʻrovlari jonli sxemaga qarshi
tekshirilmagan (tekshirishning imkoni boʻlmadi). Ruxsat olingach
`npm run sweep -- --probe` javobni toʻliq bosib chiqaradi va maydon nomlarini
oʻsha bitta faylda tuzatish kifoya.

### Oʻz doʻkoningiz uchun rasmiy yoʻl

`api-seller.uzum.uz` — Uzumning sotuvchilar uchun rasmiy API'si; token
`seller.uzum.uz` kabinetida olinadi. U butun bozorni emas, **oʻz doʻkoningiz**
maʻlumotini beradi (buyurtma, mahsulot, narx, qoldiq) va katalogdan farqli
oʻlaroq captcha bilan yopilmagan.
