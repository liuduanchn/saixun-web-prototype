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

## 任务 API（P1）
- `GET    /api/tasks?projectId=` → 看板任务列表
- `POST   /api/tasks` `{projectId,title,status?,scorePointIds?}` → 新建任务
- `PATCH  /api/tasks/:id` `{status?,title?,scorePointIds?}` → 改状态/关联评分点（看板拖拽）
- `DELETE /api/tasks/:id` → 删除
- `GET    /api/tasks/coverage?projectId=` → 评分覆盖率（实时计算）

## 作品 + 诊断 API（P1 闭环）
- `POST   /api/works?projectId=` `multipart/form-data` 字段 `file` → 上传作品，自动生成新版本
- `GET    /api/works?projectId=` → 作品版本列表
- `GET    /api/works/:id` → 单个作品（含下载 url）
- `DELETE /api/works/:id` → 删除作品与文件
- `POST   /api/diagnosis` `{workVersionId}` → 发起诊断（有 `AI_API_KEY` 走真实大模型，否则启发式兜底），逐项写入诊断记录
- `GET    /api/diagnosis?workVersionId=` → 诊断结果列表（按匹配度升序）
- `PATCH  /api/diagnosis/:id` `{status:CONFIRMED|REJECTED}` → 教师复核；确认且为 HIGH/CRITICAL 严重度时，**自动生成一条「修改：评分点」任务**到任务中心

## 本地验证 P1 闭环（PowerShell）
```powershell
cd "E:\JHC\6项目科研相关\202607金职大首届教学智能体大赛\saixun-web-prototype\server"
$token = (Invoke-RestMethod -Uri http://localhost:3001/api/auth/login -Method Post -ContentType "application/json" -Body '{"username":"teacher","password":"123456"}').access_token
Set-Content -Path .\sample-work.txt -Value "本项目实现了核心功能，技术选型合理，架构先进，具备创新点。"
$upload = curl.exe -s -X POST "http://localhost:3001/api/works?projectId=demo-project" -H "Authorization: Bearer $token" -F "file=@.\sample-work.txt"
$wid = ($upload | ConvertFrom-Json).id
Invoke-RestMethod -Uri http://localhost:3001/api/diagnosis -Method Post -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body "{`"workVersionId`":`"$wid`"}" | ConvertTo-Json -Depth 4
```



## 部署（Railway + Vercel）
- 后端：Railway 挂载 Postgres + Qdrant，运行 `npm run build && npm run start:prod`
- 前端：Vercel 连接本仓库，构建 `saixun-web-prototype`（静态）
- 数据库迁移通过 `prisma migrate deploy` 在部署时执行
