import { Module } from '@nestjs/common';
import { DiagnosticsController } from './diagnostics.controller';
import { AuthModule } from '../auth/auth.module';

/** 临时诊断模块（workbuddyDeploy 排障用，定位完即删） */
@Module({
  imports: [AuthModule],
  controllers: [DiagnosticsController],
})
export class DiagnosticsModule {}
