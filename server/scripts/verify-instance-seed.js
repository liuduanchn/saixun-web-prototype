// 实例项目示例数据校验：既有数据未被改动 + 新项目数据完整性
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const p = new PrismaClient();

// 生成前已存在的实体（来自实例项目资料生成之前的快照）
const PRE_EXISTING_TENANTS = ['demo-tenant', 'innovation-tenant', 'info-tenant', 'cmtbsa2yj0003k2lkgleouzbo'];
const PRE_EXISTING_PROJECTS = [
  'demo-project',
  'robot-project',
  'vehicle-project',
  'software-test-project',
  'bigdata-project',
];
const NEW_PROJECTS = [
  'pearl-project',
  'sidaopu-project',
  'mingzhu-project',
  'zhihuaxing-project',
  'yihuoji-project',
  'sheyun-project',
];

(async () => {
  console.log('===== 一、既有数据是否保持原样 =====');
  for (const id of PRE_EXISTING_TENANTS) {
    const t = await p.tenant.findUnique({ where: { id } });
    console.log(t ? `  OK  团队 ${id} → ${t.name}` : `  !!  团队 ${id} 丢失`);
  }
  for (const id of PRE_EXISTING_PROJECTS) {
    const pr = await p.project.findUnique({
      where: { id },
      include: { _count: { select: { criteria: true, tasks: true, works: true, defenseSessions: true, resources: true } } },
    });
    if (!pr) {
      console.log(`  !!  赛项 ${id} 丢失`);
      continue;
    }
    const d = await p.diagnosis.count({ where: { workVersion: { projectId: id } } });
    console.log(
      `  OK  ${pr.name.padEnd(18)} c=${pr._count.criteria} t=${pr._count.tasks} w=${pr._count.works} d=${d} 答辩=${pr._count.defenseSessions} r=${pr._count.resources}`,
    );
  }
  const PRE_EXISTING_USERNAMES = [
    'teacher',
    'teacher2',
    'teacher3',
    'teacher4',
    'teacher5',
    'student1',
    'student2',
    'student3',
    'student4',
    'student5',
    'student6',
    'student7',
    'student8',
    'student9',
  ];
  const preUsers = await p.user.findMany({
    where: { username: { in: PRE_EXISTING_USERNAMES } },
    select: { username: true, name: true, tenantId: true, activeTenantId: true, role: true },
    orderBy: { username: 'asc' },
  });
  console.log(`  OK  既有账号数：${preUsers.length}/${PRE_EXISTING_USERNAMES.length}`);
  for (const u of preUsers) {
    console.log(`        ${u.username} | ${u.name} | ${u.role} | 主团队=${u.tenantId} | 活跃=${u.activeTenantId}`);
  }

  console.log('\n===== 二、新增项目数据完整性 =====');
  const header = '项目'.padEnd(30) + '阶段'.padEnd(11) + '维度'.padEnd(5) + '评分点'.padEnd(7) + '任务'.padEnd(5) + '作品'.padEnd(5) + '诊断'.padEnd(5) + '答辩'.padEnd(5) + '资源'.padEnd(5) + '案例';
  console.log(header);
  for (const id of NEW_PROJECTS) {
    const pr = await p.project.findUnique({ where: { id } });
    if (!pr) {
      console.log(`  !! ${id} 缺失`);
      continue;
    }
    const criteria = await p.criterion.findMany({ where: { projectId: id }, include: { scorePoints: true } });
    const points = criteria.reduce((n, c) => n + c.scorePoints.length, 0);
    const tasks = await p.task.count({ where: { projectId: id } });
    const works = await p.workVersion.count({ where: { projectId: id } });
    const diags = await p.diagnosis.count({ where: { workVersion: { projectId: id } } });
    const defs = await p.defenseSession.count({ where: { projectId: id } });
    const res = await p.resource.count({ where: { projectId: id } });
    const cases = await p.caseLibrary.count({ where: { tenantId: pr.tenantId } });
    const name = pr.name.length > 26 ? pr.name.slice(0, 26) + '..' : pr.name;
    console.log(
      name.padEnd(30) +
        String(pr.currentStage).padEnd(11) +
        String(criteria.length).padEnd(5) +
        String(points).padEnd(7) +
        String(tasks).padEnd(5) +
        String(works).padEnd(5) +
        String(diags).padEnd(5) +
        String(defs).padEnd(5) +
        String(res).padEnd(5) +
        String(cases),
    );
  }

  console.log('\n===== 三、诊断严重度与复核状态 =====');
  for (const id of NEW_PROJECTS) {
    const rows = await p.diagnosis.findMany({
      where: { workVersion: { projectId: id } },
      select: { severity: true, status: true },
    });
    const sev = rows.reduce((m, r) => ((m[r.severity] = (m[r.severity] || 0) + 1), m), {});
    const conf = rows.filter((r) => r.status === 'CONFIRMED').length;
    console.log(`  ${id.padEnd(22)} ${JSON.stringify(sev)}  已复核=${conf}`);
  }

  console.log('\n===== 四、作品正文与落盘文件 =====');
  const works = await p.workVersion.findMany({
    where: { projectId: { in: NEW_PROJECTS } },
    select: { fileRef: true, content: true, version: true, projectId: true },
    orderBy: [{ projectId: 'asc' }, { version: 'asc' }],
  });
  const fs = require('fs');
  const path = require('path');
  for (const w of works) {
    const full = path.join(process.cwd(), 'uploads', w.fileRef);
    const diskOK = fs.existsSync(full);
    const diskSize = diskOK ? fs.statSync(full).size : 0;
    console.log(
      `  ${diskOK ? 'OK' : '!!'} ${w.fileRef}  V${w.version}  content=${(w.content || '').length}字  落盘=${diskSize}字节`,
    );
  }

  console.log('\n===== 五、团队与成员 =====');
  for (const id of ['pearl-tenant', 'sidaopu-tenant', 'mingzhu-tenant', 'zhihuaxing-tenant', 'yihuoji-tenant', 'sheyun-tenant']) {
    const t = await p.tenant.findUnique({
      where: { id },
      include: { members: { include: { user: { select: { name: true, role: true } } } }, projects: true },
    });
    const names = t.members.map((m) => `${m.user.name}(${m.role})`).join('、');
    console.log(`  ${t.name}｜项目 ${t.projects.length} 个｜成员 ${t.members.length} 人：${names}`);
  }

  console.log('\n===== 六、teacher 可切换团队 =====');
  const teacher = await p.user.findFirst({ where: { username: 'teacher' }, orderBy: { createdAt: 'asc' } });
  const ms = await p.membership.findMany({ where: { userId: teacher.id }, include: { tenant: true } });
  console.log(`  teacher(${teacher.name}) 当前活跃团队=${teacher.activeTenantId}`);
  console.log(`  可切换团队 ${ms.length} 个：${ms.map((m) => `${m.tenant.name}[${m.role}]`).join(' → ')}`);

  console.log('\n===== 七、全库总量 =====');
  console.log({
    tenant: await p.tenant.count(),
    user: await p.user.count(),
    membership: await p.membership.count(),
    project: await p.project.count(),
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
  });
})().then(() => p.$disconnect()).catch((e) => { console.error('ERR', e.message); process.exit(1); });
