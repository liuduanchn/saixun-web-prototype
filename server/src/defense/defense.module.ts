import { Module } from '@nestjs/common';
import { DefenseService } from './defense.service';
import { DefenseController } from './defense.controller';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [AiModule, StorageModule, LearningModule],
  providers: [DefenseService],
  controllers: [DefenseController],
  exports: [DefenseService],
})
export class DefenseModule {}
