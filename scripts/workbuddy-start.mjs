#!/usr/bin/env node
/**
 * WorkBuddy 启动入口（workbuddyDeploy 分支）
 * ------------------------------------------------------------------
 * 职责：
 *   1. **幂等自愈**：SQLite 库不存在时自动建库并灌种子。
 *      WorkBuddy 的托管沙箱底座是 E2B，其暂停/恢复会保留文件系统，
 *      但沙箱一旦被回收则磁盘全丢；构建阶段灌好的数据不能当作保证，
 *      因此启动时兜一层，确保「初始演示数据始终存在」。
 *   2. **统一 cwd 到 server/**：seed 与后端都用 process.cwd() 推导 uploads/，
 *      必须同源，否则附件全部 404。
 *   3. 补齐演示用 JWT 密钥：平台只注入 PORT，不会注入 JWT_SECRET。
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'server');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args, label) {
  console.log(`[workbuddy:start] ▸ ${label}`);
  const r = spawnSync(NPM, args, { cwd: serverDir, stdio: 'inherit', env: process.env, shell: false });
  if (r.error || r.status !== 0) {
    console.error(`[workbuddy:start] ✗ ${label} 失败`);
    process.exit(r.status ?? 1);
  }
}

const dbPath = path.join(serverDir, 'prisma', 'saixun.db');
if (!existsSync(dbPath)) {
  console.warn('[workbuddy:start] 未找到 SQLite 库 → 执行建库与种子灌入（自愈）');
  run(['run', 'prisma:deploy'], '应用 SQLite 迁移');
  run(['run', 'prisma:seed'], '灌入主演示数据');
  run(['run', 'prisma:seed:instances'], '灌入实例项目数据');
} else {
  console.log('[workbuddy:start] 已存在 SQLite 库，跳过初始化');
}

// 平台只注入 PORT。演示站使用固定的演示账号，JWT 密钥缺失时会退化成代码里的
// 默认串；这里显式给一个演示专用值，便于识别，也避免与生产默认值混淆。
// 如需更安全：在部署时通过 startCmd 内联注入 JWT_SECRET 覆盖此值。
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'workbuddy-demo-only-secret-please-override';
  console.warn('[workbuddy:start] 未提供 JWT_SECRET，使用演示专用默认值');
}

// 关键：切到 server/ 后再加载后端，保证 uploads/ 落点与上面的 seed 一致
process.chdir(serverDir);
await import(pathToFileURL(path.join(serverDir, 'dist', 'main.js')).href);
