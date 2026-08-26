/**
 * AI 能力抽象：定义统一的对话/补全接口。
 * 业务模块（赛项解析、作品诊断、模拟答辩）只依赖 AiProvider 接口，
 * 不直接耦合具体厂商；切换模型只需改实现或环境变量。
 */
export const AI_PROVIDER = Symbol('AI_PROVIDER');

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface AiProvider {
  /** 多轮对话补全，返回模型文本 */
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
}
