// src/shape.js 的单元测试：分页解包、日期格式化、阶段映射
import test from "node:test";
import assert from "node:assert/strict";

import { formatDateTime, formatToday, stageIndex, stageLabel, unwrapList, unwrapTotal } from "../src/shape.js";

test("unwrapList 兼容裸数组 / 分页对象 / data 包裹 / 空值", () => {
  const items = [{ id: 1 }, { id: 2 }];
  assert.deepEqual(unwrapList(items), items, "裸数组应原样返回");
  assert.deepEqual(unwrapList({ items, total: 2, page: 1 }), items, "应取 .items");
  assert.deepEqual(unwrapList({ data: items }), items, "应取 .data");
  assert.deepEqual(unwrapList(null), [], "null 应回退为空数组");
  assert.deepEqual(unwrapList({}), [], "无列表字段应回退为空数组");
  assert.deepEqual(unwrapList(42), [], "非对象应回退为空数组");
});

test("unwrapList 不会因缺少 .map 而抛错（此前登录报错的根因）", () => {
  const payload = { items: [{ id: "a" }], total: 1, page: 1, pageSize: 20, totalPages: 1 };
  assert.doesNotThrow(() => unwrapList(payload).map((x) => x.id));
  assert.equal(unwrapList(payload).map((x) => x.id)[0], "a");
});

test("unwrapTotal 优先取分页 total，退化为数组长度", () => {
  assert.equal(unwrapTotal({ items: [1], total: 37 }), 37);
  assert.equal(unwrapTotal([1, 2, 3]), 3);
  assert.equal(unwrapTotal(null, [1, 2]), 2);
  assert.equal(unwrapTotal(undefined, undefined), 0);
});

test("formatToday 取本地当日并输出中文星期", () => {
  // 2026-10-03 是星期六
  const text = formatToday(new Date(2026, 9, 3));
  assert.equal(text, "2026-10-03　星期六");
  assert.match(formatToday(), /^\d{4}-\d{2}-\d{2}　(星期日|星期一|星期二|星期三|星期四|星期五|星期六)$/);
});

test("formatToday 对非法日期回退到当前时间而不抛错", () => {
  assert.doesNotThrow(() => formatToday(new Date("not-a-date")));
  assert.match(formatToday(new Date(NaN)), /^\d{4}-\d{2}-\d{2}　/);
});

test("formatDateTime 非法输入返回空串而非 NaN", () => {
  assert.equal(formatDateTime(""), "");
  assert.equal(formatDateTime(null), "");
  assert.equal(formatDateTime("garbage"), "");
  assert.match(formatDateTime("2026-10-03T04:05:00Z"), /^\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.match(formatDateTime("2026-10-03T04:05:00Z", { withYear: true }), /^2026-\d{2}-\d{2} /);
});

test("stageLabel / stageIndex 覆盖后端全部枚举并对未知值兜底", () => {
  assert.equal(stageLabel("UNDERSTAND"), "赛项理解");
  assert.equal(stageLabel("DESIGN"), "方案设计");
  assert.equal(stageLabel("PROTOTYPE"), "原型开发");
  assert.equal(stageLabel("POLISH"), "作品打磨");
  assert.equal(stageLabel("DEFENSE"), "模拟答辩");
  assert.equal(stageLabel("REVIEW"), "赛后复盘");
  assert.equal(stageLabel("WHATEVER"), "作品打磨", "未知阶段应兜底");

  assert.equal(stageIndex("UNDERSTAND"), 1);
  assert.equal(stageIndex("REVIEW"), 6);
  assert.equal(stageIndex("UNKNOWN"), 4);
  assert.equal(stageIndex(undefined), 4);
});

test("六阶段索引与标签顺序一致（轨道渲染依赖该映射）", () => {
  const labels = ["UNDERSTAND", "DESIGN", "PROTOTYPE", "POLISH", "DEFENSE", "REVIEW"].map(stageLabel);
  assert.deepEqual(labels, ["赛项理解", "方案设计", "原型开发", "作品打磨", "模拟答辩", "赛后复盘"]);
});
