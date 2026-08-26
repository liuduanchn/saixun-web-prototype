import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHash } from 'crypto';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
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
    await mkdir(this.root, { recursive: true });
    const key = this.keyOf(input.buffer, input.filename);
    const full = join(this.root, key);
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
}
