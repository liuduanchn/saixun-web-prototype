import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';

/**
 * 运行时配置模块：只提供「配置状态」查询接口。
 * AI Key 的**读取**由 src/config/runtime-config.ts 直接供 OpenAiCompatService 使用，
 * 不需要经过 Nest 容器，因此这里没有 provider。
 */
@Module({
  controllers: [ConfigController],
})
export class RuntimeConfigModule {}
