import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1. 演示租户（幂等）
  const tenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant' },
    update: {},
    create: { id: 'demo-tenant', name: '智造先锋队（演示）' },
  });

  // 2. 教师账号（幂等）
  const passwordHash = await bcrypt.hash('123456', 10);
  await prisma.user.upsert({
    where: { tenantId_username: { username: 'teacher', tenantId: tenant.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      username: 'teacher',
      passwordHash,
      name: '张老师',
      role: 'TEACHER',
    },
  });

  // 3. 演示赛项项目（幂等）
  const project = await prisma.project.upsert({
    where: { id: 'demo-project' },
    update: {},
    create: {
      id: 'demo-project',
      tenantId: tenant.id,
      name: 'AI应用开发赛',
      competition: 'AI应用开发赛',
      currentStage: 'POLISH',
    },
  });

  // 4. 评分维度 + 评分点（仅在缺失时写入）
  const criteriaCount = await prisma.criterion.count({ where: { projectId: project.id } });
  if (criteriaCount === 0) {
    const criteriaData = [
      { name: '功能完整性', weight: 25, points: ['需求理解与功能覆盖', '核心功能实现规范性', '功能稳定性与鲁棒性'] },
      { name: '技术路线', weight: 20, points: ['技术选型合理性', '架构设计先进性', '关键技术应用正确性'] },
      { name: '创新价值', weight: 20, points: ['创新点明确性', '方案独特性与亮点', '技术创新性'] },
      { name: '应用成效', weight: 20, points: ['应用效果与性能表现', '实际应用价值', '效益与影响力'] },
      { name: '展示表达', weight: 15, points: ['文档完整性与规范性', '展示逻辑与表达清晰度', '答辩沟通表现'] },
    ];
    for (const c of criteriaData) {
      const criterion = await prisma.criterion.create({
        data: { projectId: project.id, name: c.name, weight: c.weight },
      });
      for (const p of c.points) {
        await prisma.scorePoint.create({
          data: { criterionId: criterion.id, name: p, abilityTags: [p] },
        });
      }
    }
  }

  // 5. 演示任务（仅在缺失时写入），并关联部分评分点
  const taskCount = await prisma.task.count({ where: { projectId: project.id } });
  if (taskCount === 0) {
    const points = await prisma.scorePoint.findMany({ where: { criterion: { projectId: project.id } } });
    const byName = (n: string) => points.find((p) => p.name === n)?.id;
    const demoTasks: Array<{
      title: string;
      status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'NEEDS_FIX' | 'DONE';
      pointNames: string[];
    }> = [
      { title: '梳理赛项规程与评分标准', status: 'DONE', pointNames: ['需求理解与功能覆盖'] },
      { title: '完成核心功能原型开发', status: 'IN_PROGRESS', pointNames: ['核心功能实现规范性', '技术选型合理性'] },
      { title: '架构评审与重构', status: 'IN_REVIEW', pointNames: ['架构设计先进性'] },
      { title: '补充创新点论证材料', status: 'TODO', pointNames: ['创新点明确性', '方案独特性与亮点'] },
      { title: '性能压测与优化', status: 'NEEDS_FIX', pointNames: ['功能稳定性与鲁棒性', '应用效果与性能表现'] },
      { title: '撰写参赛文档', status: 'TODO', pointNames: ['文档完整性与规范性'] },
    ];
    for (const t of demoTasks) {
      const ids = t.pointNames.map(byName).filter(Boolean) as string[];
      await prisma.task.create({
        data: {
          projectId: project.id,
          title: t.title,
          status: t.status,
          done: t.status === 'DONE',
          scorePoints: ids.length ? { connect: ids.map((id) => ({ id })) } : undefined,
        },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log('[seed] 演示数据已就绪：tenant / teacher(123456) / AI应用开发赛 + 15 评分点 + 演示任务');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
