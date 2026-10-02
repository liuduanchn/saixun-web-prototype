import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './auth.service';

/** 认证 Cookie 名（与 access_token 同值，httpOnly） */
export const AUTH_COOKIE = 'saixun_token';

/** 备用自定义请求头名：值直接是 token 原文（不带 Bearer 前缀） */
export const AUTH_HEADER = 'x-auth-token';

/**
 * 从 Cookie 中取 token。手写解析而不引入 cookie-parser ——
 * 只读一个键，没必要为此多一个依赖。
 */
function fromCookie(req: any): string | null {
  const raw = req?.headers?.cookie;
  if (!raw || typeof raw !== 'string') return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === AUTH_COOKIE) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // 三路任取其一：标准 Bearer 头 → 自定义头 → Cookie。
      // 背景：部署到 WorkBuddy 托管平台后实测「登录成功但带 token 的请求全部 401」，
      // 而同一份代码用同一个启动脚本在本地完全正常，且 refresh（走请求体、不经本策略）
      // 也正常 —— 说明令牌本身有效，问题出在 Authorization 头经过边缘代理后没能
      // 原样到达应用。因此并行支持另外两条通道，任一可用即可，本地行为不变。
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromHeader(AUTH_HEADER),
        fromCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'change-me-in-production',
    });
  }

  /** token 校验通过后的处理：直接把 payload 作为 req.user */
  async validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }
    return payload;
  }
}
