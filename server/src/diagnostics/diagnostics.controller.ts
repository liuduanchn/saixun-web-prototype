import { Controller, Get } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';

/**
 * 【临时诊断接口】workbuddyDeploy 分支排障用，定位完即删。
 *
 * 背景：部署到托管平台后出现「登录成功但带 token 的请求全部 401」，
 * 且 Authorization / X-Auth-Token / Cookie 三条通道同时失败 ——
 * 这排除了「请求头被边缘代理改写」的解释，更像是签发与校验所用的
 * JWT_SECRET 不是同一个值。若平台同时跑着多个实例，而各实例密钥不同，
 * 就会正好呈现这个现象。
 *
 * 判定方式：连续调用本接口多次，比较 instanceId 与 jwtSecretHash ——
 *   · instanceId 变化            → 存在多个实例（负载均衡）
 *   · instanceId 不变但 hash 变  → 同一实例密钥被改写（几乎不可能）
 *   · 都不变且 /api/auth/me 仍 401 → 同一进程内签发与校验不一致
 */
@Controller('diagnostics')
export class DiagnosticsController {
  /** 每个进程一份，用于识别「同一实例」 */
  private readonly instanceId = randomUUID();
  private readonly bootAt = new Date().toISOString();

  @Public()
  @Get('auth')
  auth() {
    const secret = process.env.JWT_SECRET ?? '';
    return {
      instanceId: this.instanceId,
      pid: process.pid,
      bootAt: this.bootAt,
      // 仅为对比「两个实例是否用了不同的密钥」，取前 10 位足够，且不是密钥本身
      jwtSecretHash: createHash('sha256').update(secret).digest('hex').slice(0, 10),
      hasSecret: secret.length > 0,
      node: process.version,
      cwd: process.cwd(),
    };
  }
}
