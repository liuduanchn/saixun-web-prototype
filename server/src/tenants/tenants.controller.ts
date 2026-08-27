import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { TenantsService } from './tenants.service';
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

const SwitchSchema = z.object({ tenantId: z.string().min(1) });
const RenameSchema = z.object({ name: z.string().min(1) });
const CreateSchema = z.object({ name: z.string().min(1) });
const AddMemberSchema = z.object({
  username: z.string().min(1),
  role: z.enum(['OWNER', 'TEACHER', 'STUDENT', 'MEMBER']).optional(),
});

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get('mine')
  mine(@CurrentUser() user: JwtPayload) {
    return this.tenants.mine(user);
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto = CreateSchema.safeParse(body);
    if (!dto.success) throw new BadRequestException('团队名称不能为空');
    return this.tenants.create(dto.data.name, user);
  }

  @Post('switch')
  switch(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto = SwitchSchema.safeParse(body);
    if (!dto.success) throw new BadRequestException('tenantId 不能为空');
    return this.tenants.switch(dto.data.tenantId, user);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.tenants.me(user);
  }

  @Patch('me')
  rename(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto = RenameSchema.safeParse(body);
    if (!dto.success) throw new BadRequestException('团队名称不能为空');
    return this.tenants.rename(dto.data.name, user);
  }

  @Get('members')
  members(@CurrentUser() user: JwtPayload) {
    return this.tenants.members(user);
  }

  @Post('members')
  addMember(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto = AddMemberSchema.safeParse(body);
    if (!dto.success) throw new BadRequestException('username 不能为空');
    return this.tenants.addMember(dto.data.username, (dto.data.role as any) ?? 'MEMBER', user);
  }

  @Delete('members/:userId')
  removeMember(@Param('userId') userId: string, @CurrentUser() user: JwtPayload) {
    return this.tenants.removeMember(userId, user);
  }
}
