import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role, User } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface JwtPayload {
  sub: string;
  username: string;
  name: string;
  role: Role;
  tenantId: string;
}

/** 返回给客户端的当前用户信息（不含密码） */
export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  tenantId: string;
}

/** 登录/注册返回结构（含可轮换的刷新令牌） */
export interface AuthResult {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

/** 将 "30d"/"2h"/"7d"/"15m" 解析为毫秒；默认 30 天 */
function parseDurationToMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const m = /^(\d+)\s*(d|h|m|s)$/.exec(value.trim());
  if (!m) return fallbackMs;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const mul = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : 1_000;
  return n * mul;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** 校验用户名密码，返回不含密码的用户对象 */
  async validateUser(username: string, password: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.users.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const { passwordHash, ...safe } = user;
    return safe;
  }

  /** 签发 JWT：tenantId 使用当前活跃团队 activeTenantId */
  login(user: Omit<User, 'passwordHash'>): AuthResult {
    const activeTenantId = user.activeTenantId || user.tenantId;
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      tenantId: activeTenantId,
    };
    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      tenantId: activeTenantId,
    };
    return {
      access_token: this.jwt.sign(payload),
      refresh_token: this.issueRefreshToken(user.id, activeTenantId),
      user: authUser,
    };
  }

  /** 生成并持久化一个刷新令牌（原文返回给客户端，库内存储用于失效校验） */
  private issueRefreshToken(userId: string, tenantId: string): string {
    const raw = randomBytes(32).toString('hex');
    const ttlMs = parseDurationToMs(this.config.get<string>('JWT_REFRESH_EXPIRES_IN'), 30 * 86_400_000);
    this.prisma.refreshToken.create({
      data: {
        token: raw,
        userId,
        tenantId,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    }).catch(() => { /* 刷新令牌写入失败不应阻断登录，仅失去登出能力 */ });
    return raw;
  }

  /** 用刷新令牌换取新的令牌对（轮换：旧令牌立即失效，防重放） */
  async refresh(rawToken: string): Promise<AuthResult> {
    if (!rawToken) throw new UnauthorizedException('缺少刷新令牌');
    const record = await this.prisma.refreshToken.findUnique({ where: { token: rawToken } });
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('刷新令牌无效或已过期，请重新登录');
    }
    // 轮换：先吊销旧令牌
    await this.prisma.refreshToken.update({
      where: { token: rawToken },
      data: { revokedAt: new Date() },
    });
    const user = await this.users.findById(record.userId);
    if (!user) throw new UnauthorizedException('用户不存在');
    const { passwordHash, ...safe } = user;
    // 复用 login 逻辑签发新令牌对（login 内部会再生成新 refresh）
    return this.login(safe);
  }

  /** 登出：吊销指定刷新令牌（主动失效） */
  async logout(rawToken: string | undefined): Promise<{ ok: true }> {
    if (rawToken) {
      await this.prisma.refreshToken.updateMany({
        where: { token: rawToken, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  /** 吊销某用户全部刷新令牌（改密后踢下线所有会话） */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** 注册：可指定已有租户，或新建租户 */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existed = await this.users.findByUsername(dto.username);
    if (existed) {
      throw new BadRequestException('该用户名已存在');
    }

    let tenantId = dto.tenantId;
    if (!tenantId) {
      const tenant = await this.users.createTenant(dto.tenantName || `${dto.name}的团队`);
      tenantId = tenant.id;
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.createUser({
      tenantId,
      username: dto.username,
      passwordHash,
      name: dto.name,
      role: (dto.role as Role) ?? 'STUDENT',
    });
    // 注册即成为该团队 Owner，保证可切换回
    await this.users.ensureMembership(user.id, tenantId, 'OWNER');

    const { passwordHash: _omit, ...safe } = user;
    return this.login(safe);
  }

  /** 修改密码：校验旧密码 → 更新哈希 */
  async changePassword(user: JwtPayload, oldPassword: string, newPassword: string): Promise<{ ok: true }> {
    if (!oldPassword || !newPassword) {
      throw new BadRequestException('原密码与新密码均不能为空');
    }
    if (newPassword.length < 6) {
      throw new BadRequestException('新密码至少 6 位');
    }
    const full = await this.users.findById(user.sub);
    if (!full) throw new UnauthorizedException('用户不存在');
    const ok = await bcrypt.compare(oldPassword, full.passwordHash);
    if (!ok) throw new BadRequestException('原密码错误');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.updatePassword(user.sub, passwordHash);
    // 改密后吊销该用户所有刷新令牌，强制重新登录（防令牌泄露复用）
    await this.revokeAllForUser(user.sub);
    return { ok: true };
  }
}
