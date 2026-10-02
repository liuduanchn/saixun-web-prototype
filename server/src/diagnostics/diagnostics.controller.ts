import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

/**
 * 平台连通性自检端点。
 *
 * 保留原因（重要）：托管平台**复用同一个沙箱并覆盖解包**上传内容 ——
 * 在本地删除的文件**不会**从沙箱里消失。若把这个文件删掉，
 * 沙箱里残留的旧副本会被编译进去，导致构建因引用了已删除的成员而失败
 * （实测踩过一次）。因此这里保留一个极简、无副作用的端点，而不是删除文件。
 *
 * 排障历史：曾用它逐步定位「登录成功但带 token 的请求全部 401」，
 * 最终确认是平台网关在每个请求上注入了它自己的 Authorization 头。
 * 结论已写入 WORKBUDDY_DEPLOY.md 的「平台行为注意点」。
 */
@Controller('diagnostics')
export class DiagnosticsController {
  @Public()
  @Get('ping')
  ping() {
    return { ok: true, service: 'saixun-server' };
  }
}
