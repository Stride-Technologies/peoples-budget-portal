import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { CacheStore } from './cache-store.interface.js';

/**
 * Redis-backed cache store. Every operation is guarded: a Redis error degrades
 * to a cache miss (`get` → `null`) or a silent no-op, never an exception into
 * the request path.
 */
export class RedisCacheStore implements CacheStore {
  private readonly logger = new Logger(RedisCacheStore.name);

  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (err) {
      this.logger.warn(`get(${key}) failed: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`set(${key}) failed: ${(err as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(`del(${key}) failed: ${(err as Error).message}`);
    }
  }

  async incrBy(
    key: string,
    by: number,
    ttlSeconds: number,
  ): Promise<number | null> {
    try {
      const [[, value], [, ttl]] = (await this.redis
        .multi()
        .incrby(key, by)
        .ttl(key)
        .exec()) as [[unknown, number], [unknown, number]];
      if (ttl < 0) await this.redis.expire(key, ttlSeconds);
      return value;
    } catch (err) {
      this.logger.warn(`incrBy(${key}) failed: ${(err as Error).message}`);
      return null;
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    try {
      const batch: string[] = [];
      const stream = this.redis.scanStream({
        match: `${prefix}*`,
        count: 100,
      });
      for await (const keys of stream as AsyncIterable<string[]>) {
        batch.push(...keys);
      }
      if (batch.length > 0) await this.redis.del(...batch);
    } catch (err) {
      this.logger.warn(
        `delByPrefix(${prefix}) failed: ${(err as Error).message}`,
      );
    }
  }
}
