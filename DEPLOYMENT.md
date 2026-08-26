# 赛训智舱 · 线上部署手册（Railway 后端 + Vercel 前端）

目标：线上前端走真实后端数据（不再只是演示壳）。

- 后端：NestJS + Prisma + PostgreSQL，部署到 **Railway**
- 前端：React + Vite，部署到 **Vercel**，通过 `VITE_API_BASE` 指向 Railway
- 数据库：Railway 自带 PostgreSQL 插件（自动注入 `DATABASE_URL`）

> 仓库结构：前端在仓库根目录，后端在 `server/` 子目录。GitHub Pages（`/saixun-web-prototype/`）继续可用，与 Vercel 互不冲突（前端 `base` 由 `VITE_BASE` 控制，默认保留 GitHub Pages 路径）。

---

## 一、Railway 部署后端

### 1. 新建服务
1. 打开 https://railway.app ，用 GitHub 登录。
2. New Project → Deploy from GitHub repo → 选择本仓库 `saixun-web-prototype`。
3. 在创建服务时，**Root Directory 选择 `server`**（关键：后端在子目录）。
4. 服务名随意，例如 `saixun-server`。

### 2. 添加 PostgreSQL
1. 在该 Project 内 Add → Database → PostgreSQL。
2. 创建后，点开 PostgreSQL 服务 → Variables，复制 `DATABASE_URL`（形如 `postgresql://...`）。
3. 回到后端服务 → Variables → 点 “Add Reference” 或新建变量，把 Postgres 的 `DATABASE_URL` 关联/填进来（Railway 会自动注入到后端服务，无需手填明文）。

### 3. 配置后端环境变量（后端服务 → Variables）
| 变量 | 值 | 说明 |
|---|---|---|
| `DATABASE_URL` | （由 Postgres 插件注入） | 无需手填 |
| `JWT_SECRET` | 一段强随机串，如 `openssl rand -hex 32` | **务必替换**，不要用默认值 |
| `JWT_EXPIRES_IN` | `7d` | |
| `AI_BASE_URL` | `https://api.openai.com/v1` 或 DeepSeek/通义地址 | 不填也可运行（走启发式兜底） |
| `AI_API_KEY` | 你的 LLM Key | 留空则诊断走确定性启发式，仍真实落库 |
| `AI_MODEL` | `gpt-4o-mini` 等 | |
| `STORAGE_DIR` | `./uploads`（默认） | 临时存储；若需持久化，挂载 Volume 到 `/data` 并设 `STORAGE_DIR=/data/uploads` |
| `PORT` | （Railway 自动注入） | 无需手填 |

> 构建/启动命令已在 `server/railway.json` 写死：`npm install && npx prisma generate && npx prisma migrate deploy && npm run build && npm run prisma:seed`，随后 `node dist/main`。`prisma:seed` 幂等，会建 `demo-project`、教师账号 `teacher/123456`、15 个评分点。

### 4. 拿到后端域名
部署成功后，后端服务 → Settings → Generate Domain（或 Networking），得到形如 `https://saixun-server.up.railway.app`。记下它，下面 Vercel 要用。

健康检查：`https://<你的后端域名>/api/health` 应返回 200。

---

## 二、Vercel 部署前端

### 1. 新建项目
1. 打开 https://vercel.com ，用 GitHub 登录。
2. Add New → Project → 导入本仓库 `saixun-web-prototype`。
3. **Root Directory：仓库根**（即默认，不要选 `server`）。
4. Framework Preset：选 **Vite**（或留空，由 `vercel.json` 控制）。

### 2. 环境变量（Project → Settings → Environment Variables）
| 变量 | 值 | 说明 |
|---|---|---|
| `VITE_API_BASE` | `https://<你的后端域名>/api` | 例如 `https://saixun-server.up.railway.app/api` |
| `VITE_PROJECT_ID` | `demo-project` | 指向 seed 建好的演示项目 |
| `VITE_BASE` | `/` | Vercel 根域名部署，资源从根路径加载 |

### 3. 构建与输出
由 `vercel.json` 指定：`buildCommand = npm run build`，`outputDirectory = dist/client`。直接 Deploy 即可。

> 注意：`npm run build` 会执行 `vite build` 再跑 `prepare-sites-build.mjs`（依赖仓库内已提交的 `worker/index.js` 与 `.openai/hosting.json`，仅用于内部 Sites 平台，对 Vercel 无副作用，最终静态站点在 `dist/client`）。

### 4. 访问
部署完成后得到 `https://<你的项目>.vercel.app`。用 `teacher / 123456` 登录，即可看到真实任务、覆盖率，并可在「作品诊断中心」上传作品走真实诊断闭环。

---

## 三、本地对照验证
- 后端：`cd server && npm install && npx prisma generate && npx prisma migrate deploy && npm run start:dev`（需本地 Postgres + `.env`）
- 前端：`cp .env.local`（已含 `VITE_API_BASE=http://localhost:3001/api`、`VITE_PROJECT_ID=demo-project`）→ `npm run dev`
- 未配置 `VITE_API_BASE` 时前端自动 `DEMO_MODE`，仍展示内置演示数据。

---

## 四、常见问题
- **上线后登录 401/网络错误**：检查 `VITE_API_BASE` 是否拼到 `/api` 结尾、Railway 后端域名是否已 Generate Domain、CORS 后端已 `enableCors()` 放行所有来源（无需额外配置）。
- **数据库为空 / 无 demo-project**：确认 Railway 构建命令包含 `prisma migrate deploy` 与 `prisma:seed`；可到后端服务手动 Run `npm run prisma:seed` 一次。
- **上传文件重启后丢失**：Railway 文件系统临时，挂 Volume 并改 `STORAGE_DIR` 到挂载点即可持久化。
- **Vercel 白屏/资源 404**：确认 `VITE_BASE=/`，且 `outputDirectory=dist/client`。
