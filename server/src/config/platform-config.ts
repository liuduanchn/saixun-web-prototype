import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseJson, toJson } from '../common/json';
import { aiConfig, maskSecret } from './runtime-config';

/**
 * 平台级大模型配置（方案 B1：SystemConfig 单行表）
 * ------------------------------------------------------------------
 * 背景：WorkBuddy 发布平台**只注入 PORT**，没有环境变量/密钥注入入口，
 * 线上无法用 env 配 AI Key（详见 runtime-config.ts 顶部说明）。
 * 因此大模型配置改为落在库里的**平台级单例**，由设置中心填写。
 *
 * 为什么是平台级而不是租户级：
 *   面向本次演示，模型与密钥只有一份，全站共用；放租户表会引入
 *   「任何团队 OWNER 都能改到全站密钥」的越权面。
 *
 * 安全约定（与 ASR / 既有约定一致）：
 *   · 明文 apiKey 只在本进程内读取，**绝不下发前端**；
 *   · 对外一律走 presentPlatformSettings() 的脱敏视图；
 *   · 读取 Key 的接口必须再用 isPlatformAdmin() 判定（见 platform-admin.ts）。
 */

/** 单行配置表的主键，固定值，由代码显式写入（表上不设列默认值） */
export const PLATFORM_CONFIG_ID = 'platform';

/** 功能标识：决定用哪套配置与提示词。`tasks` 为后续接入预留。 */
export type FeatureKey = 'criteria' | 'diagnosis' | 'defense' | 'tasks';

export const FEATURE_KEYS: readonly FeatureKey[] = [
  'criteria',
  'diagnosis',
  'defense',
  'tasks',
];

export interface PlatformLlmSettings {
  /** OpenAI 兼容端点，如 https://api.siliconflow.cn/v1 */
  baseUrl?: string;
  /** 明文密钥，落库；对外只回脱敏形态 */
  apiKey?: string;
  /**
   * 统一模型名。**刻意不设默认值**（2026-10-05 决策②）：
   * 为空即视为「未配置」，不猜测、不回落任何内置模型名。
   */
  model?: string;
  /** 功能开关；缺省视为启用，显式 false 才关闭 */
  enabledFeatures?: Partial<Record<FeatureKey, boolean>>;
  /** 分功能模型覆盖；留空则用 model */
  models?: Partial<Record<FeatureKey, string>>;
}

export interface ResolvedLlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  source: 'platform' | 'env' | 'file' | 'none';
  /** 该功能是否启用真 AI；false 时调用方应直接走启发式，不必发请求 */
  enabled: boolean;
  feature: FeatureKey;
}

type SettingsRow = { settings: string | null } | null;

/** 读出平台配置里的 llm 段（不存在或格式错误都返回空对象） */
export async function getPlatformSettings(
  prisma: PrismaService,
): Promise<PlatformLlmSettings> {
  const row = (await prisma.systemConfig.findUnique({
    where: { id: PLATFORM_CONFIG_ID },
  })) as SettingsRow;
  const all = parseJson<Record<string, unknown>>(row?.settings, {});
  const llm = all?.llm;
  if (!llm || typeof llm !== 'object') return {};
  return llm as PlatformLlmSettings;
}

/** 三点齐备才算「可调用」：有端点、有密钥、有模型名 */
export function isLlmReady(cfg: ResolvedLlmConfig): boolean {
  return Boolean(cfg.enabled && cfg.baseUrl && cfg.apiKey && cfg.model);
}

/**
 * 解析某功能实际生效的配置。
 * 优先级：平台配置 > env（本地开发）> runtime.json > 空。
 */
export async function resolveLlmConfig(
  prisma: PrismaService,
  feature: FeatureKey = 'criteria',
): Promise<ResolvedLlmConfig> {
  const llm = await getPlatformSettings(prisma);
  const enabled = llm.enabledFeatures?.[feature] !== false;

  if (!enabled) {
    // 该功能被显式关闭：返回空配置，调用方走启发式，不发请求
    return { baseUrl: '', apiKey: '', model: '', source: 'none', enabled: false, feature };
  }

  const env = aiConfig();
  const platformKey = (llm.apiKey || '').trim();
  const featureModel = (llm.models?.[feature] || '').trim();

  if (platformKey) {
    return {
      // 平台级密钥只配平台级端点：**不回落 env 的默认域名**，
      // 否则「填了 Key 忘填地址」会静默打到 api.openai.com，报错极难定位。
      baseUrl: (llm.baseUrl || '').replace(/\/$/, ''),
      apiKey: platformKey,
      // 不设默认模型：model 与 models[feature] 都为空时就是空串
      model: featureModel || (llm.model || '').trim(),
      source: 'platform',
      enabled: true,
      feature,
    };
  }

  // 平台未配置 → 回落 env / 未入库配置文件（仅供本地开发）
  const source = process.env.AI_API_KEY
    ? 'env'
    : env.apiKey
      ? 'file'
      : 'none';
  return {
    baseUrl: (env.baseUrl || '').replace(/\/$/, ''),
    apiKey: env.apiKey,
    model: (env.model || '').trim(),
    source,
    enabled: true,
    feature,
  };
}

/**
 * 合并写入平台配置。嵌套的 models / enabledFeatures 按 key 浅合并，
 * 避免界面只改一个功能模型时把其余覆盖掉。
 *
 * 密钥三态（与 tenants.service 的 asrApiKey 同策略）：
 *   · 未传 / 以 **** 结尾（前端回显的脱敏值）→ 保留库中原值
 *   · 空串                                    → 显式清除
 *   · 其他                                    → 视为新密钥
 */
export async function updatePlatformSettings(
  prisma: PrismaService,
  patch: PlatformLlmSettings,
  operator?: { username?: string },
): Promise<PlatformLlmSettings> {
  const current = await getPlatformSettings(prisma);
  const merged: PlatformLlmSettings = { ...current, ...patch };

  const incoming = patch.apiKey;
  if (incoming === undefined || String(incoming).trim().endsWith('****')) {
    if (current.apiKey) merged.apiKey = current.apiKey;
    else delete merged.apiKey;
  } else if (!String(incoming).trim()) {
    delete merged.apiKey;
  } else {
    merged.apiKey = String(incoming).trim();
  }

  if (patch.models) merged.models = { ...(current.models || {}), ...patch.models };
  if (patch.enabledFeatures) {
    merged.enabledFeatures = { ...(current.enabledFeatures || {}), ...patch.enabledFeatures };
  }

  // 去掉分功能模型里的空值，避免空串把统一模型「顶掉」
  if (merged.models) {
    for (const k of Object.keys(merged.models) as FeatureKey[]) {
      if (!String(merged.models[k] || '').trim()) delete merged.models[k];
    }
  }

  const settings = toJson({ ...parseJson<Record<string, unknown>>(
    ((await prisma.systemConfig.findUnique({ where: { id: PLATFORM_CONFIG_ID } })) as SettingsRow)
      ?.settings,
    {},
  ), llm: merged });

  await prisma.systemConfig.upsert({
    where: { id: PLATFORM_CONFIG_ID },
    create: { id: PLATFORM_CONFIG_ID, settings },
    update: { settings },
  });

  return merged;
}

/** 对外脱敏视图：只回布尔与元信息，绝不回明文密钥 */
export function presentPlatformSettings(llm: PlatformLlmSettings) {
  const raw = (llm.apiKey || '').trim();
  return {
    baseUrl: llm.baseUrl || '',
    model: llm.model || '',
    models: llm.models || {},
    enabledFeatures: llm.enabledFeatures || {},
    llmApiKeyMasked: maskSecret(raw),
    llmApiKeySet: Boolean(raw),
  };
}

/** 供接口层复用的显式拒绝（防止漏判管理员） */
export function assertLlmReadyOrThrow(cfg: ResolvedLlmConfig): void {
  if (!cfg.enabled) {
    throw new ForbiddenException('该功能的 AI 能力已被关闭');
  }
}
