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
/**
 * 团队级配置白名单（2026-10-05 收紧）。
 * 原实现是 `z.record(z.unknown())` —— 任意 JSON 都能写进 Tenant.settings，
 * 属既有隐患；现在只放行 ASR 相关字段，并用 .strict() 拒绝未知键。
 *
 * 大模型（LLM）配置**刻意不在此列**：按权威版方案它落在平台级 SystemConfig 表，
 * 由 config 模块单独读写。否则租户级接口就能改写平台级密钥，等于绕过平台管理员白名单。
 */
const SettingsSchema = z
  .object({
    asrProvider: z.enum(['siliconflow', 'custom']).optional(),
    asrApiKey: z.string().max(400).optional(),
    asrEndpoint: z.string().max(400).optional(),
    asrHeaderName: z.string().max(64).optional(),
    asrAuthScheme: z.string().max(64).optional(),
    asrField: z.string().max(64).optional(),
    asrModel: z.string().max(120).optional(),
  })
  .strict();
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

  /** 更新团队级配置（白名单字段，如 ASR 语音识别密钥）；仅 OWNER / TEACHER 可写 */
  @Patch('me/settings')
  updateSettings(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto = SettingsSchema.safeParse(body);
    if (!dto.success) {
      const bad = dto.error.issues.find((i) => i.code === 'unrecognized_keys');
      if (bad) throw new BadRequestException('配置项不在允许范围内，仅支持语音识别（ASR）相关字段');
      throw new BadRequestException('配置格式不正确');
    }
    return this.tenants.updateSettings(dto.data, user);
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
