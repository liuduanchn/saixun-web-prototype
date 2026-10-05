import type { FeatureKey } from '../config/platform-config';

/**
 * AI 能力抽象：定义统一的对话/补全接口。
 * 业务模块（赛项解析、作品诊断、模拟答辩、训练任务）只依赖 AiProvider 接口，
 * 不直接耦合具体厂商；切换模型只需改平台配置或环境变量。
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
  /**
   * 功能标识（2026-10-05 新增）：决定用哪套配置——分功能模型覆盖
   * （平台配置的 models.<feature>）与功能开关（enabledFeatures.<feature>）。
   * 缺省按 'criteria' 处理，保证老调用点不传也能工作。
   */
  feature?: FeatureKey;
}

export interface AiProvider {
  /** 多轮对话补全，返回模型文本 */
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
}
