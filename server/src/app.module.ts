import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StorageModule } from './storage/storage.module';
import { AiModule } from './ai/ai.module';
import { TasksModule } from './tasks/task.module';
import { WorksModule } from './works/works.module';
import { DiagnosisModule } from './diagnosis/diagnosis.module';
import { CriteriaModule } from './criteria/criteria.module';
import { DefenseModule } from './defense/defense.module';
import { ReviewModule } from './review/review.module';
import { ResourcesModule } from './resources/resources.module';
import { ProjectsModule } from './projects/projects.module';
import { LearningModule } from './learning/learning.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TenantsModule } from './tenants/tenants.module';

/**
 * 根模块：P0.1 接入全局配置、Prisma、健康检查；P0.3 接入真实鉴权（Auth/Users）；
 * P0.4 接入文件存储与 AI 能力抽象；P1 接入训练任务（Tasks）、作品上传（Works）、
 * 作品诊断（Diagnosis，含 AI 调用与教师复核生成修改任务）；P2 接入赛项解析
 * （Criteria，LLM 抽取评分要素）与模拟答辩（Defense，LLM 多轮追问与评分）。
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Phase C-2: 全局默认限流（登录接口额外加严）
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 100 },
    ]),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    StorageModule,
    AiModule,
    TasksModule,
    WorksModule,
    DiagnosisModule,
    CriteriaModule,
    DefenseModule,
    ReviewModule,
    ResourcesModule,
    ProjectsModule,
    LearningModule,
    NotificationsModule,
    TenantsModule,
  ],
  // Phase C-2: 全局注册节流守卫（forRoot 仅声明限流器，须显式绑定 guard）
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
