import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StorageModule } from './storage/storage.module';
import { AiModule } from './ai/ai.module';
import { TasksModule } from './tasks/task.module';

/**
 * 根模块：P0.1 接入全局配置、Prisma、健康检查；P0.3 接入真实鉴权（Auth/Users）；
 * P0.4 接入文件存储与 AI 能力抽象；P1 接入训练任务（Tasks）。
 * 后续阶段在此按领域逐个挂载 Projects / Works / Diagnosis / Defense ...
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    StorageModule,
    AiModule,
    TasksModule,
  ],
})
export class AppModule {}
