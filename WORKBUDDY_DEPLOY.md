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
npm run workbuddy:install   # 装依赖 → prisma generate → 建库+灌种子（仅当库不存在）→ nest build → 构建前端
npm run workbuddy:start     # 自愈（库缺失则建库+灌种子）→ 启动单端口服务
```

两个入口都是 Node 脚本（`scripts/workbuddy-install.mjs`、`scripts/workbuddy-start.mjs`），
故意不用长 shell 命令，以规避平台的引号/转义差异与 `npm --prefix` 的兼容性问题。

要点：

- `npm ci` **必须带 `--include=dev`**。server 侧的 `prisma`、`nest` CLI、`ts-node`
  全在 `devDependencies`；若环境设了 `NODE_ENV=production`，默认 `npm ci` 会跳过它们。
- **数据库初始化只在库不存在时执行**。平台会复用已记录的沙箱，重新发布时上一次的
  实例仍在运行并占着 SQLite 文件，此时做 `prisma migrate deploy` 会直接报
  `database is locked` 而整体失败；因此库已存在就完全跳过 —— 既避开争锁，
  也**保留已有演示数据**。改了 schema 又需要迁移时，先下线应用再发布。
- **依赖安装带缓存戳**：锁文件未变且两处 `node_modules` 都在时直接跳过，
  重新发布因此明显更快。`npm ci` 仅用于全新沙箱，其余场景用 `npm install` 就地调和
  （`npm ci` 会清空依赖树，在复用沙箱中实测会失败）。
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

> **演示前请注意**：线上活跃租户会停在**最后一次 seed 的最后一个实例团队**
> （当前为「思导谱团队」），不是基础演示数据。演示前在顶栏团队下拉里切到
> 「智造先锋队（演示）」即可回到标准数据。这是 `seed-instance-projects.ts` 的既有行为。

### 线上实测状态（2026-10-04 更新）

| 项| 值 |
| --- | --- |
| 分享链接 | https://saixun-cabin.app.workbuddy.host/ |
| 健康检查 | `{"status":"ok","db":"up"}` |
| 团队数 | 8（`teacher` 可见全部） |
| AI 配置 | `aiConfigured: false`（`aiConfigSource: none`） |

⚠️ **线上不带 API Key**，因此赛项解析 / 作品诊断 / 模拟答辩实际运行在
**降级启发式**上（确定性固定值，功能闭环完整但非真实模型推理）。
这是平台限制所致（只注入 `PORT`，无环境变量入口），详见第五节。
本地 `server/.env` 配了 Key，故本地跑的是真实模型——两边输出不同是预期的。

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

## 六、平台行为注意点

### 沙箱是「覆盖解包」，本地删掉的文件不会消失

平台复用同一沙箱并把上传内容**覆盖解包**上去，因此：

- 在本地**删除**某个源文件后再发布，沙箱里**旧副本仍会保留**并被编译进去；
  若旧文件引用了已删除的成员，构建会直接失败（实测踩过一次）。
- 所以应尽量用「改写文件内容」而不是「删除文件」的方式做清理；
  确实需要删除时，得请平台侧重建沙箱，或在下线后重新发布。

### 网关会注入自己的 Authorization 头（**踩过大坑**）

托管网关会在**每一个请求**上注入它自己的 `Authorization: Bearer eyJ…`
（同时注入 `x-space-key` 等）。因此：

- 后端**不能**把标准 `Authorization` 作为唯一的取令牌通道——否则永远取到网关的令牌，
  验签必然失败，表现为「登录成功，但所有带 token 的请求一律 401」，
  而且**连不带凭证的请求也会报 invalid signature**。
- 本项目的做法：优先读专属头 `X-Saixun-Auth`（前端同时发送），其次 `saixun_token`
  Cookie，最后才回退标准 Bearer。详见 `server/src/auth/jwt.strategy.ts`。
- 若你新增自定义请求头，请确认它不会与网关注入的头冲突；
  实测普通自定义头（如 `x-custom-probe`）会被原样透传。

### 网关注入不了的环境变量

平台只注入 `PORT`，其余（`JWT_SECRET`、AI Key 等）都没有注入入口，
因此 `scripts/workbuddy-start.mjs` 会**强制**设置一个演示专用的 `JWT_SECRET`
（可用 `WORKBUDDY_JWT_SECRET` 覆盖），避免实例重建后旧令牌整体失效。

---

## 七、已知限制

1. **数据非永久**：E2B 沙箱被回收后磁盘清空，运行时改动不保证长期留存；
   启动自愈可保证「初始演示数据始终存在」。
2. **AI / ASR 默认不可用**：见第五节，默认走启发式。
3. **上传文件落在沙箱本地盘**：`STORAGE_DIR` 未设时为 `<cwd>/uploads`，随沙箱生命周期存亡。
4. **限流器是进程内存态**：单实例无碍；多实例不共享计数。

---

## 八、本地验证

```bash
# 构造上传目录 → 完整跑一遍平台会执行的安装流程
git archive --format=tar HEAD | tar -x -C /tmp/selftest --exclude='.env.example' ...
cd /tmp/selftest && node scripts/workbuddy-install.mjs && PORT=17100 node scripts/workbuddy-start.mjs

# 关键检查点
curl -s  http://127.0.0.1:17100/api/health          # {"status":"ok","db":"up"}
curl -sI http://127.0.0.1:17100/api/nope            # 必须 404，不能是 200 HTML
curl -s  http://127.0.0.1:17100/some/deep/route     # 必须返回 app.html（应用壳）
```

本地跑 `workbuddy:start` 时若 `npm run build` 被本机 safe-delete 钩子拦截，
安装脚本会自动回退到 `tsc -p tsconfig.build.json --incremental false`
（产物路径一致，均为 `server/dist/main.js`）。
