import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UseFilters,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { WorksService } from './works.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { MAX_FILE_SIZE } from '../storage/file-policy';
import { FileUploadFilter } from '../storage/multer-exception.filter';

@Controller('works')
export class WorksController {
  constructor(private readonly works: WorksService) {}

  /** 上传作品（multipart/form-data，字段名 file）。projectId 走 query。 */
  @Post()
  @UseFilters(FileUploadFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!projectId) throw new BadRequestException('projectId 必填');
    return this.works.upload(file, projectId, user);
  }

  @Get()
  findAll(
    @Query('projectId') projectId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.works.findAll(projectId, user, { page, pageSize });
  }

  @Get('mine')
  findMine(
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.works.findMine(user, { page, pageSize });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.works.findOne(id, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.works.remove(id, user);
  }
}
