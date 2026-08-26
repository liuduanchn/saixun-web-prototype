import { setToken } from "./api.js";

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
    setToken(null);
    return true;
  } catch {
    return false;
  }
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
