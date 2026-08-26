import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Query,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { DiagnosisService } from './diagnosis.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { DiagnosisStatus } from '@prisma/client';

@Controller('diagnosis')
export class DiagnosisController {
  constructor(private readonly diagnosis: DiagnosisService) {}

  /** 对某个作品版本发起诊断（调用 AI 或启发式兜底） */
  @Post()
  analyze(@Body('workVersionId') workVersionId: string, @CurrentUser() user: JwtPayload) {
    if (!workVersionId) throw new NotFoundException('workVersionId 必填');
    return this.diagnosis.analyze(workVersionId, user);
  }

  @Get()
  findByWorkVersion(
    @Query('workVersionId') workVersionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.diagnosis.findByWorkVersion(workVersionId, user);
  }

  /** 教师复核：确认/驳回，确认高严重度缺口会自动生成修改任务 */
  @Patch(':id')
  review(
    @Param('id') id: string,
    @Body('status') status: DiagnosisStatus,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.diagnosis.review(id, status, user);
  }
}
