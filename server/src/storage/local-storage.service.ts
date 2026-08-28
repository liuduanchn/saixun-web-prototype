import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHash } from 'crypto';
import { mkdir, writeFile, unlink, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { StorageProvider, UploadInput, StoredObject } from './storage.interface';

/**
 * 本地文件系统存储实现。
 * 文件落盘到 server/uploads/，并通过静态路由 /api/files/:key 提供访问。
 * 生产环境可替换为云存储实现（同样实现 StorageProvider 接口）。
 */
@Injectable()
export class LocalStorageService implements StorageProvider {
  private readonly root = join(process.cwd(), 'uploads');

  private extOf(filename: string): string {
    const i = filename.lastIndexOf('.');
    return i >= 0 ? filename.slice(i).toLowerCase() : '';
  }

  private keyOf(buffer: Buffer, filename: string): string {
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 24);
    return `${Date.now()}-${hash}${this.extOf(filename)}`;
  }

  async upload(input: UploadInput): Promise<StoredObject> {
    // 租户隔离：key 以 tenantId 作为一级目录前缀
    const key = `${input.tenantId}/${this.keyOf(input.buffer, input.filename)}`;
    const full = join(this.root, key);
    // 需连同租户子目录一并创建，否则首次上传会因目录不存在而 ENOENT
    await mkdir(dirname(full), { recursive: true });
    try {
      await writeFile(full, input.buffer);
    } catch (e) {
      throw new InternalServerErrorException('文件写入失败：' + (e as Error).message);
    }
    return {
      key,
      url: this.getUrl(key),
      size: input.size,
      contentType: input.contentType,
    };
  }

  getUrl(key: string): string {
    return `/api/files/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(join(this.root, key));
    } catch {
      // 文件不存在时忽略
    }
  }

  async read(key: string): Promise<Buffer> {
    // 仅允许读取本目录下的文件，杜绝路径穿越
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '');
    try {
      return await readFile(join(this.root, safe));
    } catch (e) {
      throw new InternalServerErrorException('读取文件失败：' + (e as Error).message);
    }
  }
}
