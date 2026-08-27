import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER, StorageProvider } from '../storage/storage.interface';
import { JwtPayload } from '../auth/auth.service';

@Injectable()
export class WorksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
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
    await this.assertProjectTenant(projectId, user.tenantId);
    if (!file || !file.buffer || file.buffer.length === 0)
      throw new BadRequestException('未接收到文件或文件为空');

    const stored = await this.storage.upload({
      buffer: file.buffer,
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
    });

    const last = await this.prisma.workVersion.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;

    return this.prisma.workVersion.create({
      data: { projectId, uploaderId: user.sub, fileRef: stored.key, version },
      include: { uploader: { select: { id: true, name: true } } },
    });
  }

  async findAll(projectId: string, user: JwtPayload) {
    await this.assertProjectTenant(projectId, user.tenantId);
    return this.prisma.workVersion.findMany({
      where: { projectId },
      include: { uploader: { select: { id: true, name: true } } },
      orderBy: { version: 'desc' },
    });
  }

  /** 学生的「我的作品」：仅返回当前用户本人上传、且属于当前租户的作品版本 */
  async findMine(user: JwtPayload) {
    return this.prisma.workVersion.findMany({
      where: { uploaderId: user.sub, project: { tenantId: user.tenantId } },
      include: {
        project: { select: { id: true, name: true } },
        uploader: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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
