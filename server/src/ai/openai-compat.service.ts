import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AiProvider, ChatMessage, ChatOptions } from './ai.interface';
import { aiConfig, maskSecret } from '../config/runtime-config';

/**
 * OpenAI 兼容聊天实现：通过 HTTP 调用任意兼容 /chat/completions 的端点
 * （OpenAI / DeepSeek / 通义 / 智谱 等均可，仅需改 AI_BASE_URL + AI_API_KEY）。
 *
 * 配置来源见 src/config/runtime-config.ts：环境变量 > 未入库配置文件 > 缺省。
 * 密钥只在本进程内使用，不会下发前端；日志中一律 maskSecret() 脱敏。
 */
@Injectable()
export class OpenAiCompatService implements AiProvider {
  private baseUrl(): string {
    return aiConfig().baseUrl;
  }

  private apiKey(): string {
    return aiConfig().apiKey;
  }

  private model(): string {
    return aiConfig().model;
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
    const key = this.apiKey();
    if (!key) {
      // 无 Key 时由调用方 catch 后回退启发式实现（仍真实落库），不影响功能闭环
      throw new InternalServerErrorException(
        'AI 未配置（可设环境变量 AI_API_KEY，或提供 server/config/runtime.json），已回退启发式',
      );
    }
    const resp = await fetch(`${this.baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: this.model(),
        messages,
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxTokens ?? 2000,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      // 注意：错误信息里绝不回显 Key，只回显脱敏形态
      throw new InternalServerErrorException(
        `AI 调用失败 ${resp.status}（key=${maskSecret(key)}）: ${text}`,
      );
    }
    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }
}
