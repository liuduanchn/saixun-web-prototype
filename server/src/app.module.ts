import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StorageModule } from './storage/storage.module';
import { AiModule } from './ai/ai.module';
import { TasksModule } from './tasks/task.module';
import { WorksModule } from './works/works.module';
import { DiagnosisModule } from './diagnosis/diagnosis.module';

/**
 * 根模块：P0.1 接入全局配置、Prisma、健康检查；P0.3 接入真实鉴权（Auth/Users）；
 * P0.4 接入文件存储与 AI 能力抽象；P1 接入训练任务（Tasks）、作品上传（Works）、
 * 作品诊断（Diagnosis，含 AI 调用与教师复核生成修改任务）。
 * 后续阶段在此按领域逐个挂载 Projects / Defense / Review ...
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
    WorksModule,
    DiagnosisModule,
  ],
})
export class AppModule {}
