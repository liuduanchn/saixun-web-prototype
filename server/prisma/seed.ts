import 'dotenv/config';
import { PrismaClient, Severity, ResourceType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const prisma = new PrismaClient();

// 通用：为某赛项写入评分维度 + 评分点 + 任务（幂等，仅在缺失时写入）。
// 用于「适度扩充」时快速构建一套完整可演示的赛项闭环数据。
async function seedProjectWithCriteria(
  projectId: string,
  tenantId: string,
  name: string,
  competition: string,
  stage: 'UNDERSTAND' | 'DESIGN' | 'PROTOTYPE' | 'POLISH' | 'DEFENSE' | 'REVIEW',
  criteriaData: Array<{ name: string; weight: number; points: string[] }>,
  tasks: Array<{
    title: string;
    status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'NEEDS_FIX' | 'DONE';
    pointNames: string[];
  }>,
) {
  const project = await prisma.project.upsert({
    where: { id: projectId },
    update: {},
    create: { id: projectId, tenantId, name, competition, currentStage: stage },
  });
  const cCount = await prisma.criterion.count({ where: { projectId: project.id } });
  if (cCount === 0) {
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
  const tCount = await prisma.task.count({ where: { projectId: project.id } });
  if (tCount === 0) {
    const points = await prisma.scorePoint.findMany({ where: { criterion: { projectId: project.id } } });
    const byName = (n: string) => points.find((p) => p.name === n)?.id;
    for (const t of tasks) {
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
  return project;
}

// 以下为「全功能模块演示数据补齐」辅助函数，用于在既有赛项/团队上生成
// 作品版本、诊断记录、模拟答辩、资源、案例库、学生学习记录与通知，
// 保证每个侧边栏模块均有数据。
function diagnosisTemplate(pointName: string): {
  matchScore: number;
  severity: Severity;
  issues: string;
  suggestions: string;
} {
  if (pointName.includes('需求') || pointName.includes('功能覆盖')) {
    return {
      matchScore: 72,
      severity: 'MEDIUM',
      issues: '需求描述偏概括，缺少具体场景映射与优先级说明。',
      suggestions: '补充用例清单，将每项功能与评分点逐一对照。',
    };
  }
  if (pointName.includes('核心功能') || pointName.includes('实现规范')) {
    return {
      matchScore: 68,
      severity: 'MEDIUM',
      issues: '核心功能已实现，但边界条件与异常处理说明不足。',
      suggestions: '增加单元测试与关键路径说明，突出功能稳定性。',
    };
  }
  if (pointName.includes('架构') || pointName.includes('先进性')) {
    return {
      matchScore: 62,
      severity: 'HIGH',
      issues: '架构说明较抽象，模块职责划分与数据流不够清晰。',
      suggestions: '绘制分层架构图，说明各模块接口与演进路径。',
    };
  }
  if (pointName.includes('技术选型') || pointName.includes('应用正确性')) {
    return {
      matchScore: 75,
      severity: 'LOW',
      issues: '技术路线基本可行，但选型理由与替代方案对比不足。',
      suggestions: '补充选型对比表，突出技术适配性。',
    };
  }
  if (pointName.includes('创新') || pointName.includes('亮点')) {
    return {
      matchScore: 78,
      severity: 'LOW',
      issues: '创新点已提出，但缺少与常规方案的量化对比。',
      suggestions: '加入对比实验或应用成效数据，强化说服力。',
    };
  }
  if (pointName.includes('文档') || pointName.includes('规范')) {
    return {
      matchScore: 58,
      severity: 'HIGH',
      issues: '文档结构欠规范，关键结论缺少加粗与图表佐证。',
      suggestions: '使用统一模板，关键结论加粗并插入配图/表格。',
    };
  }
  if (pointName.includes('展示') || pointName.includes('答辩') || pointName.includes('表达')) {
    return {
      matchScore: 70,
      severity: 'MEDIUM',
      issues: '展示逻辑基本清晰，但时间分配与重点突出可优化。',
      suggestions: '精简背景铺垫，突出作品价值与佐证数据。',
    };
  }
  if (pointName.includes('性能') || pointName.includes('应用效果') || pointName.includes('效益')) {
    return {
      matchScore: 66,
      severity: 'MEDIUM',
      issues: '应用成效描述较笼统，缺少可量化指标。',
      suggestions: '补充测试样本、响应时延、并发结果等数据。',
    };
  }
  return {
    matchScore: 65,
    severity: 'MEDIUM',
    issues: '该评分点支撑材料不足，需进一步补充说明。',
    suggestions: `围绕「${pointName}」补充具体实现、佐证与总结。`,
  };
}

/** 为某赛项创建演示作品版本（含落盘文件，保证可下载/诊断可读取） */
async function seedWorkVersion(
  projectId: string,
  tenantId: string,
  uploaderId: string,
  fileName: string,
) {
  const existing = await prisma.workVersion.findFirst({
    where: { projectId },
    orderBy: { version: 'asc' },
  });
  if (existing) return existing;

  const fileRef = `${tenantId}/${fileName}`;
  // npm run prisma:seed 的 cwd 为 server/；若在其他目录运行请调整 uploads 路径
  const dir = join(process.cwd(), 'uploads', tenantId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, fileName),
    `# 作品说明 V1\n\n本作品为「${projectId}」赛项的演示参赛作品，用于展示赛训智舱各功能模块闭环。\n包含赛项理解、方案设计、原型实现、作品打磨与模拟答辩等阶段。\n`,
    'utf8',
  );

  return prisma.workVersion.create({
    data: { projectId, uploaderId, fileRef, version: 1 },
  });
}

/** 为某作品版本按评分点生成诊断记录（若已存在则跳过） */
async function seedDiagnoses(workVersionId: string) {
  const exists = await prisma.diagnosis.count({ where: { workVersionId } });
  if (exists > 0) return;
  const points = await prisma.scorePoint.findMany({
    where: { criterion: { project: { works: { some: { id: workVersionId } } } } },
  });
  for (const p of points) {
    const tpl = diagnosisTemplate(p.name);
    await prisma.diagnosis.create({
      data: {
        workVersionId,
        scorePointId: p.id,
        matchScore: tpl.matchScore,
        severity: tpl.severity,
        issues: tpl.issues,
        suggestions: tpl.suggestions,
        status: 'PENDING',
      },
    });
  }
}

/** 为某赛项创建一场已完成的模拟答辩会话（若已存在则跳过） */
async function seedDefenseSession(projectId: string) {
  const exists = await prisma.defenseSession.count({ where: { projectId } });
  if (exists > 0) return;
  const transcript = [
    {
      round: 1,
      role: 'judge',
      content: '请简要说明你的作品是如何理解并落实赛项需求的？',
    },
    {
      round: 1,
      role: 'student',
      content: '我们先用思维导图拆解题规，将每个评分点映射为可验证的功能清单，再按清单逐一实现并自测。',
      evaluation: { logic: 82, evidence: 76, accuracy: 80, comment: '需求理解到位，但可补充更多量化场景。' },
    },
    {
      round: 2,
      role: 'judge',
      content: '作品中核心技术实现的关键难点是什么，你是如何解决的？',
    },
    {
      round: 2,
      role: 'student',
      content: '难点在于多租户隔离与文件权限校验，我们通过租户前缀与路径解析做了严格隔离，并补充了单元测试。',
      evaluation: { logic: 85, evidence: 78, accuracy: 83, comment: '技术方案清晰，建议补充性能压测数据。' },
    },
    {
      round: 3,
      role: 'judge',
      content: '如果继续打磨，你最想改进哪一部分，为什么？',
    },
    {
      round: 3,
      role: 'student',
      content: '想进一步强化应用成效证据链，补充真实运行截图、响应时延与并发测试结果。',
      evaluation: { logic: 80, evidence: 72, accuracy: 81, comment: '改进方向明确，证据意识有提升空间。' },
    },
  ];
  const evaluations = {
    maxRounds: 3,
    rounds: [
      { round: 1, scores: { logic: 82, evidence: 76, accuracy: 80 }, comment: '需求理解到位，但可补充更多量化场景。' },
      { round: 2, scores: { logic: 85, evidence: 78, accuracy: 83 }, comment: '技术方案清晰，建议补充性能压测数据。' },
      { round: 3, scores: { logic: 80, evidence: 72, accuracy: 81 }, comment: '改进方向明确，证据意识有提升空间。' },
    ],
    overall: '整体表现良好，需求理解与技术方案较清晰；建议在应用成效证据链、边界条件说明与技术细节上继续打磨。',
    done: true,
  };
  await prisma.defenseSession.create({
    data: {
      projectId,
      round: 3,
      transcript: transcript as any,
      evaluations: evaluations as any,
    },
  });
}

/** 为某赛项创建演示资源（模板/案例/材料各 1 条；已 ≥3 条则跳过） */
async function seedResources(projectId: string, projectName: string) {
  const count = await prisma.resource.count({ where: { projectId } });
  if (count >= 3) return;
  const templates: Array<{ type: ResourceType; name: string; description: string }> = [
    {
      type: 'TEMPLATE',
      name: `${projectName}规程解读模板`,
      description: `用于快速拆解${projectName}评分标准，逐项映射训练任务与作品版本。`,
    },
    {
      type: 'CASE',
      name: `${projectName}优秀作品案例`,
      description: '历届获奖作品的亮点梳理，供本次备赛参考。',
    },
    {
      type: 'MATERIAL',
      name: `${projectName}技术参考资料`,
      description: '赛项涉及的关键技术文档、工具链与最佳实践。',
    },
  ];
  for (const t of templates) {
    await prisma.resource.create({
      data: { projectId, type: t.type, name: t.name, description: t.description },
    });
  }
}

/** 幂等批量写入案例沉淀库 */
async function seedCaseLibrary(
  tenantId: string,
  projectId: string,
  cases: Array<{ title: string; content: string; category: string; tags: string[] }>,
) {
  const count = await prisma.caseLibrary.count({ where: { tenantId } });
  if (count >= cases.length) return;
  for (const c of cases) {
    await prisma.caseLibrary.create({ data: { tenantId, projectId, title: c.title, content: c.content, category: c.category, tags: c.tags } });
  }
}

/** 为每位学生补齐学习记录，让「学习记录」模块对教师、学生均有内容 */
async function seedStudentEvents(studentId: string, projectName: string, isUploader: boolean) {
  const exists = await prisma.learningEvent.count({ where: { userId: studentId } });
  if (exists > 0) return;
  const base = Date.now();
  const day = 86400000;
  const events: Array<{ type: string; payload: Record<string, unknown>; ago: number }> = [
    { type: 'CRITERIA_PARSED', payload: { title: `赛项解析：${projectName}评分标准`, points: 15 }, ago: 14 },
    { type: 'TASK_CREATED', payload: { title: `${projectName}训练任务`, status: 'IN_PROGRESS' }, ago: 10 },
  ];
  if (isUploader) {
    events.push(
      { type: 'WORK_UPLOADED', payload: { title: `${projectName}作品 V1`, version: 1 }, ago: 7 },
      { type: 'DIAGNOSIS_RUN', payload: { title: `作品诊断：${projectName} V1`, findings: 15 }, ago: 6 },
      { type: 'DEFENSE_RUN', payload: { title: '模拟答辩第 1 轮', rounds: 3 }, ago: 3 },
    );
  }
  for (const e of events) {
    await prisma.learningEvent.create({
      data: { userId: studentId, type: e.type, payload: e.payload as any, createdAt: new Date(base - e.ago * day) },
    });
  }
}

/** 为每位学生补齐通知，让「通知」模块对学生不空 */
async function seedStudentNotifications(studentId: string, projectName: string, isUploader: boolean) {
  const exists = await prisma.notification.count({ where: { userId: studentId } });
  if (exists > 0) return;
  const data: Array<{
    userId: string;
    category: string;
    title: string;
    detail: string;
    targetNav: string;
    read: boolean;
  }> = [
    {
      userId: studentId,
      category: '训练任务',
      title: '新训练任务已分配',
      detail: `「${projectName}」训练任务已创建，请及时跟进。`,
      targetNav: '训练任务中心',
      read: false,
    },
  ];
  if (isUploader) {
    data.push({
      userId: studentId,
      category: '作品诊断',
      title: '作品 V1 诊断完成',
      detail: `「${projectName}」作品 V1 诊断已完成，请查看反馈。`,
      targetNav: '作品诊断中心',
      read: false,
    });
  }
  await prisma.notification.createMany({ data });
}

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

  // 8. 适度扩充：信息工程学院代表队（贴合金华职业技术大学首届教学智能体大赛真实场景）
  //    给「团队 / 人员 / 赛项」三类核心实体补充一套连贯的演示数据。
  const infoTenant = await prisma.tenant.upsert({
    where: { id: 'info-tenant' },
    update: {},
    create: { id: 'info-tenant', name: '信息工程学院代表队' },
  });

  // 8.1 指导教师（3 名，均归属信息工程学院，密码 123456）
  const teacher3 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'teacher3', tenantId: infoTenant.id } },
    update: { name: '王敏' },
    create: {
      tenantId: infoTenant.id,
      activeTenantId: infoTenant.id,
      username: 'teacher3',
      passwordHash,
      name: '王敏',
      role: 'TEACHER',
    },
  });
  const teacher4 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'teacher4', tenantId: infoTenant.id } },
    update: { name: '孙磊' },
    create: {
      tenantId: infoTenant.id,
      activeTenantId: infoTenant.id,
      username: 'teacher4',
      passwordHash,
      name: '孙磊',
      role: 'TEACHER',
    },
  });
  const teacher5 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'teacher5', tenantId: infoTenant.id } },
    update: { name: '周婷' },
    create: {
      tenantId: infoTenant.id,
      activeTenantId: infoTenant.id,
      username: 'teacher5',
      passwordHash,
      name: '周婷',
      role: 'TEACHER',
    },
  });

  // 8.2 参赛学生（3 名，归属信息工程学院代表队）
  const student7 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'student7', tenantId: infoTenant.id } },
    update: { name: '林浩' },
    create: {
      tenantId: infoTenant.id,
      activeTenantId: infoTenant.id,
      username: 'student7',
      passwordHash,
      name: '林浩',
      role: 'STUDENT',
    },
  });
  const student8 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'student8', tenantId: infoTenant.id } },
    update: { name: '陈思琪' },
    create: {
      tenantId: infoTenant.id,
      activeTenantId: infoTenant.id,
      username: 'student8',
      passwordHash,
      name: '陈思琪',
      role: 'STUDENT',
    },
  });
  const student9 = await prisma.user.upsert({
    where: { tenantId_username: { username: 'student9', tenantId: infoTenant.id } },
    update: { name: '黄子轩' },
    create: {
      tenantId: infoTenant.id,
      activeTenantId: infoTenant.id,
      username: 'student9',
      passwordHash,
      name: '黄子轩',
      role: 'STUDENT',
    },
  });

  // 8.3 成员资格（幂等）
  await ensureMembership(teacher3.id, infoTenant.id, 'OWNER');
  await ensureMembership(teacher4.id, infoTenant.id, 'TEACHER');
  await ensureMembership(teacher5.id, infoTenant.id, 'TEACHER');
  await ensureMembership(student7.id, infoTenant.id, 'STUDENT');
  await ensureMembership(student8.id, infoTenant.id, 'STUDENT');
  await ensureMembership(student9.id, infoTenant.id, 'STUDENT');

  // 8.4 两个赛项（软件测试赛项 / 大数据技术应用赛项），含评分维度与任务，形成完整闭环
  const genericCriteria = (techPoint: string) => [
    { name: '功能完整性', weight: 25, points: ['需求理解与功能覆盖', '核心功能实现规范性', '功能稳定性与鲁棒性'] },
    { name: '技术路线', weight: 20, points: ['技术选型合理性', '架构设计先进性', techPoint] },
    { name: '创新价值', weight: 20, points: ['创新点明确性', '方案独特性与亮点', '技术创新性'] },
    { name: '应用成效', weight: 20, points: ['应用效果与性能表现', '实际场景应用价值', '效益与影响力'] },
    { name: '展示表达', weight: 15, points: ['文档完整性与规范性', '展示逻辑与表达清晰度', '答辩沟通表现'] },
  ];

  await seedProjectWithCriteria(
    'software-test-project',
    infoTenant.id,
    '软件测试赛项',
    '软件测试赛项',
    'PROTOTYPE',
    genericCriteria('测试技术应用正确性'),
    [
      { title: '梳理赛项规程与评分标准', status: 'DONE', pointNames: ['需求理解与功能覆盖'] },
      { title: '搭建自动化测试框架', status: 'IN_PROGRESS', pointNames: ['核心功能实现规范性', '技术选型合理性'] },
      { title: '典型缺陷场景用例设计', status: 'IN_REVIEW', pointNames: ['架构设计先进性'] },
      { title: '补充性能测试方案', status: 'TODO', pointNames: ['创新点明确性', '方案独特性与亮点'] },
      { title: '测试报告与文档撰写', status: 'TODO', pointNames: ['文档完整性与规范性'] },
    ],
  );
  await seedProjectWithCriteria(
    'bigdata-project',
    infoTenant.id,
    '大数据技术应用赛项',
    '大数据技术应用赛项',
    'UNDERSTAND',
    genericCriteria('大数据处理技术应用正确性'),
    [
      { title: '梳理赛项规程与评分标准', status: 'DONE', pointNames: ['需求理解与功能覆盖'] },
      { title: '数据采集与清洗 pipeline', status: 'IN_PROGRESS', pointNames: ['核心功能实现规范性', '技术选型合理性'] },
      { title: '可视化分析与建模', status: 'TODO', pointNames: ['架构设计先进性'] },
      { title: '撰写参赛文档', status: 'TODO', pointNames: ['文档完整性与规范性'] },
    ],
  );

  // 8.5 teacher3 的学习记录与通知（演示信息工程学院代表队闭环）
  const eventInfoCount = await prisma.learningEvent.count({ where: { userId: teacher3.id } });
  if (eventInfoCount === 0) {
    const base = Date.now();
    const day = 86400000;
    const eventsInfo: Array<{ type: string; payload: Record<string, unknown>; ago: number }> = [
      { type: 'CRITERIA_PARSED', payload: { title: '赛项解析：软件测试赛项评分标准', points: 15 }, ago: 11 },
      { type: 'TASK_CREATED', payload: { title: '搭建自动化测试框架', status: 'IN_PROGRESS' }, ago: 9 },
      { type: 'WORK_UPLOADED', payload: { title: '测试方案 V1', version: 1 }, ago: 7 },
      { type: 'DIAGNOSIS_RUN', payload: { title: '作品诊断：V1', findings: 19 }, ago: 6 },
      { type: 'DEFENSE_RUN', payload: { title: '模拟答辩第 1 轮', rounds: 2 }, ago: 3 },
      { type: 'REVIEW_GENERATED', payload: { title: '赛后复盘报告', coverage: 25 }, ago: 1 },
    ];
    for (const e of eventsInfo) {
      await prisma.learningEvent.create({
        data: { userId: teacher3.id, type: e.type, payload: e.payload as any, createdAt: new Date(base - e.ago * day) },
      });
    }
  }
  const notifInfoCount = await prisma.notification.count({ where: { userId: teacher3.id } });
  if (notifInfoCount === 0) {
    await prisma.notification.createMany({
      data: [
        {
          userId: teacher3.id,
          category: '作品诊断',
          title: '作品 V1 诊断完成',
          detail: '共识别 19 条问题发现，其中 11 条高风险，建议优先处理。',
          targetNav: '作品诊断中心',
          read: false,
        },
        {
          userId: teacher3.id,
          category: '任务复核',
          title: '修改任务待复核',
          detail: '「搭建自动化测试框架」已提交，等待教师复核与闭环。',
          targetNav: '训练任务中心',
          read: false,
        },
        {
          userId: teacher3.id,
          category: '模拟答辩',
          title: '答辩反馈已生成',
          detail: '第 2 轮模拟答辩完成，表达维度评分 86。',
          targetNav: '模拟答辩室',
          read: true,
        },
      ],
    });
  }

  // 9. 全功能模块演示数据补齐：让侧边栏每一个模块都有真实可展示的数据
  //    覆盖：作品诊断中心、模拟答辩室、赛后复盘、资源知识库、案例沉淀库、学习记录、通知。

  // 9.1 修复：智能机器人赛项原有任务但缺少评分标准，导致无法诊断
  const robotCriteriaCount = await prisma.criterion.count({ where: { projectId: project2.id } });
  if (robotCriteriaCount === 0) {
    const robotCriteria = genericCriteria('机器人控制技术应用正确性');
    for (const c of robotCriteria) {
      const criterion = await prisma.criterion.create({
        data: { projectId: project2.id, name: c.name, weight: c.weight },
      });
      for (const p of c.points) {
        await prisma.scorePoint.create({
          data: { criterionId: criterion.id, name: p, abilityTags: [p] },
        });
      }
    }
    // 将已有任务与评分点关联，提升赛后复盘覆盖率
    const robotPoints = await prisma.scorePoint.findMany({ where: { criterion: { projectId: project2.id } } });
    const byNameRobot = (n: string) => robotPoints.find((p) => p.name === n)?.id;
    const robotTaskLinks: Array<{ title: string; pointNames: string[] }> = [
      { title: '机器人机械结构设计', pointNames: ['核心功能实现规范性'] },
      { title: '视觉识别算法开发', pointNames: ['技术选型合理性'] },
      { title: '运动控制联调', pointNames: ['架构设计先进性'] },
    ];
    for (const link of robotTaskLinks) {
      const ids = link.pointNames.map(byNameRobot).filter(Boolean) as string[];
      const task = await prisma.task.findFirst({ where: { projectId: project2.id, title: link.title } });
      if (task && ids.length) {
        await prisma.task.update({
          where: { id: task.id },
          data: { scorePoints: { connect: ids.map((id) => ({ id })) } },
        });
      }
    }
  }

  // 9.2 每个赛项均生成：作品版本 + 诊断记录 + 模拟答辩 + 资源
  const softwareTestProject = await prisma.project.findUniqueOrThrow({ where: { id: 'software-test-project' } });
  const bigdataProject = await prisma.project.findUniqueOrThrow({ where: { id: 'bigdata-project' } });
  const projectDemos: Array<{
    project: typeof project;
    tenantId: string;
    uploaderId: string;
    file: string;
  }> = [
    { project, tenantId: tenant.id, uploaderId: student1.id, file: 'seed-work-v1.md' },
    { project: project2, tenantId: tenant2.id, uploaderId: student2.id, file: 'seed-robot-work-v1.md' },
    { project: project3, tenantId: tenant2.id, uploaderId: student5.id, file: 'seed-vehicle-work-v1.md' },
    { project: softwareTestProject, tenantId: infoTenant.id, uploaderId: student7.id, file: 'seed-softest-work-v1.md' },
    { project: bigdataProject, tenantId: infoTenant.id, uploaderId: student8.id, file: 'seed-bigdata-work-v1.md' },
  ];
  for (const d of projectDemos) {
    const wv = await seedWorkVersion(d.project.id, d.tenantId, d.uploaderId, d.file);
    await seedDiagnoses(wv.id);
    await seedDefenseSession(d.project.id);
    await seedResources(d.project.id, d.project.name);
  }

  // 9.3 案例沉淀库：为 innovation-tenant / info-tenant 补齐，三团队均可做 RAG
  await seedCaseLibrary(tenant2.id, project2.id, [
    {
      title: '优秀案例：机器人机械结构设计的轻量化思路',
      content: '结构件过重会导致运动响应滞后。获奖作品普遍采用碳纤维支架与3D打印件组合，既保证强度又降低惯量，并给出扭矩校核与运动仿真截图。',
      category: '机械结构',
      tags: ['机器人', '机械设计', '轻量化'],
    },
    {
      title: '优秀案例：视觉识别算法的鲁棒性提升',
      content: '视觉识别受光照、遮挡影响大。应加入数据增强、多尺度检测与置信度过滤，并展示不同场景下的识别准确率对比。',
      category: '算法',
      tags: ['视觉识别', '鲁棒性', '算法调优'],
    },
    {
      title: '优秀案例：车路协同感知决策的案例写法',
      content: '车路协同需说明车端与路侧端的职责边界、通信协议与容错机制。用状态机图说明决策流程，并给出典型交通场景下的决策结果。',
      category: '车路协同',
      tags: ['智能网联汽车', '感知决策', '车路协同'],
    },
    {
      title: '优秀案例：实车联调中的安全策略',
      content: '实车调试必须包含急停、限速、异常退出等安全策略，并在文档中明确人员分工与场地安全规范。',
      category: '安全规范',
      tags: ['智能网联汽车', '实车联调', '安全'],
    },
  ]);
  await seedCaseLibrary(infoTenant.id, softwareTestProject.id, [
    {
      title: '优秀案例：自动化测试框架的分层设计',
      content: '测试框架应分为用例层、执行层、报告层。用例层使用数据驱动，执行层支持并发与重试，报告层输出可视化统计与缺陷分布。',
      category: '测试框架',
      tags: ['软件测试', '自动化测试', '框架设计'],
    },
    {
      title: '优秀案例：等价类与边界值用例设计',
      content: '功能测试优先采用等价类划分与边界值分析，确保覆盖正常、异常与临界输入。用例应包含前置条件、执行步骤、预期结果三要素。',
      category: '用例设计',
      tags: ['软件测试', '用例设计', '等价类'],
    },
    {
      title: '优秀案例：大数据清洗的异常处理',
      content: '原始数据常有缺失、重复、格式不一致问题。清洗流程应包括去重、缺失值填充、异常值检测与日志记录，并给出清洗前后数据量对比。',
      category: '数据处理',
      tags: ['大数据', '数据清洗', '异常处理'],
    },
    {
      title: '优秀案例：可视化分析的设计规范',
      content: '可视化应服务于结论，避免花哨。关键指标用趋势图与对比图呈现，并配以文字说明洞察；避免大段文字堆砌。',
      category: '可视化',
      tags: ['大数据', '可视化', '分析规范'],
    },
  ]);

  // 9.4 学生学习记录 + 通知：让「学习记录/通知」在学生视角也有数据
  const studentList: Array<{
    student: typeof student1;
    projectName: string;
    isUploader: boolean;
  }> = [
    { student: student1, projectName: project.name, isUploader: true },
    { student: student2, projectName: project2.name, isUploader: true },
    { student: student3, projectName: project.name, isUploader: false },
    { student: student4, projectName: project.name, isUploader: false },
    { student: student5, projectName: project3.name, isUploader: true },
    { student: student6, projectName: project3.name, isUploader: false },
    { student: student7, projectName: softwareTestProject.name, isUploader: true },
    { student: student8, projectName: bigdataProject.name, isUploader: true },
    { student: student9, projectName: bigdataProject.name, isUploader: false },
  ];
  for (const s of studentList) {
    await seedStudentEvents(s.student.id, s.projectName, s.isUploader);
    await seedStudentNotifications(s.student.id, s.projectName, s.isUploader);
  }

  // eslint-disable-next-line no-console
  console.log('[seed] 演示数据已就绪：三团队 / 全部教师+学生 / 全部 5 大赛项 / 作品诊断 / 模拟答辩 / 资源知识库 / 案例沉淀库 / 学习记录 / 通知 / 赛后复盘 均已有演示数据（password: 123456）');
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
