import type { ConfigService } from '@nestjs/config';
import { resolveMailProvider } from './mail-provider.js';

function config(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as Pick<ConfigService, 'get'>;
}

describe('resolveMailProvider', () => {
  it('uses explicit MAIL_PROVIDER when configured', () => {
    expect(resolveMailProvider(config({ MAIL_PROVIDER: 'console' }))).toBe(
      'console',
    );
    expect(resolveMailProvider(config({ MAIL_PROVIDER: 'smtp' }))).toBe('smtp');
    expect(
      resolveMailProvider(config({ MAIL_PROVIDER: 'azure-communication' })),
    ).toBe('azure-communication');
  });

  it('defaults staging and production to ACS Email', () => {
    expect(resolveMailProvider(config({ NODE_ENV: 'staging' }))).toBe(
      'azure-communication',
    );
    expect(resolveMailProvider(config({ NODE_ENV: 'production' }))).toBe(
      'azure-communication',
    );
  });

  it('defaults other environments to console mail', () => {
    expect(resolveMailProvider(config({ NODE_ENV: 'development' }))).toBe(
      'console',
    );
    expect(resolveMailProvider(config({ NODE_ENV: 'test' }))).toBe('console');
  });

  it('rejects unsupported providers', () => {
    expect(() =>
      resolveMailProvider(config({ MAIL_PROVIDER: 'sendmail' })),
    ).toThrow('Unsupported MAIL_PROVIDER');
  });
});
