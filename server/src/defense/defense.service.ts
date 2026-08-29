import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AI_PROVIDER, AiProvider, ChatMessage } from '../ai/ai.interface';
import { STORAGE_PROVIDER, StorageProvider } from '../storage/storage.interface';
import { JwtPayload } from '../auth/auth.service';
import { LearningService } from '../learning/learning.service';
import { extractJson } from '../common/llm.util';

interface TranscriptEntry {
  round: number;
  role: 'judge' | 'student';
  content: string;
  evaluation?: { logic: number; evidence: number; accuracy: number; comment: string };
}
interface RoundEval {
  round: number;
  scores: { logic: number; evidence: number; accuracy: number };
  comment: string;
}
interface Evaluations {
  maxRounds: number;
  rounds: RoundEval[];
  overall?: string;
  done?: boolean;
}

@Injectable()
export class DefenseService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly learning: LearningService,
  ) {}

  private async assertProjectTenant(projectId: string, tenantId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('赛项项目不存在');
    if (project.tenantId !== tenantId) throw new ForbiddenException('无权限访问该项目');
    return project;
  }

  /** 收集答辩上下文：评分点列表 + 最新作品文本 */
  private async buildContext(projectId: string) {
    const points = await this.prisma.scorePoint.findMany({
      where: { criterion: { projectId } },
      include: { criterion: true },
    });
    const pointList = points
      .map((p) => `- 【${p.criterion.name}】${p.name}`)
      .join('\n');

    const latest = await this.prisma.workVersion.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: { fileRef: true },
    });
    let workText = '';
    if (latest) {
      try {
        const buf = await this.storage.read(latest.fileRef);
        if (buf.length <= 512 * 1024) workText = buf.toString('utf8').slice(0, 4000);
      } catch {
        /* ignore */
      }
    }
    return { pointList, workText };
  }

  /** 发起模拟答辩：生成第 1 轮评委追问 */
  async create(projectId: string, maxRounds: number, user: JwtPayload) {
    await this.assertProjectTenant(projectId, user.tenantId);
    const rounds = Math.max(1, Math.min(6, maxRounds || 3));
    const { pointList, workText } = await this.buildContext(projectId);

    let question: string;
    try {
      question = await this.callAiFirstQuestion(pointList, workText);
    } catch {
      question = this.heuristicQuestion(1);
    }

    const transcript: TranscriptEntry[] = [
      { round: 1, role: 'judge', content: question },
    ];
    const evaluations: Evaluations = { maxRounds: rounds, rounds: [] };

    const session = await this.prisma.defenseSession.create({
      data: { projectId, round: 1, transcript: transcript as any, evaluations: evaluations as any },
    });

    // 事件驱动：为答辩发起者记录学习埋点
    await this.learning.track({
      userId: user.sub,
      type: 'DEFENSE_RUN',
      payload: { rounds },
    });

    return session;
  }

  private async callAiFirstQuestion(pointList: string, workText: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是职业技能竞赛模拟答辩评委。请基于评分要点与学生作品，提出聚焦最关键得分点的第1个答辩问题。' +
          '只输出 JSON：{question:"问题内容"}。不要输出多余文字。',
      },
      {
        role: 'user',
        content:
          `评分要点：\n${pointList || '（暂无）'}\n\n` +
          `作品摘要：\n${workText || '（未提供可解析作品）'}\n\n请提出第1个答辩问题。`,
      },
    ];
    const raw = await this.ai.chat(messages, { temperature: 0.6, maxTokens: 600 });
    const json = extractJson<{ question?: string }>(raw);
    if (!json?.question) throw new Error('AI 未返回问题');
    return json.question;
  }

  /** 学生作答：评分 + 下一轮追问 / 总评 */
  async answer(id: string, answerText: string, user: JwtPayload) {
    const session = await this.prisma.defenseSession.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!session) throw new NotFoundException('答辩会话不存在');
    if (session.project.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限参与该答辩');
    if (!answerText || !answerText.trim())
      throw new BadRequestException('作答内容不能为空');

    const transcript = (session.transcript as unknown as TranscriptEntry[]) || [];
    const evaluations = (session.evaluations as unknown as Evaluations) || {
      maxRounds: 3,
      rounds: [],
    };
    if (evaluations.done) throw new BadRequestException('答辩已结束，可重新发起新会话');

    const lastJudge = [...transcript].reverse().find((t) => t.role === 'judge');
    const currentRound = evaluations.rounds.length + 1;
    const isLast = currentRound >= evaluations.maxRounds;

    const { pointList, workText } = await this.buildContext(session.projectId);

    let evaluation: RoundEval['scores'] & { comment: string };
    let nextQuestion: string | null = null;
    let finalSummary: string | undefined;

    try {
      const result = await this.callAiEvaluate(
        pointList,
        workText,
        lastJudge?.content || '',
        answerText,
        currentRound,
        evaluations.maxRounds,
      );
      evaluation = result.evaluation;
      nextQuestion = result.nextQuestion ?? null;
      finalSummary = result.finalSummary;
    } catch {
      const h = this.heuristicEvaluate(answerText, currentRound);
      evaluation = h.evaluation;
      nextQuestion = h.nextQuestion;
      finalSummary = h.finalSummary;
    }

    transcript.push({
      round: currentRound,
      role: 'student',
      content: answerText,
      evaluation: {
        logic: evaluation.logic,
        evidence: evaluation.evidence,
        accuracy: evaluation.accuracy,
        comment: evaluation.comment,
      },
    });
    if (nextQuestion) {
      transcript.push({ round: currentRound + 1, role: 'judge', content: nextQuestion });
    }

    evaluations.rounds.push({
      round: currentRound,
      scores: { logic: evaluation.logic, evidence: evaluation.evidence, accuracy: evaluation.accuracy },
      comment: evaluation.comment,
    });
    if (finalSummary) {
      evaluations.overall = finalSummary;
      evaluations.done = true;
    }

    const updated = await this.prisma.defenseSession.update({
      where: { id },
      data: {
        round: nextQuestion ? currentRound + 1 : currentRound,
        transcript: transcript as any,
        evaluations: evaluations as any,
      },
    });
    return updated;
  }

  private async callAiEvaluate(
    pointList: string,
    workText: string,
    question: string,
    answer: string,
    round: number,
    maxRounds: number,
  ): Promise<{
    evaluation: { logic: number; evidence: number; accuracy: number; comment: string };
    nextQuestion?: string;
    finalSummary?: string;
  }> {
    const isLast = round >= maxRounds;
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是职业技能竞赛模拟答辩评委。基于评分要点、作品与学生的回答进行评估。' +
          '严格输出 JSON：若还需继续追问，返回 {evaluation:{logic,evidence,accuracy(均为0-100整数),comment(中文简评)}, ' +
          'nextQuestion:"下一个问题"}；若已是最后一轮，返回 {evaluation:{...}, finalSummary:"总体评价与改进建议(中文)"}。不要输出多余文字。',
      },
      {
        role: 'user',
        content:
          `评分要点：\n${pointList || '（暂无）'}\n\n` +
          `作品摘要：\n${workText || '（未提供）'}\n\n` +
          `评委提问：\n${question}\n\n` +
          `学生作答：\n${answer}\n\n` +
          `当前第 ${round}/${maxRounds} 轮。${isLast ? '请直接给出总评(finalSummary)。' : '请评分并给出下一轮追问(nextQuestion)。'}`,
      },
    ];
    const raw = await this.ai.chat(messages, { temperature: 0.5, maxTokens: 1200 });
    const json = extractJson<{
      evaluation?: { logic: number; evidence: number; accuracy: number; comment: string };
      nextQuestion?: string;
      finalSummary?: string;
    }>(raw);
    if (!json?.evaluation) throw new Error('AI 未返回评估');
    return {
      evaluation: {
        logic: Math.max(0, Math.min(100, Number(json.evaluation.logic) || 0)),
        evidence: Math.max(0, Math.min(100, Number(json.evaluation.evidence) || 0)),
        accuracy: Math.max(0, Math.min(100, Number(json.evaluation.accuracy) || 0)),
        comment: String(json.evaluation.comment || ''),
      },
      nextQuestion: json.nextQuestion,
      finalSummary: json.finalSummary,
    };
  }

  async list(projectId: string, user: JwtPayload) {
    await this.assertProjectTenant(projectId, user.tenantId);
    return this.prisma.defenseSession.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string, user: JwtPayload) {
    const session = await this.prisma.defenseSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('答辩会话不存在');
    const project = await this.prisma.project.findUnique({ where: { id: session.projectId } });
    if (project?.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限访问该答辩');
    return session;
  }

  /** 删除答辩记录：校验租户归属后物理删除 */
  async delete(id: string, user: JwtPayload) {
    const session = await this.prisma.defenseSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('答辩会话不存在');
    const project = await this.prisma.project.findUnique({ where: { id: session.projectId } });
    if (project?.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限删除该答辩');
    await this.prisma.defenseSession.delete({ where: { id } });
    return { id };
  }

  /** 重命名答辩记录标题（本人租户内）；空标题视为清除 */
  async rename(id: string, title: string, user: JwtPayload) {
    const session = await this.prisma.defenseSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('答辩会话不存在');
    const project = await this.prisma.project.findUnique({ where: { id: session.projectId } });
    if (project?.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限修改该答辩');
    const updated = await this.prisma.defenseSession.update({
      where: { id },
      data: { title: title ? title.trim().slice(0, 80) : null },
    });
    return updated;
  }

  // ---- 启发式兜底（无 AI 密钥时本地可用）----
  private heuristicQuestion(round: number): string {
    const qs = [
      '请简要说明你的作品是如何理解并落实赛项需求的？',
      '作品中核心技术实现的关键难点是什么，你是如何解决的？',
      '请阐述作品的应用成效与可量化的价值体现。',
      '相比同类方案，你的作品有哪些创新与差异化？',
      '如果继续打磨，你最想改进哪一部分，为什么？',
    ];
    return qs[(round - 1) % qs.length];
  }

  private heuristicEvaluate(answer: string, round: number) {
    const len = answer.trim().length;
    const base = Math.max(40, Math.min(95, 45 + Math.floor(len / 6)));
    const jitter = (round * 3) % 11;
    const evaluation = {
      logic: Math.min(100, base),
      evidence: Math.min(100, base - 8 + jitter),
      accuracy: Math.min(100, base - 4),
      comment: len > 30 ? '作答较完整，建议补充更具体的佐证与数据。' : '作答偏短，建议展开说明并举例。',
    };
    const maxRounds = 3;
    const isLast = round >= maxRounds;
    return {
      evaluation,
      nextQuestion: isLast ? null : this.heuristicQuestion(round + 1),
      finalSummary: isLast
        ? '整体表现良好，建议在证据充分性与技术细节上继续打磨，突出应用成效与创新点。'
        : undefined,
    };
  }
}
