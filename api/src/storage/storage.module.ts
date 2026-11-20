import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DOSpacesStorageAdapter } from './adapters/do-spaces-storage.adapter.js';
import { LocalFileStorageAdapter } from './adapters/local-file-storage.adapter.js';
import { STORAGE_ADAPTER } from './storage-adapter.interface.js';
import { resolveStorageProvider } from './storage-provider.js';
import { StorageController } from './storage.controller.js';
import { StorageService } from './storage.service.js';

/**
 * Selects the storage adapter from STORAGE_PROVIDER when configured.
 * Defaults: staging/production -> DO Spaces (S3-compatible), everything
 * else -> local disk. Mirrors `mail.module.ts`'s `mailAdapterFactory`.
 */
function storageAdapterFactory(
  config: ConfigService,
): LocalFileStorageAdapter | DOSpacesStorageAdapter {
  const provider = resolveStorageProvider(config);
  if (provider === 'do-spaces') {
    return new DOSpacesStorageAdapter(config);
  }
  return new LocalFileStorageAdapter(config);
}

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [StorageController],
  providers: [
    {
      provide: STORAGE_ADAPTER,
      useFactory: storageAdapterFactory,
      inject: [ConfigService],
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
