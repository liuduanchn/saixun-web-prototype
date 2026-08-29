import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER, StorageProvider } from '../storage/storage.interface';
import { assertFileAllowed } from '../storage/file-policy';
import { extractText } from '../common/text-extract';
import { parsePage, toPaged, PageQuery, Paged } from '../common/pagination';
import { JwtPayload } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LearningService } from '../learning/learning.service';

@Injectable()
export class WorksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly notifications: NotificationsService,
    private readonly learning: LearningService,
  ) {}

  private async assertProjectTenant(projectId: string, tenantId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('赛项项目不存在');
    if (project.tenantId !== tenantId) throw new ForbiddenException('无权限访问该项目');
    return project;
  }

  /** 上传作品：写入存储层 + 记录一个 WorkVersion（版本号自增） */
  async upload(
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    projectId: string,
    user: JwtPayload,
  ) {
    const project = await this.assertProjectTenant(projectId, user.tenantId);
    if (!file || !file.buffer || file.buffer.length === 0)
      throw new BadRequestException('未接收到文件或文件为空');
    assertFileAllowed(file);

    // 抽取文件纯文本（doc/docx/pdf/txt），供诊断比对；抽取失败直接拒绝上传
    let content = '';
    try {
      content = await extractText({
        buffer: file.buffer,
        mimetype: file.mimetype,
        filename: file.originalname,
      });
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(`无法解析文件内容：${(e as Error).message || '不支持的文件'}`);
    }

    const stored = await this.storage.upload({
      buffer: file.buffer,
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      tenantId: user.tenantId,
    });

    const last = await this.prisma.workVersion.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;

    const wv = await this.prisma.workVersion.create({
      data: { projectId, uploaderId: user.sub, fileRef: stored.key, content, version },
      include: { uploader: { select: { id: true, name: true } } },
    });

    // 事件驱动：通知本租户教师有新作品；为学生记录学习埋点
    const teachers = await this.prisma.user.findMany({
      where: { tenantId: user.tenantId, role: 'TEACHER' },
      select: { id: true },
    });
    for (const t of teachers) {
      await this.notifications.notify({
        userId: t.id,
        category: 'work',
        title: `${user.name} 上传了新作品`,
        detail: `${project.name} · 版本 V${version}`,
        targetNav: '竞赛项目驾驶舱',
      });
    }
    await this.learning.track({
      userId: user.sub,
      type: 'WORK_UPLOADED',
      payload: { version, title: project.name },
    });

    return wv;
  }

  async findAll(
    projectId: string,
    user: JwtPayload,
    page: PageQuery = {},
  ): Promise<Paged<any>> {
    await this.assertProjectTenant(projectId, user.tenantId);
    const p = parsePage(page);
    const where = { projectId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workVersion.findMany({
        where,
        include: { uploader: { select: { id: true, name: true } } },
        orderBy: { version: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.workVersion.count({ where }),
    ]);
    return toPaged(items, total, p);
  }

  /** 学生的「我的作品」：仅返回当前用户本人上传、且属于当前租户的作品版本 */
  async findMine(user: JwtPayload, page: PageQuery = {}): Promise<Paged<any>> {
    const p = parsePage(page);
    const where = { uploaderId: user.sub, project: { tenantId: user.tenantId } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workVersion.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          uploader: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.workVersion.count({ where }),
    ]);
    return toPaged(items, total, p);
  }

  async findOne(id: string, user: JwtPayload) {
    const wv = await this.prisma.workVersion.findUnique({
      where: { id },
      include: { project: true, uploader: { select: { id: true, name: true } } },
    });
    if (!wv) throw new NotFoundException('作品版本不存在');
    if (wv.project.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限访问该作品');
    return { ...wv, url: this.storage.getUrl(wv.fileRef) };
  }

  async remove(id: string, user: JwtPayload) {
    const wv = await this.prisma.workVersion.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!wv) throw new NotFoundException('作品版本不存在');
    if (wv.project.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限删除该作品');
    await this.storage.delete(wv.fileRef);
    await this.prisma.workVersion.delete({ where: { id } });
    return { id };
  }
}
