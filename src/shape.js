// 前后端接口形状适配工具
//
// 背景：后端 `findAll` 系列接口统一走 `toPaged()`，返回
//   { items: [...], total, page, pageSize, totalPages }
// 而不是裸数组。前端若直接对返回值调 .map / .filter 会抛
// “xxx.map is not a function”。因此所有列表接口的返回值都必须先过这里。

/**
 * 把分页对象或裸数组统一解包成数组。
 * 兼容三种形态：裸数组、分页对象 { items }、以及个别接口的 { data }。
 */
export function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

/**
 * 取分页总数（拿不到时退化为数组长度）。
 */
export function unwrapTotal(payload, fallbackList) {
  if (payload && typeof payload.total === "number") return payload.total;
  if (Array.isArray(payload)) return payload.length;
  if (Array.isArray(fallbackList)) return fallbackList.length;
  return 0;
}

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * 生成顶栏「YYYY-MM-DD 星期X」文案。
 * 取本地时区的系统当日日期——此前该处为硬编码字符串，
 * 演示时与真实日期不符。
 */
export function formatToday(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}　${WEEKDAYS[d.getDay()]}`;
}

/**
 * 安全格式化 ISO 时间：非法日期返回空串，避免出现 “NaN-NaN NaN:NaN”。
 */
export function formatDateTime(iso, { withYear = false } = {}) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = withYear
    ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    : `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 后端 Project.currentStage 枚举 → 界面中文标签。 */
const STAGE_LABELS = {
  UNDERSTAND: "赛项理解",
  DESIGN: "方案设计",
  PROTOTYPE: "原型开发",
  POLISH: "作品打磨",
  DEFENSE: "模拟答辩",
  REVIEW: "赛后复盘",
};

/** 阶段枚举 → 阶段轨道上的序号（1~6），未知值回落到 4（作品打磨）。 */
const STAGE_INDEX = {
  UNDERSTAND: 1,
  DESIGN: 2,
  PROTOTYPE: 3,
  POLISH: 4,
  DEFENSE: 5,
  REVIEW: 6,
};

export function stageLabel(stage) {
  return STAGE_LABELS[stage] ?? "作品打磨";
}

export function stageIndex(stage) {
  return STAGE_INDEX[stage] ?? 4;
}
