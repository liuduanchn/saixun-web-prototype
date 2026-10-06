/**
 * 资源附件文档的生成与回填（演示数据用）
 * ------------------------------------------------------------------
 * 背景：示例资源原先只有名称/说明，没有 fileRef，前端点开也无文件可下载。
 * 这里为每条资源生成一份**可打开、内容说得通**的文档，落盘到 uploads/，
 * 并把 key 写回 Resource.fileRef（前端经 storage.getUrl 得到 /api/files/<key>）。
 *
 * 约定与 WorkVersion 完全一致：
 *   · key   = `${tenantId}/${fileName}`（storage.resolveWithinRoot 已防目录穿越）
 *   · 目录  = `<cwd>/uploads/<tenantId>`（prisma:seed 的 cwd 为 server/）
 *   · 文件名用 `resource-<type>-<id>.md`：纯 ASCII + 稳定 id，避免中文名出现在 URL 里
 *
 * 为什么用 Markdown 而不是 docx：仓库没有 docx 生成库；演示关注的是「能下载、内容可信」，
 * .md 用系统字体清晰可读，且体积小、可纳入版本管理。
 */
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { PrismaClient } from '@prisma/client';

/** 按资源类型生成文档正文 */
export function resourceDocContent(
  type: string,
  projectName: string,
  description?: string | null,
): string {
  const head = `# ${projectName}\n\n> ${description ?? '赛训智舱演示资源'}\n\n`;
  const foot = `\n\n---\n\n本文档由赛训智舱在初始化演示数据时生成，用于演示「资源知识库 → 下载」链路。\n`;

  if (type === 'TEMPLATE') {
    return head + `## 一、赛项信息

| 项目 | 内容 |
| --- | --- |
| 赛项名称 | ${projectName} |
| 参赛组别 | |
| 评分标准版本 | |

## 二、评分表拆解

| 评分维度 | 权重 | 关键评分点 | 证据形式 |
| --- | --- | --- | --- |
| 功能完整性 | | | 功能清单、测试记录 |
| 技术路线 | | | 架构图、关键实现说明 |
| 创新价值 | | | 创新点对照表 |
| 应用成效 | | | 测试样本、统计口径、前后对比 |
| 展示表达 | | | 作品说明、答辩记录 |

## 三、能力要求 → 训练任务映射

| 能力要求 | 对应训练任务 | 完成标准 |
| --- | --- | --- |
| | | |

## 四、阶段检查清单

- [ ] 赛项理解：确认评分要素与权重
- [ ] 方案设计：技术路线对齐得分逻辑
- [ ] 原型开发：每个阶段留下可核对的证据
- [ ] 作品打磨：按诊断结论补齐证据缺口
- [ ] 模拟答辩：预演高频问题并记录回答
- [ ] 赛后复盘：沉淀可复用模板
` + foot;
  }

  if (type === 'CASE') {
    return head + `## 一、作品概览

- 所属赛项：${projectName}
- 获奖情况：
- 作品形态：应用系统 / 算法方案 / 硬件原型

## 二、亮点拆解（对应评分点）

| 评分点 | 作品中的做法 | 可复用点 |
| --- | --- | --- |
| | | |

## 三、证据链说明

说明作品如何提供**可核验**的应用成效证据：测试样本来源、统计口径、
优化前后的核心指标对比，以及与赛项评分点的对应关系。

## 四、可借鉴与需规避

**值得借鉴**

-

**容易踩坑**

-
` + foot;
  }

  if (type === 'QUESTION_BANK') {
    return head + `## 一、选择题

1. 题干
   - A.
   - B.
   - C.
   - D.

   答案：　解析：

## 二、判断题

1. 题干　（　）

   答案：　解析：

## 三、简答题

1. 题干

   参考答案要点：
` + foot;
  }

  return head + `## 一、关键技术栈

| 技术 | 用途 | 版本 |
| --- | --- | --- |
| | | |

## 二、学习路径

1. 入门：
2. 进阶：
3. 实战：

## 三、参考资料

-

## 四、常见问题

| 问题 | 处理方式 |
| --- | --- |
| | |
` + foot;
}

/** 写入一份资源文档并返回 fileRef（key 形如 <tenantId>/resource-template-<id>.md） */
export async function writeResourceDoc(
  tenantId: string,
  resourceId: string,
  type: string,
  projectName: string,
  description?: string | null,
): Promise<string> {
  const fileName = `resource-${type.toLowerCase()}-${resourceId}.md`;
  const dir = join(process.cwd(), 'uploads', tenantId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), resourceDocContent(type, projectName, description), 'utf8');
  return `${tenantId}/${fileName}`;
}

/**
 * 为所有**缺少附件**的资源补生成文档（幂等）。
 * 放在 seed 末尾调用，既能让新库一次到位，也能修复历史库（含线上已建好的库）。
 */
export async function backfillResourceFiles(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.resource.findMany({
    where: { OR: [{ fileRef: null }, { fileRef: '' }] },
    include: { project: { select: { tenantId: true, name: true } } },
  });
  for (const r of rows) {
    if (!r.project?.tenantId) continue;
    const fileRef = await writeResourceDoc(
      r.project.tenantId,
      r.id,
      r.type,
      r.project.name ?? r.name,
      r.description,
    );
    await prisma.resource.update({ where: { id: r.id }, data: { fileRef } });
  }
  return rows.length;
}
