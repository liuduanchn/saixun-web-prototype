// 临时：查看当前数据库已有实例数据快照（只读）
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const p = new PrismaClient();
(async () => {
  const tenants = await p.tenant.findMany({ include: { _count: { select: { projects: true, members: true } } } });
  console.log('=== TENANTS ===');
  for (const t of tenants) console.log(`${t.id} | ${t.name} | projects=${t._count.projects} members=${t._count.members}`);
  const projects = await p.project.findMany({ include: { _count: { select: { criteria: true, tasks: true, works: true, defenseSessions: true, resources: true } } } });
  console.log('=== PROJECTS ===');
  for (const x of projects) console.log(`${x.id} | ${x.name} | ${x.tenantId} | stage=${x.currentStage} | c=${x._count.criteria} t=${x._count.tasks} w=${x._count.works} d=${x._count.defenseSessions} r=${x._count.resources}`);
  console.log('=== USERS ===');
  for (const u of await p.user.findMany({ select: { username: true, name: true, role: true, tenantId: true } })) console.log(`${u.username} | ${u.name} | ${u.role} | ${u.tenantId}`);
  console.log('=== COUNTS ===');
  console.log({
    criterion: await p.criterion.count(),
    scorePoint: await p.scorePoint.count(),
    task: await p.task.count(),
    workVersion: await p.workVersion.count(),
    diagnosis: await p.diagnosis.count(),
    defenseSession: await p.defenseSession.count(),
    resource: await p.resource.count(),
    caseLibrary: await p.caseLibrary.count(),
    learningEvent: await p.learningEvent.count(),
    notification: await p.notification.count(),
    membership: await p.membership.count(),
  });
})().then(() => p.$disconnect()).catch((e) => { console.error('ERR', e.message); process.exit(1); });
