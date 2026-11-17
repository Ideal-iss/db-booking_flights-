import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Сборка для сайта кладётся прямо в статику Django-приложения hollow: /static/hollow/app.js и app.css.
// Режим «yandex» (npm run build:yandex) собирает отдельную папку для Яндекс Игр: index.html в корне,
// без сервера, с SDK площадки.
// Режим «pikabu» (npm run build:pikabu): Пикабу не хранит игры у себя, сборка лежит в статике сайта
// (/static/hollow-pikabu/), а страницу отдаёт Django по адресу /world/pikabu/ — её Пикабу и показывает в рамке.
export default defineConfig(({ mode }) => {
  const yandex = mode === "yandex";
  const pikabu = mode === "pikabu";
  return {
  root: here("."),
  base: pikabu ? "/static/hollow-pikabu/" : "./",
  define: { "import.meta.env.VITE_PLATFORM": JSON.stringify(yandex ? "yandex" : pikabu ? "pikabu" : "web") },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "hollow-yandex-html",
      transformIndexHtml(html: string) {
        if (pikabu) {
          return html
            .replace("<title>THE HOLLOW</title>", "<title>Полость</title>\n  <style>html,body{margin:0;height:100%;background:#0b0a09;overflow:hidden;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}</style>");
        }
        if (!yandex) return html;
        // SDK отдаёт сама площадка по относительному адресу
        return html.replace("<head>", '<head>\n  <script src="/sdk.js"></script>').replace("<title>THE HOLLOW</title>", "<title>THE HOLLOW</title>\n  <style>html,body{margin:0;height:100%;background:#0b0a09;overflow:hidden;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}</style>");
      },
    },
  ],
  resolve: { alias: { "@shared": here("../shared") } },
  server: {
    port: 5173,
    proxy: { "/world/api": "http://127.0.0.1:8000" },
  },
  build: {
    outDir: yandex ? here("../dist-yandex") : pikabu ? here("../../web/hollow/static/hollow-pikabu") : here("../../web/hollow/static/hollow"),
    emptyOutDir: true,
    assetsDir: "",
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: here("index.html"),
      output: {
        // у Пикабу файлы отдаются как есть — имена с хешем, чтобы обновления не застревали в кеше
        entryFileNames: pikabu ? "app-[hash].js" : "app.js",
        assetFileNames: (a) => (a.names?.[0]?.endsWith(".css") ? (pikabu ? "app-[hash].css" : "app.css") : pikabu ? "[name]-[hash][extname]" : "[name][extname]"),
        inlineDynamicImports: true,
      },
    },
  },
};
});
