import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // 必须带泛型，否则拿不到 useStaticAssets（NestExpressApplication 专有）
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 前端静态产物目录。默认按**编译产物位置**推导，而不是 cwd：
  // 本文件编译后位于 server/dist/main.js，故 ../../dist/client 即仓库根的 dist/client。
  // 这样无论从哪个目录启动后端都能正确定位；可用 CLIENT_DIR 覆盖。
  const clientDir = process.env.CLIENT_DIR
    ? resolve(process.env.CLIENT_DIR)
    : resolve(__dirname, '..', '..', 'dist', 'client');
  // SPA 回退目标是应用壳 app.html —— index.html 现为网站落地页，
  // 若仍回退到它，任何深链接都会被送去落地页而不是应用。
  const appHtml = join(clientDir, 'app.html');
  const hasClient = existsSync(appHtml);

  // ── 安全头 ────────────────────────────────────────────────────────────
  // 与「纯 JSON API」时期不同：现在同一个进程还要托管前端 HTML，
  // 因此默认 CSP 里两条指令需要按实际托管方式调整：
  //   · frame-ancestors / X-Frame-Options：托管平台可能以内嵌 iframe 预览应用，
  //     默认的 'self' 会直接拒渲（表现为「发布成功但打开是白屏」）。本应用是对外
  //     公开的演示站，不存在点击劫持风险，故放开。
  //   · upgrade-insecure-requests：若托管环境以 http 提供，该指令会把同源请求
  //     升级为 https 从而导致全站失效。平台对外为 https 时其实用不上，故一并关闭。
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'upgrade-insecure-requests': null,
          frameAncestors: null,
          // 预留：将来若用 <audio src="blob:"> 播放录音
          'media-src': ["'self'", 'blob:'],
        },
      },
      crossOriginEmbedderPolicy: false,
      xFrameOptions: false,
    }),
  );

  // ── 前端静态资源 ──────────────────────────────────────────────────────
  // useStaticAssets 内部就是 this.use(express.static(...))，属立即注册，
  // 因此顺序为：helmet → 静态资源 → SPA 回退 → Nest 路由。
  if (hasClient) {
    app.useStaticAssets(clientDir, {
      index: false, // 根路径交给下面的回退统一处理，保证 / 与深链接行为一致
      etag: true,
      setHeaders: (res, filePath) => {
        // Vite 产物带内容哈希，可长期强缓存；index.html 必须不缓存
        if (/[.-][0-9a-f]{8,}\./i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    });
  }

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // ── SPA 回退 ──────────────────────────────────────────────────────────
  // 该中间件注册在 Nest 路由之前，所以「放行 /api」这道守卫是必需的：
  // 少了它会把所有 /api 请求都吞成 index.html，表现为前端永远拿到 HTML 而非 JSON。
  app.use((req: any, res: any, next: () => void) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const reqPath: string = req.path || '/';
    if (reqPath === '/api' || reqPath.startsWith('/api/')) return next();
    if (!hasClient) return next();
    // 看起来是静态资源（带扩展名）却没命中 → 老实 404，不要返回 HTML
    if (/\.[a-zA-Z0-9]+$/.test(reqPath)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.sendFile(appHtml);
  });

  // ── CORS ──────────────────────────────────────────────────────────────
  // 单端口同源部署下浏览器不会对同源请求做 CORS 校验，此处白名单仅服务于
  // 本地前后端分端口开发的场景，线上保持默认即可。
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(
    `saixun-server listening on 0.0.0.0:${port}  client=${hasClient ? clientDir : '(未找到 dist/client，仅提供 API)'}`,
  );
}

bootstrap();
