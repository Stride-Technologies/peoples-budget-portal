import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants.js';

const PING_TIMEOUT_MS = 2000;

/**
 * Informational Redis health indicator. Redis is optional — when it is down the
 * API degrades to its in-memory cache and in-process SSE, so this indicator
 * never reports `down`: it always returns `up` with a `redis` detail of
 * `disabled` / `connected` / `unreachable`, keeping `/health` green regardless.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    if (!this.redis) return this.getStatus(key, true, { redis: 'disabled' });

    try {
      const pong = await Promise.race([
        this.redis.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('ping timed out')),
            PING_TIMEOUT_MS,
          ),
        ),
      ]);
      return this.getStatus(key, true, {
        redis: pong === 'PONG' ? 'connected' : 'degraded',
      });
    } catch (error) {
      return this.getStatus(key, true, {
        redis: 'unreachable',
        message: (error as Error).message,
      });
    }
  }
}
