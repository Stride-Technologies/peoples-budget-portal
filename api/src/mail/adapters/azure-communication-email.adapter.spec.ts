import { EmailClient } from '@azure/communication-email';
import type { ConfigService } from '@nestjs/config';
jest.mock('@azure/communication-email', () => ({
  EmailClient: jest.fn(),
}));

import {
  AzureCommunicationEmailAdapter,
  type AzureEmailClientLike,
} from './azure-communication-email.adapter.js';

function config(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`${key} missing`);
      return value;
    }),
  } as unknown as ConfigService;
}

function clientWithStatus(status: string): AzureEmailClientLike {
  return {
    beginSend: jest.fn().mockResolvedValue({
      pollUntilDone: jest.fn().mockResolvedValue({ status }),
    }),
  };
}

describe('AzureCommunicationEmailAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the ACS connection string when configured', () => {
    const mockedEmailClient = jest.mocked(EmailClient);

    new AzureCommunicationEmailAdapter(
      config({
        MAIL_FROM_ADDRESS: 'DoNotReply@example.test',
        ACS_CONNECTION_STRING:
          'endpoint=https://example.communication.azure.com/;accesskey=secret',
      }),
    );

    expect(mockedEmailClient).toHaveBeenCalledWith(
      'endpoint=https://example.communication.azure.com/;accesskey=secret',
    );
  });

  it('maps portal mail messages to ACS Email messages', () => {
    const adapter = new AzureCommunicationEmailAdapter(
      config({ MAIL_FROM_ADDRESS: 'DoNotReply@example.test' }),
      clientWithStatus('Succeeded'),
    );

    expect(
      adapter.toAzureMessage({
        to: 'user@example.test',
        subject: 'Subject',
        text: 'Plain text',
        html: '<p>HTML</p>',
      }),
    ).toEqual({
      senderAddress: 'DoNotReply@example.test',
      content: {
        subject: 'Subject',
        plainText: 'Plain text',
        html: '<p>HTML</p>',
      },
      recipients: {
        to: [{ address: 'user@example.test' }],
      },
    });
  });

  it('treats ACS Succeeded and Queued statuses as accepted delivery', async () => {
    for (const status of ['Succeeded', 'Queued']) {
      const client = clientWithStatus(status);
      const adapter = new AzureCommunicationEmailAdapter(
        config({ MAIL_FROM_ADDRESS: 'DoNotReply@example.test' }),
        client,
      );

      await expect(
        adapter.send({
          to: 'user@example.test',
          subject: 'Subject',
          text: 'Plain text',
          html: '<p>HTML</p>',
        }),
      ).resolves.toBeUndefined();

      expect(client.beginSend).toHaveBeenCalledWith(
        expect.objectContaining({
          senderAddress: 'DoNotReply@example.test',
          recipients: { to: [{ address: 'user@example.test' }] },
        }),
      );
    }
  });

  it('throws when ACS reports a non-success terminal status', async () => {
    const client: AzureEmailClientLike = {
      beginSend: jest.fn().mockResolvedValue({
        pollUntilDone: jest.fn().mockResolvedValue({
          status: 'Failed',
          error: { message: 'Denied by provider' },
        }),
      }),
    };
    const adapter = new AzureCommunicationEmailAdapter(
      config({ MAIL_FROM_ADDRESS: 'DoNotReply@example.test' }),
      client,
    );

    await expect(
      adapter.send({
        to: 'user@example.test',
        subject: 'Subject',
        text: 'Plain text',
        html: '<p>HTML</p>',
      }),
    ).rejects.toThrow('Denied by provider');
  });
});
