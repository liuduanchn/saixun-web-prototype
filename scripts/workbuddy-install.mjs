#!/usr/bin/env node
/**
 * WorkBuddy 构建入口（workbuddyDeploy 分支）
 * ------------------------------------------------------------------
 * 发布平台的 installCmd 只是一个 shell 字符串、且**没有独立的 buildCmd**，
 * 因此把「装依赖 → 生成 Client → 迁移 → 编译后端 → 灌种子 → 构建前端」全部
 * 收敛到这一个 Node 脚本里，平台侧只需要 `npm run workbuddy:install`。
 *
 * 关键约定（不要改）：
 *   1. `--include=dev` 必须保留。server 的 prisma / nest CLI / ts-node 全在
 *      devDependencies，若平台设了 NODE_ENV=production，默认 npm ci 会跳过它们，
 *      后续步骤会立刻失败。
 *   2. 两个 seed **必须按顺序**执行：seed-instance-projects.ts 依赖 seed.ts 建好的
 *      既有 teacher 账号，顺序颠倒会提前中止。
 *   3. 所有后端相关步骤都以 server/ 为 cwd 执行，前端构建以仓库根为 cwd 执行。
 *      这样 seed 写入的 uploads/ 与后端运行时读取的 uploads/ 才是同一个目录
 *      （两者都用 process.cwd() 推导）。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'server');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(cwd, args, label) {
  console.log(`\n[workbuddy:install] ▸ ${label}\n[workbuddy:install]   cwd=${cwd}\n[workbuddy:install]   npm ${args.join(' ')}`);
  const r = spawnSync(NPM, args, { cwd, stdio: 'inherit', env: process.env, shell: false });
  if (r.error) {
    console.error(`[workbuddy:install] ✗ 无法启动 npm：${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`[workbuddy:install] ✗ 步骤失败：npm ${args.join(' ')}（退出码 ${r.status}）`);
    process.exit(r.status ?? 1);
  }
  return true;
}

/** 同 run，但失败返回 false 而不退出，供允许降级的步骤使用。 */
function runSoft(cwd, args, label) {
  console.log(`\n[workbuddy:install] ▸ ${label}\n[workbuddy:install]   npm ${args.join(' ')}`);
  const r = spawnSync(NPM, args, { cwd, stdio: 'inherit', env: process.env, shell: false });
  return !r.error && r.status === 0;
}

console.log('[workbuddy:install] Node ' + process.version);
run(root, ['ci', '--include=dev'], '安装前端依赖');
run(serverDir, ['ci', '--include=dev'], '安装后端依赖（含 devDependencies，构建必需）');
run(serverDir, ['run', 'prisma:generate'], '生成 Prisma Client');
run(serverDir, ['run', 'prisma:deploy'], '应用 SQLite 迁移');

// nest build 的 deleteOutDir 会被本机 safe-delete 钩子拦截（沙箱内无此钩子，正常）。
// 失败时回退到等价的 tsc 编译；两者产物路径一致，都是 dist/main.js
// （依赖 tsconfig.build.json 已把 prisma 目录排除出编译集）。
if (!runSoft(serverDir, ['run', 'build'], '编译后端 (nest build)')) {
  console.warn('[workbuddy:install] nest build 失败，回退到 tsc 编译');
  // 必须带 --incremental false：tsconfig 开了 incremental，
  // 否则命中年内缓存时会「报告成功但跳过产出」，dist 里还是旧代码
  run(
    serverDir,
    ['exec', '--', 'tsc', '-p', 'tsconfig.build.json', '--incremental', 'false'],
    '编译后端 (tsc 回退)',
  );
}

run(serverDir, ['run', 'prisma:seed'], '灌入主演示数据（3 团队 / 5 赛项）');
run(serverDir, ['run', 'prisma:seed:instances'], '灌入实例项目数据（6 团队 / 27 账号）');
run(root, ['run', 'build:workbuddy'], '构建前端静态产物 (vite build --mode workbuddy)');

console.log('\n[workbuddy:install] ✓ 全部完成');
