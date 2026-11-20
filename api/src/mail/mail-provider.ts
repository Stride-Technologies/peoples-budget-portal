import type { ConfigService } from '@nestjs/config';

export type MailProvider = 'console' | 'smtp' | 'azure-communication';

const MAIL_PROVIDERS = new Set<MailProvider>([
  'console',
  'smtp',
  'azure-communication',
]);

export function resolveMailProvider(
  config: Pick<ConfigService, 'get'>,
): MailProvider {
  const configured = config.get<string>('MAIL_PROVIDER')?.trim();
  if (configured) {
    if (!MAIL_PROVIDERS.has(configured as MailProvider)) {
      throw new Error(
        `Unsupported MAIL_PROVIDER "${configured}". Expected one of: ${Array.from(MAIL_PROVIDERS).join(', ')}`,
      );
    }
    return configured as MailProvider;
  }

  const env = config.get<string>('NODE_ENV', 'development');
  return env === 'production' || env === 'staging'
    ? 'azure-communication'
    : 'console';
}
