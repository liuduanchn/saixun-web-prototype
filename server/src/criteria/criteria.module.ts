import { Module } from '@nestjs/common';
import { CriteriaService } from './criteria.service';
import { CriteriaController } from './criteria.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  providers: [CriteriaService],
  controllers: [CriteriaController],
  exports: [CriteriaService],
})
export class CriteriaModule {}
