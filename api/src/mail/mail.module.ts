import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AzureCommunicationEmailAdapter } from './adapters/azure-communication-email.adapter.js';
import { ConsoleMailAdapter } from './adapters/console-mail.adapter.js';
import { SmtpMailAdapter } from './adapters/smtp-mail.adapter.js';
import { DevMailOutboxService } from './dev-mail-outbox.service.js';
import { MAIL_ADAPTER } from './mail-adapter.interface.js';
import { MailOutboxController } from './mail-outbox.controller.js';
import { resolveMailProvider } from './mail-provider.js';
import { MailService } from './mail.service.js';

/**
 * Selects the mail adapter from MAIL_PROVIDER when configured.
 * Defaults: staging/production -> ACS Email SDK, everything else -> console.
 * SMTP remains available as an explicit opt-in provider.
 */
function mailAdapterFactory(
  config: ConfigService,
  outbox: DevMailOutboxService,
): ConsoleMailAdapter | SmtpMailAdapter | AzureCommunicationEmailAdapter {
  const provider = resolveMailProvider(config);
  if (provider === 'azure-communication') {
    return new AzureCommunicationEmailAdapter(config);
  }
  if (provider === 'smtp') {
    return new SmtpMailAdapter(config);
  }
  return new ConsoleMailAdapter(outbox);
}

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [MailOutboxController],
  providers: [
    DevMailOutboxService,
    {
      provide: MAIL_ADAPTER,
      useFactory: mailAdapterFactory,
      inject: [ConfigService, DevMailOutboxService],
    },
    MailService,
  ],
  exports: [MailService, DevMailOutboxService],
})
export class MailModule {}
