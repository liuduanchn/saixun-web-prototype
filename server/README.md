# saixun-server（赛训智舱后端）

NestJS + Prisma + PostgreSQL。与前端 `src/` 同仓，独立目录 `server/`。

## 技术栈
- NestJS 11（TypeScript，严格模式）
- Prisma ORM + PostgreSQL（业务数据）
- Qdrant（向量库，P1 诊断/RAG 使用，尚未接入）
- JWT 鉴权（P0.3 实现）
- OpenAI 兼容 AI 接口（P2 使用，`aiProvider` 抽象）

## 目录与阶段映射
| 目录 | 阶段 | 说明 |
| --- | --- | --- |
| `prisma/` | P0.2 | schema.prisma 全量模型 + seed.ts 演示数据 |
| `src/prisma/` | P0.2 | PrismaService（全局注入） |
| `src/health/` | P0.1 | `/health` 健康检查 |
| `src/auth/` `users/` `tenants/` | P0.3 | 登录/JWT/多租户（骨架） |
| `src/projects/` `criteria/` | P0.3/P2 | 赛项与评分点 |
| `src/tasks/` | P1 | 训练任务 CRUD/看板 |
| `src/works/` `diagnosis/` | P1 | 作品上传 + RAG 诊断 |
| `src/defense/` | P2 | 模拟答辩 |
| `src/review/` `resources/` `learning/` `notifications/` | P3 | 复盘/资源/学习/通知 |
| `src/ai/` `storage/` | P0.4 | AI 抽象层（OpenAI 兼容）/ 文件存储（本地实现，可换云） |

## 本地运行
```bash
cp .env.example .env        # 填入 DATABASE_URL / JWT_SECRET 等
npm install
npx prisma generate
npx prisma migrate deploy   # 需要有可达的 Postgres
npm run prisma:seed         # 可选：写入演示数据
npm run start:dev
```
健康检查：`GET http://localhost:3001/health`

## 鉴权 API（P0.3 已实现）
所有 `/api` 路由默认需 JWT，除标注 `@Public()` 的登录/注册/健康检查外。
- `POST /api/auth/login` `{username,password}` → `{access_token, user}`（演示账号 `teacher/123456`）
- `POST /api/auth/register` `{username,password,name,role?,tenantId?}` → `{access_token, user}`
- `GET  /api/auth/me` → 当前用户（需 `Authorization: Bearer <token>`）
- 全局 `JwtAuthGuard` 通过 `@Public()` 放行公开路由


## 部署（Railway + Vercel）
- 后端：Railway 挂载 Postgres + Qdrant，运行 `npm run build && npm run start:prod`
- 前端：Vercel 连接本仓库，构建 `saixun-web-prototype`（静态）
- 数据库迁移通过 `prisma migrate deploy` 在部署时执行
