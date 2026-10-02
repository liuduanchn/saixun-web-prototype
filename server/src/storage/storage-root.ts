import { join, resolve } from 'path';

/**
 * 存储根目录的**唯一来源**。
 * 上传（LocalStorageService）与下载（StorageController）必须使用同一个根，
 * 否则会出现「上传成功但下载 404」。
 *
 * 取值规则：STORAGE_DIR（绝对路径优先）→ 否则 <cwd>/uploads。
 * 注意：两个 seed 脚本与后端进程必须在**同一个 cwd** 下运行，
 * 否则 seed 写入的作品正文与后端读取的位置会错位。
 */
export function storageRoot(): string {
  return process.env.STORAGE_DIR
    ? resolve(process.env.STORAGE_DIR)
    : join(process.cwd(), 'uploads');
}
