import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Сборка для сайта кладётся прямо в статику Django-приложения hollow: /static/hollow/app.js и app.css.
// Режим «yandex» (npm run build:yandex) собирает отдельную папку для Яндекс Игр: index.html в корне,
// без сервера, с SDK площадки.
export default defineConfig(({ mode }) => {
  const yandex = mode === "yandex";
  return {
  root: here("."),
  base: "./",
  define: { "import.meta.env.VITE_PLATFORM": JSON.stringify(yandex ? "yandex" : "web") },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "hollow-yandex-html",
      transformIndexHtml(html: string) {
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
    outDir: yandex ? here("../dist-yandex") : here("../../web/hollow/static/hollow"),
    emptyOutDir: true,
    assetsDir: "",
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: here("index.html"),
      output: {
        entryFileNames: "app.js",
        assetFileNames: (a) => (a.names?.[0]?.endsWith(".css") ? "app.css" : "[name][extname]"),
        inlineDynamicImports: true,
      },
    },
  },
};
});
