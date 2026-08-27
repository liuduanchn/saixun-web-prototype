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
import { z } from 'zod';

const CreateResourceSchema = z.object({
  name: z.string().min(1, '资源名称不能为空'),
  type: z.enum(['TEMPLATE', 'CASE', 'QUESTION_BANK', 'MATERIAL']).default('MATERIAL'),
  description: z.string().optional(),
});

export type CreateResourceInput = z.infer<typeof CreateResourceSchema>;

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class ResourcesService {
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

  async list(projectId: string, user: JwtPayload) {
    await this.assertProjectTenant(projectId, user.tenantId);
    const rows = await this.prisma.resource.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ ...r, url: r.fileRef ? this.storage.getUrl(r.fileRef) : null }));
  }

  async create(
    body: unknown,
    file: UploadedFile | undefined,
    projectId: string,
    user: JwtPayload,
  ) {
    if (!projectId) throw new BadRequestException('projectId 必填');
    await this.assertProjectTenant(projectId, user.tenantId);

    const parsed = CreateResourceSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(parsed.error.issues[0]?.message ?? '参数错误');
    const { name, type, description } = parsed.data;

    let fileRef: string | undefined;
    if (file && file.buffer && file.buffer.length) {
      const stored = await this.storage.upload({
        buffer: file.buffer,
        filename: file.originalname,
        contentType: file.mimetype,
        size: file.size,
      });
      fileRef = stored.key;
    }

    const row = await this.prisma.resource.create({
      data: {
        projectId,
        name,
        type,
        description: description ?? null,
        fileRef: fileRef ?? null,
      },
    });
    return { ...row, url: fileRef ? this.storage.getUrl(fileRef) : null };
  }

  async remove(id: string, user: JwtPayload) {
    const row = await this.prisma.resource.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!row) throw new NotFoundException('资源不存在');
    if (row.project.tenantId !== user.tenantId)
      throw new ForbiddenException('无权限删除该资源');
    if (row.fileRef) await this.storage.delete(row.fileRef);
    await this.prisma.resource.delete({ where: { id } });
    return { id };
  }
}
