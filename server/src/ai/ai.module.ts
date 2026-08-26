import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAiCompatService } from './openai-compat.service';
import { AI_PROVIDER } from './ai.interface';

@Module({
  imports: [ConfigModule],
  providers: [{ provide: AI_PROVIDER, useClass: OpenAiCompatService }],
  exports: [AI_PROVIDER],
})
export class AiModule {}
