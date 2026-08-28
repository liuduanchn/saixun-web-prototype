import { Module } from '@nestjs/common';
import { DiagnosisService } from './diagnosis.service';
import { DiagnosisController } from './diagnosis.controller';
import { StorageModule } from '../storage/storage.module';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LearningModule } from '../learning/learning.module';
import { CaseLibraryModule } from '../case-library/case-library.module';

@Module({
  imports: [StorageModule, AiModule, NotificationsModule, LearningModule, CaseLibraryModule],
  controllers: [DiagnosisController],
  providers: [DiagnosisService],
})
export class DiagnosisModule {}
