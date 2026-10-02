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
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'server');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Windows 上必须 shell: true：Node 18.20+/20.12+/22 起，spawn 一个 .cmd/.bat
// 而不经过 shell 会直接抛 EINVAL（CVE-2024-27980 的修复引入的行为）。
// 这里传给 npm 的都是固定短参数（无空格、无用户输入），走 shell 无注入风险。
const SPAWN_OPTS = { shell: true };

/**
 * 依赖安装缓存戳。
 * 平台会**复用已记录的沙箱**，所以第二次发布会面对一个已经装好 node_modules 的目录。
 * 实测在这种状态下重跑整套 `npm ci` 会失败（首次部署则成功），因此：
 *   · 锁文件与 package.json 未变、且两处 node_modules 都在 → 跳过安装；
 *   · 否则照常安装，并在成功后写入戳。
 * 这既规避了上面的失败，也让后续重新发布快很多。
 */
const STAMP = path.join(root, '.workbuddy-install-stamp');
function depsFingerprint() {
  const files = [
    'package.json',
    'package-lock.json',
    'server/package.json',
    'server/package-lock.json',
  ];
  const h = createHash('sha256');
  for (const f of files) {
    const p = path.join(root, f);
    h.update(f);
    h.update(existsSync(p) ? readFileSync(p) : '');
  }
  return h.digest('hex');
}
function depsReady() {
  if (!existsSync(path.join(root, 'node_modules', '.package-lock.json'))) return false;
  if (!existsSync(path.join(serverDir, 'node_modules', '.package-lock.json'))) return false;
  return existsSync(STAMP) && readFileSync(STAMP, 'utf8').trim() === depsFingerprint();
}

function run(cwd, args, label) {
  console.log(`\n[workbuddy:install] ▸ ${label}\n[workbuddy:install]   cwd=${cwd}\n[workbuddy:install]   npm ${args.join(' ')}`);
  const r = spawnSync(NPM, args, { cwd, stdio: 'inherit', env: process.env, ...SPAWN_OPTS });
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
  const r = spawnSync(NPM, args, { cwd, stdio: 'inherit', env: process.env, ...SPAWN_OPTS });
  return !r.error && r.status === 0;
}

/**
 * 安装依赖。
 * 策略（按沙箱实际状态选，实测踩过坑）：
 *   · node_modules 不存在（首次部署）→ `npm ci`：按锁文件精确安装，最快最稳；
 *   · node_modules 已存在（平台复用沙箱后再发布）→ `npm install`：**就地调和**，
 *     不整棵删除。因为 `npm ci` 会先清空 node_modules，实测在复用的沙箱里这一步
 *     会失败（首次部署同一命令却成功）。
 * 统一带 --loglevel=error：平台回传的错误信息会被截断，npm 的 deprecation 警告
 * 会把真正的失败行挤掉，必须压低噪音。
 */
const NPM_FLAGS = ['--include=dev', '--no-audit', '--no-fund', '--loglevel=error'];

function installDeps(cwd, label) {
  if (depsReady()) {
    console.log(`\n[workbuddy:install] ▸ ${label}\n[workbuddy:install]   依赖已就绪且锁文件未变 → 跳过安装（复用沙箱）`);
    return;
  }
  const hasModules = existsSync(path.join(cwd, 'node_modules'));
  if (hasModules) {
    if (runSoft(cwd, ['install', ...NPM_FLAGS], `${label}（npm install 就地调和）`)) return;
    console.warn('[workbuddy:install]   npm install 失败，退回 npm ci');
    run(cwd, ['ci', ...NPM_FLAGS], `${label}（npm ci 回退）`);
    return;
  }
  if (runSoft(cwd, ['ci', ...NPM_FLAGS], `${label}（npm ci）`)) return;
  console.warn('[workbuddy:install]   npm ci 失败，退回 npm install');
  run(cwd, ['install', ...NPM_FLAGS], `${label}（npm install 回退）`);
}

console.log('[workbuddy:install] Node ' + process.version);
installDeps(root, '安装前端依赖');
installDeps(serverDir, '安装后端依赖（含 devDependencies，构建必需）');
writeFileSync(STAMP, depsFingerprint());
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
