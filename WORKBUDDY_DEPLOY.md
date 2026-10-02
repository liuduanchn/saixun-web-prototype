# 赛训智舱 · WorkBuddy 部署说明

本文件说明如何把本项目发布到 **WorkBuddy 的「发布为应用」托管平台**。
适用分支：`workbuddyDeploy`。该分支把后端数据层从 PostgreSQL 切换到 **SQLite**，
并由 NestJS 同时托管前端静态产物，使整个应用以**单端口自包含**形态运行。

> `main` 分支不受影响，仍是 PostgreSQL + Railway 的那条链路（见 `DEPLOYMENT.md`）。
> 两份数据层**不能互迁**：枚举被降级为字符串、JSON 存为文本。

---

## 一、平台约束（决定了本分支的形态）

| 约束 | 影响 |
|---|---|
| 只暴露**单个 HTTP 端口**，端口经 `PORT` 注入，须 bind `0.0.0.0` | Nest 同时提供 API 与前端静态资源 |
| 只支持 Node.js / Python / Go / 纯静态 | 后端必须用 Node 跑 |
| **不支持任何外部数据库/缓存**，SQLite 完全支持 | 数据层必须迁到 SQLite |
| 发布前有**前置检查**，命中即拒发：`.env*` 连接串指向 localhost、`prisma/schema.prisma` 的 provider 不是 sqlite、依赖含 `pg`/`mysql2`/`ioredis`、compose 含外部服务 | 上传目录必须零 `.env*`、provider=sqlite |
| 工具参数只有 `directory`/`language`/`port`/`installCmd`/`startCmd`/`entryHtml`/`appName`/`domainPrefix` | **没有 buildCmd**（构建折进 installCmd）；**没有环境变量注入入口**（除 `PORT`） |
| 上传时排除 `node_modules`/`.git`/构建产物，依赖与构建在沙箱内重跑 | 不要指望把本地 `dist/` 带上去 |
| 发布后**任何获得链接的人都能访问** | 不要在产物里放任何密钥 |

沙箱底座是 **E2B**：暂停/恢复会保留文件系统，但沙箱被回收则磁盘清空 ——
所以启动脚本做了**幂等自愈**，保证初始演示数据始终存在。

---

## 二、一键构建与启动

```bash
npm run workbuddy:install   # 装依赖 → prisma generate → migrate deploy → nest build → 两个 seed → 构建前端
npm run workbuddy:start     # 自愈（库缺失则建库+灌种子）→ 启动单端口服务
```

两个入口都是 Node 脚本（`scripts/workbuddy-install.mjs`、`scripts/workbuddy-start.mjs`），
故意不用长 shell 命令，以规避平台的引号/转义差异与 `npm --prefix` 的兼容性问题。

要点：

- `npm ci` **必须带 `--include=dev`**。server 侧的 `prisma`、`nest` CLI、`ts-node`
  全在 `devDependencies`；若环境设了 `NODE_ENV=production`，默认 `npm ci` 会跳过它们。
- 两个 seed **必须按序**：`seed.ts` 先，`seed-instance-projects.ts` 后
  （后者依赖前者建好的既有 `teacher` 账号）。
- seed 与后端进程的 cwd 都固定为 `server/`，这样两者写读的 `uploads/` 才是同一目录。
- 前端构建走 `vite build --mode workbuddy`，变量取自仓库内的 `.env.workbuddy`。

---

## 三、发布到 WorkBuddy

1. **生成上传目录**（用 `git archive` 导出，天然排除一切 `.gitignore` 内容）：

   ```bash
   git archive --format=tar HEAD | tar -x -C workbuddyDeploy/payload \
     --exclude='.env.example' --exclude='.openai' --exclude='worker' \
     --exclude='server/prisma/_pg-migrations' --exclude='DEPLOYMENT.md' \
     --exclude='*.png' --exclude='*.PNG' --exclude='docs/readme-assets'
   node scripts/prepare-workbuddy-deploy.mjs workbuddyDeploy/payload --check-only   # 自检
   ```

2. **发布**（工具参数）：

   | 参数 | 值 |
   |---|---|
   | `directory` | 上一步的 `payload` 绝对路径 |
   | `language` | `node` |
   | `installCmd` | `npm run workbuddy:install` |
   | `startCmd` | `npm run workbuddy:start` |
   | `appName` | `赛训智舱` |
   | `domainPrefix` | `saixun-cabin`（deploy 时必填，≤32 字符小写字母数字连字符） |

   首次发布的 `installCmd` 会打印 `node -v`，用于确认沙箱 Node 版本。

---

## 四、演示账号

| 账号 | 密码 | 说明 |
|---|---|---|
| `teacher` | `123456` | 可切换到全部 8 个团队（既有账号被加为 6 个实例团队的 MEMBER） |
| `student1` | `123456` | 学生端（demo-tenant） |
| `<项目前缀>_teacher` / `<项目前缀>_student<N>` | `123456` | 6 个实例项目团队各自的账号 |

前缀：`pearl` `sidaopu` `mingzhu` `zhihuaxing` `yihuoji` `sheyun`。

数据规模：10 租户 / 11 项目 / 41 账号（`seed.ts` 贡献 3 团队 5 赛项，
`seed-instance-projects.ts` 贡献 6 团队 27 账号）。

---

## 五、密钥配置（三级优先级，向上覆盖）

1. **运行时环境变量** `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`
2. **未入库的配置文件** `server/config/runtime.json`（模板见 `runtime.example.json`）
3. **缺省**：无 Key → AI 自动降级为确定性启发式，诊断/解析/答辩**仍真实落库**，闭环完整

安全约定：

- 密钥**绝不下发前端**。配置状态通过 `GET /api/config/status` 暴露，只返回
  `aiConfigured` / `aiModel` / `aiBaseHost` / `aiConfigSource`，不含密钥本身。
- 日志与错误信息中的密钥一律脱敏为 `sk-****`。
- ASR 密钥存于 `Tenant.settings`，读取接口返回的是**脱敏值**（`asrApiKey: "sk-****"`）
  + `asrApiKeySet` 标记；若把脱敏值原样回传视为「未修改」，不会覆盖真实密钥。
- **默认线上不携带真实 Key**：发布链接对外公开，一旦配置，任何访问者都可能通过
  `/api` 消耗你的模型额度。平台没有环境变量注入入口，若确需线上启用真实 AI，
  只能内联进 `startCmd` 或随包携带 `runtime.json`，两者都意味着密钥落在平台侧。

> 本机 `server/.env` 中曾出现真实 `sk-` 开头的 Key，建议轮换。

---

## 六、已知限制

1. **数据非永久**：E2B 沙箱被回收后磁盘清空，运行时改动不保证长期留存；
   启动自愈可保证「初始演示数据始终存在」。
2. **AI / ASR 默认不可用**：见第五节，默认走启发式。
3. **上传文件落在沙箱本地盘**：`STORAGE_DIR` 未设时为 `<cwd>/uploads`，随沙箱生命周期存亡。
4. **限流器是进程内存态**：单实例无碍；多实例不共享计数。

---

## 七、本地验证

```bash
# 构造上传目录 → 完整跑一遍平台会执行的安装流程
git archive --format=tar HEAD | tar -x -C /tmp/selftest --exclude='.env.example' ...
cd /tmp/selftest && node scripts/workbuddy-install.mjs && PORT=17100 node scripts/workbuddy-start.mjs

# 关键检查点
curl -s  http://127.0.0.1:17100/api/health          # {"status":"ok","db":"up"}
curl -sI http://127.0.0.1:17100/api/nope            # 必须 404，不能是 200 HTML
curl -s  http://127.0.0.1:17100/some/deep/route     # 必须返回 index.html
```

本地跑 `workbuddy:start` 时若 `npm run build` 被本机 safe-delete 钩子拦截，
安装脚本会自动回退到 `tsc -p tsconfig.build.json --incremental false`
（产物路径一致，均为 `server/dist/main.js`）。
