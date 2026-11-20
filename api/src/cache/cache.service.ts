import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_STORE, type CacheStore } from './cache-store.interface.js';

/**
 * JSON cache facade over the active CacheStore. Values round-trip through
 * `JSON.stringify`/`JSON.parse`, which matches how the HTTP layer serializes
 * Prisma results (Date / Decimal → string), so a cached response is identical
 * to a freshly computed one.
 *
 * Caching is best-effort. The store implementations already swallow their own
 * errors, but this facade is defensive on top of that: a store failure or an
 * unparseable entry only means the loader runs (reads) or the cache goes stale
 * until its TTL (writes) — never an exception into a request that has already
 * done its real work.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_STORE) private readonly store: CacheStore) {}

  /** Return the cached value for `key`, or compute it with `loader`, cache it, and return it. */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    try {
      const cached = await this.store.get(key);
      if (cached !== null) return JSON.parse(cached) as T;
    } catch {
      // Store down or corrupt entry — recompute.
    }

    const fresh = await loader();
    try {
      await this.store.set(key, JSON.stringify(fresh), ttlSeconds);
    } catch (err) {
      this.logger.warn(`Failed to cache ${key}: ${(err as Error).message}`);
    }
    return fresh;
  }

  /** The cached value, or `null` on a miss or a store failure. */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.store.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.store.set(key, JSON.stringify(value), ttlSeconds);
    } catch (err) {
      this.logger.warn(`Failed to cache ${key}: ${(err as Error).message}`);
    }
  }

  /**
   * A counter (rate limits, the explorer's daily budget). `null`
   * when the store is down — callers decide whether that fails open or shut.
   */
  async incrBy(
    key: string,
    by: number,
    ttlSeconds: number,
  ): Promise<number | null> {
    try {
      return await this.store.incrBy(key, by, ttlSeconds);
    } catch {
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.store.del(key);
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate ${key}: ${(err as Error).message}`,
      );
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    try {
      await this.store.delByPrefix(prefix);
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate prefix ${prefix}: ${(err as Error).message}`,
      );
    }
  }
}
