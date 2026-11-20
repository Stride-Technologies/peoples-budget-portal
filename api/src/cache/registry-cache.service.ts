import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service.js';
import {
  PUBLIC_REGISTRY_KEY_PREFIX,
  REGISTRY_COUNTS_KEY_PREFIX,
} from './cache.constants.js';

/**
 * Write-side invalidation for the two registry caches.
 *
 * It exists so the write paths (publish, program CRUD, comments) do not each
 * have to know a key prefix, and so both invalidations live in one place — the
 * cached data is read in `AIPRegistryService` / `PublicService`, but what makes
 * it stale happens in services that have no reason to import either.
 *
 * Both methods drop a whole prefix rather than a targeted key: one entry exists
 * per filter combination, and there is no way to know which combinations a given
 * program appears in. `delByPrefix` is a `SCAN` over the keyspace, which is why
 * this portal's Redis should not be shared with another project's keys.
 */
@Injectable()
export class RegistryCacheService {
  constructor(private readonly cache: CacheService) {}

  /**
   * Anything that changes what the public list shows: publishing (rows, totals)
   * and public feedback (`feedbackCount`, and the `most_feedback` sort order).
   */
  invalidatePublicRegistry(): Promise<void> {
    return this.cache.delByPrefix(PUBLIC_REGISTRY_KEY_PREFIX);
  }

  /**
   * Anything that changes a program's existence or status, which moves the
   * internal tab counts.
   *
   * ponytail: deliberately not called from BudgetRollupService /
   * EstimateRollupService. Those move only the aggregate footer figure, and
   * covering them means threading invalidation through two more transactional
   * services; the 60s TTL absorbs that drift. Wire them up if the footer lag
   * ever gets noticed.
   */
  invalidateRegistryCounts(): Promise<void> {
    return this.cache.delByPrefix(REGISTRY_COUNTS_KEY_PREFIX);
  }

  /** Both — for writes that change status *and* public visibility (publishing). */
  async invalidateAll(): Promise<void> {
    await Promise.all([
      this.invalidatePublicRegistry(),
      this.invalidateRegistryCounts(),
    ]);
  }
}
