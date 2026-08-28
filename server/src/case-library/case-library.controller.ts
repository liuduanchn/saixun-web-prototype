import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { CaseLibraryService } from './case-library.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('case-library')
export class CaseLibraryController {
  constructor(private readonly cases: CaseLibraryService) {}

  /** 新增案例（鉴权即可，按当前租户归属） */
  @Post()
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.cases.create(body, user.tenantId);
  }

  /** 全文检索相关案例（RAG 检索入口） */
  @Get()
  search(
    @Query('q') q: string,
    @Query('projectId') projectId: string,
    @Query('limit') limit: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const n = Math.min(20, Math.max(1, parseInt(limit ?? '5', 10) || 5));
    if (q && q.trim()) return this.cases.search(user.tenantId, q, n);
    return this.cases.findByTenant(user.tenantId, projectId);
  }
}
