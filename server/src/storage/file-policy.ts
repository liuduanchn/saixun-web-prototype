import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

/**
 * 文件上传安全策略：统一约束大小与类型，防止磁盘被撑爆 / 上传可执行文件。
 * 被 works 与 resources 两个上传入口复用。
 */

/** 单文件硬上限 20MB。Multer 的 limits.fileSize 据此在读取阶段即拒绝。 */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** 允许的 MIME 类型白名单（与扩展名双校验，避免伪造 MIME 绕过）。 */
export const ALLOWED_MIME = new Set<string>([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
  'application/zip',
  'application/x-zip-compressed',
]);

/** 允许的扩展名白名单（小写，不含点）。 */
export const ALLOWED_EXT = new Set<string>([
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'txt',
  'md',
  'zip',
]);

function extOf(filename?: string): string {
  if (!filename) return '';
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}

/**
 * 校验上传文件：大小超限抛 413，类型不在白名单抛 400。
 * 同时校验 MIME 与扩展名，二者任一不合法即拒绝（防 MIME 伪造）。
 */
export function assertFileAllowed(file?: {
  originalname?: string;
  mimetype?: string;
  size?: number;
}): void {
  if (!file) throw new BadRequestException('缺少上传文件');
  if (typeof file.size === 'number' && file.size > MAX_FILE_SIZE) {
    throw new PayloadTooLargeException(
      `文件大小超过上限（${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB）`,
    );
  }
  const ext = extOf(file.originalname);
  const okMime = file.mimetype && ALLOWED_MIME.has(file.mimetype);
  const okExt = ext && ALLOWED_EXT.has(ext);
  if (!okMime || !okExt) {
    throw new BadRequestException(
      `不支持的文件类型（${file.mimetype || '未知'} .${ext || '无扩展名'}），仅允许 ${[...ALLOWED_EXT].join('/')}`,
    );
  }
}
