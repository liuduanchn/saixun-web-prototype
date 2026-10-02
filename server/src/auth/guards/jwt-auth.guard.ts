import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: any) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  /**
   * 【临时诊断】把鉴权失败的具体原因带进 401 响应体，用于定位线上
   * 「登录成功但带 token 的请求全部 401」。默认实现只抛一句 "Unauthorized"，
   * 无法区分「没取到 token / 签名不对 / 过期 / validate 抛错」。
   * 定位完成后应恢复为默认行为（直接 super.handleRequest 或删除本方法）。
   */
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      const reason =
        (err && (err.message || err.name)) ||
        (info && (info.message || info.name)) ||
        'no-user-and-no-info';
      throw new UnauthorizedException(`auth-debug: ${String(reason).slice(0, 200)}`);
    }
    return user;
  }
}
