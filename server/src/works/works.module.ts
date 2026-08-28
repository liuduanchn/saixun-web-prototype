import { Module } from '@nestjs/common';
import { WorksService } from './works.service';
import { WorksController } from './works.controller';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [StorageModule, NotificationsModule, LearningModule],
  controllers: [WorksController],
  providers: [WorksService],
})
export class WorksModule {}
