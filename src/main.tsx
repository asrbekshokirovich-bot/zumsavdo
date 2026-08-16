import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { bootstrap } from "./data/bootstrap";
import "./styles.css";

/**
 * Ombor yuklanmaguncha sahifa chizilmaydi.
 *
 * Sabab: barcha soʻrov funksiyalari faol toʻplamga tayanadi, va yarim
 * yuklangan holatda panel avval namuna raqamlarini, keyin haqiqiylarini
 * koʻrsatib yuborardi — bu eng yomon variant.
 */
const root = ReactDOM.createRoot(document.getElementById("root")!);

root.render(
  <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--ink2)" }}>
    Ombor oʻqilyapti…
  </div>,
);

bootstrap().then(async (boot) => {
  // Oʻlchov boʻlmasa sahifalar umuman chizilmaydi: boʻsh grafik va nol
  // kartochka "savdo yoʻq" deb oʻqiladi, bu esa yolgʻon javob.
  if (boot.mode === "empty") {
    const { NoDataPage } = await import("./pages/NoData");
    root.render(
      <React.StrictMode>
        <main className="wrap">
          <NoDataPage boot={boot} />
        </main>
      </React.StrictMode>,
    );
    return;
  }

  const { App } = await import("./App");
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App demo={boot.mode === "demo"} />
      </BrowserRouter>
    </React.StrictMode>,
  );
});
