import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AI_PROVIDER, AiProvider, ChatMessage } from '../ai/ai.interface';
import { JwtPayload } from '../auth/auth.service';
import { extractJson } from '../common/llm.util';

export interface ScorePointDraft {
  name: string;
  abilityTags?: string[];
}
export interface CriterionDraft {
  name: string;
  weight: number;
  scorePoints: ScorePointDraft[];
}

@Injectable()
export class CriteriaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  private async assertProjectTenant(projectId: string, tenantId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('赛项项目不存在');
    if (project.tenantId !== tenantId) throw new ForbiddenException('无权限访问该项目');
    return project;
  }

  /** 列出某项目的评分要素与评分点 */
  async list(projectId: string, user: JwtPayload) {
    await this.assertProjectTenant(projectId, user.tenantId);
    return this.prisma.criterion.findMany({
      where: { projectId },
      include: { scorePoints: true },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * 赛项解析：从规程/评分标准文本中抽取结构化评分要素草稿。
   * 优先调用 LLM；无 AI 密钥或调用失败时回退到启发式模板，保证本地可用。
   */
  async parse(text: string, user: JwtPayload) {
    const clean = (text || '').slice(0, 12000);
    if (!clean.trim()) {
      throw new BadRequestException('请提供赛项规程或评分标准文本');
    }
    let draft: CriterionDraft[];
    try {
      draft = await this.callAi(clean);
    } catch {
      draft = this.heuristic(clean);
    }
    return { draft };
  }

  private async callAi(text: string): Promise<CriterionDraft[]> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是职业技能竞赛赛项解析专家。请阅读赛项规程或评分标准文本，' +
          '抽取评分要素（一级维度）及其下的评分点，并估算各要素权重。' +
          '严格输出 JSON 数组，每个元素：{name(要素名), weight(整数权重,所有要素权重之和约为100), ' +
          'scorePoints:[{name(评分点名), abilityTags:[相关能力标签字符串]}]}。不要输出多余文字。',
      },
      { role: 'user', content: `赛项规程/评分标准文本：\n${text}` },
    ];
    const raw = await this.ai.chat(messages, { temperature: 0.3, maxTokens: 2500 });
    const json = extractJson<CriterionDraft[]>(raw);
    if (!Array.isArray(json) || json.length === 0) throw new Error('AI 未返回有效结构');
    return json.map((c) => ({
      name: String(c.name || '未命名要素'),
      weight: Math.max(0, Math.min(100, Number(c.weight) || 0)),
      scorePoints: Array.isArray(c.scorePoints)
        ? c.scorePoints.map((sp) => ({
            name: String(sp?.name || '未命名评分点'),
            abilityTags: Array.isArray(sp?.abilityTags)
              ? sp!.abilityTags.map(String).slice(0, 6)
              : [],
          }))
        : [],
    }));
  }

  /** 无 AI 时的启发式：按常见竞赛维度产出结构化草稿 */
  private heuristic(text: string): CriterionDraft[] {
    const base: CriterionDraft[] = [
      { name: '需求理解', weight: 20, scorePoints: [{ name: '准确理解赛项需求与约束', abilityTags: ['需求分析'] }] },
      { name: '方案设计', weight: 20, scorePoints: [{ name: '方案完整性与合理性', abilityTags: ['系统设计'] }] },
      { name: '技术实现', weight: 30, scorePoints: [{ name: '核心技术实现质量', abilityTags: ['工程能力'] }] },
      { name: '应用成效', weight: 20, scorePoints: [{ name: '应用价值与成效佐证', abilityTags: ['成果转化'] }] },
      { name: '创新与特色', weight: 10, scorePoints: [{ name: '创新点与差异化', abilityTags: ['创新思维'] }] },
    ];
    // 若文本中出现可识别的分项，追加为评分点（轻量解析）
    const lines = text
      .split(/\n+/)
      .map((l) => l.replace(/^[\d.\-\s、]+/, '').trim())
      .filter((l) => l.length >= 4 && l.length <= 40);
    if (lines.length > 0) {
      base[2].scorePoints.push({
        name: `规程要点：${lines[0]}`,
        abilityTags: ['赛项要点'],
      });
    }
    return base;
  }

  /** 教师确认：将草稿落库为 Criterion + ScorePoint（已做租户校验） */
  async confirm(projectId: string, draft: CriterionDraft[], user: JwtPayload) {
    await this.assertProjectTenant(projectId, user.tenantId);
    if (!Array.isArray(draft) || draft.length === 0)
      throw new BadRequestException('草稿为空，无法确认');

    const created = [];
    for (const c of draft) {
      const criterion = await this.prisma.criterion.create({
        data: {
          projectId,
          name: String(c.name || '未命名要素'),
          weight: Math.max(0, Math.min(100, Number(c.weight) || 0)),
          scorePoints: {
            create: (c.scorePoints || []).map((sp) => ({
              name: String(sp.name || '未命名评分点'),
              abilityTags: Array.isArray(sp.abilityTags)
                ? sp.abilityTags.map(String).slice(0, 6)
                : [],
            })),
          },
        },
        include: { scorePoints: true },
      });
      created.push(criterion);
    }
    return created;
  }

  async removeCriterion(id: string, user: JwtPayload) {
    const criterion = await this.prisma.criterion.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!criterion) throw new NotFoundException('评分要素不存在');
    if (criterion.project.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限删除该评分要素');
    await this.prisma.criterion.delete({ where: { id } });
    return { id };
  }

  async removeScorePoint(id: string, user: JwtPayload) {
    const sp = await this.prisma.scorePoint.findUnique({
      where: { id },
      include: { criterion: { include: { project: true } } },
    });
    if (!sp) throw new NotFoundException('评分点不存在');
    if (sp.criterion.project.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限删除该评分点');
    await this.prisma.scorePoint.delete({ where: { id } });
    return { id };
  }
}
