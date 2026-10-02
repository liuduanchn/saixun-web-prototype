import { Module } from '@nestjs/common';
import { DiagnosticsController } from './diagnostics.controller';

/** 临时诊断模块（workbuddyDeploy 排障用，定位完即删） */
@Module({
  controllers: [DiagnosticsController],
})
export class DiagnosticsModule {}
