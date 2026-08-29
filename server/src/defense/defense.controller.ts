import { Controller, Post, Get, Param, Query, Body, Delete } from '@nestjs/common';
import { DefenseService } from './defense.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('defense')
export class DefenseController {
  constructor(private readonly defense: DefenseService) {}

  /** 发起模拟答辩会话（生成第 1 轮追问） */
  @Post('sessions')
  create(
    @Body('projectId') projectId: string,
    @Body('maxRounds') maxRounds: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.defense.create(projectId, Number(maxRounds) || 3, user);
  }

  /** 学生作答：评分 + 下一轮追问 / 总评 */
  @Post('sessions/:id/answer')
  answer(
    @Param('id') id: string,
    @Body('answer') answer: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.defense.answer(id, answer, user);
  }

  @Get('sessions')
  list(@Query('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.defense.list(projectId, user);
  }

  @Get('sessions/:id')
  get(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.defense.get(id, user);
  }

  /** 删除答辩记录（本人租户内） */
  @Delete('sessions/:id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.defense.delete(id, user);
  }
}
