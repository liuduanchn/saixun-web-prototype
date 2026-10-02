import { clearTokens } from "./api.js";

const SESSION_KEY = "saixun-session";

const pageKeys = Object.freeze({
  "竞赛项目驾驶舱": "dashboard",
  "赛项解析中心": "analysis",
  "训练任务中心": "training",
  "作品诊断中心": "diagnosis",
  "模拟答辩室": "defense",
  "赛后复盘": "review",
  "资源知识库": "resources",
  "学习记录": "learning",
  "设置中心": "settings",
  "我的任务": "student-tasks",
  "我的作品": "student-works",
  "诊断反馈": "student-diagnosis",
  "模拟答辩": "student-defense",
});

/** 读取已保存的会话用户（token 由 api.js 单独管理） */
export function loadSession(storage) {
  try {
    const stored = JSON.parse(storage.getItem(SESSION_KEY));
    if (!stored?.user) return null;
    return stored.user;
  } catch {
    return null;
  }
}

export function saveSession(storage, user) {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify({ user }));
    return true;
  } catch {
    return false;
  }
}

/** 退出登录：清除会话与 token */
export function clearSession(storage) {
  try {
    storage.removeItem(SESSION_KEY);
    clearTokens();
    return true;
  } catch {
    return false;
  }
}

/**
 * 演示模式（未连接后端）下的固定账号。
 * 注意：这只用于 DEMO_MODE —— 即未配置 VITE_API_BASE、没有后端可用时的兜底登录。
 * 连上后端时登录一律由后端 `/api/auth/login` 校验，本文件这几个函数不参与。
 */
const DEMO_USER = Object.freeze({ username: "teacher", name: "张老师", role: "指导教师" });

/** SHA-256 摘要（十六进制小写）。基于 WebCrypto，仅用于演示模式的本地比对。 */
export async function hashPassword(password) {
  const encoded = new TextEncoder().encode(String(password ?? ""));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * 演示模式登录校验：把输入密码做 SHA-256 后与构建期注入的哈希比对。
 * @param configuredPasswordHash 来自 VITE_DEMO_PASSWORD_HASH 的 64 位十六进制哈希
 */
export async function authenticate(username, password, configuredPasswordHash) {
  const expected = String(configuredPasswordHash ?? "");
  if (!/^[a-f\d]{64}$/i.test(expected)) {
    return { ok: false, error: "登录配置缺失，请联系管理员" };
  }
  if (username !== DEMO_USER.username) {
    return { ok: false, error: "账号或密码错误，请使用测试账号登录" };
  }
  const hashed = await hashPassword(password);
  if (hashed !== expected.toLowerCase()) {
    return { ok: false, error: "账号或密码错误，请使用测试账号登录" };
  }
  return { ok: true, user: { ...DEMO_USER } };
}

/** 演示模式登录并持久化会话；存储不可用时返回明确错误而不是假装登录成功。 */
export async function loginWithStorage(storage, username, password, configuredPasswordHash) {
  const result = await authenticate(username, password, configuredPasswordHash);
  if (!result.ok) return result;
  if (!saveSession(storage, result.user)) {
    return { ok: false, error: "无法保存登录状态，请检查浏览器存储权限" };
  }
  return result;
}

export function resolvePage(label) {
  return pageKeys[label] ?? "dashboard";
}

export function markNotificationRead(notifications, id) {
  return notifications.map((notification) =>
    notification.id === id ? { ...notification, read: true } : notification,
  );
}

export function markAllNotificationsRead(notifications) {
  return notifications.map((notification) =>
    notification.read ? notification : { ...notification, read: true },
  );
}

export function getUnreadNotificationCount(notifications) {
  return notifications.filter((notification) => !notification.read).length;
}

export function resolveNotificationTarget(notification) {
  return Object.hasOwn(pageKeys, notification?.targetNav) ? notification.targetNav : "竞赛项目驾驶舱";
}
