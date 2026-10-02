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
        secret: config.get<string>('JWT_SECRET') || 'change-me-in-production',
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
  // JwtStrategy 一并导出：临时诊断接口需要读取「验签侧实际使用的密钥指纹」
  exports: [AuthService, JwtModule, JwtStrategy],
})
export class AuthModule {}
