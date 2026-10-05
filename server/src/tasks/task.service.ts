import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { parsePage, toPaged, PageQuery, Paged } from '../common/pagination';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { AI_PROVIDER, AiProvider, ChatMessage } from '../ai/ai.interface';
import { PROMPTS, STAGE_FOCUS } from '../config/prompts';
import { extractJson } from '../common/llm.util';

/** AI 生成的任务草稿（尚未落库） */
export interface AiTaskDraft {
  title: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  scorePointNames: string[];
  rationale: string;
}

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    // AI 能力：与赛项解析 / 作品诊断 / 模拟答辩共用同一 AiProvider，
    // 因此复用同一份 .env 配置（AI_BASE_URL / AI_API_KEY / AI_MODEL）。
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  /** 校验 project 归属当前租户，返回 project 或抛错 */
  private async assertProjectTenant(projectId: string, tenantId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('赛项项目不存在');
    if (project.tenantId !== tenantId) throw new ForbiddenException('无权限访问该项目');
    return project;
  }

  async create(dto: CreateTaskDto, user: JwtPayload) {
    await this.assertProjectTenant(dto.projectId, user.tenantId);
    const created = await this.prisma.task.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        ownerId: dto.ownerId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: dto.status ?? 'TODO',
        done: dto.status === 'DONE',
        scorePoints: dto.scorePointIds?.length
          ? { connect: dto.scorePointIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { scorePoints: true, owner: { select: { id: true, name: true } } },
    });

    // 事件驱动：若任务指定了负责人，通知其有新任务
    if (dto.ownerId) {
      await this.notifications.notify({
        userId: dto.ownerId,
        category: 'task',
        title: '你有一条新任务',
        detail: dto.title,
        targetNav: '竞赛项目驾驶舱',
      });
    }

    return created;
  }

  async findAll(
    projectId: string,
    user: JwtPayload,
    page: PageQuery = {},
  ): Promise<Paged<any>> {
    await this.assertProjectTenant(projectId, user.tenantId);
    const p = parsePage(page);
    const where = { projectId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: { scorePoints: true, owner: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.task.count({ where }),
    ]);
    return toPaged(items, total, p);
  }

  async update(id: string, dto: UpdateTaskDto, user: JwtPayload) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!existing) throw new NotFoundException('任务不存在');
    if (existing.project.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限修改该任务');

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.ownerId !== undefined) data.ownerId = dto.ownerId;
    if (dto.dueDate !== undefined)
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.done = dto.status === 'DONE';
    }
    if (dto.scorePointIds !== undefined) {
      data.scorePoints = { set: dto.scorePointIds.map((sp) => ({ id: sp })) };
    }
    return this.prisma.task.update({
      where: { id },
      data: data as never,
      include: { scorePoints: true, owner: { select: { id: true, name: true } } },
    });
  }

  async remove(id: string, user: JwtPayload) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!existing) throw new NotFoundException('任务不存在');
    if (existing.project.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限删除该任务');
    await this.prisma.task.delete({ where: { id } });
    return { id };
  }

  /** 评分覆盖率统计：项目下总评分点 vs 已有关联任务覆盖的评分点 */
  async coverage(projectId: string, user: JwtPayload) {
    await this.assertProjectTenant(projectId, user.tenantId);
    const [total, covered] = await this.prisma.$transaction([
      this.prisma.scorePoint.count({ where: { criterion: { projectId } } }),
      this.prisma.scorePoint.count({
        where: { criterion: { projectId }, tasks: { some: {} } },
      }),
    ]);
    return {
      totalScorePoints: total,
      coveredScorePoints: covered,
      coverageRate: total ? Math.round((covered / total) * 100) : 0,
    };
  }

  // ──────────────────────AI 能力──────────────────────
  // 三处调用共用 AiProvider（与 criteria/diagnosis/defense 完全一致），
  // Key 统一读server/.env 的 AI_BASE_URL / AI_API_KEY / AI_MODEL。
  // 无 Key 或调用失败时各自 catch → 降级为确定性启发式，功能闭环不断。

  /**
   * 读取项目的评分标准（含所属要素）与已有任务，作为 AI 的上下文。
   */
  private async loadPlanningContext(projectId: string, user: JwtPayload) {
    await this.assertProjectTenant(projectId, user.tenantId);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        criteria: {
          include: { scorePoints: true },
          orderBy: { weight: 'desc' },
        },
        tasks: { select: { id: true, title: true, status: true } },
      },
    });
    if (!project) throw new NotFoundException('赛项项目不存在');

    const allPoints = (project.criteria ?? []).flatMap((c) =>
      (c.scorePoints ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        criterionName: c.name,
        weight: c.weight,
      })),
    );
    const coveredIds = new Set<string>();
    const linked = await this.prisma.scorePoint.findMany({
      where: { criterion: { projectId }, tasks: { some: {} } },
      select: { id: true },
    });
    for (const p of linked) coveredIds.add(p.id);
    const uncovered = allPoints.filter((p) => !coveredIds.has(p.id));

    return { project, allPoints, uncovered, existingTasks: project.tasks ?? [] };
  }

  /** AI 生成阶段任务清单：返回草稿供教师确认，不直接落库 */
  async generateTasks(projectId: string, user: JwtPayload) {
    const ctx = await this.loadPlanningContext(projectId, user);
    if (ctx.allPoints.length === 0) {
      throw new BadRequestException('该项目尚未配置评分标准，无法生成训练任务');
    }

    const pointList = ctx.allPoints
      .map((p) => `${p.criterionName} / ${p.name}`)
      .join('\n');
    const uncoveredNames = ctx.uncovered.map((p) => p.name);
    const stageKey = ctx.project.currentStage || 'UNDERSTAND';
    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPTS.tasks.generate },
      {
        role: 'user',
        content:
          `项目名称：${ctx.project.name}\n` +
          `当前阶段：${stageKey}\n` +
          `本阶段重点：${STAGE_FOCUS[stageKey] ?? '按评分标准推进备赛'}\n\n` +
          `评分标准列表（scorePointNames 只能从中挑选）：\n${pointList}\n\n` +
          `尚未被任务覆盖的评分点：${uncoveredNames.length ? uncoveredNames.join('、') : '（全部已覆盖）'}\n` +
          `已有任务（避免重复）：\n${ctx.existingTasks.map((t) => `- ${t.title}`).join('\n') || '（无）'}\n\n` +
          `请生成 4-6 条任务。`,
      },
    ];

    try {
      // temperature 0.4：任务清单要求既有创意又不离谱，比诊断高、比出题低
      const raw = await this.ai.chat(messages, {
        temperature: 0.4,
        maxTokens: 2000,
        feature: 'tasks',
      });
      const json = extractJson<AiTaskDraft[]>(raw);
      if (!Array.isArray(json) || json.length === 0) throw new Error('AI 未返回有效任务');
      const valid = new Set(ctx.allPoints.map((p) => p.name));
      const drafts = json
        .map((d) => ({
          title: String(d?.title || '').trim().slice(0, 60),
          priority:
            d?.priority === 'HIGH' || d?.priority === 'LOW' ? d.priority : 'MEDIUM',
          // 过滤模型可能编造的评分点名，只保留真实存在的
          scorePointNames: (Array.isArray(d?.scorePointNames) ? d.scorePointNames : [])
            .map(String)
            .filter((n) => valid.has(n)),
          rationale: String(d?.rationale || '').slice(0, 200),
        }))
        .filter((d) => d.title);
      if (drafts.length === 0) throw new Error('AI 返回内容无法解析');
      return { drafts, source: 'ai' as const, uncoveredCount: ctx.uncovered.length };
    } catch {
      // 降级：按未覆盖评分点生成确定性任务，保证功能可用
      return {
        drafts: this.heuristicTaskDrafts(ctx.uncovered, ctx.existingTasks.map((t) => t.title)),
        source: 'heuristic' as const,
        uncoveredCount: ctx.uncovered.length,
      };
    }
  }

  /** 无 Key 时的任务草稿兜底：每条未覆盖评分点生成一条任务 */
  private heuristicTaskDrafts(
    uncovered: { name: string; criterionName: string }[],
    existingTitles: string[],
  ): AiTaskDraft[] {
    const seen = new Set(existingTitles);
    return uncovered
      .filter((p) => !seen.has(`补齐：${p.name}`))
      .slice(0, 6)
      .map((p, i) => ({
        title: `补齐：${p.name}`,
        priority: i < 2 ? 'HIGH' : i < 4 ? 'MEDIUM' : 'LOW',
        scorePointNames: [p.name],
        rationale: `评分点「${p.name}」（${p.criterionName}）尚无任务覆盖，建议安排任务补齐证据。`,
      }));
  }

  /** AI 动态风险预警：替代前端写死的文案 */
  async buildRiskReport(projectId: string, user: JwtPayload) {
    const ctx = await this.loadPlanningContext(projectId, user);
    const total = ctx.allPoints.length;
    const covered = total - ctx.uncovered.length;
    const openTasks = ctx.existingTasks.filter((t) => t.status !== 'DONE');
    const stageKey = ctx.project.currentStage || 'UNDERSTAND';

    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPTS.tasks.risk },
      {
        role: 'user',
        content:
          `项目：${ctx.project.name}｜当前阶段：${stageKey}\n` +
          `评分点覆盖：${covered}/${total}（未覆盖 ${ctx.uncovered.length} 个）\n` +
          `未覆盖评分点：${ctx.uncovered.map((p) => p.name).join('、') || '（无）'}\n` +
          `未完成任务：${openTasks.length} 条${openTasks.length ? `（${openTasks.slice(0, 8).map((t) => t.title).join('、')}）` : ''}\n\n` +
          `请识别风险，最多 3 条。`,
      },
    ];

    try {
      const raw = await this.ai.chat(messages, {
        temperature: 0.3,
        maxTokens: 1200,
        feature: 'tasks',
      });
      const json = extractJson<{ risks?: unknown[] }>(raw);
      const list = Array.isArray(json?.risks) ? json.risks : [];
      const risks = list.slice(0, 3).map((r) => ({
        level: (r as any)?.level === 'HIGH' || (r as any)?.level === 'LOW' ? (r as any).level : 'MEDIUM',
        title: String((r as any)?.title || '').slice(0, 40),
        detail: String((r as any)?.detail || '').slice(0, 200),
        action: String((r as any)?.action || '').slice(0, 120),
      })).filter((r) => r.title);
      return { risks, source: 'ai' as const, coverage: { covered, total } };
    } catch {
      return { risks: this.heuristicRisks(covered, total, ctx.uncovered, openTasks.length), source: 'heuristic' as const, coverage: { covered, total } };
    }
  }

  /** 无 Key 时的风险兜底：完全由覆盖情况推导 */
  private heuristicRisks(
    covered: number,
    total: number,
    uncovered: { name: string; criterionName: string }[],
    openTaskCount: number,
  ) {
    const risks: { level: string; title: string; detail: string; action: string }[] = [];
    const rate = total ? Math.round((covered / total) * 100) : 0;
    if (uncovered.length) {
      risks.push({
        level: rate < 50 ? 'HIGH' : 'MEDIUM',
        title: `尚有 ${uncovered.length} 个评分点未覆盖`,
        detail: `当前评分点覆盖率 ${rate}%（${covered}/${total}），未覆盖项包括：${uncovered.slice(0, 4).map((p) => p.name).join('、')}${uncovered.length > 4 ? ' 等' : ''}。`,
        action: '点击「AI 生成任务」补齐缺口。',
      });
    }
    if (openTaskCount >= 3) {
      risks.push({
        level: 'MEDIUM',
        title: `${openTaskCount} 条任务未完成`,
        detail: '看板中积压较多任务，可能影响阶段推进与答辩准备。',
        action: '优先处理标记为「高优先级」且临近截止的任务。',
      });
    }
    if (risks.length === 0) {
      risks.push({
        level: 'LOW',
        title: '备赛节奏正常',
        detail: '评分点已全部覆盖且无积压任务，保持当前节奏即可。',
        action: '可提前准备答辩说辞与证据材料。',
      });
    }
    return risks.slice(0, 3);
  }

  /** AI 推荐任务应关联的评分点（只给建议，不自动改关联关系） */
  async suggestScorePoints(projectId: string, user: JwtPayload) {
    const ctx = await this.loadPlanningContext(projectId, user);
    if (ctx.allPoints.length === 0 || ctx.existingTasks.length === 0) {
      return { suggestions: [], source: 'ai' as const };
    }
    const pointList = ctx.allPoints
      .map((p) => `${p.criterionName} / ${p.name}`)
      .join('\n');
    const taskList = ctx.existingTasks.map((t) => t.title).join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPTS.tasks.suggest },
      {
        role: 'user',
        content:
          `评分标准列表：\n${pointList}\n\n现有任务：\n${taskList}\n\n` +
          `请为每条任务推荐应关联的评分点。`,
      },
    ];

    try {
      const raw = await this.ai.chat(messages, {
        temperature: 0.2,
        maxTokens: 2000,
        feature: 'tasks',
      });
      const json = extractJson<{ suggestions?: { taskTitle?: string; scorePointNames?: string[] }[] }>(raw);
      const valid = new Set(ctx.allPoints.map((p) => p.name));
      const suggestions = (Array.isArray(json?.suggestions) ? json.suggestions : [])
        .map((s) => ({
          taskTitle: String(s?.taskTitle || '').slice(0, 60),
          scorePointNames: (Array.isArray(s?.scorePointNames) ? s.scorePointNames : [])
            .map(String)
            .filter((n) => valid.has(n)),
        }))
        // 只保留「确实还没关联任何评分点」的任务，避免对已有配置指手画脚
        .filter((s) => s.taskTitle && s.scorePointNames.length > 0);
      return { suggestions, source: 'ai' as const };
    } catch {
      return { suggestions: [], source: 'heuristic' as const };
    }
  }
}
