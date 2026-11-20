import type { CacheStore } from './cache-store.interface.js';

interface Entry {
  value: string;
  expiresAt: number;
}

/** About 64 MB of UTF-16: cached values are whole registry responses. */
const DEFAULT_MAX_CHARS = 32 * 1024 * 1024;

/**
 * Process-local cache used when `REDIS_URL` is unset (dev / CI).
 * Not shared across replicas — that is the documented trade-off of running
 * without Redis.
 *
 * Bounded: public GETs vary their keys freely (filters, search, page), and an
 * unbounded map grew the API heap until it died. Past `maxChars` the least
 * recently used entries go first; expired ones also go on read.
 */
export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, Entry>();
  private chars = 0;

  constructor(private readonly maxChars = DEFAULT_MAX_CHARS) {}

  get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return Promise.resolve(null);
    if (entry.expiresAt < Date.now()) {
      this.drop(key);
      return Promise.resolve(null);
    }
    // Map order is recency order: move a hit to the back.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.put(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    this.drop(key);
    return Promise.resolve();
  }

  async incrBy(key: string, by: number, ttlSeconds: number): Promise<number> {
    const entry = (await this.get(key)) === null ? null : this.entries.get(key);
    const value = Number(entry?.value ?? 0) + by;
    this.put(key, {
      value: String(value),
      expiresAt: entry?.expiresAt ?? Date.now() + ttlSeconds * 1000,
    });
    return value;
  }

  delByPrefix(prefix: string): Promise<void> {
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.drop(key);
    }
    return Promise.resolve();
  }

  private put(key: string, entry: Entry): void {
    this.drop(key);
    if (entry.value.length > this.maxChars) return;
    this.entries.set(key, entry);
    this.chars += entry.value.length;
    // Map order is recency order, so the first keys are the least recent.
    for (const oldest of this.entries.keys()) {
      if (this.chars <= this.maxChars) break;
      this.drop(oldest);
    }
  }

  private drop(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.chars -= entry.value.length;
    this.entries.delete(key);
  }
}
