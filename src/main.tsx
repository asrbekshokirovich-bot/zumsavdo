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
  const { App } = await import("./App");
  root.render(
    <React.StrictMode>
      {/*
        Manzillar `base` ostida: Pages da /zumsavdo/sotuvchi/9103, ildizda
        esa /sotuvchi/9103. `basename` boʻlmasa Pages da hamma ichki havola
        404 berardi.
      */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App boot={boot} />
      </BrowserRouter>
    </React.StrictMode>,
  );
});
