/**
 * 存储抽象：定义统一的对象存储接口。
 * 当前提供本地文件系统实现（LocalStorageService），后续可无缝替换为
 * 阿里云 OSS / 腾讯云 COS / AWS S3（实现同一接口即可，业务代码不变）。
 */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface UploadInput {
  buffer: Buffer;
  filename: string;
  contentType: string;
  size: number;
}

export interface StoredObject {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface StorageProvider {
  /** 上传对象，返回内部 key 与可访问 url */
  upload(input: UploadInput): Promise<StoredObject>;
  /** 由 key 生成访问 URL（本地实现为静态文件路由，云实现为签名 URL） */
  getUrl(key: string): string;
  /** 删除对象 */
  delete(key: string): Promise<void>;
}
