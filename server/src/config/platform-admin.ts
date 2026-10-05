/**
 * 平台级管理员白名单
 * ------------------------------------------------------------------
 * 背景：按「大模型接入方案·权威版」的决策，大模型配置是**平台级单例**
 * （全站唯一一份，落在 SystemConfig 表），而不是租户级。
 * 这意味着若沿用「租户管理员即可改」的规则，任何团队的 OWNER 都能改到
 * 全站共用的模型与密钥 —— 属于跨租户提权，必须单独收紧。
 *
 * 为什么用代码常量而不是环境变量：
 *   WorkBuddy 发布平台**只注入 PORT**，没有环境变量/密钥注入入口
 *   （详见 src/config/runtime-config.ts 顶部说明），env 在线上永远读不到。
 *   因此平台管理员的判定只能固化在代码里，改动需发版。
 *
 * 二期如果要做成可管理，建议给 User 加 `isPlatformAdmin` 字段，
 * 而不是继续堆白名单。
 */

/** 平台管理员用户名（可改，改动需发版） */
export const PLATFORM_ADMIN_USERNAMES: readonly string[] = ['teacher'];

/** 判断某用户名是否具备平台级配置的读写权限 */
export function isPlatformAdmin(username?: string | null): boolean {
  if (!username) return false;
  return PLATFORM_ADMIN_USERNAMES.includes(username);
}
