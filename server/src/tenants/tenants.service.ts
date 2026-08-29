import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { AuthService, JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Prisma } from '@prisma/client';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  /** 当前用户可切换的团队列表（含是否当前活跃） */
  async mine(user: JwtPayload) {
    const memberships = await this.users.listUserTenants(user.sub);
    return memberships.map((m) => ({
      tenantId: m.tenantId,
      name: m.tenant.name,
      role: m.role,
      isActive: m.tenantId === user.tenantId,
    }));
  }

  /** 切换到某团队：校验成员资格 → 更新活跃租户 → 重签 JWT */
  async switch(tenantId: string, user: JwtPayload) {
    const ok = await this.users.isMember(user.sub, tenantId);
    if (!ok) throw new ForbiddenException('你不是该团队的成员，无法切换');
    const updated = await this.users.setActiveTenant(user.sub, tenantId);
    const { passwordHash, ...safe } = updated;
    return this.auth.login(safe as any);
  }

  /** 当前活跃团队资料 + 统计 */
  async me(user: JwtPayload) {
    const tenant = await this.users.findTenantById(user.tenantId);
    if (!tenant) throw new NotFoundException('团队不存在');
    const [memberCount, projectCount] = await Promise.all([
      this.prisma.membership.count({ where: { tenantId: user.tenantId } }),
      this.prisma.project.count({ where: { tenantId: user.tenantId } }),
    ]);
    return {
      id: tenant.id,
      name: tenant.name,
      createdAt: tenant.createdAt,
      memberCount,
      projectCount,
      settings: tenant.settings,
    };
  }

  /** 重命名当前活跃团队 */
  async rename(name: string, user: JwtPayload) {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new BadRequestException('团队名称不能为空');
    if (trimmed.length > 40) throw new BadRequestException('团队名称过长');
    const tenant = await this.users.updateTenantName(user.tenantId, trimmed);
    return { id: tenant.id, name: tenant.name };
  }

  /** 更新团队级配置（JSON 合并）：如语音识别 ASR 的 asrApiKey / asrEndpoint / asrHeaderName */
  async updateSettings(settings: Record<string, unknown>, user: JwtPayload) {
    if (!settings || typeof settings !== 'object') throw new BadRequestException('配置格式不正确');
    const current = (await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
    }))?.settings as Record<string, unknown> | null;
    const merged = { ...(current || {}), ...settings };
    const tenant = await this.prisma.tenant.update({
      where: { id: user.tenantId },
      // merged 为运行时合并后的任意 JSON 对象，Prisma 的 InputJsonValue 类型校验较严，此处按 JSON 写入
      data: { settings: merged as unknown as Prisma.InputJsonValue },
    });
    return { id: tenant.id, settings: tenant.settings };
  }

  /** 创建新团队：当前用户成为 OWNER 并自动切换为活跃团队 */
  async create(name: string, user: JwtPayload) {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new BadRequestException('团队名称不能为空');
    if (trimmed.length > 40) throw new BadRequestException('团队名称过长');
    const tenant = await this.users.createTenant(trimmed);
    await this.users.ensureMembership(user.sub, tenant.id, 'OWNER');
    const updated = await this.users.setActiveTenant(user.sub, tenant.id);
    const { passwordHash, ...safe } = updated;
    return this.auth.login(safe as any);
  }

  /** 当前活跃团队成员列表 */
  async members(user: JwtPayload) {
    return this.users.listTenantMembers(user.tenantId);
  }

  /** 把已存在的用户加入当前活跃团队 */
  async addMember(username: string, role: Role, user: JwtPayload) {
    const target = await this.users.findByUsername(username);
    if (!target) throw new NotFoundException('用户不存在，请先注册');
    if (target.tenantId === user.tenantId) {
      // 已是该团队主账号，仍确保一条成员记录
    }
    const membership = await this.users.ensureMembership(target.id, user.tenantId, role);
    return { userId: target.id, username: target.username, name: target.name, role: membership.role };
  }

  /** 将某成员移出当前活跃团队（不能移除自己） */
  async removeMember(userId: string, user: JwtPayload) {
    if (userId === user.sub) throw new BadRequestException('不能移除当前登录的自己');
    const membership = await this.users.getMembership(user.tenantId, userId);
    if (!membership) throw new NotFoundException('该用户不是本团队成员');
    await this.users.removeMembership(user.tenantId, userId);
    return this.users.listTenantMembers(user.tenantId);
  }
}
