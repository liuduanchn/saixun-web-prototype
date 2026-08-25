import test from "node:test";
import assert from "node:assert/strict";

import {
  authenticate,
  clearSession,
  hashPassword,
  loginWithStorage,
  loadSession,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  resolveNotificationTarget,
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

const TEST_PASSWORD_HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

test("hashes a password with SHA-256 before credential comparison", async () => {
  assert.equal(await hashPassword("abc"), TEST_PASSWORD_HASH);
});

test("accepts the configured teacher demo credentials", async () => {
  assert.deepEqual(await authenticate("teacher", "abc", TEST_PASSWORD_HASH), {
    ok: true,
    user: { username: "teacher", name: "张老师", role: "指导教师" },
  });
});

test("rejects credentials that do not exactly match the demo account", async () => {
  assert.deepEqual(await authenticate("teacher", "wrong", TEST_PASSWORD_HASH), {
    ok: false,
    error: "账号或密码错误，请使用测试账号登录",
  });
});

test("reports a configuration error when no password hash is provided", async () => {
  assert.deepEqual(await authenticate("teacher", "abc", ""), {
    ok: false,
    error: "登录配置缺失，请联系管理员",
  });
});

test("does not report a persistent login when browser storage rejects the session", async () => {
  const unavailableStorage = {
    getItem() { return null; },
    setItem() { throw new Error("storage disabled"); },
    removeItem() {},
  };

  assert.deepEqual(await loginWithStorage(unavailableStorage, "teacher", "abc", TEST_PASSWORD_HASH), {
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

test("marks one notification read without mutating the source list", () => {
  const notifications = [
    { id: 1, read: false },
    { id: 2, read: false },
  ];

  const updated = markNotificationRead(notifications, 1);

  assert.deepEqual(updated, [
    { id: 1, read: true },
    { id: 2, read: false },
  ]);
  assert.equal(getUnreadNotificationCount(updated), 1);
  assert.equal(notifications[0].read, false);
});

test("marks every notification read and clears the unread count", () => {
  const updated = markAllNotificationsRead([
    { id: 1, read: false },
    { id: 2, read: true },
  ]);

  assert.deepEqual(updated, [
    { id: 1, read: true },
    { id: 2, read: true },
  ]);
  assert.equal(getUnreadNotificationCount(updated), 0);
});

test("resolves each notification to its configured workspace page", () => {
  assert.equal(resolveNotificationTarget({ targetNav: "作品诊断中心" }), "作品诊断中心");
  assert.equal(resolveNotificationTarget({ targetNav: "训练任务中心" }), "训练任务中心");
});

test("falls back to the dashboard when a notification target is invalid", () => {
  assert.equal(resolveNotificationTarget({ targetNav: "不存在的页面" }), "竞赛项目驾驶舱");
  assert.equal(resolveNotificationTarget(null), "竞赛项目驾驶舱");
});
