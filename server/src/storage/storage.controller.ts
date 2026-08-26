import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { join } from 'path';
import { Public } from '../auth/decorators/public.decorator';

/**
 * 提供已上传文件的访问：GET /api/files/:key
 * （演示用本地存储；生产环境由云存储直接提供签名 URL，此路由可移除）
 */
@Controller('files')
export class StorageController {
  private readonly root = join(process.cwd(), 'uploads');

  @Public()
  @Get(':key')
  serve(@Param('key') key: string, @Res() res: Response) {
    // 防目录穿越
    if (key.includes('/') || key.includes('..')) throw new NotFoundException();
    const stream = createReadStream(join(this.root, key));
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).send('not found');
    });
    stream.pipe(res);
  }
}
