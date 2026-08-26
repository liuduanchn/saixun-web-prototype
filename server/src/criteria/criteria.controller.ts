import { Controller, Get, Post, Delete, Query, Body, Param } from '@nestjs/common';
import { CriteriaService, CriterionDraft } from './criteria.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

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
