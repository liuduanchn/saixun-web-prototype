// 只读数据库备份：从 .env 的 DATABASE_URL 解析连接信息，调用 pg_dump 落地 SQL
// 用法：node scripts/db-backup.js [备注名]
const { spawnSync } = require('child_process');
const { mkdirSync } = require('fs');
const { join } = require('path');
require('dotenv').config();

const url = process.env.DATABASE_URL || '';
const m = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
if (!m) {
  console.error('无法解析 DATABASE_URL');
  process.exit(1);
}
const [, user, password, host, port, db] = m;
const tag = process.argv[2] || 'manual';
const dir = join(process.cwd(), '.dbbackup');
mkdirSync(dir, { recursive: true });
const out = join(dir, `saixun-${tag}.sql`);

const pgDump = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe';
const r = spawnSync(pgDump, ['-h', host, '-p', port, '-U', user, '-d', db, '-f', out], {
  env: { ...process.env, PGPASSWORD: password },
  encoding: 'utf8',
});
if (r.error) {
  console.error('pg_dump 启动失败：', r.error.message);
  process.exit(1);
}
if (r.status !== 0) {
  console.error('pg_dump 失败：', r.stderr);
  process.exit(r.status || 1);
}
console.log(`备份完成：${out}`);
