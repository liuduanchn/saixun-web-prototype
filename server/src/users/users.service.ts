import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Tenant, User } from '@prisma/client';

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
}
