import type { ConfigService } from '@nestjs/config';

export type StorageProvider = 'local' | 'do-spaces';

const STORAGE_PROVIDERS = new Set<StorageProvider>(['local', 'do-spaces']);

export function resolveStorageProvider(
  config: Pick<ConfigService, 'get'>,
): StorageProvider {
  const configured = config.get<string>('STORAGE_PROVIDER')?.trim();
  if (configured) {
    if (!STORAGE_PROVIDERS.has(configured as StorageProvider)) {
      throw new Error(
        `Unsupported STORAGE_PROVIDER "${configured}". Expected one of: ${Array.from(STORAGE_PROVIDERS).join(', ')}`,
      );
    }
    return configured as StorageProvider;
  }

  const env = config.get<string>('NODE_ENV', 'development');
  return env === 'production' || env === 'staging' ? 'do-spaces' : 'local';
}
