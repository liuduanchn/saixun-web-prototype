import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { WorksService } from './works.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('works')
export class WorksController {
  constructor(private readonly works: WorksService) {}

  /** 上传作品（multipart/form-data，字段名 file）。projectId 走 query。 */
  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!projectId) throw new BadRequestException('projectId 必填');
    return this.works.upload(file, projectId, user);
  }

  @Get()
  findAll(@Query('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.works.findAll(projectId, user);
  }

  @Get('mine')
  findMine(@CurrentUser() user: JwtPayload) {
    return this.works.findMine(user);
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
