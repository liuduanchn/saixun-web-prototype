import { BadRequestException, Body, Controller, Post, Get, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './auth.service';
import { LoginSchema } from './dto/login.dto';
import { RegisterSchema } from './dto/register.dto';
import { AUTH_COOKIE } from './jwt.strategy';
import { z } from 'zod';

/** access_token 有效期与 JWT_EXPIRES_IN 默认值保持一致（12h） */
const COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * 登录成功时把 access_token 同时写入 httpOnly Cookie。
 * 用途见 jwt.strategy.ts：托管平台的边缘代理可能改写 Authorization 头，
 * Cookie 是它的兜底通道。不加 Secure 是因为沙箱内应用看到的是 http
 * （TLS 由前置代理终结），加了 Secure 浏览器会直接拒绝写 Cookie。
 * SameSite=Lax 可抵御跨站 POST 带来的 CSRF。
 */
function writeAuthCookie(res: Response, token: string | undefined) {
  if (!res || !token) return;
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const dto = LoginSchema.safeParse(body);
    if (!dto.success) {
      throw new BadRequestException(dto.error.issues[0]?.message ?? '参数错误');
    }
    const user = await this.auth.validateUser(dto.data.username, dto.data.password);
    const result = await this.auth.login(user);
    writeAuthCookie(res, (result as { access_token?: string })?.access_token);
    return result;
  }

  @Public()
  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const dto = RegisterSchema.safeParse(body);
    if (!dto.success) {
      throw new BadRequestException(dto.error.issues[0]?.message ?? '参数错误');
    }
    const result = await this.auth.register(dto.data);
    writeAuthCookie(res, (result as { access_token?: string })?.access_token);
    return result;
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }

  @Post('change-password')
  changePassword(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const schema = z.object({
      oldPassword: z.string().min(1),
      newPassword: z.string().min(6),
    });
    const dto = schema.safeParse(body);
    if (!dto.success) {
      throw new BadRequestException(dto.error.issues[0]?.message ?? '参数错误');
    }
    return this.auth.changePassword(user, dto.data.oldPassword, dto.data.newPassword);
  }

  /** 刷新令牌：用未过期的 refresh_token 换取新的令牌对（旧令牌被轮换吊销） */
  @Public()
  @Post('refresh')
  async refresh(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const schema = z.object({ refresh_token: z.string().min(1) });
    const dto = schema.safeParse(body);
    if (!dto.success) {
      throw new BadRequestException('缺少 refresh_token');
    }
    const result = await this.auth.refresh(dto.data.refresh_token);
    writeAuthCookie(res, (result as { access_token?: string })?.access_token);
    return result;
  }

  /** 登出：吊销指定刷新令牌（主动失效，可选；不传则仅前端清除） */
  @Public()
  @Post('logout')
  logout(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const schema = z.object({ refresh_token: z.string().min(1).optional() });
    const dto = schema.safeParse(body);
    const refreshToken = dto.success ? dto.data.refresh_token : undefined;
    if (res) res.clearCookie(AUTH_COOKIE, { path: '/' });
    return this.auth.logout(refreshToken);
  }
}
