import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AiProvider, ChatMessage, ChatOptions } from './ai.interface';
import { maskSecret } from '../config/runtime-config';
import {
  getPlatformSettings,
  isLlmReady,
  resolveLlmConfig,
} from '../config/platform-config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * OpenAI 兼容聊天实现：通过 HTTP 调用任意兼容 /chat/completions 的端点
 * （硅基流动 / DeepSeek / 通义 / 智谱 等均可，只需在设置中心填 Base URL + Key + 模型）。
 *
 * 配置来源（2026-10-05 打通配置通路）：
 *   平台配置（SystemConfig 表，设置中心填写）> 环境变量 > runtime.json。
 *   解析逻辑全部收口在 config/platform-config.ts，本文件不再直接读 process.env。
 *
 * 超时与重试（对齐 speech.service.ts 的成熟做法）：
 *   · 45s 超时（AbortController）—— 裸 fetch 无超时会让请求挂死；
 *   · 429 / 503 / 504 退避重试 1 次 —— 硅基流动高峰期会限流或过载；
 *   · 只在**没有拿到可用响应**时重试，不会重复计费已成功的调用。
 *
 * 安全约定：
 *   · 明文 Key 只在本进程内使用，**绝不下发前端**；
 *   · 任何日志、错误信息里的 Key 一律经 maskSecret() 脱敏。
 */

/** 单次请求超时（毫秒）。LLM 比 ASR 快，45s 足够，超过基本是网络或服务端异常。 */
const REQUEST_TIMEOUT_MS = 45_000;
/** 可重试的 HTTP 状态：限流 / 过载 / 网关超时 */
const RETRYABLE_STATUS = [429, 503, 504];
const RETRY_DELAY_MS = 1_500;

@Injectable()
export class OpenAiCompatService implements AiProvider {
  constructor(private readonly prisma: PrismaService) {}

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
    const feature = opts?.feature ?? 'criteria';
    const cfg = await resolveLlmConfig(this.prisma, feature);

    if (!cfg.enabled) {
      // 该功能被显式关闭：由调用方 catch 后回退启发式，不影响功能闭环
      throw new InternalServerErrorException(
        `AI 已按功能关闭（${feature}），走启发式`,
      );
    }

    // 缺失项逐项报清，便于在设置中心自查（比笼统的「未配置」有用得多）
    const missing = [
      !cfg.baseUrl && '接口地址',
      !cfg.apiKey && 'API Key',
      !cfg.model && '模型名称',
    ].filter(Boolean) as string[];
    if (missing.length || !isLlmReady(cfg)) {
      throw new InternalServerErrorException(
        `AI 未配置：缺少 ${missing.join('、') || '必要参数'}（来源 ${cfg.source}），走启发式`,
      );
    }

    let lastErr: unknown = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            messages,
            temperature: opts?.temperature ?? 0.3,
            max_tokens: opts?.maxTokens ?? 2000,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          // 注意：错误信息里绝不回显 Key，只回显脱敏形态
          const err = new InternalServerErrorException(
            `AI 调用失败 ${resp.status}（model=${cfg.model}, key=${maskSecret(cfg.apiKey)}）：${text.slice(0, 300)}`,
          );
          if (RETRYABLE_STATUS.includes(resp.status) && attempt === 0) {
            lastErr = err;
            await this.sleep(RETRY_DELAY_MS);
            continue;
          }
          throw err;
        }

        const data = (await resp.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        return data.choices?.[0]?.message?.content?.trim() ?? '';
      } catch (e) {
        // 已经是可读的业务异常（含 4xx/5xx），不再包装、也不再重试
        if (e instanceof InternalServerErrorException) throw e;
        const isAbort = (e as Error)?.name === 'AbortError';
        lastErr = new InternalServerErrorException(
          isAbort
            ? `AI 调用超时（${REQUEST_TIMEOUT_MS / 1000}s 未响应，model=${cfg.model}）`
            : `AI 调用失败：${(e as Error)?.message || '网络错误'}`,
        );
        // 网络层失败（含超时中断）：重试一次再放弃
        if (attempt === 0) {
          await this.sleep(RETRY_DELAY_MS);
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastErr instanceof Error
      ? lastErr
      : new InternalServerErrorException('AI 调用失败');
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 设置中心「测试连接」用：只发一个极小请求（max_tokens: 8），
   * 验证「端点 + 密钥 + 模型」三者是否真的能用，并把失败原因原样带回界面。
   */
  async ping(): Promise<{
    ok: boolean;
    latencyMs: number;
    model: string;
    message: string;
  }> {
    const cfg = await resolveLlmConfig(this.prisma, 'criteria');
    const startedAt = Date.now();
    try {
      const text = await this.chat(
        [
          { role: 'system', content: '你是连通性测试助手，只回复 OK 两个字母。' },
          { role: 'user', content: 'ping' },
        ],
        { temperature: 0, maxTokens: 8, feature: 'criteria' },
      );
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        model: cfg.model,
        message: text || '（模型返回空文本，但链路已通）',
      };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        model: cfg.model,
        message: (e as Error)?.message || '调用失败',
      };
    }
  }

  /** 当前生效配置的脱敏视图：只回布尔与元信息，绝不回明文密钥 */
  async status() {
    const cfg = await resolveLlmConfig(this.prisma, 'criteria');
    const settings = await getPlatformSettings(this.prisma);
    return {
      aiConfigured: isLlmReady(cfg),
      aiModel: cfg.model,
      aiBaseHost: safeHost(cfg.baseUrl),
      aiConfigSource: cfg.source,
      llmApiKeySet: Boolean((settings.apiKey || '').trim()),
    };
  }
}

function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return '';
  }
}
