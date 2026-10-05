import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { NotificationsModule } from '../notifications/notifications.module';
// 接入 AI 能力：TaskService 注入 AI_PROVIDER，
// 与赛项解析 / 作品诊断 / 模拟答辩共用同一份 .env 配置。
import { AiModule } from '../ai/ai.module';

@Module({
  controllers: [TaskController],
  imports: [NotificationsModule, AiModule],
  providers: [TaskService],
  exports: [TaskService],
})
export class TasksModule {}
