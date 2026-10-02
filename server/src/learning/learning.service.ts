import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/auth.service';
import { parseJson, toJson } from '../common/json';

export interface LearningEventView {
  id: string;
  type: string;
  title: string;
  detail: string;
  createdAt: string;
}

export interface LearningSummary {
  abilities: { label: string; value: number }[];
  totalEvents: number;
}

const TYPE_META: Record<string, { label: string; icon: string }> = {
  CRITERIA_PARSED: { label: '赛项解析', icon: 'BookOpenText' },
  TASK_CREATED: { label: '任务创建', icon: 'ListChecks' },
  TASK_DONE: { label: '任务完成', icon: 'CheckCircle' },
  WORK_UPLOADED: { label: '作品上传', icon: 'Upload' },
  DIAGNOSIS_RUN: { label: '作品诊断', icon: 'MagnifyingGlass' },
  DEFENSE_RUN: { label: '模拟答辩', icon: 'UsersThree' },
  REVIEW_GENERATED: { label: '赛后复盘', icon: 'Medal' },
};

@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  iconOf(type: string): string {
    return TYPE_META[type]?.icon ?? 'Circle';
  }

  private titleOf(ev: { type: string; payload: Record<string, unknown> }): { title: string; detail: string } {
    const meta = TYPE_META[ev.type] ?? { label: ev.type };
    const p = ev.payload ?? {};
    const title = (p.title as string) ?? meta.label;
    let detail = '';
    switch (ev.type) {
      case 'DIAGNOSIS_RUN':
        detail = `识别 ${p.findings ?? 0} 条问题发现`;
        break;
      case 'DEFENSE_RUN':
        detail = `完成 ${p.rounds ?? 1} 轮模拟答辩`;
        break;
      case 'CRITERIA_PARSED':
        detail = `拆解 ${p.points ?? 0} 个评分点`;
        break;
      case 'WORK_UPLOADED':
        detail = `上传版本 V${p.version ?? 1}`;
        break;
      case 'TASK_CREATED':
      case 'TASK_DONE':
        detail = `状态：${p.status ?? '待办'}`;
        break;
      case 'REVIEW_GENERATED':
        detail = `覆盖率 ${p.coverage ?? 0}%`;
        break;
      default:
        detail = '';
    }
    return { title, detail };
  }

  async events(user: JwtPayload): Promise<LearningEventView[]> {
    const list = await this.prisma.learningEvent.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return list.map((ev) => {
      // payload 在库中以 JSON 文本存储（SQLite 不支持 Json 类型），先还原再交给 titleOf
      const { title, detail } = this.titleOf({
        type: ev.type,
        payload: parseJson<Record<string, unknown>>(ev.payload, {}),
      });
      return {
        id: ev.id,
        type: ev.type,
        title,
        detail,
        createdAt: ev.createdAt.toISOString(),
      };
    });
  }

  async summary(user: JwtPayload): Promise<LearningSummary> {
    const totalEvents = await this.prisma.learningEvent.count({ where: { userId: user.sub } });
    const all = await this.prisma.learningEvent.findMany({
      where: { userId: user.sub },
      select: { type: true },
    });
    const byType: Record<string, number> = {};
    for (const e of all) byType[e.type] = (byType[e.type] ?? 0) + 1;

    const abilities = [
      { label: '赛项解析', value: Math.min(100, (byType.CRITERIA_PARSED ?? 0) * 60 + (totalEvents ? 40 : 0)) },
      { label: '任务执行', value: Math.min(100, (byType.TASK_CREATED ?? 0) * 25 + (byType.TASK_DONE ?? 0) * 20) },
      { label: '作品迭代', value: Math.min(100, (byType.WORK_UPLOADED ?? 0) * 35) },
      { label: '诊断复盘', value: Math.min(100, (byType.DIAGNOSIS_RUN ?? 0) * 40 + (byType.REVIEW_GENERATED ?? 0) * 30) },
      { label: '答辩训练', value: Math.min(100, (byType.DEFENSE_RUN ?? 0) * 45) },
      { label: '学习活跃度', value: Math.min(100, totalEvents * 12) },
    ];
    return { abilities, totalEvents };
  }

  /** 学习埋点：在教学动作发生时记录一条 LearningEvent（替代纯 seed 数据） */
  async track(input: { userId: string; type: string; payload?: Record<string, unknown> }) {
    return this.prisma.learningEvent.create({
      data: {
        userId: input.userId,
        type: input.type,
        payload: toJson(input.payload ?? {}),
      },
    });
  }
}
