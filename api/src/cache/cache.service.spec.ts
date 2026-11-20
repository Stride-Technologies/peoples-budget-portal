import { CacheService } from './cache.service.js';
import { MemoryCacheStore } from './memory-cache.store.js';
import type { CacheStore } from './cache-store.interface.js';

describe('CacheService', () => {
  describe('with the in-memory store', () => {
    let service: CacheService;

    beforeEach(() => {
      service = new CacheService(new MemoryCacheStore());
    });

    it('runs the loader on a miss and serves the cached value on a hit', async () => {
      const loader = jest.fn().mockResolvedValue({ n: 1 });
      const first = await service.getOrSet('k', 60, loader);
      const second = await service.getOrSet('k', 60, loader);

      expect(first).toEqual({ n: 1 });
      expect(second).toEqual({ n: 1 });
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('re-runs the loader after the key is invalidated', async () => {
      const loader = jest.fn().mockResolvedValue('v');
      await service.getOrSet('k', 60, loader);
      await service.del('k');
      await service.getOrSet('k', 60, loader);

      expect(loader).toHaveBeenCalledTimes(2);
    });

    it('delByPrefix drops every matching key and leaves others', async () => {
      const loader = jest.fn().mockResolvedValue('v');
      await service.getOrSet('ref:a', 60, loader);
      await service.getOrSet('ref:b', 60, loader);
      await service.getOrSet('other', 60, loader);

      await service.delByPrefix('ref:');
      await service.getOrSet('ref:a', 60, loader); // miss → reload
      await service.getOrSet('other', 60, loader); // still a hit

      expect(loader).toHaveBeenCalledTimes(4); // 3 initial + 1 reload
    });

    it('expires an entry after its TTL', async () => {
      jest.useFakeTimers();
      try {
        const loader = jest.fn().mockResolvedValue('v');
        await service.getOrSet('k', 1, loader);
        jest.advanceTimersByTime(1500);
        await service.getOrSet('k', 1, loader);
        expect(loader).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('graceful degradation', () => {
    it('still returns the loader result when the store throws', async () => {
      const brokenStore: CacheStore = {
        get: jest.fn().mockRejectedValue(new Error('redis down')),
        set: jest.fn().mockRejectedValue(new Error('redis down')),
        del: jest.fn().mockRejectedValue(new Error('redis down')),
        delByPrefix: jest.fn().mockRejectedValue(new Error('redis down')),
        incrBy: jest.fn().mockRejectedValue(new Error('redis down')),
      };
      const service = new CacheService(brokenStore);

      await expect(
        service.getOrSet('k', 60, () => Promise.resolve(42)),
      ).resolves.toBe(42);
      await expect(service.del('k')).resolves.toBeUndefined();
      await expect(service.delByPrefix('ref:')).resolves.toBeUndefined();
    });
  });
});
