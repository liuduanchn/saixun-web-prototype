import { api, DEMO_MODE } from "./api.js";
import { saveSession, loginWithStorage } from "./appState.js";

/**
 * 统一的登录入口 —— 应用壳里的经典登录页（LoginScreen，app.html）与
 * 网站首页的新版落地页（index.html）共用同一份逻辑。
 *
 * - 演示模式（未配置 VITE_API_BASE，没有后端可用）：走本地 SHA-256 比对，
 *   期望哈希由构建期注入 VITE_DEMO_PASSWORD_HASH。
 * - 正常模式：调用后端 /api/auth/login，并把会话写入 localStorage。
 *
 * 不抛异常：任何失败都归一化为 { ok: false, error }，调用方只负责展示 error。
 *
 * @returns {Promise<{ok: true, user: object} | {ok: false, error: string}>}
 */
export async function performLogin(username, password) {
  try {
    if (DEMO_MODE) {
      const result = await loginWithStorage(
        window.localStorage,
        username,
        password,
        import.meta.env.VITE_DEMO_PASSWORD_HASH,
      );
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, user: result.user };
    }

    const user = await api.auth.login(username, password);
    if (!saveSession(window.localStorage, user)) {
      return { ok: false, error: "无法保存登录状态，请检查浏览器存储权限" };
    }
    return { ok: true, user };
  } catch (err) {
    return { ok: false, error: err?.message || "登录失败，请重试" };
  }
}
