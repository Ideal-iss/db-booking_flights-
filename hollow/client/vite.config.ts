import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Сборка кладётся прямо в статику Django-приложения hollow: /static/hollow/app.js и app.css.
export default defineConfig({
  root: here("."),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@shared": here("../shared") } },
  server: {
    port: 5173,
    proxy: { "/world/api": "http://127.0.0.1:8000" },
  },
  build: {
    outDir: here("../../web/hollow/static/hollow"),
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
});
