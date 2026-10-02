import {
  Controller,
  Get,
  Req,
  Res,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { join, resolve, normalize, sep } from 'path';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { storageRoot } from './storage-root';

/**
 * 提供已上传文件的访问：GET /api/files/:tenant/:key...
 * 文件按租户（tenantId）分目录隔离，下载须携带合法 token 且只能访问
 * 当前用户所属租户目录下的文件，杜绝跨租户越权读取。
 */
@Controller('files')
export class StorageController {
  private readonly root = storageRoot();

  @Get('*path')
  serve(@Req() req: any, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    // 通配段在不同 path-to-regexp 版本下参数名为 path 或 0；
    // Express 5 对跨多段的通配参数返回数组，需按 '/' 还原为相对路径。
    const params = (req && req.params) || {};
    const raw = params.path ?? params[0];
    let path = (Array.isArray(raw) ? raw.join('/') : String(raw ?? '')).replace(/^\/+/, '');
    if (!path) {
      path = String(req?.path ?? '').replace(/^\/+/, '').replace(/^api\/files\//, '');
    }

    // 防目录穿越：path 不得包含 .. ，且必须落在当前用户租户目录内
    if (!path || path.includes('..') || !path.startsWith(`${user.tenantId}/`)) {
      throw new NotFoundException();
    }
    const full = resolve(this.root, normalize(path));
    const rootResolved = resolve(this.root);
    if (full !== rootResolved && !full.startsWith(rootResolved + sep)) {
      throw new ForbiddenException();
    }
    if (!existsSync(full)) {
      throw new NotFoundException();
    }
    const stream = createReadStream(full);
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).send('not found');
    });
    stream.pipe(res);
  }
}
