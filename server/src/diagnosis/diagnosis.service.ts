import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER, StorageProvider } from '../storage/storage.interface';
import { AI_PROVIDER, AiProvider, ChatMessage } from '../ai/ai.interface';
import { JwtPayload } from '../auth/auth.service';
import { Severity, DiagnosisStatus } from '@prisma/client';

interface Finding {
  index?: number;
  scorePointName: string;
  matchScore: number;
  severity: Severity;
  issues: string;
  suggestions: string;
}

@Injectable()
export class DiagnosisService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  private async assertWorkTenant(workVersionId: string, tenantId: string) {
    const wv = await this.prisma.workVersion.findUnique({
      where: { id: workVersionId },
      include: { project: true },
    });
    if (!wv) throw new NotFoundException('作品版本不存在');
    if (wv.project.tenantId !== tenantId)
      throw new ForbiddenException('无权限访问该作品');
    return wv;
  }

  /** 读取作品文本内容（仅文本类且 <512KB；否则返回空串，由模型/启发式兜底） */
  private async readText(fileRef: string): Promise<string> {
    try {
      const buf = await this.storage.read(fileRef);
      if (buf.length > 512 * 1024) return '';
      return buf.toString('utf8');
    } catch {
      return '';
    }
  }

  /** 诊断：作品内容 vs 评分标准，逐项产出匹配度/缺口/建议，并持久化 */
  async analyze(workVersionId: string, user: JwtPayload) {
    const wv = await this.assertWorkTenant(workVersionId, user.tenantId);
    const points = await this.prisma.scorePoint.findMany({
      where: { criterion: { projectId: wv.projectId } },
      include: { criterion: true },
    });
    if (points.length === 0)
      throw new BadRequestException('该项目尚无评分点，请先在赛项解析中配置评分标准');

    const content = await this.readText(wv.fileRef);

    let findings: Finding[];
    try {
      findings = await this.callAi(points, content);
    } catch {
      findings = this.heuristic(points, content);
    }

    // 重新诊断前清理该作品版本的旧记录，避免重复累积
    await this.prisma.diagnosis.deleteMany({ where: { workVersionId } });

    const created: unknown[] = [];
    for (const f of findings) {
      // 优先按模型返回的序号精确匹配；否则回退到名称（去除空白后）匹配
      const norm = (s: string) => s.replace(/\s+/g, '');
      const sp =
        (f.index && points[f.index - 1]) ||
        points.find((p) => norm(p.name) === norm(f.scorePointName)) ||
        points.find((p) => p.name.includes(f.scorePointName) || f.scorePointName.includes(p.name));
      if (!sp) continue;
      created.push(
        await this.prisma.diagnosis.create({
          data: {
            workVersionId,
            scorePointId: sp.id,
            matchScore: Math.max(0, Math.min(100, Math.round(f.matchScore))),
            severity: f.severity,
            issues: f.issues,
            suggestions: f.suggestions,
          },
          include: { scorePoint: { include: { criterion: true } } },
        }),
      );
    }
    return created;
  }

  /** 真实调用大模型：要求返回 JSON 数组（每项对应一个评分点） */
  private async callAi(
    points: { name: string; criterion: { name: string } }[],
    content: string,
  ): Promise<Finding[]> {
    const pointList = points
      .map((p, i) => `${i + 1}. 【${p.criterion.name}】${p.name}`)
      .join('\n');
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是职业技能竞赛作品评审专家。请根据评分标准逐项评估学生作品，' +
          '输出严格的 JSON 数组，每个元素包含：index(整数，须与下方评分标准列表中的序号一一对应，从1开始)、' +
          'scorePointName(评分点名称，只写纯名称，不要包含序号或【】前缀)、' +
          'matchScore(0-100 整数，作品对该评分点的达成度)、severity(LOW/MEDIUM/HIGH/CRITICAL 之一)、' +
          'issues(中文，指出不足，不超过120字)、suggestions(中文，改进建议，不超过120字)。不要输出多余文字，也不要用代码块包裹。',
      },
      {
        role: 'user',
        content:
          `评分标准列表：\n${pointList}\n\n` +
          `学生作品内容：\n${content || '（未提供可解析文本，请基于评分点给出通用性评估）'}`,
      },
    ];
    const raw = await this.ai.chat(messages, { temperature: 0.2, maxTokens: 4000 });
    const json = this.extractJsonArray(raw);
    return json.map((item: Record<string, unknown>) => ({
      index: Number(item.index ?? 0),
      scorePointName: String(item.scorePointName ?? ''),
      matchScore: Number(item.matchScore ?? 60),
      severity: this.toSeverity(item.severity),
      issues: String(item.issues ?? ''),
      suggestions: String(item.suggestions ?? ''),
    }));
  }

  /** 无 AI 密钥或调用失败时的启发式兜底（保证闭环可本地验证） */
  private heuristic(
    points: { name: string }[],
    content: string,
  ): Finding[] {
    return points.map((p, i) => {
      // 依据评分点名词是否出现在作品文本中，给出确定性评分
      const hit = content && content.includes(p.name);
      const base = hit ? 78 : 55 + (i % 4) * 6;
      const matchScore = base;
      const severity: Severity = matchScore >= 75 ? 'LOW' : matchScore >= 60 ? 'MEDIUM' : 'HIGH';
      return {
        scorePointName: p.name,
        matchScore,
        severity,
        issues: hit ? '作品中有所涉及，但深度与佐证材料仍显不足。' : '作品中未发现该评分点的明确体现。',
        suggestions: `建议补充「${p.name}」相关的说明、实现或佐证材料，提升达成度。`,
      };
    });
  }

  private toSeverity(v: unknown): Severity {
    const s = String(v).toUpperCase();
    if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(s)) return s as Severity;
    return 'MEDIUM';
  }

  private extractJsonArray(raw: string): Record<string, unknown>[] {
    try {
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      if (start >= 0 && end > start) {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>[];
      }
    } catch {
      // 响应被截断（token 超限）时，尝试截到最后一个完整对象再补齐，避免整批丢失
      const start = raw.indexOf('[');
      const lastObj = raw.lastIndexOf('}');
      if (start >= 0 && lastObj > start) {
        try {
          return JSON.parse(raw.slice(start, lastObj + 1) + ']') as Record<string, unknown>[];
        } catch {
          /* ignore */
        }
      }
    }
    return [];
  }

  async findByWorkVersion(workVersionId: string, user: JwtPayload) {
    await this.assertWorkTenant(workVersionId, user.tenantId);
    return this.prisma.diagnosis.findMany({
      where: { workVersionId },
      include: { scorePoint: { include: { criterion: true } } },
      orderBy: { matchScore: 'asc' },
    });
  }

  /** 教师复核：确认/驳回；确认且为高严重度缺口时，真实生成一条修改任务 */
  async review(id: string, status: DiagnosisStatus, user: JwtPayload) {
    const diag = await this.prisma.diagnosis.findUnique({
      where: { id },
      include: { workVersion: { include: { project: true } }, scorePoint: true },
    });
    if (!diag) throw new NotFoundException('诊断项不存在');
    if (diag.workVersion.project.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限复核该诊断');

    const updated = await this.prisma.diagnosis.update({
      where: { id },
      data: { status },
      include: { scorePoint: { include: { criterion: true } } },
    });

    let createdTask: unknown = null;
    if (status === 'CONFIRMED' && (diag.severity === 'HIGH' || diag.severity === 'CRITICAL')) {
      createdTask = await this.prisma.task.create({
        data: {
          projectId: diag.workVersion.projectId,
          title: `修改：${diag.scorePoint.name}`,
          status: 'NEEDS_FIX',
          done: false,
          scorePoints: { connect: [{ id: diag.scorePointId }] },
        },
        include: { scorePoints: true },
      });
    }
    return { diagnosis: updated, createdTask };
  }
}
