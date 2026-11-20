import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service.js';
import { explorerDailyBudgetUsd } from './explorer.config.js';

export interface Window {
  name: string;
  seconds: number;
  limit: number;
}

/** design §12: one person's share; the IP throttler is sized for a crowd. */
export const ASK_DEVICE_LIMITS: Window[] = [
  { name: 'h', seconds: 3600, limit: 30 },
  { name: 'd', seconds: 86_400, limit: 100 },
];
/** Design §12: a clip costs CPU (or Azure minutes) every time. */
export const TRANSCRIBE_DEVICE_LIMITS: Window[] = [
  { name: 'h', seconds: 3600, limit: 20 },
];
export const FEEDBACK_DEVICE_LIMITS: Window[] = [
  { name: 'h', seconds: 3600, limit: 10 },
];

export class DeviceLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many requests from this device.');
  }
}

const MICRO = 1_000_000;

/**
 * Device limits and the daily model budget (design §5 step 1, §12), as
 * counters in the cache store — Redis when configured, so every replica shares
 * them. A store outage
 * fails open: the IP throttler still holds.
 */
@Injectable()
export class ExplorerLimits {
  private readonly logger = new Logger(ExplorerLimits.name);
  private readonly salt: string;

  constructor(private readonly cache: CacheService) {
    this.salt = process.env.EXPLORER_DEVICE_SALT ?? '';
    if (!this.salt) {
      // ponytail: a per-process salt still limits; set the env to keep
      // "one feedback per device" across restarts.
      this.salt = randomBytes(16).toString('hex');
      this.logger.warn(
        'EXPLORER_DEVICE_SALT unset; device hashes reset on restart.',
      );
    }
  }

  /** The browser's random id, salted and hashed before it is stored or counted (R15). */
  hashDevice(deviceKey?: string): string | undefined {
    return deviceKey
      ? createHash('sha256')
          .update(`${this.salt}:${deviceKey}`)
          .digest('hex')
          .slice(0, 32)
      : undefined;
  }

  /** Count one request in every window; throws when any is over its limit. */
  async take(
    deviceHash: string | undefined,
    bucket: string,
    windows: Window[],
  ) {
    if (!deviceHash) return;
    const now = Math.floor(Date.now() / 1000);
    for (const w of windows) {
      const slot = Math.floor(now / w.seconds);
      const n = await this.cache.incrBy(
        `explorer:dev:${deviceHash}:${bucket}:${w.name}:${slot}`,
        1,
        w.seconds,
      );
      if (n !== null && n > w.limit)
        throw new DeviceLimitError((slot + 1) * w.seconds - now);
    }
  }

  private budgetKey() {
    return `explorer:budget:${new Date().toISOString().slice(0, 10)}`;
  }

  /** Add a model call's cost to today's (UTC) spend. */
  async spend(usd: number) {
    if (usd > 0)
      await this.cache.incrBy(
        this.budgetKey(),
        Math.ceil(usd * MICRO),
        2 * 86_400,
      );
  }

  /** R19: today's spend has reached `EXPLORER_DAILY_BUDGET_USD`. */
  async overBudget(): Promise<boolean> {
    const budget = explorerDailyBudgetUsd();
    if (budget <= 0) return true;
    const spent = await this.cache.incrBy(this.budgetKey(), 0, 2 * 86_400);
    return (spent ?? 0) >= budget * MICRO;
  }
}
