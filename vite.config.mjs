import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  // 用 loadEnv 读取 .env / .env.<mode> 文件。
  // 原先读的是 process.env.VITE_BASE，但 Vite **不会**把 .env 文件的内容写进
  // process.env（它只通过 import.meta.env 暴露给客户端代码），因此
  // `.env.workbuddy` 里的 VITE_BASE 一直不生效，产物仍是 GitHub Pages 的子路径。
  // 这里改为「env 文件优先，其次进程环境变量，最后回落到 Pages 默认值」，
  // 保证 GitHub Pages 构建（默认 mode=production，不加载 .env.workbuddy）不受影响。
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE || process.env.VITE_BASE || "/saixun-web-prototype/";

  return {
    // 部署基准路径：GitHub Pages 用 /saixun-web-prototype/；
    // WorkBuddy / Vercel 等根域名或独立子域部署由 .env.workbuddy 设成 /
    base,
    build: {
      outDir: "dist/client",
      // 多页入口：index.html 是应用本体，landing.html 是新版落地页
      //（从经典登录页右上角「新版入口」进入，登录复用 src/loginFlow.js）。
      // 显式声明两个入口后，产物仍是 dist/client/index.html 与 dist/client/landing.html，
      // Sites 交付所依赖的 dist/client/index.html 位置不变。
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          landing: fileURLToPath(new URL("./landing.html", import.meta.url)),
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      // 本地开发时把 /api 代理到 NestJS 后端（默认 :8080，可用 VITE_PROXY_TARGET 覆盖），
      // 避免跨域并复用相对路径。注意：端口须避开 Windows 动态保留段（如 8950-9049 含旧用的 9000）
      proxy: {
        "/api": {
          target: process.env.VITE_PROXY_TARGET || "http://localhost:8080",
          changeOrigin: true,
        },
      },
      warmup: {
        clientFiles: ["./src/main.jsx"],
      },
    },
    plugins: [react()],
  };
});
