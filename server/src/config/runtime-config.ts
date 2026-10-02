import { Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * 运行时密钥配置（workbuddyDeploy 分支）
 * ------------------------------------------------------------------
 * 背景：WorkBuddy 的发布能力**只能注入 PORT**，没有环境变量/密钥注入入口，
 * 因此线上无法像常规平台那样用 Environment Variables 配置 AI Key。
 * 这里提供三级优先级，向上覆盖：
 *
 *   1) 运行时环境变量      AI_BASE_URL / AI_API_KEY / AI_MODEL
 *   2) 未入库的配置文件    <RUNTIME_CONFIG_FILE 或 cwd>/config/runtime.json
 *   3) 都没有             → apiKey 为空，AI 能力自动降级为确定性启发式
 *                          （criteria / diagnosis / defense 均有兜底，闭环仍完整）
 *
 * 安全约定：
 *   · 本文件读取的 Key **绝不下发前端**。对外只暴露 aiStatus() 里的
 *     aiConfigured / aiModel / aiBaseHost 这类非敏感元信息。
 *   · 任何日志、错误信息里的 Key 一律经过 maskSecret() 脱敏。
 *   · runtime.json 已在 .gitignore 中，仓库只提交 runtime.example.json。
 */

export interface AiRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const DEFAULT_AI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_AI_MODEL = 'gpt-4o-mini';
const logger = new Logger('RuntimeConfig');

/** 允许从配置文件读取的键（白名单，避免把任意文件内容注入进程配置） */
const FILE_KEYS = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'] as const;

let fileConfigCache: Record<string, string> | null = null;

function configFilePath(): string {
  return process.env.RUNTIME_CONFIG_FILE
    ? resolve(process.env.RUNTIME_CONFIG_FILE)
    : resolve(process.cwd(), 'config', 'runtime.json');
}

/** 读取未入库的本地配置文件（只读一次并缓存；不存在或格式错误都视为空） */
function fileConfig(): Record<string, string> {
  if (fileConfigCache) return fileConfigCache;
  const path = configFilePath();
  if (!existsSync(path)) {
    fileConfigCache = {};
    return fileConfigCache;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const picked: Record<string, string> = {};
    for (const key of FILE_KEYS) {
      const value = raw?.[key];
      if (typeof value === 'string' && value.trim()) picked[key] = value.trim();
    }
    fileConfigCache = picked;
    logger.log(
      `已加载运行时配置文件 ${path}（字段：${Object.keys(picked).join(', ') || '无'}；` +
        `AI_API_KEY=${maskSecret(picked.AI_API_KEY)}）`,
    );
  } catch (e) {
    logger.warn(`运行时配置文件解析失败（已忽略）：${path} — ${(e as Error).message}`);
    fileConfigCache = {};
  }
  return fileConfigCache;
}

/** 脱敏：保留前 3 位便于识别是哪个 key，其余一律星号 */
export function maskSecret(value: string | undefined | null): string {
  const v = String(value ?? '');
  if (!v) return '';
  if (v.length <= 4) return '****';
  return `${v.slice(0, 3)}****`;
}

/** 三级优先级解析：环境变量 > 配置文件 > 内置默认 */
export function aiConfig(): AiRuntimeConfig {
  const file = fileConfig();
  const pick = (key: 'AI_BASE_URL' | 'AI_API_KEY' | 'AI_MODEL') =>
    process.env[key]?.trim() || file[key] || '';

  return {
    baseUrl: (pick('AI_BASE_URL') || DEFAULT_AI_BASE_URL).replace(/\/$/, ''),
    apiKey: pick('AI_API_KEY'),
    model: pick('AI_MODEL') || DEFAULT_AI_MODEL,
  };
}

/**
 * 对外可公开的配置状态（供前端在登录页/设置页展示）。
 * 只包含非敏感信息 —— 绝不返回 apiKey 本身。
 */
export function aiStatus() {
  const { apiKey, baseUrl, model } = aiConfig();
  let aiBaseHost = '';
  try {
    aiBaseHost = new URL(baseUrl).host;
  } catch {
    aiBaseHost = '';
  }
  return {
    aiConfigured: Boolean(apiKey),
    aiModel: model,
    aiBaseHost,
    // 配置来源，便于排障：env | file | none
    aiConfigSource: process.env.AI_API_KEY
      ? 'env'
      : fileConfig().AI_API_KEY
        ? 'file'
        : 'none',
  };
}
