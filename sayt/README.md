# Sotuv sahifasi

Bu papka — tayyor statik sayt. Qurish qadami yoʻq: Vercel uni
shundoq beradi.

Fayllar `dizayn/qurish.mjs` bilan yasaladi va **qoʻlda
tahrirlanmaydi**. Dizaynning yangi versiyasi kelsa:

```bash
node dizayn/qurish.mjs
```

Qoʻlda tahrirlash mumkin emasligining sababi bor: qurish skripti
matn tuzatishlarini ham oʻz ichiga oladi (soxta guvohliklar olib
tashlanadi, imkoniyatlar TAYYOR/REJADA deb belgilanadi, foyda
kafolati chiqarilmaydi). Qoʻlda tahrir qilinsa, keyingi qurishda
ular jimgina qaytardi.

Skript har bir tuzatish qoʻllanganini tekshiradi. Dizayn oʻzgarib
matn koʻchsa, qurish **toʻxtaydi** — tuzatishsiz sayt chiqmaydi.

## Vercel

Alohida loyiha sifatida qoʻyiladi:

1. Vercel → **Add New → Project** → shu omborni tanlang
2. **Root Directory**: `sayt`
3. **Framework Preset**: Other
4. Build Command va Output Directory — **boʻsh qoldiring**

Panel (`/` dagi Vite ilovasi) alohida loyiha boʻlib qoladi va bunga
tegilmaydi.

## Nima mahalliy, nima tashqi

Hamma narsa mahalliy: React, ReactDOM, dizayn tizimi, Inter va
JetBrains Mono shriftlari — hammasi `boylik/` ichida.

Bu ataylab. Asl qadoq React ni `unpkg.com` dan soʻrardi va u yerga
yeta olmasa sahifa **butunlay boʻsh** qolardi — oʻlchandi: 0px
balandlik, 0 belgi matn. Endi sayt begona xizmatning ishlashiga
bogʻliq emas.

## Hajm

| | |
|---|---|
| `index.html` | 174 KB |
| `boylik/` | 1 198 KB (17 fayl) |

Katta qismi dizayn tizimi bundli (730 KB) va shriftlar. Bu
optimallashtirilmagan — dizayn asbobi chiqargan holicha. Sayt
ishlaydi, lekin sekin internetda birinchi ochilish ogʻir boʻladi.
Keyinchalik kerakli qismini ajratib olish mumkin.
