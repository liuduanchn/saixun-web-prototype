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
  list(@Query('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    if (!projectId) throw new BadRequestException('projectId 必填');
    return this.task.findAll(projectId, user);
  }

  @Get('coverage')
  coverage(@Query('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    if (!projectId) throw new BadRequestException('projectId 必填');
    return this.task.coverage(projectId, user);
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
