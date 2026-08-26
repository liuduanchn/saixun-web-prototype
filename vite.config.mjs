import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 部署基准路径：GitHub Pages 用 /saixun-web-prototype/；Vercel 等根域名部署设 VITE_BASE=/
  base: process.env.VITE_BASE || "/saixun-web-prototype/",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    // 本地开发时把 /api 代理到 NestJS 后端（:3001），避免跨域并复用相对路径
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
