/**
 * JSON / 数组字段的序列化边界工具（workbuddyDeploy 分支）
 * ------------------------------------------------------------------
 * 背景：Prisma 6 的 SQLite 连接器不支持 `Json` 与标量列表（`String[]`），
 * 因此 schema 中这几类字段已统一降级为 `String`：
 *   · 原 Json：Tenant.settings / DefenseSession.transcript /
 *     DefenseSession.evaluations / LearningEvent.payload
 *   · 原 String[]：ScorePoint.abilityTags / CaseLibrary.tags
 *
 * 使用约定（务必遵守，否则前端会拿到字符串而崩溃）：
 *   · 写入数据库前 → 一律经过 toJson()
 *   · 从数据库读出后 → 一律经过 parseJson() / parseStrArray() 还原成对象/数组
 *     再返回给上层或前端
 * 前端存在三处直接消费数组的代码（src/pages.jsx 的 abilityTags.join()、
 * tags.map()、transcript.map()），后端出口若漏掉还原会直接抛 TypeError 导致白屏。
 */

/** 解析 JSON 文本；已是对象则原样返回；失败或空值返回 fallback。 */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T; // 兼容已是对象的旧数据
  const text = value.trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** 序列化为 JSON 文本（写入数据库前调用）。 */
export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** 还原字符串数组字段（原 String[]）。 */
export function parseStrArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}
