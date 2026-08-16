import type { BootResult } from "@/data/bootstrap";
import { enableDemo } from "@/lib/demo";

/**
 * Oʻlchov yoʻqligini aytadigan ekran.
 *
 * Bu sahifa ataylab raqamsiz. Boʻsh grafik yoki nolga toʻlgan kartochka
 * "savdo yoʻq" deb oʻqiladi — bu esa yolgʻon: savdo bor, oʻlchov yoʻq.
 */
export function NoDataPage({ boot }: { boot: Extract<BootResult, { mode: "empty" }> }) {
  return (
    <div className="page-head">
      <h1>Hali oʻlchov yigʻilmagan</h1>
      <p className="subline">{boot.reason}</p>

      {boot.detail && (
        <div className="callout" style={{ marginTop: 16 }}>
          {boot.detail}
        </div>
      )}

      <div className="panel" style={{ marginTop: 18 }}>
        <header>
          <h2>Dizaynni koʻrish</h2>
        </header>
        <div className="body" style={{ maxWidth: "70ch" }}>
          <p style={{ marginTop: 0 }}>
            Panel qanday ishlashini haqiqiy oʻlchovsiz ham koʻrish mumkin.
            Demo rejimida toʻqilgan maʻlumot ishlatiladi va har sahifaning
            tepasida oʻchmaydigan <b>DEMO</b> tasmasi turadi.
          </p>
          <button type="button" className="chip" onClick={enableDemo}>
            Demo maʻlumot bilan ochish
          </button>
        </div>
      </div>

      <div className="panel">
        <header>
          <h2>Nega raqam koʻrsatilmayapti</h2>
        </header>
        <div className="body" style={{ maxWidth: "70ch" }}>
          <p style={{ marginTop: 0 }}>
            Panel faqat haqiqiy oʻlchovni koʻrsatadi. Ombor boʻsh boʻlsa nol ham,
            namuna raqami ham chizilmaydi — ikkalasi ham notoʻgʻri javob beradi:
            biri "sotuv boʻlmagan" deb, ikkinchisi umuman toʻqib.
          </p>
          <p>
            Raqam paydo boʻlishi uchun sweep kamida <b>ikki marta</b> ishlashi
            kerak. Buyurtma soni Uzumda kümülativ hisoblagich sifatida keladi va
            kunlik son ikki oʻlchov farqidan chiqadi — bitta oʻlchov bilan farq
            hisoblab boʻlmaydi.
          </p>
        </div>
      </div>

      <div className="panel">
        <header>
          <h2>Sweepni ishga tushirish</h2>
        </header>
        <div className="body">
          <pre
            style={{
              fontFamily: "var(--f)",
              fontSize: 12.5,
              margin: 0,
              whiteSpace: "pre-wrap",
              color: "var(--ink2)",
            }}
          >
{`cd ingest
npm install
cp .env.example .env    # toʻldiring
npm run sweep`}
          </pre>
          <p className="note-inline">
            Uzum katalogi hozircha brauzerdan kelmagan soʻrovni rad etadi
            (<code>x-ext-authz-check-result: denied</code>). Kirish huquqi Uzumdan
            rasmiy olinishi va <code>UZUM_CATALOG_HEADERS</code> ga qoʻyilishi kerak.
            Oʻz doʻkoningiz uchun rasmiy yoʻl — <code>api-seller.uzum.uz</code>,
            token <code>seller.uzum.uz</code> kabinetida olinadi.
          </p>
        </div>
      </div>
    </div>
  );
}
