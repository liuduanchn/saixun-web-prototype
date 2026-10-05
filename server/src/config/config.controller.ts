import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiCompatService } from '../ai/openai-compat.service';
import { isPlatformAdmin } from './platform-admin';
import {
  FEATURE_KEYS,
  getPlatformSettings,
  presentPlatformSettings,
  updatePlatformSettings,
  type FeatureKey,
} from './platform-config';

/**
 * 大模型配置接口（2026-10-05 新增，对应方案 B 平台级单例）。
 *
 * 鉴权设计：
 *   · `GET status` → @Public：登录页需要知道「AI 是否已配置」，故不鉴权；
 *     但**只回布尔与模型名**，不回域名/来源，避免把平台配置细节给未登录者。
 *   · 其余三个     → 需登录 **且** 平台管理员（PLATFORM_ADMIN_USERNAMES）。
 *     平台级配置全站唯一，若沿用「租户管理员即可改」，任何团队 OWNER 都能改到
 *     全站密钥，属跨租户提权。
 *
 * 密钥约定：请求体可传明文 Key（写入用），**响应永不含明文 Key**，
 * 一律走 presentPlatformSettings() 的脱敏视图（`sk-****` + `llmApiKeySet`）。
 */

const FeatureEnum = z.enum(FEATURE_KEYS as unknown as [FeatureKey, ...FeatureKey[]]);

/** 写入 schema：白名单字段 + .strict()，拒绝未知键 */
const LlmPatchSchema = z
  .object({
    baseUrl: z.string().max(300).optional(),
    apiKey: z.string().max(400).optional(),
    model: z.string().max(200).optional(),
    models: z.record(FeatureEnum, z.string().max(200)).optional(),
    enabledFeatures: z.record(FeatureEnum, z.boolean()).optional(),
  })
  .strict();

@Controller('config')
@UseGuards(JwtAuthGuard)
export class ConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: OpenAiCompatService,
  ) {}

  /** 公开状态：只回「是否已配置」与模型名，供登录页/驾驶舱做提示 */
  @Public()
  @Get('status')
  async status() {
    const s = await this.ai.status();
    return { aiConfigured: s.aiConfigured, aiModel: s.aiModel };
  }

  /** 平台配置的脱敏视图（设置中心回显用） */
  @Get('llm')
  async llm(@CurrentUser() user: JwtPayload) {
    this.assertAdmin(user);
    const settings = await getPlatformSettings(this.prisma);
    return {
      ...presentPlatformSettings(settings),
      features: this.featureView(settings.enabledFeatures),
      status: await this.ai.status(),
    };
  }

  /** 保存平台配置（合并写入；密钥三态：脱敏值不覆盖 / 空串清除 / 其他为新值） */
  @Patch('llm')
  async updateLlm(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    this.assertAdmin(user);
    const dto = LlmPatchSchema.safeParse(body);
    if (!dto.success) {
      const bad = dto.error.issues.find((i) => i.code === 'unrecognized_keys');
      throw new BadRequestException(
        bad ? '存在不支持的配置项，请检查字段名' : '配置格式不正确',
      );
    }
    const merged = await updatePlatformSettings(this.prisma, dto.data, {
      username: user.username,
    });
    return {
      ...presentPlatformSettings(merged),
      features: this.featureView(merged.enabledFeatures),
      status: await this.ai.status(),
    };
  }

  /**
   * 测试连接：只发一个极小请求（max_tokens: 8）验证「端点 + 密钥 + 模型」能否真的调通。
   * 限流加严到 10 次/分钟：这是唯一会真实消耗额度的接口，防止被当免费代理刷。
   * 显式 @HttpCode(200)：这不是「创建资源」，Nest 默认会给 POST 返回 201，语义不符。
   */
  @Post('llm/test')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async testLlm(@CurrentUser() user: JwtPayload) {
    this.assertAdmin(user);
    return this.ai.ping();
  }

  private assertAdmin(user: JwtPayload) {
    if (!isPlatformAdmin(user?.username)) {
      throw new ForbiddenException('仅平台管理员可查看或修改大模型配置');
    }
  }

  /** 功能开关视图：未显式关闭即为启用，给出界面可直接绑定的布尔值 */
  private featureView(enabled?: Partial<Record<FeatureKey, boolean>>) {
    return FEATURE_KEYS.reduce<Record<string, boolean>>((acc, k) => {
      acc[k] = enabled?.[k] !== false;
      return acc;
    }, {});
  }
}
