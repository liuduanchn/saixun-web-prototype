import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  Param,
  UseInterceptors,
  UseFilters,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { CriteriaService, CriterionDraft } from './criteria.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { MAX_FILE_SIZE } from '../storage/file-policy';
import { FileUploadFilter } from '../storage/multer-exception.filter';

@Controller('criteria')
export class CriteriaController {
  constructor(private readonly criteria: CriteriaService) {}

  @Get()
  list(@Query('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.criteria.list(projectId, user);
  }

  /** 赛项解析：规程文本 -> 结构化草稿（不落库，供教师预览/修订） */
  @Post('parse')
  parse(@Body('text') text: string, @CurrentUser() user: JwtPayload) {
    return this.criteria.parse(text, user);
  }

  /** 赛项解析（文件版）：上传规程文件（DOC/DOCX/PDF/TXT）-> 抽取文本 -> 结构化草稿 */
  @Post('parse-file')
  @UseFilters(FileUploadFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  parseFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!projectId) throw new BadRequestException('projectId 必填');
    if (!file || !file.buffer || file.buffer.length === 0)
      throw new BadRequestException('未接收到文件或文件为空');
    return this.criteria.parseFile(file, user);
  }

  /** 教师确认：将草稿落库为评分要素 + 评分点 */
  @Post('confirm')
  confirm(
    @Body('projectId') projectId: string,
    @Body('draft') draft: CriterionDraft[],
    @CurrentUser() user: JwtPayload,
  ) {
    return this.criteria.confirm(projectId, draft, user);
  }

  @Delete(':id')
  removeCriterion(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.criteria.removeCriterion(id, user);
  }

  @Delete('score-points/:id')
  removeScorePoint(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.criteria.removeScorePoint(id, user);
  }
}
