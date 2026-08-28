import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * 全局租户守卫（Phase C 收尾）：
 * 在 JwtAuthGuard 之后运行，从已认证的 JWT 取出 tenantId 写入 req.tenantId，
 * 并强制校验「当前账号必须具备租户上下文」——避免漏写租户过滤导致跨租户越权。
 * 对未认证路由（@Public）放行，交由 JwtAuthGuard 处理。
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    // 未认证（@Public 路由）跳过，交由 JwtAuthGuard 决定
    if (!user) return true;

    const tenantId = user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('当前账号缺少租户上下文，无法访问');
    }
    // 供需要直接从请求读取租户的 Handler 使用（保持与 user.tenantId 一致）
    req.tenantId = tenantId;
    return true;
  }
}
