import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseStrArray, toJson } from '../common/json';
import { z } from 'zod';

const CreateCaseSchema = z.object({
  title: z.string().min(1, '案例标题不能为空').max(200),
  content: z.string().min(1, '案例内容不能为空'),
  category: z.string().max(50).default('通用'),
  tags: z.array(z.string()).default([]),
  projectId: z.string().optional(),
});

export type CreateCaseInput = z.infer<typeof CreateCaseSchema>;

/** 清理查询串：仅保留中英文与数字、空白，避免注入与噪声词。 */
function sanitizeQuery(q: string): string {
  return (q || '').replace(/[^\w一-龥\s]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

/** 生成二元组（bigram）集合：中文无空格，用相邻 2 字窗口作为匹配单元，
 *  规避 Postgres 'simple' 配置不做中文分词的缺陷，零扩展依赖即可召回相关案例。 */
function bigrams(s: string): Set<string> {
  const clean = (s || '').replace(/\s+/g, '');
  const set = new Set<string>();
  for (let i = 0; i + 1 < clean.length; i++) set.add(clean.slice(i, i + 2));
  return set;
}

@Injectable()
export class CaseLibraryService {
  constructor(private readonly prisma: PrismaService) {}

  /** 出口统一还原：tags 在库中以 JSON 文本存储，返回前还原为字符串数组 */
  private present<T extends { tags: unknown }>(row: T) {
    return { ...row, tags: parseStrArray(row.tags) };
  }

  async create(input: unknown, tenantId: string) {
    const parsed = CreateCaseSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(parsed.error.issues[0]?.message ?? '参数错误');
    const { title, content, category, tags, projectId } = parsed.data;
    const created = await this.prisma.caseLibrary.create({
      data: { tenantId, title, content, category, tags: toJson(tags), projectId: projectId ?? null },
    });
    return this.present(created);
  }

  /**
   * 检索 top-K 相关案例（RAG 检索阶段）。
   * 采用二元组（bigram）重叠打分：对中文友好、零扩展依赖，可在案例库规模不大时
   * 于应用层完成召回，按标题加权后的重叠度排序，限定当前租户。
   */
  async search(tenantId: string, query: string, limit = 5) {
    const q = sanitizeQuery(query).replace(/\s+/g, '');
    if (!q) return [];
    const cases = await this.prisma.caseLibrary.findMany({
      where: { tenantId },
      take: 200,
    });
    const qg = bigrams(q);
    if (qg.size === 0) return [];
    const scored = cases
      .map((c) => {
        const hay = `${c.title} ${c.content}`;
        const hg = bigrams(hay);
        const titleG = bigrams(c.title);
        let body = 0;
        let title = 0;
        qg.forEach((g) => {
          if (hg.has(g)) body++;
          if (titleG.has(g)) title++;
        });
        return { c, score: body + title * 2 };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((x) => this.present(x.c));
  }

  async findByTenant(tenantId: string, projectId?: string) {
    const rows = await this.prisma.caseLibrary.findMany({
      where: projectId ? { tenantId, projectId } : { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.present(row));
  }
}
