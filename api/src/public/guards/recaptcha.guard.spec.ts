import { BadRequestException, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { RecaptchaGuard } from './recaptcha.guard.js';

// Minimal ExecutionContext — the guard only ever reaches getRequest().
const ctx = (
  body: Record<string, unknown>,
  req: Record<string, unknown> = {},
) =>
  ({
    switchToHttp: () => ({ getRequest: () => Object.assign(req, { body }) }),
  }) as unknown as ExecutionContext;

const siteverify = (payload: unknown) =>
  jest.fn().mockResolvedValue({ json: () => Promise.resolve(payload) });

describe('RecaptchaGuard', () => {
  const originalEnv = process.env.RECAPTCHA_SECRET_KEY;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.RECAPTCHA_SECRET_KEY = originalEnv;
  });

  it('logs an error at construction when the secret is missing', () => {
    delete process.env.RECAPTCHA_SECRET_KEY;
    new RecaptchaGuard();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('RECAPTCHA_SECRET_KEY is not set'),
    );
  });

  it('stays quiet at construction when the secret is set', () => {
    process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
    new RecaptchaGuard();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("surfaces siteverify's error-codes before throwing", async () => {
    process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
    global.fetch = siteverify({
      success: false,
      'error-codes': ['invalid-input-secret'],
    });

    await expect(
      new RecaptchaGuard().canActivate(ctx({ recaptchaToken: 'tok' })),
    ).rejects.toThrow(BadRequestException);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('invalid-input-secret'),
    );
  });

  it('passes a valid token through', async () => {
    process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
    global.fetch = siteverify({ success: true, score: 0.9 });

    await expect(
      new RecaptchaGuard().canActivate(ctx({ recaptchaToken: 'tok' })),
    ).resolves.toBe(true);
  });

  it.each(['submit_feedback'])('accepts the %s action', async (action) => {
    process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
    global.fetch = siteverify({ success: true, score: 0.9, action });

    await expect(
      new RecaptchaGuard().canActivate(ctx({ recaptchaToken: 'tok' })),
    ).resolves.toBe(true);
  });

  it('rejects an action no form asks for', async () => {
    process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
    global.fetch = siteverify({ success: true, score: 0.9, action: 'login' });

    await expect(
      new RecaptchaGuard().canActivate(ctx({ recaptchaToken: 'tok' })),
    ).rejects.toThrow(BadRequestException);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('action mismatch'),
    );
  });

  it('short-circuits on a honeypot hit without calling siteverify', async () => {
    process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
    const fetchMock = siteverify({ success: true });
    global.fetch = fetchMock;
    const req: Record<string, unknown> = {};

    await expect(
      new RecaptchaGuard().canActivate(ctx({ website: 'spam' }, req)),
    ).resolves.toBe(true);
    expect(req._honeypotHit).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
