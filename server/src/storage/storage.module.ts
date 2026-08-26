import { Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { StorageController } from './storage.controller';
import { STORAGE_PROVIDER } from './storage.interface';

@Module({
  controllers: [StorageController],
  providers: [{ provide: STORAGE_PROVIDER, useClass: LocalStorageService }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
