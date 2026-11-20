import { Injectable, Logger } from '@nestjs/common';
import { MailAdapter, MailMessage } from '../mail-adapter.interface.js';
import { DevMailOutboxService } from '../dev-mail-outbox.service.js';

/**
 * Console mail adapter for local development.
 * Logs email content to stdout instead of sending real messages.
 */
@Injectable()
export class ConsoleMailAdapter implements MailAdapter {
  private readonly logger = new Logger(ConsoleMailAdapter.name);

  constructor(private readonly outbox: DevMailOutboxService) {}

  send(message: MailMessage): Promise<void> {
    this.logger.log(
      [
        '=== [DEV MAIL] ===',
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        `Text:    ${message.text}`,
        '==================',
      ].join('\n'),
    );
    this.outbox.capture(message);
    return Promise.resolve();
  }
}
