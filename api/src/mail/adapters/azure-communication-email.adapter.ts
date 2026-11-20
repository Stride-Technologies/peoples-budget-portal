import {
  EmailClient,
  type EmailMessage as AzureEmailMessage,
} from '@azure/communication-email';
import { DefaultAzureCredential } from '@azure/identity';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MailAdapter, MailMessage } from '../mail-adapter.interface.js';

interface AzureEmailPoller {
  pollUntilDone(): Promise<{ status?: string; error?: { message?: string } }>;
}

export interface AzureEmailClientLike {
  beginSend(message: AzureEmailMessage): Promise<AzureEmailPoller>;
}

@Injectable()
export class AzureCommunicationEmailAdapter implements MailAdapter {
  private readonly client: AzureEmailClientLike;
  private readonly fromAddress: string;

  constructor(
    private readonly config: ConfigService,
    client?: AzureEmailClientLike,
  ) {
    this.fromAddress = this.config.getOrThrow<string>('MAIL_FROM_ADDRESS');

    if (client) {
      this.client = client;
      return;
    }

    const connectionString = this.config.get<string>('ACS_CONNECTION_STRING');
    if (connectionString) {
      this.client = new EmailClient(connectionString);
      return;
    }

    const endpoint = this.config.getOrThrow<string>('ACS_EMAIL_ENDPOINT');
    const managedIdentityClientId = this.config.get<string>('AZURE_CLIENT_ID');
    const credential = new DefaultAzureCredential(
      managedIdentityClientId ? { managedIdentityClientId } : undefined,
    );

    this.client = new EmailClient(endpoint, credential);
  }

  toAzureMessage(message: MailMessage): AzureEmailMessage {
    return {
      senderAddress: this.fromAddress,
      content: {
        subject: message.subject,
        plainText: message.text,
        html: message.html,
      },
      recipients: {
        to: [{ address: message.to }],
      },
    };
  }

  async send(message: MailMessage): Promise<void> {
    const poller = await this.client.beginSend(this.toAzureMessage(message));
    const result = await poller.pollUntilDone();

    if (!this.isAccepted(result.status)) {
      const detail = result.error?.message
        ? `: ${result.error.message}`
        : result.status
          ? ` with status ${result.status}`
          : '';
      throw new Error(`ACS Email send failed${detail}`);
    }
  }

  private isAccepted(status: string | undefined): boolean {
    return status === 'Succeeded' || status === 'Queued';
  }
}
