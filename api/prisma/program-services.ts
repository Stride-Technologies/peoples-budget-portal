/**
 * The real program services, wired by hand for a CLI script (publish-cycle.ts,
 * archive-programs.ts) — no second implementation of publishing or archiving.
 *
 * Wired by hand rather than resolved from `AppModule`: a standalone Nest
 * context fails on `EventsService`, whose SSE fan-out has nothing to do with
 * these. Wiring includes the **real cache**, because publish and archive both
 * finish with `registryCache.invalidateAll()`, and a script that quietly
 * skipped it would change what the public page should show while it kept
 * serving the old list. `REDIS_URL` unset falls back to the in-memory store,
 * exactly as `CacheModule` does — fine locally, wrong in production, so the
 * store in use is printed.
 */

import { PrismaClient, Role } from '../src/generated/prisma/index';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';
import { ProgramPublishService } from '../src/programs/program-publish.service';
import { ProgramsService } from '../src/programs/programs.service';
import { ProgramVersionsService } from '../src/programs/program-versions.service';
import { ProgramAuditLogService } from '../src/program-audit/program-audit-log.service';
import { AIPCodesService } from '../src/aip-codes/aip-codes.service';
import { EstimateRollupService } from '../src/budget-rollup/estimate-rollup.service';
import { BudgetRollupService } from '../src/budget-rollup/budget-rollup.service';
import { OfficeScopeService } from '../src/permissions/office-scope.service';
import { CacheService } from '../src/cache/cache.service';
import { RegistryCacheService } from '../src/cache/registry-cache.service';
import { RedisCacheStore } from '../src/cache/redis-cache.store';
import { MemoryCacheStore } from '../src/cache/memory-cache.store';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { CacheStore } from '../src/cache/cache-store.interface';
import type { JwtPayload } from '../src/auth/decorators/current-user.decorator';

export function programServices() {
  // Both settings exist for one reason: these scripts are usually pointed at a
  // *remote* pooled database (Supabase), where the client-side defaults that are
  // fine against a co-located Postgres are not.
  //
  //   max         `publishPreview` fans every candidate out at once
  //               (`Promise.all` over `readinessFor`), and Supabase's session
  //               mode caps the whole project at 15 clients — shared with every
  //               running app. node-pg's default of 10 exhausted it and the run
  //               died with `(EMAXCONNSESSION) max clients reached`. A small
  //               pool makes those queries queue locally instead.
  //   timeout     `publishOne` runs inside an interactive transaction whose
  //               Prisma default is 5 s. That is several round trips, and a wide
  //               program cleared it locally in well under a second but expired
  //               against a remote database. Same value the 2027 seed uses.
  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
      max: 3,
    }),
    transactionOptions: { timeout: 120_000, maxWait: 30_000 },
  });
  const prisma = client as unknown as PrismaService;

  const redisUrl = process.env.REDIS_URL;
  const redis = redisUrl ? new Redis(redisUrl) : null;
  const store: CacheStore = redis
    ? new RedisCacheStore(redis)
    : new MemoryCacheStore();
  const cache = new CacheService(store);
  const registryCache = new RegistryCacheService(cache);

  const codes = new AIPCodesService(prisma);
  const audit = new ProgramAuditLogService();
  const officeScope = new OfficeScopeService(prisma, cache);
  const estimates = new EstimateRollupService(prisma);
  const programs = new ProgramsService(
    prisma,
    codes,
    officeScope,
    audit,
    registryCache,
    estimates,
  );
  const publish = new ProgramPublishService(
    prisma,
    programs,
    new ProgramVersionsService(prisma),
    codes,
    estimates,
    new BudgetRollupService(prisma),
    audit,
    registryCache,
  );

  const cacheNote = `cache store: ${redis ? 'Redis' : 'in-memory (REDIS_URL unset — the public page will serve stale data until its TTL expires)'}`;

  /**
   * Every write names an actor, so the account is resolved and printed before
   * anything is written. It must be a SUPER_ADMIN: `assertOwner` short-circuits
   * for that role, archiving requires it, and anything else would be silently
   * skipped for offices outside its scope.
   */
  async function superAdmin(email?: string): Promise<JwtPayload> {
    const actor = await client.user.findFirst({
      where: {
        role: Role.SUPER_ADMIN,
        isActive: true,
        ...(email ? { email } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, role: true },
    });
    if (!actor) {
      throw new Error(
        email
          ? `No active SUPER_ADMIN with email ${email}.`
          : 'No active SUPER_ADMIN found; pass --as <email>.',
      );
    }
    return {
      sub: actor.id,
      email: actor.email,
      role: actor.role,
    } as JwtPayload;
  }

  async function close() {
    await client.$disconnect();
    if (redis) redis.disconnect();
  }

  return { client, publish, cacheNote, superAdmin, close };
}

export const arg = (flag: string): string | undefined => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
