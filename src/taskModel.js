// 后端 Task 模型 <-> 前端展示模型的转换工具（驾驶舱与训练任务中心共用）

export const STATUS_COLUMNS = [
  { key: "TODO", label: "待开始", tone: "neutral" },
  { key: "IN_PROGRESS", label: "进行中", tone: "blue" },
  { key: "IN_REVIEW", label: "待审核", tone: "cyan" },
  { key: "NEEDS_FIX", label: "需修改", tone: "orange" },
  { key: "DONE", label: "已完成", tone: "green" },
];

export function formatDue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

/** 将后端任务对象转换为前端展示结构 */
export function normalizeTask(task) {
  const done = task.status === "DONE" || task.done;
  const owner = task.owner?.name ?? "待分配";
  let priority = "中优先级";
  if (done) priority = "已完成";
  else if (task.status === "NEEDS_FIX") priority = "高优先级";
  let due = "待排期";
  if (done) due = "已完成";
  else if (task.dueDate) due = `${formatDue(task.dueDate)} 截止`;
  const scorePoints = Array.isArray(task.scorePoints) ? task.scorePoints : [];
  return {
    id: task.id,
    title: task.title,
    priority,
    owner,
    due,
    done,
    status: task.status,
    scorePoints,
  };
}

/** 将任务列表按状态分组成看板列 */
export function buildColumns(tasks) {
  const columns = STATUS_COLUMNS.map((c) => ({ ...c, items: [] }));
  for (const t of tasks) {
    const col = columns.find((c) => c.key === t.status) || columns[0];
    col.items.push(t);
  }
  return columns;
}
