import { Link, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { StatusBar } from "@/components/StatusBar";
import { HomePage } from "@/pages/Home";
import { ShopPage } from "@/pages/Shop";
import { ProductPage } from "@/pages/Product";
import { CategoryPage } from "@/pages/Category";
import { NotFoundPage } from "@/pages/NotFound";
import { getStatus } from "@/data/api";
import { disableDemo } from "@/lib/demo";

/**
 * Manzillar id boʻyicha: /sotuvchi/9103, /mahsulot/560305, /turkum/1007.
 * Nomga bogʻlanmaydi — Uzumda nom istalgan kuni oʻzgarishi mumkin, id esa yoʻq.
 */
export function App({ demo = false }: { demo?: boolean }) {
  const location = useLocation();
  // Ombor ulangani hech narsani isbotlamaydi: ichida namunaviy oʻlchov turgan
  // boʻlishi mumkin. Ogohlantirish ulanishga emas, maʻlumot manbaiga qaraydi.
  const sampleData = getStatus().source === "sample";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <>
      {/*
        DEMO tasmasi sahifaning eng tepasida, yopishib turadi va yopilmaydi.
        Ilgari toʻqilgan raqamlar haqiqiy oʻlchov deb oʻqilgani uchun bu belgi
        koʻz qochirib boʻlmaydigan joyda turishi kerak.
      */}
      {demo && (
        <div className="demo-strip">
          <b>DEMO</b>
          <span>
            Bu sahifadagi barcha raqamlar toʻqilgan — Uzumdan olingan emas.
            Dizaynni koʻrish uchun.
          </span>
          <button type="button" className="demo-exit" onClick={disableDemo}>
            Demo'dan chiqish
          </button>
        </div>
      )}

      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/">
            <span className="mark">Z</span>
            ZumSavdo
          </Link>
          <span className="spacer" />
          <StatusBar />
        </div>
      </header>

      <main className="wrap">
        {sampleData && (
          <div className="callout warn" style={{ marginTop: 14 }}>
            <b>Bu namuna maʻlumot — Uzumdan olingan emas.</b> Ombordagi oxirgi
            sweep manbai <code>sample</code>. Haqiqiy oʻlchovlar uchun{" "}
            <code>ingest</code> sweepini haqiqiy manba bilan ishga tushiring.
          </div>
        )}

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sotuvchi/:id" element={<ShopPage />} />
          <Route path="/mahsulot/:id" element={<ProductPage />} />
          <Route path="/turkum/:id" element={<CategoryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>

        <p className="footnote">
          Buyurtma soni <b>aniq</b> — u <code>Shop.ordersQuantity</code> hisoblagichining farqi.
          Aylanma va sotilgan dona <b>taxminiy</b>: birinchisi dona × narx, ikkinchisi qoldiq
          kamayishidan hisoblanadi va tovar oraliqda keltirilsa sotuvning bir qismi koʻrinmay
          qoladi. Panel hech qayerda sabab daʻvo qilmaydi — faqat bir vaqtda nima boʻlganini
          koʻrsatadi.
        </p>
      </main>
    </>
  );
}
