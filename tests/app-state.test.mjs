import test from "node:test";
import assert from "node:assert/strict";

import {
  authenticate,
  clearSession,
  loginWithStorage,
  loadSession,
  resolvePage,
  saveSession,
} from "../src/appState.js";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test("accepts the configured teacher demo credentials", () => {
  assert.deepEqual(authenticate("teacher", "123456"), {
    ok: true,
    user: { username: "teacher", name: "张老师", role: "指导教师" },
  });
});

test("rejects credentials that do not exactly match the demo account", () => {
  assert.deepEqual(authenticate("teacher", "12345"), {
    ok: false,
    error: "账号或密码错误，请使用测试账号登录",
  });
});

test("does not report a persistent login when browser storage rejects the session", () => {
  const unavailableStorage = {
    getItem() { return null; },
    setItem() { throw new Error("storage disabled"); },
    removeItem() {},
  };

  assert.deepEqual(loginWithStorage(unavailableStorage, "teacher", "123456"), {
    ok: false,
    error: "无法保存登录状态，请检查浏览器存储权限",
  });
});

test("persists, restores, and clears a valid session", () => {
  const storage = createStorage();
  const user = { username: "teacher", name: "张老师", role: "指导教师" };

  assert.equal(saveSession(storage, user), true);
  assert.deepEqual(loadSession(storage), user);
  clearSession(storage);
  assert.equal(loadSession(storage), null);
});

test("ignores malformed or unauthorized stored sessions", () => {
  const storage = createStorage();
  storage.setItem("saixun-session", "not-json");
  assert.equal(loadSession(storage), null);

  storage.setItem("saixun-session", JSON.stringify({ username: "visitor" }));
  assert.equal(loadSession(storage), null);
});

test("resolves every supported menu label to a distinct page key", () => {
  const expected = {
    "竞赛项目驾驶舱": "dashboard",
    "赛项解析中心": "analysis",
    "训练任务中心": "training",
    "作品诊断中心": "diagnosis",
    "模拟答辩室": "defense",
    "赛后复盘": "review",
    "资源知识库": "resources",
    "学习记录": "learning",
    "设置中心": "settings",
  };

  for (const [label, pageKey] of Object.entries(expected)) {
    assert.equal(resolvePage(label), pageKey, label);
  }
});

test("falls back to the dashboard for an unknown menu label", () => {
  assert.equal(resolvePage("不存在的菜单"), "dashboard");
});
