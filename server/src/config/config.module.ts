import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { AiModule } from '../ai/ai.module';

/**
 * 运行时配置模块：提供「配置状态」与「大模型配置」接口。
 *
 * 2026-10-05 调整：
 *   · `status` 从「直接读 env 层（runtime-config.ts）」改为**经 AI 服务解析**，
 *     这样平台级配置（SystemConfig 表）填好后，状态能立刻反映真实来源；
 *   · 新增 `GET/PATCH /api/config/llm` 与 `POST /api/config/llm/test`，
 *     因此需要 import AiModule 拿到 OpenAiCompatService（ping / status）。
 *   · PrismaService 由 @Global() 的 PrismaModule 提供，无需在此 import。
 */
@Module({
  imports: [AiModule],
  controllers: [ConfigController],
})
export class RuntimeConfigModule {}
