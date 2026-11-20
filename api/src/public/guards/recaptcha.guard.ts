import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';

interface SiteverifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

// The actions the client asks reCAPTCHA for. A new public form adds its action here.
const ALLOWED_ACTIONS = ['submit_feedback'];

// Cost ladder (D19): ThrottlerGuard → RecaptchaGuard (honeypot then siteverify) → handler
@Injectable()
export class RecaptchaGuard implements CanActivate {
  private readonly logger = new Logger(RecaptchaGuard.name);
  private readonly secretKey = process.env.RECAPTCHA_SECRET_KEY ?? '';
  private readonly minScore = Number(process.env.RECAPTCHA_MIN_SCORE ?? '0.5');
  private readonly expectedHostname = process.env.RECAPTCHA_EXPECTED_HOSTNAME;

  constructor() {
    // Without a secret, siteverify answers invalid-input-secret and every public
    // submission 400s — which reads as an ordinary validation error, so the env
    // gap is invisible until someone diffs a client bundle. Say it at boot.
    if (!this.secretKey) {
      this.logger.error(
        'RECAPTCHA_SECRET_KEY is not set — every public feedback submission will be rejected.',
      );
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { _honeypotHit?: boolean }>();
    const body = req.body as Record<string, unknown>;

    // Honeypot: bots fill every field; humans never see this one (D18).
    // Mark and pass through — HoneypotInterceptor returns a silent 200 (D23).
    if (body['website']) {
      req._honeypotHit = true;
      return true;
    }

    const token = body['recaptchaToken'];
    if (typeof token !== 'string' || !token) {
      throw new BadRequestException(
        'Could not verify submission, please try again.',
      );
    }

    let result: SiteverifyResponse;
    try {
      const res = await fetch(
        'https://www.google.com/recaptcha/api/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${encodeURIComponent(this.secretKey)}&response=${encodeURIComponent(token)}`,
          signal: AbortSignal.timeout(5000),
        },
      );
      result = (await res.json()) as SiteverifyResponse;
    } catch (err) {
      // Fail-open on outage/timeout (D22): log a warning but let the request
      // through — honeypot + rate limiting remain as a floor.
      this.logger.warn(`reCAPTCHA siteverify unreachable: ${String(err)}`);
      return true;
    }

    if (!result.success) {
      // error-codes distinguishes "the API is misconfigured"
      // (invalid-input-secret) from "this token is bad" (invalid-input-response,
      // timeout-or-duplicate). Both used to surface as the same silent 400.
      this.logger.warn(
        `reCAPTCHA siteverify rejected: ${(result['error-codes'] ?? ['none']).join(', ')}`,
      );
      throw new BadRequestException(
        'Could not verify submission, please try again.',
      );
    }

    const score = result.score ?? 1.0;
    if (score < this.minScore) {
      this.logger.warn(
        `reCAPTCHA low score: ${score} (threshold: ${this.minScore})`,
      );
      throw new BadRequestException(
        'Could not verify submission, please try again.',
      );
    }

    // Action check — only validate when Google returns one (test keys don't).
    if (result.action && !ALLOWED_ACTIONS.includes(result.action)) {
      this.logger.warn(
        `reCAPTCHA action mismatch: expected ${ALLOWED_ACTIONS.join(' or ')}, got ${result.action}`,
      );
      throw new BadRequestException(
        'Could not verify submission, please try again.',
      );
    }

    // Hostname check — only when RECAPTCHA_EXPECTED_HOSTNAME is set (D20).
    // Leave unset on dev/staging so test keys (localhost) pass without config.
    if (this.expectedHostname && result.hostname !== this.expectedHostname) {
      this.logger.warn(
        `reCAPTCHA hostname mismatch: expected ${this.expectedHostname}, got ${result.hostname ?? 'none'}`,
      );
      throw new BadRequestException(
        'Could not verify submission, please try again.',
      );
    }

    return true;
  }
}
