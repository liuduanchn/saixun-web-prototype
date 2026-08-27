import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { ResourcesService } from './resources.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('resources')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  list(@Query('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    if (!projectId) throw new BadRequestException('projectId 必填');
    return this.resources.list(projectId, user);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: unknown,
    @Query('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const uploaded =
      file && file.buffer && file.buffer.length ? file : undefined;
    return this.resources.create(body, uploaded, projectId, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.resources.remove(id, user);
  }
}
