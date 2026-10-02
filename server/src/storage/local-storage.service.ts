import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHash } from 'crypto';
import { mkdir, writeFile, unlink, readFile } from 'fs/promises';
import { join, dirname, resolve, sep } from 'path';
import { StorageProvider, UploadInput, StoredObject } from './storage.interface';
import { storageRoot } from './storage-root';

/**
 * 本地文件系统存储实现。
 * 文件落盘到 STORAGE_DIR（未设置时为 <cwd>/uploads），并通过 /api/files/:key 提供访问。
 * 生产环境可替换为云存储实现（同样实现 StorageProvider 接口）。
 *
 * workbuddyDeploy 分支改动：
 *   1. 真正支持 STORAGE_DIR 环境变量（此前该变量只在 .env 里声明、代码从不读取，
 *      导致 DEPLOYMENT.md 里「挂载卷后可持久化」的说法不成立）；
 *   2. 修复 read() 的路径清洗 bug —— 旧实现用 replace(/[^a-zA-Z0-9._-]/g,'')
 *      会把 key 里的 '/' 一并删掉，而写入时的 key 形如 `${tenantId}/${文件名}`，
 *      于是 read() 永远找不到文件（EOF/ENOENT）。改为「resolve 后校验仍在 root 内」。
 */
@Injectable()
export class LocalStorageService implements StorageProvider {
  private readonly root = storageRoot();

  private extOf(filename: string): string {
    const i = filename.lastIndexOf('.');
    return i >= 0 ? filename.slice(i).toLowerCase() : '';
  }

  private keyOf(buffer: Buffer, filename: string): string {
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 24);
    return `${Date.now()}-${hash}${this.extOf(filename)}`;
  }

  /**
   * 把 key 解析成 root 内的绝对路径；拒绝任何路径穿越。
   * key 形如 `${tenantId}/${文件名}`，必须保留 '/' 才能与写入路径一致。
   */
  private resolveWithinRoot(key: string): string {
    const rel = String(key ?? '').replace(/\\/g, '/');
    if (!rel || rel.includes('..') || rel.startsWith('/')) {
      throw new InternalServerErrorException('非法的文件引用');
    }
    const full = resolve(this.root, rel);
    const rootWithSep = this.root.endsWith(sep) ? this.root : this.root + sep;
    if (full !== this.root && !full.startsWith(rootWithSep)) {
      throw new InternalServerErrorException('非法的文件引用');
    }
    return full;
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
      await unlink(this.resolveWithinRoot(key));
    } catch {
      // 文件不存在（或引用非法）时忽略
    }
  }

  async read(key: string): Promise<Buffer> {
    const full = this.resolveWithinRoot(key);
    try {
      return await readFile(full);
    } catch (e) {
      throw new InternalServerErrorException('读取文件失败：' + (e as Error).message);
    }
  }
}
