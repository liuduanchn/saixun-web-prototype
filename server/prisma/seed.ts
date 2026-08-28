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
    // 每次 seed 都确保活跃团队回到本租户（演示数据一致性，避免历史手动切换残留）
    update: { activeTenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      activeTenantId: tenant.id,
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

  // 6. 学习记录与通知（仅在该教师用户无数据时写入，幂等）
  const teacherUser = await prisma.user.findUnique({
    where: { tenantId_username: { tenantId: tenant.id, username: 'teacher' } },
  });
  if (teacherUser) {
    const eventCount = await prisma.learningEvent.count({ where: { userId: teacherUser.id } });
    if (eventCount === 0) {
      const base = Date.now();
      const day = 86400000;
      const events: Array<{
        type: string;
        payload: Record<string, unknown>;
        ago: number;
      }> = [
        { type: 'CRITERIA_PARSED', payload: { title: '赛项解析：AI应用开发赛评分标准', points: 15 }, ago: 12 },
        { type: 'TASK_CREATED', payload: { title: '梳理赛项规程与评分标准', status: 'DONE' }, ago: 10 },
        { type: 'WORK_UPLOADED', payload: { title: '作品说明书 V1', version: 1 }, ago: 8 },
        { type: 'DIAGNOSIS_RUN', payload: { title: '作品诊断：V1', findings: 27 }, ago: 7 },
        { type: 'TASK_CREATED', payload: { title: '性能压测与优化', status: 'NEEDS_FIX' }, ago: 5 },
        { type: 'DEFENSE_RUN', payload: { title: '模拟答辩第 1 轮', rounds: 3 }, ago: 3 },
        { type: 'REVIEW_GENERATED', payload: { title: '赛后复盘报告', coverage: 33 }, ago: 1 },
      ];
      for (const e of events) {
        await prisma.learningEvent.create({
          data: {
            userId: teacherUser.id,
            type: e.type,
            payload: e.payload as any,
            createdAt: new Date(base - e.ago * day),
          },
        });
      }
    }

    const notifCount = await prisma.notification.count({ where: { userId: teacherUser.id } });
    if (notifCount === 0) {
      await prisma.notification.createMany({
        data: [
          {
            userId: teacherUser.id,
            category: '作品诊断',
            title: '作品 V1 诊断完成',
            detail: '共识别 27 条问题发现，其中 17 条高风险，建议优先处理。',
            targetNav: '作品诊断中心',
            read: false,
          },
          {
            userId: teacherUser.id,
            category: '任务复核',
            title: '修改任务待复核',
            detail: '「性能压测与优化」已提交，等待教师复核与闭环。',
            targetNav: '训练任务中心',
            read: false,
          },
          {
            userId: teacherUser.id,
            category: '模拟答辩',
            title: '答辩反馈已生成',
            detail: '第 3 轮模拟答辩完成，表达维度评分 88。',
            targetNav: '模拟答辩室',
            read: true,
          },
        ],
      });
    }
  }

  // 7. 多租户演示数据：第二个团队 + 教师跨团队成员资格
  // 7.1 第二团队（创新实验队）
  const tenant2 = await prisma.tenant.upsert({
    where: { id: 'innovation-tenant' },
    update: {},
    create: { id: 'innovation-tenant', name: '创新实验队' },
  });

  // 7.2 第二团队的项目与任务
  const project2 = await prisma.project.upsert({
    where: { id: 'robot-project' },
    update: {},
    create: {
      id: 'robot-project',
      tenantId: tenant2.id,
      name: '智能机器人赛',
      competition: '智能机器人赛',
      currentStage: 'PROTOTYPE',
    },
  });
  const task2Count = await prisma.task.count({ where: { projectId: project2.id } });
  if (task2Count === 0) {
    await prisma.task.createMany({
      data: [
        { projectId: project2.id, title: '机器人机械结构设计', status: 'DONE', done: true },
        { projectId: project2.id, title: '视觉识别算法开发', status: 'IN_PROGRESS' },
        { projectId: project2.id, title: '运动控制联调', status: 'TODO' },
      ],
    });
  }

  // 7.3 第二教师 teacher2（归属第二团队）
  const teacher2 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'teacher2', tenantId: tenant2.id } },
    update: {},
    create: {
      tenantId: tenant2.id,
      activeTenantId: tenant2.id,
      username: 'teacher2',
      passwordHash,
      name: '李老师',
      role: 'TEACHER',
    },
  });

  // 7.4 成员资格（幂等）：teacher 同时属于两个团队；teacher2 同时属于两个团队
  const ensureMembership = async (userId: string, tenantIdValue: string, role: 'OWNER' | 'TEACHER' | 'STUDENT' | 'MEMBER') => {
    await prisma.membership.upsert({
      where: { userId_tenantId: { userId, tenantId: tenantIdValue } },
      update: { role },
      create: { userId, tenantId: tenantIdValue, role },
    });
  };
  if (teacherUser) {
    await ensureMembership(teacherUser.id, tenant.id, 'OWNER');
    await ensureMembership(teacherUser.id, tenant2.id, 'MEMBER');
  }
  await ensureMembership(teacher2.id, tenant2.id, 'OWNER');
  await ensureMembership(teacher2.id, tenant.id, 'MEMBER');

  // 7.5 两个团队各加入一名学生（演示「添加学生成员」），密码均为 123456
  const student1 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'student1', tenantId: tenant.id } },
    update: { name: '陈晨' },
    create: {
      tenantId: tenant.id,
      activeTenantId: tenant.id,
      username: 'student1',
      passwordHash,
      name: '陈晨',
      role: 'STUDENT',
    },
  });
  const student2 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'student2', tenantId: tenant2.id } },
    update: { name: '赵磊' },
    create: {
      tenantId: tenant2.id,
      activeTenantId: tenant2.id,
      username: 'student2',
      passwordHash,
      name: '赵磊',
      role: 'STUDENT',
    },
  });
  await ensureMembership(student1.id, tenant.id, 'STUDENT');
  await ensureMembership(student2.id, tenant2.id, 'STUDENT');

  // 7.6 两个团队各再补充两名学生（演示多学生视角）
  const student3 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'student3', tenantId: tenant.id } },
    update: { name: '刘洋' },
    create: { tenantId: tenant.id, activeTenantId: tenant.id, username: 'student3', passwordHash, name: '刘洋', role: 'STUDENT' },
  });
  const student4 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'student4', tenantId: tenant.id } },
    update: { name: '张宇' },
    create: { tenantId: tenant.id, activeTenantId: tenant.id, username: 'student4', passwordHash, name: '张宇', role: 'STUDENT' },
  });
  const student5 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'student5', tenantId: tenant2.id } },
    update: { name: '钱思源' },
    create: { tenantId: tenant2.id, activeTenantId: tenant2.id, username: 'student5', passwordHash, name: '钱思源', role: 'STUDENT' },
  });
  const student6 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'student6', tenantId: tenant2.id } },
    update: { name: '吴雨桐' },
    create: { tenantId: tenant2.id, activeTenantId: tenant2.id, username: 'student6', passwordHash, name: '吴雨桐', role: 'STUDENT' },
  });
  await ensureMembership(student3.id, tenant.id, 'STUDENT');
  await ensureMembership(student4.id, tenant.id, 'STUDENT');
  await ensureMembership(student5.id, tenant2.id, 'STUDENT');
  await ensureMembership(student6.id, tenant2.id, 'STUDENT');

  // 7.7 第二套完整赛事演示数据（创新实验队：智能网联汽车赛，含评分维度/评分点/任务）
  const project3 = await prisma.project.upsert({
    where: { id: 'vehicle-project' },
    update: {},
    create: {
      id: 'vehicle-project',
      tenantId: tenant2.id,
      name: '智能网联汽车赛',
      competition: '智能网联汽车赛',
      currentStage: 'POLISH',
    },
  });
  const criteria3Count = await prisma.criterion.count({ where: { projectId: project3.id } });
  if (criteria3Count === 0) {
    const criteriaData3 = [
      { name: '功能完整性', weight: 25, points: ['需求理解与功能覆盖', '核心功能实现规范性', '功能稳定性与鲁棒性'] },
      { name: '技术路线', weight: 20, points: ['技术选型合理性', '架构设计先进性', '车路协同技术应用正确性'] },
      { name: '创新价值', weight: 20, points: ['创新点明确性', '方案独特性与亮点', '技术创新性'] },
      { name: '应用成效', weight: 20, points: ['应用效果与性能表现', '实际场景应用价值', '效益与影响力'] },
      { name: '展示表达', weight: 15, points: ['文档完整性与规范性', '展示逻辑与表达清晰度', '答辩沟通表现'] },
    ];
    for (const c of criteriaData3) {
      const criterion = await prisma.criterion.create({
        data: { projectId: project3.id, name: c.name, weight: c.weight },
      });
      for (const p of c.points) {
        await prisma.scorePoint.create({
          data: { criterionId: criterion.id, name: p, abilityTags: [p] },
        });
      }
    }
  }
  const task3Count = await prisma.task.count({ where: { projectId: project3.id } });
  if (task3Count === 0) {
    const points3 = await prisma.scorePoint.findMany({ where: { criterion: { projectId: project3.id } } });
    const byName3 = (n: string) => points3.find((p) => p.name === n)?.id;
    const project3Tasks: Array<{
      title: string;
      status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'NEEDS_FIX' | 'DONE';
      pointNames: string[];
    }> = [
      { title: '梳理赛项规程与评分标准', status: 'DONE', pointNames: ['需求理解与功能覆盖'] },
      { title: '完成感知决策核心算法', status: 'IN_PROGRESS', pointNames: ['核心功能实现规范性', '技术选型合理性'] },
      { title: '架构评审与重构', status: 'IN_REVIEW', pointNames: ['架构设计先进性'] },
      { title: '补充车路协同创新论证', status: 'TODO', pointNames: ['创新点明确性', '方案独特性与亮点'] },
      { title: '实车联调与性能优化', status: 'NEEDS_FIX', pointNames: ['功能稳定性与鲁棒性', '应用效果与性能表现'] },
      { title: '撰写参赛文档', status: 'TODO', pointNames: ['文档完整性与规范性'] },
    ];
    for (const t of project3Tasks) {
      const ids = t.pointNames.map(byName3).filter(Boolean) as string[];
      await prisma.task.create({
        data: {
          projectId: project3.id,
          title: t.title,
          status: t.status,
          done: t.status === 'DONE',
          scorePoints: ids.length ? { connect: ids.map((id) => ({ id })) } : undefined,
        },
      });
    }
  }

  // 7.8 第二套赛事的学习记录与通知（归属 teacher2，演示创新实验队完整闭环）
  const event3Count = await prisma.learningEvent.count({ where: { userId: teacher2.id } });
  if (event3Count === 0) {
    const base = Date.now();
    const day = 86400000;
    const events3: Array<{ type: string; payload: Record<string, unknown>; ago: number }> = [
      { type: 'CRITERIA_PARSED', payload: { title: '赛项解析：智能网联汽车赛评分标准', points: 15 }, ago: 12 },
      { type: 'TASK_CREATED', payload: { title: '梳理赛项规程与评分标准', status: 'DONE' }, ago: 10 },
      { type: 'WORK_UPLOADED', payload: { title: '作品说明书 V1', version: 1 }, ago: 8 },
      { type: 'DIAGNOSIS_RUN', payload: { title: '作品诊断：V1', findings: 22 }, ago: 7 },
      { type: 'TASK_CREATED', payload: { title: '实车联调与性能优化', status: 'NEEDS_FIX' }, ago: 5 },
      { type: 'DEFENSE_RUN', payload: { title: '模拟答辩第 1 轮', rounds: 3 }, ago: 3 },
      { type: 'REVIEW_GENERATED', payload: { title: '赛后复盘报告', coverage: 33 }, ago: 1 },
    ];
    for (const e of events3) {
      await prisma.learningEvent.create({
        data: { userId: teacher2.id, type: e.type, payload: e.payload as any, createdAt: new Date(base - e.ago * day) },
      });
    }
  }
  const notif3Count = await prisma.notification.count({ where: { userId: teacher2.id } });
  if (notif3Count === 0) {
    await prisma.notification.createMany({
      data: [
        {
          userId: teacher2.id,
          category: '作品诊断',
          title: '作品 V1 诊断完成',
          detail: '共识别 22 条问题发现，其中 14 条高风险，建议优先处理。',
          targetNav: '作品诊断中心',
          read: false,
        },
        {
          userId: teacher2.id,
          category: '任务复核',
          title: '修改任务待复核',
          detail: '「实车联调与性能优化」已提交，等待教师复核与闭环。',
          targetNav: '训练任务中心',
          read: false,
        },
        {
          userId: teacher2.id,
          category: '模拟答辩',
          title: '答辩反馈已生成',
          detail: '第 3 轮模拟答辩完成，表达维度评分 85。',
          targetNav: '模拟答辩室',
          read: true,
        },
      ],
    });
  }

  // 7.9 案例沉淀库（RAG 检索增强）：为 demo-tenant 注入若干示例案例，供诊断时检索借鉴
  const caseCount = await prisma.caseLibrary.count({ where: { tenantId: 'demo-tenant' } });
  if (caseCount === 0) {
    const demoCases: Array<{
      title: string;
      content: string;
      category: string;
      tags: string[];
    }> = [
      {
        title: '优秀案例：需求理解不清导致功能覆盖不足',
        content:
          '某参赛作品未充分研读赛项规程，导致评分点"需求理解与功能覆盖"严重失分。改进做法：先用思维导图拆解评分标准，将每个评分点映射为可验证的功能清单，再逐一实现并自测。',
        category: '需求与功能',
        tags: ['需求理解', '功能覆盖', '评分标准'],
      },
      {
        title: '优秀案例：核心功能实现规范性提升路径',
        content:
          '作品"核心功能实现规范性"得分偏低，常见原因是代码缺少模块边界与单元测试。规范做法：按分层架构组织代码，关键算法提供单元测试用例，并在文档中说明输入输出约束。',
        category: '实现规范',
        tags: ['核心功能', '实现规范', '单元测试'],
      },
      {
        title: '优秀案例：架构设计先进性的体现',
        content:
          '架构设计评分关注解耦与可扩展性。获奖作品普遍采用清晰的模块划分、统一接口与配置驱动，避免硬编码；并用架构图说明各模块职责与数据流，便于评审理解。',
        category: '架构设计',
        tags: ['架构设计', '解耦', '可扩展性'],
      },
      {
        title: '优秀案例：创新点的明确表达',
        content:
          '创新点不清晰是高频扣分项。应将创新落到一个具体、可演示的能力上，例如引入自研算法或跨界技术，并用对比实验说明相对通用方案的提升，避免空泛表述。',
        category: '创新点',
        tags: ['创新点', '方案独特性', '亮点'],
      },
      {
        title: '优秀案例：文档完整性与规范性的写法',
        content:
          '参赛文档须包含需求分析、设计方案、实现说明、测试验证与总结。使用统一模板、配图与表格，避免大段文字；关键结论用加粗突出，便于评审快速抓取要点。',
        category: '文档',
        tags: ['文档完整性', '规范性', '模板'],
      },
      {
        title: '优秀案例：应用效果与性能表现的佐证',
        content:
          '评分点"应用效果与性能表现"需要真实数据佐证。应提供运行截图、响应时延对比、并发测试结果，并对异常场景给出容错说明，体现功能稳定性与鲁棒性。',
        category: '性能与效果',
        tags: ['应用效果', '性能表现', '鲁棒性'],
      },
    ];
    for (const c of demoCases) {
      await prisma.caseLibrary.create({
        data: {
          tenantId: 'demo-tenant',
          projectId: project.id,
          title: c.title,
          content: c.content,
          category: c.category,
          tags: c.tags,
        },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log('[seed] 演示数据已就绪：tenant / teacher(123456) / 智造先锋队(AI应用开发赛 完整) + 创新实验队(智能机器人赛 + 智能网联汽车赛 完整) + 学习记录 + 通知 + 双团队 + 学生(demo:陈晨/刘洋/张宇, innovation:赵磊/钱思源/吴雨桐) + 案例沉淀库(RAG)');
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
