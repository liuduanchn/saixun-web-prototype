import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './auth.service';

/** 认证 Cookie 名（与 access_token 同值，httpOnly） */
export const AUTH_COOKIE = 'saixun_token';

/**
 * 本应用专用的认证请求头（值直接是 token 原文，不带 Bearer 前缀）。
 *
 * 为什么不用标准 Authorization —— 部署到 WorkBuddy 托管平台后实测：
 * 平台网关会**在每一个请求上注入它自己的** `Authorization: Bearer eyJ...`
 * （同时还有 x-space-key 等），导致 passport 从标准头取到的是**网关的令牌**，
 * 验签必然 `invalid signature`，表现为「登录成功但所有带 token 的请求 401」。
 * 用一个网关不会触碰的专属头名即可绕开该冲突。
 */
export const AUTH_HEADER = 'x-saixun-auth';

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
    // 直接以 process.env 为准：与 AuthModule 的签发侧保持**同一个读取路径**，
    // 避免两侧分别经 ConfigService 解析时出现不一致（排查线上 401 时固化下来）。
    const secret =
      process.env.JWT_SECRET || config.get<string>('JWT_SECRET') || 'change-me-in-production';
    super({
      // 提取顺序**很重要**：专属头 → Cookie → 标准 Bearer。
      // 标准 Bearer 放最后，因为托管平台的网关会注入自己的 Authorization，
      // 若放在前面就会永远取到网关的令牌（详见 AUTH_HEADER 的说明）。
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromHeader(AUTH_HEADER),
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
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
