import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Tenant, User } from '@prisma/client';
import { Role } from '../common/enums';

export interface CreateUserData {
  tenantId: string;
  username: string;
  passwordHash: string;
  name: string;
  role?: Role;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { username } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createUser(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({ data });
  }

  createTenant(name: string): Promise<Tenant> {
    return this.prisma.tenant.create({ data: { name } });
  }

  async findTenantById(id: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  async updateTenantName(id: string, name: string): Promise<Tenant> {
    return this.prisma.tenant.update({ where: { id }, data: { name } });
  }

  async listTenantMembers(tenantId: string) {
    const members = await this.prisma.membership.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, name: true, username: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({ ...m.user, membershipRole: m.role }));
  }

  async listUserTenants(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId },
      include: { tenant: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async ensureMembership(userId: string, tenantId: string, role: Role = 'MEMBER') {
    return this.prisma.membership.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      update: { role },
      create: { userId, tenantId, role },
    });
  }

  async isMember(userId: string, tenantId: string): Promise<boolean> {
    const m = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    return !!m;
  }

  async getMembership(tenantId: string, userId: string) {
    return this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
  }

  async removeMembership(tenantId: string, userId: string) {
    return this.prisma.membership.delete({
      where: { userId_tenantId: { userId, tenantId } },
    });
  }

  async setActiveTenant(userId: string, tenantId: string): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { activeTenantId: tenantId } });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }
}
