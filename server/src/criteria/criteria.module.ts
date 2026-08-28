import { Module } from '@nestjs/common';
import { CriteriaService } from './criteria.service';
import { CriteriaController } from './criteria.controller';
import { AiModule } from '../ai/ai.module';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [AiModule, LearningModule],
  providers: [CriteriaService],
  controllers: [CriteriaController],
  exports: [CriteriaService],
})
export class CriteriaModule {}
