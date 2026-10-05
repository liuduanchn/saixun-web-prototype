import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { TaskService } from './task.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { CreateTaskSchema, UpdateTaskSchema } from './dto/task.dto';
import { z } from 'zod';

@Controller('tasks')
export class TaskController {
  constructor(private readonly task: TaskService) {}

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto = CreateTaskSchema.safeParse(body);
    if (!dto.success)
      throw new BadRequestException(dto.error.issues[0]?.message ?? '参数错误');
    return this.task.create(dto.data, user);
  }

  @Get()
  list(
    @Query('projectId') projectId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!projectId) throw new BadRequestException('projectId 必填');
    return this.task.findAll(projectId, user, { page, pageSize });
  }

  @Get('coverage')
  coverage(@Query('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    if (!projectId) throw new BadRequestException('projectId 必填');
    return this.task.coverage(projectId, user);
  }

  /**
   * AI 生成阶段任务草稿（不落库，由教师确认后再批量创建）。
   * 无 Key 时自动降级为启发式，响应中 source 字段标明实际来源。
   */
  @Post('ai-generate')
  aiGenerate(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const parsed = z.object({ projectId: z.string().min(1) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('projectId 必填');
    return this.task.generateTasks(parsed.data.projectId, user);
  }

  /** AI 动态风险预警：替代前端写死的文案 */
  @Get('ai-risk')
  aiRisk(@Query('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    if (!projectId) throw new BadRequestException('projectId 必填');
    return this.task.buildRiskReport(projectId, user);
  }

  /** AI 推荐任务应关联的评分点（只给建议，不改关联关系） */
  @Get('ai-suggest')
  aiSuggest(@Query('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    if (!projectId) throw new BadRequestException('projectId 必填');
    return this.task.suggestScorePoints(projectId, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto = UpdateTaskSchema.safeParse(body);
    if (!dto.success)
      throw new BadRequestException(dto.error.issues[0]?.message ?? '参数错误');
    return this.task.update(id, dto.data, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.task.remove(id, user);
  }
}
