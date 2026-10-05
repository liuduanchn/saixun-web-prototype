import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAiCompatService } from './openai-compat.service';
import { AI_PROVIDER } from './ai.interface';

/**
 * AI 能力模块。
 *
 * 2026-10-05 调整：把 `OpenAiCompatService` **同时**作为类本身导出。
 * 原因：`AI_PROVIDER` 提供的是 `AiProvider` 接口，只暴露 `chat()`；
 * 而设置中心的「测试连接」「状态回显」需要 `ping()` / `status()` 这两个具体方法。
 * 用 `useExisting` 保证两种注入方式拿到**同一个实例**，避免重复构造。
 *
 * 注意：RuntimeConfigModule 会 import 本模块（配置接口要用 AI 服务），
 * 因此这里**不要**反向 import 它，否则形成循环依赖。
 */
@Module({
  imports: [ConfigModule],
  providers: [
    OpenAiCompatService,
    { provide: AI_PROVIDER, useExisting: OpenAiCompatService },
  ],
  exports: [AI_PROVIDER, OpenAiCompatService],
})
export class AiModule {}
