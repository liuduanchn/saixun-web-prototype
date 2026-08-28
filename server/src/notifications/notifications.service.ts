import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/auth.service';

export interface NotificationView {
  id: string;
  category: string;
  title: string;
  detail: string | null;
  targetNav: string | null;
  read: boolean;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: JwtPayload): Promise<NotificationView[]> {
    const list = await this.prisma.notification.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return list.map((n) => ({
      id: n.id,
      category: n.category,
      title: n.title,
      detail: n.detail,
      targetNav: n.targetNav,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async markRead(id: string, user: JwtPayload) {
    const existing = await this.prisma.notification.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('通知不存在');
    if (existing.userId !== user.sub) throw new ForbiddenException('无权限操作该通知');
    await this.prisma.notification.update({ where: { id }, data: { read: true } });
    return { ok: true };
  }

  async markAllRead(user: JwtPayload) {
    await this.prisma.notification.updateMany({
      where: { userId: user.sub, read: false },
      data: { read: true },
    });
    return { ok: true };
  }

  /** 业务动作触发的通知写入（事件驱动，替代纯 seed 数据） */
  async notify(input: {
    userId: string;
    category: string;
    title: string;
    detail?: string | null;
    targetNav?: string | null;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        category: input.category,
        title: input.title,
        detail: input.detail ?? null,
        targetNav: input.targetNav ?? null,
        read: false,
      },
    });
  }
}
