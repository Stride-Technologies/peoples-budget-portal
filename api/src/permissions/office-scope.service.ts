import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '../generated/prisma/index';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../cache/cache.service.js';

/** Sentinel for "every office" — distinct from an empty list, which means none. */
export const ALL_OFFICES = 'ALL' as const;

export type EffectiveOfficeScope = typeof ALL_OFFICES | string[];

const CACHE_TTL_SECONDS = 300;
const cacheKey = (userId: string) => `office-scope:${userId}`;

/**
 * Resolves the second, orthogonal authorization dimension: *on whose records?*
 *
 *   SUPER_ADMIN                   → ALL
 *   user.allOfficesScope === true → ALL
 *   otherwise                     → UserOfficeScope[] ∪ LGUUser.officeId
 *
 * The union with the home office is what makes this a no-backfill change: every
 * existing user keeps exactly today's access on the day the migration lands.
 *
 * The office id list is deliberately **not** carried in the JWT (up to ~50 UUIDs,
 * and it goes stale the moment a grant changes). Only the `allOffices` boolean is,
 * as a fast path; the list is resolved per request through the Redis cache and
 * invalidated on grant change.
 *
 * See docs/design/phase-1-publish-scope.md §5.4.
 */
@Injectable()
export class OfficeScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async effectiveOfficeIds(user: JwtPayload): Promise<EffectiveOfficeScope> {
    if (user.role === Role.SUPER_ADMIN) return ALL_OFFICES;
    if (user.allOfficesScope) return ALL_OFFICES;

    return this.cache.getOrSet(
      cacheKey(user.sub),
      CACHE_TTL_SECONDS,
      async () => {
        const [grants, lguUsers] = await Promise.all([
          this.prisma.userOfficeScope.findMany({
            where: { userId: user.sub },
            select: { officeId: true },
          }),
          this.prisma.lGUUser.findMany({
            where: { userId: user.sub },
            select: { officeId: true },
          }),
        ]);

        return [
          ...new Set([
            ...grants.map((g) => g.officeId),
            ...lguUsers.map((l) => l.officeId),
          ]),
        ];
      },
    );
  }

  /** Drop the cached list. Call from every grant / all-offices mutation. */
  async invalidate(userId: string): Promise<void> {
    await this.cache.del(cacheKey(userId));
  }

  /**
   * Whether an admin has explicitly listed the offices this user works on.
   *
   * Distinct from a non-empty `effectiveOfficeIds`, which every LGU user has via
   * their home office. It means "someone decided this user's scope", and callers
   * use it to stop widening that decision — `buildVisibilityWhere` skips the
   * same-cluster peer rule for these users, because a CPDO encoder granted the
   * Economy offices should not also read all of Governance just because CPDO
   * happens to sit there.
   *
   * Not cached: it is one indexed count on a small table, and caching it would
   * add a second key to invalidate on every grant change.
   */
  async hasExplicitGrants(user: JwtPayload): Promise<boolean> {
    if (user.role === Role.SUPER_ADMIN || user.allOfficesScope) return false;
    const grants = await this.prisma.userOfficeScope.count({
      where: { userId: user.sub },
    });
    return grants > 0;
  }

  /**
   * Assertion shape — single-resource writes. Throws `403` when the resource's
   * office is outside the caller's scope.
   */
  async assertOfficeInScope(
    user: JwtPayload,
    officeId: string | null,
  ): Promise<void> {
    const scope = await this.effectiveOfficeIds(user);
    if (scope === ALL_OFFICES) return;
    if (officeId && scope.includes(officeId)) return;
    throw new ForbiddenException('Office is outside your assigned scope');
  }

  /**
   * Filter shape — list endpoints. Returns a fragment to fold into an existing
   * Prisma `where`: `{}` for ALL, otherwise `{ officeId: { in: [...] } }`.
   *
   * A user with no grants and no home office gets `{ in: [] }`, which correctly
   * matches nothing rather than everything.
   */
  async officeScopeWhere(
    user: JwtPayload,
  ): Promise<{ officeId?: { in: string[] } }> {
    const scope = await this.effectiveOfficeIds(user);
    if (scope === ALL_OFFICES) return {};
    return { officeId: { in: scope } };
  }
}
