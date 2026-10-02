import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TenantGuard } from './guards/tenant.guard';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // 直接以 process.env 为准，与 JwtStrategy 的验签侧保持**同一个读取路径**。
        // 排查线上 401 时发现：签发侧经 ConfigService 解析、验签侧另一条路径，
        // 两者一旦取值不同，就会出现「登录成功但所有带 token 的请求 401」，
        // 且自签自验能通过（两边各自的密钥都自洽），极难定位。
        secret:
          process.env.JWT_SECRET || config.get<string>('JWT_SECRET') || 'change-me-in-production',
        signOptions: {
          // access_token 短期有效（默认 12h），配合 /auth/refresh 续期；可经 JWT_EXPIRES_IN 覆盖
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') || '12h') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // 全局 JWT 守卫：除标注 @Public() 的路由外都需合法 token
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 全局租户守卫：校验请求具备租户上下文，集中式多租户隔离兜底
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
