import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, ChatMessage, ChatOptions } from './ai.interface';

/**
 * OpenAI 兼容聊天实现：通过 HTTP 调用任意兼容 /chat/completions 的端点
 * （OpenAI / DeepSeek / 通义 / 智谱 等均可，仅需改 AI_BASE_URL + AI_API_KEY）。
 */
@Injectable()
export class OpenAiCompatService implements AiProvider {
  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    return (
      this.config.get<string>('AI_BASE_URL') ||
      'https://api.openai.com/v1'
    ).replace(/\/$/, '');
  }

  private apiKey(): string {
    return this.config.get<string>('AI_API_KEY') || '';
  }

  private model(): string {
    return this.config.get<string>('AI_MODEL') || 'gpt-4o-mini';
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
    const key = this.apiKey();
    if (!key) {
      throw new InternalServerErrorException(
        'AI_API_KEY 未配置，请在 .env 中设置后重试。',
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
      throw new InternalServerErrorException(`AI 调用失败 ${resp.status}: ${text}`);
    }
    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }
}
