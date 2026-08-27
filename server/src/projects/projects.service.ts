import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/auth.service';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 列出当前租户下的赛项项目（用于项目切换） */
  async list(user: JwtPayload) {
    return this.prisma.project.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { tasks: true, criteria: true, works: true, defenseSessions: true },
        },
      },
    });
  }
}
