import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/auth.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  /** 校验 project 归属当前租户，返回 project 或抛错 */
  private async assertProjectTenant(projectId: string, tenantId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('赛项项目不存在');
    if (project.tenantId !== tenantId) throw new ForbiddenException('无权限访问该项目');
    return project;
  }

  async create(dto: CreateTaskDto, user: JwtPayload) {
    await this.assertProjectTenant(dto.projectId, user.tenantId);
    return this.prisma.task.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        ownerId: dto.ownerId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: dto.status ?? 'TODO',
        done: dto.status === 'DONE',
        scorePoints: dto.scorePointIds?.length
          ? { connect: dto.scorePointIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { scorePoints: true, owner: { select: { id: true, name: true } } },
    });
  }

  async findAll(projectId: string, user: JwtPayload) {
    await this.assertProjectTenant(projectId, user.tenantId);
    return this.prisma.task.findMany({
      where: { projectId },
      include: { scorePoints: true, owner: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(id: string, dto: UpdateTaskDto, user: JwtPayload) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!existing) throw new NotFoundException('任务不存在');
    if (existing.project.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限修改该任务');

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.ownerId !== undefined) data.ownerId = dto.ownerId;
    if (dto.dueDate !== undefined)
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.done = dto.status === 'DONE';
    }
    if (dto.scorePointIds !== undefined) {
      data.scorePoints = { set: dto.scorePointIds.map((sp) => ({ id: sp })) };
    }
    return this.prisma.task.update({
      where: { id },
      data: data as never,
      include: { scorePoints: true, owner: { select: { id: true, name: true } } },
    });
  }

  async remove(id: string, user: JwtPayload) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!existing) throw new NotFoundException('任务不存在');
    if (existing.project.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限删除该任务');
    await this.prisma.task.delete({ where: { id } });
    return { id };
  }

  /** 评分覆盖率统计：项目下总评分点 vs 已有关联任务覆盖的评分点 */
  async coverage(projectId: string, user: JwtPayload) {
    await this.assertProjectTenant(projectId, user.tenantId);
    const [total, covered] = await this.prisma.$transaction([
      this.prisma.scorePoint.count({ where: { criterion: { projectId } } }),
      this.prisma.scorePoint.count({
        where: { criterion: { projectId }, tasks: { some: {} } },
      }),
    ]);
    return {
      totalScorePoints: total,
      coveredScorePoints: covered,
      coverageRate: total ? Math.round((covered / total) * 100) : 0,
    };
  }
}
