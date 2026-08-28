import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  PayloadTooLargeException,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';

/**
 * 将 Multer 上传错误转换为规范的 HTTP 状态码：
 * - LIMIT_FILE_SIZE → 413（文件过大）
 * - 其余（如字段名不符）→ 400
 * 注册在上传接口方法上，避免默认的 500 透出。
 */
@Catch(MulterError)
export class FileUploadFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let error: HttpException;
    if (exception.code === 'LIMIT_FILE_SIZE') {
      error = new PayloadTooLargeException(`文件大小超过上传上限`);
    } else {
      error = new BadRequestException(exception.message || '文件上传失败');
    }
    res.status(error.getStatus()).json({
      statusCode: error.getStatus(),
      message: error.message,
    });
  }
}
