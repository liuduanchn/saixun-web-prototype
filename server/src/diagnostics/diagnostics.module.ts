import { Module } from '@nestjs/common';
import { DiagnosticsController } from './diagnostics.controller';

/** 平台连通性自检模块（见 controller 注释：保留而不删除，避免沙箱残留旧副本） */
@Module({
  controllers: [DiagnosticsController],
})
export class DiagnosticsModule {}
