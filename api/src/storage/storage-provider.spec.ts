import { resolveStorageProvider } from './storage-provider.js';

const config = (env: Record<string, string>) => ({
  get: <T>(key: string, fallback?: T) => (env[key] ?? fallback) as T,
});

describe('resolveStorageProvider', () => {
  it('uses Spaces in production and local storage in development', () => {
    expect(resolveStorageProvider(config({ NODE_ENV: 'production' }))).toBe(
      'do-spaces',
    );
    expect(resolveStorageProvider(config({}))).toBe('local');
  });

  it('an explicit setting wins', () => {
    expect(
      resolveStorageProvider(config({ STORAGE_PROVIDER: 'do-spaces' })),
    ).toBe('do-spaces');
    expect(() =>
      resolveStorageProvider(config({ STORAGE_PROVIDER: 's3' })),
    ).toThrow('Unsupported');
  });
});
