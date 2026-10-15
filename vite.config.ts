import { defineConfig } from "vite";

// base:"./" — 关键：GitHub Pages 部署在子路径 <owner>.github.io/<repo>/，
// 相对 base 让 JS/CSS/version.json 都按相对路径解析，避免 404。
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});