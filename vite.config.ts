import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  /*
   * GitHub Pages loyihani `/<ombor-nomi>/` ostida beradi, ildizda emas.
   * `base` qoʻyilmasa hamma JS va CSS manzili `/assets/...` boʻlib qoladi
   * va sahifa boʻsh oq ekran boʻlib ochiladi.
   *
   * Muhit oʻzgaruvchisi orqali: Vercel va localhost ildizda ishlaydi,
   * faqat Pages uchun boshqacha.
   */
  base: process.env.ZUMSAVDO_BASE ?? "/",
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // ZumSavdo tailwind ishlatmaydi. Inline konfiguratsiya berilmasa, Vite
  // yuqoriga chiqib omborning ildizidagi postcss.config.js ni topib oladi.
  css: { postcss: { plugins: [] } },
  server: {
    host: "0.0.0.0",
    port: 5180,
  },
  preview: {
    host: "0.0.0.0",
    port: 5180,
  },
});
