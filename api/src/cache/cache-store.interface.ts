/** DI token for the active cache store (Redis-backed or in-memory). */
export const CACHE_STORE = Symbol('CACHE_STORE');

/**
 * Minimal string key/value cache. Implementations must never throw — a backend
 * failure degrades to a cache miss (`get` → `null`) or a silent no-op so the
 * request path is never broken by the cache.
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Delete every key starting with `prefix`. */
  delByPrefix(prefix: string): Promise<void>;
  /**
   * Atomically add `by` to an integer counter, starting it at 0 with a
   * `ttlSeconds` expiry; returns the new value, or `null` when the store is down.
   */
  incrBy(key: string, by: number, ttlSeconds: number): Promise<number | null>;
}
