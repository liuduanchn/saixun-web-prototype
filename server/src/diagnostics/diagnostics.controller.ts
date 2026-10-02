import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';
import { JwtStrategy } from '../auth/jwt.strategy';

// jsonwebtoken 是 @nestjs/jwt 的传递依赖，直接借来做「用指定密钥验签」的交叉验证
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jwtLib = require('jsonwebtoken') as { verify: (token: string, secret: string) => unknown };
// passport 的策略注册表：AuthGuard('jwt') 依赖它，若注册表里没有 'jwt'
// 就会抛「Unknown authentication strategy」并被 Nest 统一转成 401
// eslint-disable-next-line @typescript-eslint/no-var-requires
const passportLib = require('passport') as { _strategies?: Record<string, unknown> };

function verifyWithSecret(token: string, secret: string) {
  return jwtLib.verify(token, secret);
}

/**
 * 【临时诊断接口】workbuddyDeploy 分支排障用，定位完即删。
 *
 * 待查问题：部署到托管平台后「登录成功但带 token 的请求全部 401」，
 * 且 Authorization / X-Auth-Token / Cookie 三条通道同时失败。
 * 已排除：多实例（连续调用同一 instanceId/pid）、边缘缓存（响应恒为 MISS）、
 *        令牌本身无效（refresh 走请求体正常、JWT payload 正确且未过期）。
 * 本接口用来一次性确定剩下两种可能：
 *   · /headers  → 应用到底收到了哪些请求头（凭证是否被链路剥掉）
 *   · /auth     → 验签密钥指纹是否与签发侧一致
 */
@Controller('diagnostics')
export class DiagnosticsController {
  /** 每个进程一份，用于识别「同一实例」 */
  private readonly instanceId = randomUUID();
  private readonly bootAt = new Date().toISOString();

  constructor(
    private readonly jwtStrategy: JwtStrategy,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Get('auth')
  async auth() {
    const secret = process.env.JWT_SECRET ?? '';
    // 功能自检：用签发侧（JwtModule）签一个 token，再用它的密钥验回来，
    // 确认签发侧自身一致（若这步都失败，问题在签发侧的配置）。
    let moduleRoundTrip = 'ok';
    let signedTokenPrefix = '';
    try {
      const t = await this.jwt.signAsync({ sub: 'diag', tenantId: 'demo-tenant' });
      signedTokenPrefix = t.slice(0, 12);
      await this.jwt.verifyAsync(t);
    } catch (e) {
      moduleRoundTrip = (e as Error).message;
    }
    return {
      instanceId: this.instanceId,
      pid: process.pid,
      bootAt: this.bootAt,
      hasSecret: secret.length > 0,
      // 签发侧（process.env）与验签侧（策略实际持有）的指纹，两者必须相同
      envSecretFingerprint: createHash('sha256').update(secret).digest('hex').slice(0, 10),
      strategySecretFingerprint: this.jwtStrategy.secretFingerprint(),
      moduleRoundTrip,
      signedTokenPrefix,
      // 关键探针：passport 全局注册表里是否已有 'jwt' 策略
      registeredStrategies: Object.keys(passportLib._strategies ?? {}),
      hasJwtStrategy: Boolean(passportLib._strategies?.jwt),
      passportPath: (() => {
        try {
          return require.resolve('passport');
        } catch {
          return 'resolve-failed';
        }
      })(),
      node: process.version,
      cwd: process.cwd(),
    };
  }

  /** 回显应用实际收到的请求头 —— 用于判断凭证是否在链路上被剥离 */
  @Public()
  @Get('headers')
  headers(@Req() req: any) {
    const h = req?.headers ?? {};
    const cookieNames = String(h.cookie ?? '')
      .split(';')
      .map((s: string) => s.split('=')[0].trim())
      .filter(Boolean);
    // 解开 Authorization 里的 JWT payload（不验签），用于判断这个令牌到底是谁的：
    // 托管平台网关会注入它自己的 Authorization，其 sub 与本应用的完全不同。
    const authRaw = String(h.authorization ?? '').replace(/^Bearer\s+/i, '');
    let authorizationSub = '';
    try {
      const p = authRaw.split('.')[1];
      if (p) authorizationSub = String(JSON.parse(Buffer.from(p, 'base64url').toString()).sub ?? '');
    } catch {
      authorizationSub = 'decode-failed';
    }
    return {
      allHeaderNames: Object.keys(h).sort(),
      hasAuthorization: Boolean(h.authorization),
      authorizationPrefix: String(h.authorization ?? '').slice(0, 14),
      authorizationSub,
      hasSaixunAuth: Boolean(h['x-saixun-auth']),
      hasXAuthToken: Boolean(h['x-auth-token']),
      hasCookie: Boolean(h.cookie),
      cookieNames,
      host: h.host ?? null,
      forwardedProto: h['x-forwarded-proto'] ?? null,
      forwardedFor: h['x-forwarded-for'] ?? null,
    };
  }

  /**
   * 交叉验签探针：把「同一个 token」分别用签发模块的密钥与进程环境变量的密钥验一遍。
   * 自签自验（moduleRoundTrip）即使两侧密钥不同也会通过，只有交叉验证才能暴露差异。
   */
  @Public()
  @Post('verify')
  async verify(@Body() body: { token?: string }) {
    const token = String(body?.token ?? '');
    const secret = process.env.JWT_SECRET ?? '';
    const out: Record<string, string> = {};
    try {
      await this.jwt.verifyAsync(token);
      out.moduleVerify = 'ok';
    } catch (e) {
      out.moduleVerify = (e as Error).message;
    }
    try {
      verifyWithSecret(token, secret);
      out.envVerify = 'ok';
    } catch (e) {
      out.envVerify = (e as Error).message;
    }
    return out;
  }
}
