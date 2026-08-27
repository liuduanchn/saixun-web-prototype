import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/auth.service';

export interface ReviewSummary {
  metrics: {
    taskCount: number;
    workVersions: number;
    issuesTotal: number;
    issuesClosed: number;
    defenseRounds: number;
  };
  coverage: { totalScorePoints: number; coveredScorePoints: number; coverageRate: number };
  abilityGrowth: { label: string; value: number }[];
  report: {
    effective: string[];
    shortcomings: string[];
    suggestions: string[];
  };
}

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertProjectTenant(projectId: string, tenantId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('赛项项目不存在');
    if (project.tenantId !== tenantId) throw new ForbiddenException('无权限访问该项目');
    return project;
  }

  async summary(projectId: string, user: JwtPayload): Promise<ReviewSummary> {
    await this.assertProjectTenant(projectId, user.tenantId);

    const taskCount = await this.prisma.task.count({ where: { projectId } });
    const workVersions = await this.prisma.workVersion.count({ where: { projectId } });
    const issuesTotal = await this.prisma.diagnosis.count({
      where: { workVersion: { projectId } },
    });
    const issuesClosed = await this.prisma.diagnosis.count({
      where: { workVersion: { projectId }, status: 'CONFIRMED' },
    });
    const defenseRounds = await this.prisma.defenseSession.count({ where: { projectId } });

    const totalScorePoints = await this.prisma.scorePoint.count({
      where: { criterion: { projectId } },
    });
    const coveredScorePoints = await this.prisma.scorePoint.count({
      where: { criterion: { projectId }, tasks: { some: {} } },
    });
    const coverageRate = totalScorePoints
      ? Math.round((coveredScorePoints / totalScorePoints) * 100)
      : 0;

    const highIssues = await this.prisma.diagnosis.count({
      where: { workVersion: { projectId }, severity: { in: ['HIGH', 'CRITICAL'] } },
    });

    const abilityGrowth = [
      { label: '标准理解', value: coverageRate },
      {
        label: '证据意识',
        value: issuesTotal ? Math.round((issuesClosed / issuesTotal) * 100) : 0,
      },
      { label: '作品迭代', value: Math.min(100, workVersions * 25) },
      { label: '答辩表达', value: defenseRounds ? Math.min(100, defenseRounds * 30) : 0 },
      {
        label: '协作统筹',
        value: Math.min(100, taskCount * 12 + defenseRounds * 10),
      },
    ];

    return {
      metrics: { taskCount, workVersions, issuesTotal, issuesClosed, defenseRounds },
      coverage: { totalScorePoints, coveredScorePoints, coverageRate },
      abilityGrowth,
      report: this.buildReport({
        taskCount,
        workVersions,
        issuesClosed,
        issuesTotal,
        defenseRounds,
        coverageRate,
        highIssues,
      }),
    };
  }

  private buildReport(d: {
    taskCount: number;
    workVersions: number;
    issuesClosed: number;
    issuesTotal: number;
    defenseRounds: number;
    coverageRate: number;
    highIssues: number;
  }) {
    const effective: string[] = [
      `完成 ${d.taskCount} 个训练任务，覆盖 ${d.coverageRate}% 的评分点`,
    ];
    if (d.workVersions > 0) effective.push(`产出 ${d.workVersions} 个作品版本，形成迭代记录`);
    else effective.push('尚未上传作品版本，建议补充材料以支撑诊断');
    if (d.defenseRounds > 0) effective.push(`完成 ${d.defenseRounds} 轮模拟答辩，沉淀问答记录`);
    else effective.push('尚未开展模拟答辩，建议补充答辩训练');

    const shortcomings: string[] =
      d.highIssues > 0
        ? [
            `存在 ${d.highIssues} 个高/严重风险评分点，证据链仍不完整`,
            '关键边界条件与异常场景考虑不足',
          ]
        : ['尚未识别到高风险评分点', '建议补充对照证据与前后对比数据'];

    const suggestions = [
      '补充测试样本与统计口径，强化应用成效证据链',
      '针对高风险评分点完善修改任务并形成闭环',
      '沉淀赛项模板与典型问题，复用至下一轮备赛',
    ];

    return { effective, shortcomings, suggestions };
  }
}
