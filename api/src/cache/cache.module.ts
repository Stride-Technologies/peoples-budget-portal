import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import { CACHE_STORE, type CacheStore } from './cache-store.interface.js';
import { CacheService } from './cache.service.js';
import { RegistryCacheService } from './registry-cache.service.js';
import { MemoryCacheStore } from './memory-cache.store.js';
import { RedisCacheStore } from './redis-cache.store.js';

/**
 * Selects the cache store from the Redis foundation: a real `REDIS_CLIENT`
 * yields the Redis-backed store, a `null` client (no `REDIS_URL`) yields the
 * process-local in-memory store.
 */
function cacheStoreFactory(redis: Redis | null): CacheStore {
  return redis ? new RedisCacheStore(redis) : new MemoryCacheStore();
}

@Global()
@Module({
  providers: [
    {
      provide: CACHE_STORE,
      useFactory: cacheStoreFactory,
      inject: [REDIS_CLIENT],
    },
    CacheService,
    RegistryCacheService,
  ],
  exports: [CacheService, RegistryCacheService],
})
export class CacheModule {}
