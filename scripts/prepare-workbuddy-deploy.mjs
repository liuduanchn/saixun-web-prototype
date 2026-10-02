#!/usr/bin/env node
/**
 * WorkBuddy 上传目录准备（workbuddyDeploy 分支）
 * ------------------------------------------------------------------
 * 为什么需要这个脚本：
 *   1. **规避平台前置检查**。WorkBuddy 的发布工具会扫描上传目录，命中以下任一
 *      条件即直接拒发：`.env*` 里的连接串指向 localhost、`prisma/schema.prisma`
 *      的 provider 不是 sqlite、依赖清单里出现 pg/mysql2/ioredis 等驱动、
 *      docker-compose 含外部服务。本仓库工作区里存在 `server/.env`（本地 Postgres
 *      串）与 `.env.local`，原样上传必然被拒 —— 用 `git archive` 导出可天然免疫
 *      （这些文件都在 .gitignore 里）。
 *   2. **剔除与部署无关的体积**。仓库里有十余张大 PNG（含 8MB 级），
 *      上传它们只会拖慢构建。
 *
 * 实现要点：用 `git archive` 导出到内存，再交给 `tar --exclude` 解包，
 * **全程不做任何删除操作**（本机装有拦截删除的 safe-delete 钩子）。
 *
 * 用法：
 *   node scripts/prepare-workbuddy-deploy.mjs [输出目录] [--from-tar <归档路径>]
 *   默认输出：<仓库上一级>/workbuddyDeploy/payload
 *
 * 注意：某些沙箱环境会拦截 Node 子进程调用 git（报 spawnSync EBUSY）。
 * 此时先用 shell 生成归档，再用 --from-tar 让本脚本只做解包 + 自检：
 *   git archive --format=tar HEAD -o <归档路径>
 *   node scripts/prepare-workbuddy-deploy.mjs <输出目录> --from-tar <归档路径>
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const fromTarIndex = args.indexOf('--from-tar');
const fromTar = fromTarIndex >= 0 ? path.resolve(args[fromTarIndex + 1]) : null;
const positional = args.filter(
  (a, i) => !a.startsWith('--') && i !== fromTarIndex + 1,
);
const outDir = positional[0]
  ? path.resolve(positional[0])
  : path.resolve(root, '..', 'workbuddyDeploy', 'payload');

/** 不进入上传目录的路径（tar 的 --exclude 语义，相对仓库根） */
const EXCLUDES = [
  // 会命中前置检查的文件
  '.env.example',
  // 为另一条托管路径（OpenAI Sites / Workers 风格）准备的遗留产物，与本平台无关，
  // 其中的 hosting.json 还带有 d1/r2 绑定字段，避免被前置检查误读
  '.openai',
  'worker',
  // 旧 Postgres 迁移：SQLite 部署完全用不到，且含 Postgres 专有语法
  'server/prisma/_pg-migrations',
  // 旧部署手册：描述的是 Railway + Vercel 那条路径，且正文含 Postgres 连接串示例。
  // WorkBuddy 部署说明见仓库根 WORKBUDDY_DEPLOY.md
  'DEPLOYMENT.md',
  // 体积优化：仓库中的大图（README 截图、设计稿、实现过程图等）
  '*.png',
  '*.PNG',
  'docs/readme-assets',
];

/** 与 Bash 侧 `git archive … | tar -x --exclude=…` 保持一致的排除清单（打印给调用方） */
if (args.includes('--print-excludes')) {
  console.log(EXCLUDES.join(' '));
  process.exit(0);
}

console.log(`[prepare] 仓库：${root}`);
console.log(`[prepare] 输出：${outDir}`);

if (checkOnly) {
  console.log('[prepare] --check-only：跳过归档与解包，仅执行自检');
} else if (existsSync(outDir) && readdirSync(outDir).length > 0) {
  console.error(
    `[prepare] ✗ 输出目录已存在且非空：${outDir}\n` +
      `[prepare]   请先手工清空，或换一个输出目录（本脚本刻意不做删除操作）。`,
  );
  process.exit(1);
} else {
  mkdirSync(outDir, { recursive: true });
}

// 1) 取得源码归档：优先用调用方给的 tar，否则自己调 git archive
let archiveBuf = null;
if (!checkOnly) {
  if (fromTar) {
    if (!existsSync(fromTar)) {
      console.error(`[prepare] ✗ 指定的归档不存在：${fromTar}`);
      process.exit(1);
    }
    archiveBuf = readFileSync(fromTar);
    console.log(
      `[prepare] 使用外部归档 ${fromTar}（${(archiveBuf.length / 1024 / 1024).toFixed(1)} MB）`,
    );
  } else {
    const archive = spawnSync('git', ['archive', '--format=tar', 'HEAD'], {
      cwd: root,
      maxBuffer: 512 * 1024 * 1024,
    });
    if (archive.status !== 0 || !archive.stdout?.length) {
      console.error(
        '[prepare] ✗ git archive 失败：' +
          (archive.error?.message ?? String(archive.stderr).slice(0, 300)),
      );
      console.error('[prepare]   若报 spawnSync EBUSY（沙箱拦截 Node 调 git/tar），请改走两步：');
      console.error('[prepare]     git archive --format=tar HEAD | tar -x -C <输出目录> --exclude=…');
      console.error(`[prepare]     node scripts/prepare-workbuddy-deploy.mjs <输出目录> --check-only`);
      process.exit(1);
    }
    archiveBuf = archive.stdout;
    console.log(`[prepare] git archive 产物 ${(archiveBuf.length / 1024 / 1024).toFixed(1)} MB`);
  }
}

// 2) tar 解包时按 --exclude 过滤（避免解包后再删除）
if (!checkOnly && archiveBuf) {
  const tarArgs = ['-x', '-C', outDir];
  for (const pattern of EXCLUDES) tarArgs.push(`--exclude=${pattern}`);
  const untar = spawnSync('tar', tarArgs, {
    input: archiveBuf,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (untar.status !== 0 || untar.error) {
    console.error(
      '[prepare] ✗ tar 解包失败：' +
        (untar.error?.message ?? String(untar.stderr).slice(0, 300)),
    );
    console.error('[prepare]   若报 spawnSync EBUSY，请在 shell 里直接解包后再用 --check-only 自检：');
    console.error(
      `[prepare]     git archive --format=tar HEAD | tar -x -C "${outDir}" ${EXCLUDES.map((p) => `--exclude='${p}'`).join(' ')}`,
    );
    process.exit(1);
  }
}

// 3) 自检：按平台**实际的前置检查口径**复核，有泄漏就直接判失败
//    平台规则原文：命中以下任一即拒发 ——
//      · `.env*` 里的连接串指向 localhost 或 compose 服务名
//      · prisma/schema.prisma 的 provider 不是 sqlite
//      · docker-compose.yml 含外部服务容器
//      · 依赖清单里出现 pg / mysql2 / mongoose / ioredis / psycopg2 等驱动
//    这里按同样口径检查（而不是对任意文档里的 “postgresql://” 示例一刀切），
//    并对所有文件额外拦一道「出现 .env 类文件」的存在性检查。
const problems = [];
const MANIFESTS = new Set(['package.json', 'package-lock.json', 'requirements.txt', 'go.mod', 'pom.xml']);
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    const rel = path.relative(outDir, full).replace(/\\/g, '/');
    const base = entry.name;

    // 存在性检查：除 .env.workbuddy（只含相对路径与演示值）外不允许有 .env 类文件
    if (/(^|\/)\.env(\.|$)/.test(rel) && !rel.endsWith('.env.workbuddy')) {
      problems.push(`发现 .env 类文件：${rel}`);
    }

    // 内容检查：只对可能声明外部依赖的文件做，避免文档示例造成误报
    const isEnvLike = /(^|\/)\.env/.test(rel);
    const isCompose = /(^|\/)docker-compose\.ya?ml$/.test(rel);
    const isManifest = MANIFESTS.has(base) || /(^|\/)server\/package\.json$/.test(rel);
    const isPrismaSchema = rel.endsWith('prisma/schema.prisma');
    if (!isEnvLike && !isCompose && !isManifest && !isPrismaSchema) continue;

    const text = readFileSync(full, 'utf8');
    if (isEnvLike && /(postgres|mysql|mongodb|redis):\/\/(localhost|127\.0\.0\.1)/i.test(text)) {
      problems.push(`.env 类文件含指向 localhost 的连接串：${rel}`);
    }
    if (isCompose && /(postgres|mysql|mongo|redis|rabbitmq|kafka)/i.test(text)) {
      problems.push(`compose 文件含外部服务容器：${rel}`);
    }
    if (isManifest && /"(pg|mysql2|mongoose|ioredis|@prisma\/adapter-pg)"\s*:/.test(text)) {
      problems.push(`依赖清单含外部数据库驱动：${rel}`);
    }
    if (isPrismaSchema && !/provider\s*=\s*"sqlite"/.test(text)) {
      problems.push(`prisma provider 不是 sqlite：${rel}`);
    }
  }
}
walk(outDir);

// 必须存在的东西
for (const required of [
  'package.json',
  'vite.config.mjs',
  '.env.workbuddy',
  'scripts/workbuddy-install.mjs',
  'scripts/workbuddy-start.mjs',
  'server/package.json',
  'server/prisma/schema.prisma',
  'src/main.jsx',
]) {
  if (!existsSync(path.join(outDir, required))) problems.push(`缺少必要文件：${required}`);
}

// provider 必须是 sqlite
const schema = readFileSync(path.join(outDir, 'server/prisma/schema.prisma'), 'utf8');
if (!/provider\s*=\s*"sqlite"/.test(schema)) {
  problems.push('server/prisma/schema.prisma 的 provider 不是 sqlite');
}

function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
}
const sizeMB = dirSize(outDir) / 1024 / 1024;

console.log(`[prepare] 上传目录体积：${sizeMB.toFixed(1)} MB`);
if (problems.length) {
  console.error('[prepare] ✗ 自检未通过：');
  for (const p of problems) console.error('   - ' + p);
  process.exit(1);
}
console.log('[prepare] ✓ 自检通过：无 .env 泄漏、无 Postgres 连接串、provider=sqlite、必要文件齐全');
console.log(`[prepare] 上传目录：${outDir}`);
