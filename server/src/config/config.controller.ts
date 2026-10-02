import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { aiStatus } from './runtime-config';

/**
 * 对外暴露「能力是否已配置」，供前端展示。
 * 只返回布尔与元信息，**绝不返回任何密钥**。
 *
 * 标 @Public() 的原因：全局 JwtAuthGuard 会拦截所有接口，
 * 而登录页需要在登录前就展示「AI 未配置/已配置」的提示。
 */
@Controller('config')
export class ConfigController {
  @Public()
  @Get('status')
  status() {
    return aiStatus();
  }
}
