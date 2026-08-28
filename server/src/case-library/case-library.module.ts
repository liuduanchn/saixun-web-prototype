import { Module } from '@nestjs/common';
import { CaseLibraryService } from './case-library.service';
import { CaseLibraryController } from './case-library.controller';

@Module({
  controllers: [CaseLibraryController],
  providers: [CaseLibraryService],
  exports: [CaseLibraryService],
})
export class CaseLibraryModule {}
