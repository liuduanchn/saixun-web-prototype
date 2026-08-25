const SESSION_KEY = "saixun-session";

const demoUser = Object.freeze({
  username: "teacher",
  name: "张老师",
  role: "指导教师",
});

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
});

export async function hashPassword(password) {
  const encoded = new TextEncoder().encode(password);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authenticate(username, password, configuredPasswordHash) {
  if (!/^[a-f\d]{64}$/i.test(configuredPasswordHash ?? "")) {
    return { ok: false, error: "登录配置缺失，请联系管理员" };
  }

  if (username === demoUser.username && await hashPassword(password) === configuredPasswordHash.toLowerCase()) {
    return { ok: true, user: { ...demoUser } };
  }

  return { ok: false, error: "账号或密码错误，请使用测试账号登录" };
}

export function loadSession(storage) {
  try {
    const stored = JSON.parse(storage.getItem(SESSION_KEY));
    if (stored?.username !== demoUser.username) return null;
    return { ...demoUser };
  } catch {
    return null;
  }
}

export function saveSession(storage, user) {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(user));
    return true;
  } catch {
    return false;
  }
}

export async function loginWithStorage(storage, username, password, configuredPasswordHash) {
  const result = await authenticate(username, password, configuredPasswordHash);
  if (!result.ok) return result;
  if (saveSession(storage, result.user)) return result;
  return { ok: false, error: "无法保存登录状态，请检查浏览器存储权限" };
}

export function clearSession(storage) {
  try {
    storage.removeItem(SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

export function resolvePage(label) {
  return pageKeys[label] ?? "dashboard";
}

export function markNotificationRead(notifications, id) {
  return notifications.map((notification) => notification.id === id ? { ...notification, read: true } : notification);
}

export function markAllNotificationsRead(notifications) {
  return notifications.map((notification) => notification.read ? notification : { ...notification, read: true });
}

export function getUnreadNotificationCount(notifications) {
  return notifications.filter((notification) => !notification.read).length;
}

export function resolveNotificationTarget(notification) {
  return Object.hasOwn(pageKeys, notification?.targetNav) ? notification.targetNav : "竞赛项目驾驶舱";
}
