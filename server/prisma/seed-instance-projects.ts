/**
 * 实例项目示例数据生成（收敛式 / 幂等 / 无删除）
 * ------------------------------------------------------------------
 * 原型来源：项目根目录 `实例项目资料/` 下的 7 份参赛项目文档（归并为 6 个项目）。
 *   - 数据定义：prisma/instance-project-data.ts
 *   - 进展档案：prisma/instance-project-profiles.ts（让 6 个项目呈现不同阶段与进展）
 *
 * 设计原则（务必保持）：
 *   1. 作用域白名单：只遍历 INSTANCE_PROJECTS 声明的 6 个项目 / 6 个团队 / 27 个账号，
 *      既不读也不写 demo / robot / vehicle / software-test / bigdata 等既有赛项的数据；
 *   2. 收敛式（converge）：按计划逐项「匹配 → 创建或更新」，使数据最终等于计划值。
 *      全程**不做任何删除**；重复执行结果一致（幂等）；
 *   3. 团队 / 赛项 / 账号 / 成员关系一律 upsert(update:{})，不修改既有资料与 activeTenantId；
 *   4. 除「任务状态与负责人」「诊断复核状态」「答辩场次内容」这三类由进展档案驱动的字段外，
 *      不触碰其他字段。
 *
 * 运行：npx ts-node prisma/seed-instance-projects.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { TaskStatus } from '../src/common/enums';
import { parseJson, toJson } from '../src/common/json';
import * as bcrypt from 'bcryptjs';
import { mkdir, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { INSTANCE_PROJECTS, ProjectSeed, DiagSeed, MemberSeed } from './instance-project-data';
import {
  PROJECT_PROFILES,
  ProjectProfile,
  ProfileDefenseSession,
  reviewStatusOf,
} from './instance-project-profiles';

const prisma = new PrismaClient();

/** 演示账号统一密码（与既有演示账号一致） */
const DEMO_PASSWORD = '123456';
/** 既有教师账号：加入全部新团队作为 MEMBER，便于在一个账号内切换查看所有新项目 */
const EXISTING_TEACHER_USERNAME = 'teacher';

const DAY = 86400000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY);

/** 任务标题归一化：把进展档案的键与数据定义里的标题对齐（忽略标点与空白差异） */
const normKey = (s: string) => s.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '');

interface Stats {
  created: Record<string, number>;
  updated: Record<string, number>;
  warnings: string[];
}
const stats: Stats = { created: {}, updated: {}, warnings: [] };
const bump = (bucket: 'created' | 'updated', key: string, n = 1) => {
  stats[bucket][key] = (stats[bucket][key] ?? 0) + n;
};

// ============================== 工具 ==============================

async function ensureUser(
  tenantId: string,
  m: MemberSeed,
  role: 'TEACHER' | 'STUDENT',
  passwordHash: string,
) {
  const existed = await prisma.user.findUnique({
    where: { tenantId_username: { tenantId, username: m.username } },
  });
  if (existed) return existed;
  const created = await prisma.user.create({
    data: {
      tenantId,
      activeTenantId: tenantId,
      username: m.username,
      passwordHash,
      name: m.name,
      role,
    },
  });
  bump('created', '账号');
  return created;
}

async function ensureMembership(
  userId: string,
  tenantId: string,
  role: 'OWNER' | 'TEACHER' | 'STUDENT' | 'MEMBER',
) {
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: {},
    create: { userId, tenantId, role },
  });
}

/** 落盘作品正文（已存在则保留原文件，不覆盖） */
async function ensureWorkFile(tenantId: string, fileName: string, content: string) {
  const dir = join(process.cwd(), 'uploads', tenantId);
  await mkdir(dir, { recursive: true });
  const full = join(dir, fileName);
  try {
    await stat(full);
    return false;
  } catch {
    /* 文件不存在，继续写入 */
  }
  await writeFile(full, content, 'utf8');
  return true;
}

/** 答辩会话内容构造（供创建与更新共用） */
function buildDefenseData(s: ProfileDefenseSession) {
  const done = !!s.overall;
  const transcript: Array<Record<string, unknown>> = [];
  s.rounds.forEach((r, idx) => {
    transcript.push({ round: idx + 1, role: 'judge', content: r.question });
    transcript.push({
      round: idx + 1,
      role: 'student',
      content: r.answer,
      evaluation: { ...r.scores, comment: r.comment },
    });
  });
  return {
    round: done ? s.rounds.length : s.rounds.length + 1,
    title: s.title,
    transcript: toJson(transcript),
    evaluations: toJson({
      maxRounds: s.maxRounds,
      rounds: s.rounds.map((r, idx) => ({ round: idx + 1, scores: r.scores, comment: r.comment })),
      ...(s.overall ? { overall: s.overall, done: true } : { done: false }),
    }),
  };
}

// ============================ 单项目生成 ============================

async function seedProject(p: ProjectSeed, profile: ProjectProfile, passwordHash: string) {
  console.log(`\n【${p.projectName}】`);
  console.log(`  档案：${profile.stageNote}`);

  // 进展档案的任务键含标点（_ （） 、 等），必须与查找值**两边都归一化**后再比对；
  // 只归一化一侧会导致带标点的任务匹配不上，从而沿用数据定义里的状态。
  const taskPlanIndex = new Map<string, { status: TaskStatus; ownerIdx: number }>();
  for (const [k, v] of Object.entries(profile.taskPlan)) taskPlanIndex.set(normKey(k), v);
  const planOf = (title: string) => taskPlanIndex.get(normKey(title));

  // 1) 团队（已存在则不动）
  const tenantExisted = (await prisma.tenant.count({ where: { id: p.tenantId } })) > 0;
  await prisma.tenant.upsert({
    where: { id: p.tenantId },
    update: {},
    create: { id: p.tenantId, name: p.tenantName },
  });
  if (!tenantExisted) bump('created', '团队');
  console.log(`  团队：${p.tenantName}（${p.tenantId}）${tenantExisted ? '（已存在）' : ''}`);

  // 2) 成员账号
  const owner = await ensureUser(p.tenantId, p.teachers[0], 'TEACHER', passwordHash);
  await ensureMembership(owner.id, p.tenantId, 'OWNER');
  const otherTeachers = [];
  for (const t of p.teachers.slice(1)) {
    const u = await ensureUser(p.tenantId, t, 'TEACHER', passwordHash);
    await ensureMembership(u.id, p.tenantId, 'TEACHER');
    otherTeachers.push(u);
  }
  const students = [];
  for (const s of p.students) {
    const u = await ensureUser(p.tenantId, s, 'STUDENT', passwordHash);
    await ensureMembership(u.id, p.tenantId, 'STUDENT');
    students.push(u);
  }

  // 3) 既有教师账号加入本团队（MEMBER，不动其 activeTenantId）
  const existingTeacher =
    (await prisma.user.findFirst({
      where: { username: EXISTING_TEACHER_USERNAME },
      orderBy: { createdAt: 'asc' },
    })) || null;
  if (existingTeacher) await ensureMembership(existingTeacher.id, p.tenantId, 'MEMBER');

  // 4) 赛项项目（已存在则不动）
  await prisma.project.upsert({
    where: { id: p.projectId },
    update: {},
    create: {
      id: p.projectId,
      tenantId: p.tenantId,
      name: p.projectName,
      competition: p.competition,
      currentStage: p.stage,
    },
  });

  // 5) 评分维度 + 评分点（内容固定，已存在即跳过）
  const cCount = await prisma.criterion.count({ where: { projectId: p.projectId } });
  if (cCount === 0) {
    for (const c of p.criteria) {
      const criterion = await prisma.criterion.create({
        data: { projectId: p.projectId, name: c.name, weight: c.weight },
      });
      bump('created', '评分维度');
      for (const pt of c.points) {
        await prisma.scorePoint.create({
          data: { criterionId: criterion.id, name: pt.name, abilityTags: toJson([pt.name]) },
        });
        bump('created', '评分点');
      }
    }
    const total = p.criteria.reduce((n, c) => n + c.points.length, 0);
    console.log(`  评分标准：${p.criteria.length} 个维度 / ${total} 个评分点`);
  } else {
    console.log('  评分标准已存在，跳过');
  }
  const points = await prisma.scorePoint.findMany({
    where: { criterion: { projectId: p.projectId } },
  });
  const byName = (n: string) => points.find((x) => x.name === n)?.id;

  // 6) 训练任务：按标题收敛（状态与负责人取自进展档案）
  const statusTally: Record<string, number> = {};
  let tCreated = 0;
  let tUpdated = 0;
  let i = 0;
  for (const t of p.tasks) {
    const plan = planOf(t.title);
    if (!plan) stats.warnings.push(`${p.slug} 任务未匹配档案：${t.title}`);
    const status = plan?.status ?? t.status;
    const ownerUser = plan ? students[plan.ownerIdx] : undefined;
    statusTally[status] = (statusTally[status] ?? 0) + 1;

    const found = await prisma.task.findFirst({ where: { projectId: p.projectId, title: t.title } });
    if (found) {
      await prisma.task.update({
        where: { id: found.id },
        data: { status, done: status === 'DONE', ownerId: ownerUser?.id ?? null },
      });
      tUpdated += 1;
    } else {
      const ids = t.pointNames.map(byName).filter(Boolean) as string[];
      await prisma.task.create({
        data: {
          projectId: p.projectId,
          title: t.title,
          status,
          done: status === 'DONE',
          ownerId: ownerUser?.id ?? null,
          dueDate: ago(-7 * (i - 2)),
          createdAt: ago(40 - 4 * i),
          scorePoints: ids.length ? { connect: ids.map((id) => ({ id })) } : undefined,
        },
      });
      tCreated += 1;
    }
    i += 1;
  }
  bump('created', '训练任务', tCreated);
  bump('updated', '训练任务', tUpdated);
  console.log(
    `  训练任务：${p.tasks.length} 条（${Object.entries(statusTally)
      .map(([k, v]) => `${k}×${v}`)
      .join(' / ')}，负责人已分配；新建 ${tCreated} / 更新 ${tUpdated}）`,
  );

  // 7) 作品版本（含档案追加版本）
  const allWorks = [...p.works, ...profile.extraWorks].sort((a, b) => a.version - b.version);
  for (const w of allWorks) {
    const found = await prisma.workVersion.findFirst({
      where: { projectId: p.projectId, version: w.version },
    });
    if (found) continue;
    await ensureWorkFile(p.tenantId, w.fileName, w.content);
    const uploaderIdx = profile.workUploaders[w.version - 1] ?? 0;
    await prisma.workVersion.create({
      data: {
        projectId: p.projectId,
        uploaderId: (students[uploaderIdx] ?? students[0]).id,
        fileRef: `${p.tenantId}/${w.fileName}`,
        content: w.content,
        version: w.version,
        createdAt: ago(34 - w.version * 11),
      },
    });
    bump('created', '作品版本');
    console.log(`  作品：V${w.version} ${w.title}`);
  }

  const latest = await prisma.workVersion.findFirst({
    where: { projectId: p.projectId },
    orderBy: { version: 'desc' },
  });

  // 8) 作品诊断：按（最新版本 × 评分点）收敛，复核状态取自进展档案
  if (latest) {
    const diagMap = new Map<string, DiagSeed>();
    for (const c of p.criteria) for (const pt of c.points) diagMap.set(pt.name, pt);
    const tally: Record<string, number> = {};
    let dCreated = 0;
    let dUpdated = 0;
    for (const pt of points) {
      const d = diagMap.get(pt.name);
      if (!d) continue;
      const status = reviewStatusOf(profile, pt.name, d.severity);
      tally[status] = (tally[status] ?? 0) + 1;
      const found = await prisma.diagnosis.findFirst({
        where: { workVersionId: latest.id, scorePointId: pt.id },
      });
      const payload = {
        matchScore: d.matchScore,
        severity: d.severity,
        issues: d.issues,
        suggestions: d.suggestions,
        status,
      };
      if (found) {
        await prisma.diagnosis.update({ where: { id: found.id }, data: payload });
        dUpdated += 1;
      } else {
        await prisma.diagnosis.create({
          data: { workVersionId: latest.id, scorePointId: pt.id, createdAt: ago(16), ...payload },
        });
        dCreated += 1;
      }
    }
    bump('created', '作品诊断', dCreated);
    bump('updated', '作品诊断', dUpdated);
    console.log(
      `  作品诊断：${points.length} 条（挂 V${latest.version}；${Object.entries(tally)
        .map(([k, v]) => `${k}×${v}`)
        .join(' / ')}；新建 ${dCreated} / 更新 ${dUpdated}）`,
    );
  }

  // 9) 模拟答辩：按「场次序号」收敛（含进行中会话）
  const existingDefenses = await prisma.defenseSession.findMany({
    where: { projectId: p.projectId },
    orderBy: { createdAt: 'asc' },
  });
  for (let k = 0; k < profile.defenses.length; k += 1) {
    const s = profile.defenses[k];
    const data = buildDefenseData(s);
    if (existingDefenses[k]) {
      // 一并校正 createdAt：前端按 createdAt desc 取最近一场，索引 0 必须是最新的一场
      await prisma.defenseSession.update({
        where: { id: existingDefenses[k].id },
        data: { ...data, createdAt: ago(3 + k * 7) },
      });
      bump('updated', '模拟答辩');
    } else {
      await prisma.defenseSession.create({
        data: { projectId: p.projectId, createdAt: ago(3 + k * 7), ...data },
      });
      bump('created', '模拟答辩');
    }
    console.log(`  模拟答辩：${s.title}（${s.rounds.length}/${s.maxRounds} 轮，${s.overall ? '已结束' : '进行中'}）`);
  }
  if (existingDefenses.length > profile.defenses.length) {
    stats.warnings.push(
      `${p.slug} 存在 ${existingDefenses.length} 场答辩、档案只声明 ${profile.defenses.length} 场（多余场次保留未处理）`,
    );
  }

  // 10) 资源知识库：按名称收敛
  const allResources = [...p.resources, ...profile.extraResources];
  let rCreated = 0;
  for (const r of allResources) {
    const found = await prisma.resource.findFirst({
      where: { projectId: p.projectId, name: r.name },
    });
    if (found) continue;
    await prisma.resource.create({
      data: {
        projectId: p.projectId,
        type: r.type,
        name: r.name,
        description: r.description,
        createdAt: ago(35),
      },
    });
    rCreated += 1;
  }
  bump('created', '资源', rCreated);
  console.log(`  资源知识库：共 ${allResources.length} 条（新建 ${rCreated} 条）`);

  // 11) 案例沉淀库（内容固定，已存在即跳过）
  const clCount = await prisma.caseLibrary.count({ where: { tenantId: p.tenantId } });
  if (clCount === 0) {
    for (const c of p.cases) {
      await prisma.caseLibrary.create({
        data: {
          tenantId: p.tenantId,
          projectId: p.projectId,
          title: c.title,
          content: c.content,
          category: c.category,
          tags: toJson(c.tags),
          createdAt: ago(25),
        },
      });
      bump('created', '案例沉淀');
    }
    console.log(`  案例沉淀库：${p.cases.length} 条`);
  } else {
    console.log(`  案例沉淀库：已存在 ${clCount} 条，跳过`);
  }

  // 12) 学习记录 + 通知：新账号铺底，已有记录则按丰富度做幂等补充
  const members = [owner, ...otherTeachers, ...students];
  const pointTotal = p.criteria.reduce((n, c) => n + c.points.length, 0);
  const uploaderId = students[0].id;
  const doneTask = p.tasks.find((t) => (planOf(t.title)?.status ?? t.status) === 'DONE');

  for (const u of members) {
    const isCore = u.id === uploaderId || u.role === 'TEACHER';
    const existingEvents = await prisma.learningEvent.findMany({
      where: { userId: u.id },
      select: { id: true, payload: true },
    });
    const titleSet = new Set(
      existingEvents
        .map((e) => parseJson<Record<string, unknown>>(e.payload, {}).title)
        .filter((t): t is string => typeof t === 'string'),
    );

    if (existingEvents.length === 0) {
      // 铺底：基础 3 条 + 核心成员进阶 1~4 条
      const plan: Array<{ type: string; payload: Record<string, unknown>; d: number }> = [
        { type: 'CRITERIA_PARSED', payload: { title: `赛项解析：${p.projectName}`, points: pointTotal }, d: 20 },
        { type: 'TASK_CREATED', payload: { title: p.tasks[0].title, status: planOf(p.tasks[0].title)?.status ?? 'TODO' }, d: 18 },
        { type: 'TASK_CREATED', payload: { title: p.tasks[Math.min(2, p.tasks.length - 1)].title, status: 'TODO' }, d: 14 },
      ];
      if (isCore) {
        const adv: Array<{ type: string; payload: Record<string, unknown>; d: number }> = [
          { type: 'WORK_UPLOADED', payload: { title: `${p.projectName} 作品 V${latest?.version ?? 1}`, version: latest?.version ?? 1 }, d: 11 },
          { type: 'DIAGNOSIS_RUN', payload: { title: `作品诊断：${p.projectName}`, findings: pointTotal }, d: 9 },
          { type: 'DEFENSE_RUN', payload: { title: `模拟答辩 · ${p.projectName}`, rounds: profile.defenses[0]?.rounds.length ?? 0 }, d: 6 },
          { type: 'REVIEW_GENERATED', payload: { title: '赛后复盘报告', coverage: 100 }, d: 3 },
        ];
        const keep = profile.feedLevel === 3 ? 4 : profile.feedLevel === 2 ? 3 : 1;
        plan.push(...adv.slice(0, keep));
      } else if (profile.feedLevel === 1) {
        plan.pop();
      }
      for (const e of plan) {
        await prisma.learningEvent.create({
          data: { userId: u.id, type: e.type, payload: toJson(e.payload), createdAt: ago(e.d) },
        });
        bump('created', '学习记录');
      }
    } else {
      // 幂等补充：按丰富度追加，标题已在则跳过
      const topUp: Array<{ type: string; payload: Record<string, unknown>; d: number }> = [];
      if (doneTask && profile.feedLevel >= 2) {
        topUp.push({ type: 'TASK_DONE', payload: { title: doneTask.title, status: 'DONE' }, d: 7 });
      }
      if (profile.feedLevel === 3) {
        topUp.push({ type: 'REVIEW_GENERATED', payload: { title: `赛后复盘报告 · ${p.projectName}`, coverage: 100 }, d: 2 });
      }
      for (const e of topUp) {
        const t = e.payload.title as string;
        if (titleSet.has(t)) continue;
        await prisma.learningEvent.create({
          data: { userId: u.id, type: e.type, payload: toJson(e.payload), createdAt: ago(e.d) },
        });
        bump('created', '学习记录');
      }
    }

    if ((await prisma.notification.count({ where: { userId: u.id } })) === 0) {
      const pool: Array<Record<string, unknown>> = [
        {
          userId: u.id,
          category: '训练任务',
          title: '训练任务已分配',
          detail: `「${p.projectName}」已有 ${p.tasks.length} 条训练任务，请及时跟进。`,
          targetNav: '训练任务中心',
          read: u.role !== 'STUDENT',
          createdAt: ago(18),
        },
        {
          userId: u.id,
          category: '作品诊断',
          title: `作品 V${latest?.version ?? 1} 诊断完成`,
          detail: `「${p.projectName}」共识别 ${pointTotal} 条问题发现，请查看反馈。`,
          targetNav: '作品诊断中心',
          read: false,
          createdAt: ago(9),
        },
        {
          userId: u.id,
          category: '模拟答辩',
          title: '答辩反馈已生成',
          detail: `「${p.projectName}」${profile.defenses[0]?.title ?? '模拟答辩'}。`,
          targetNav: '模拟答辩室',
          read: u.role !== 'STUDENT',
          createdAt: ago(5),
        },
        {
          userId: u.id,
          category: '作品审核',
          title: '备赛进展同步',
          detail: `「${p.projectName}」当前进展：${profile.stageNote}`,
          targetNav: '赛后复盘',
          read: false,
          createdAt: ago(2),
        },
      ];
      const keep = profile.feedLevel === 3 ? (isCore ? 4 : 3) : profile.feedLevel === 2 ? (isCore ? 3 : 2) : 2;
      await prisma.notification.createMany({ data: pool.slice(0, keep) as never });
      bump('created', '通知', keep);
    }
  }
}

// ==================== 既有教师账号的投喂补充 ====================

async function seedExistingTeacherFeed(p: ProjectSeed, profile: ProjectProfile) {
  const teacher = await prisma.user.findFirst({
    where: { username: EXISTING_TEACHER_USERNAME },
    orderBy: { createdAt: 'asc' },
  });
  if (!teacher) return;
  const pointTotal = p.criteria.reduce((n, c) => n + c.points.length, 0);

  const events = await prisma.learningEvent.findMany({
    where: { userId: teacher.id },
    select: { payload: true },
  });
  const titles = new Set(
    events.map((e) => parseJson<Record<string, unknown>>(e.payload, {}).title).filter((t): t is string => typeof t === 'string'),
  );
  const plan: Array<{ type: string; payload: Record<string, unknown>; d: number }> = [
    { type: 'CRITERIA_PARSED', payload: { title: `赛项解析：${p.projectName}`, points: pointTotal }, d: 21 },
    { type: 'WORK_UPLOADED', payload: { title: `作品上传：${p.projectName}`, version: 2 }, d: 11 },
    { type: 'DIAGNOSIS_RUN', payload: { title: `作品诊断：${p.projectName}`, findings: pointTotal }, d: 9 },
    { type: 'DEFENSE_RUN', payload: { title: `模拟答辩 · ${p.projectName}`, rounds: profile.defenses[0]?.rounds.length ?? 0 }, d: 5 },
  ];
  const keep = profile.feedLevel === 3 ? 4 : profile.feedLevel === 2 ? 3 : 2;
  for (const e of plan.slice(0, keep)) {
    const t = e.payload.title as string;
    if (titles.has(t)) continue;
    await prisma.learningEvent.create({
      data: { userId: teacher.id, type: e.type, payload: toJson(e.payload), createdAt: ago(e.d) },
    });
    bump('created', 'teacher 学习记录');
  }

  const notifs = await prisma.notification.findMany({
    where: { userId: teacher.id },
    select: { detail: true },
  });
  const details = new Set(notifs.map((n) => n.detail).filter((d): d is string => typeof d === 'string'));
  const nPool = [
    {
      userId: teacher.id,
      category: '作品诊断',
      title: '作品诊断完成',
      detail: `「${p.projectName}」共识别 ${pointTotal} 条问题发现，请查看反馈。`,
      targetNav: '作品诊断中心',
      createdAt: ago(9),
    },
    {
      userId: teacher.id,
      category: '模拟答辩',
      title: '答辩反馈已生成',
      detail: `「${p.projectName}」${profile.defenses[0]?.title ?? '模拟答辩'}。`,
      targetNav: '模拟答辩室',
      createdAt: ago(5),
    },
    {
      userId: teacher.id,
      category: '作品审核',
      title: '备赛进展同步',
      detail: `「${p.projectName}」当前进展：${profile.stageNote}`,
      targetNav: '赛后复盘',
      createdAt: ago(2),
    },
  ].filter((n) => !details.has(n.detail));
  if (nPool.length) {
    await prisma.notification.createMany({ data: nPool as never });
    bump('created', 'teacher 通知', nPool.length);
  }
}

// ============================== 主流程 ==============================

async function main() {
  console.log('=== 实例项目示例数据生成（收敛式 / 幂等 / 无删除）===');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const p of INSTANCE_PROJECTS) {
    const profile = PROJECT_PROFILES[p.slug];
    if (!profile) throw new Error(`缺少进展档案：${p.slug}`);
    await seedProject(p, profile, passwordHash);
  }

  console.log('\n===== 补充既有教师账号（teacher）的投喂 =====');
  for (const p of INSTANCE_PROJECTS) {
    await seedExistingTeacherFeed(p, PROJECT_PROFILES[p.slug]);
  }

  console.log('\n=== 本次统计 ===');
  console.log('新建：', stats.created);
  console.log('更新：', stats.updated);
  if (stats.warnings.length) {
    console.log('\n⚠ 提示：');
    for (const w of stats.warnings) console.log(`  - ${w}`);
  }
  console.log(`\n演示账号密码：${DEMO_PASSWORD}`);
  console.log('账号命名：<项目前缀>_teacher / <项目前缀>_student<N>');
  console.log('项目前缀：pearl(珍珠) sidaopu(思导谱) mingzhu(掌上明猪) zhihuaxing(智划星) yihuoji(易货集) sheyun(数智畲韵)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
