/**
 * Confirm the import decisions on every flagged program in a cycle, in bulk.
 *
 * Companion to `publish-cycle.ts`, and deliberately a **separate** script for
 * the reason that one documents: clearing a review flag and publishing are two
 * different acts, and folding them together turns "publish what is ready" into
 * "publish everything". Run this first when a bulk-imported cycle has been
 * reviewed; then run `publish-cycle.ts`.
 *
 * Like its sibling it adds no logic of its own — it resolves the real
 * `ProgramPublishService` and calls `acknowledgeImportsForClusters`, the same
 * method `POST /aip-cycles/:id/acknowledge-imports` calls, so every program
 * still gets its own `IMPORT_REVIEWED` audit row naming the actor.
 *
 * What it clears, and what it does not:
 *
 *   - `Program.importWarnings` — the three decisions the import had to make on
 *     a program's behalf (an inferred finish line, a duplicate merge, a
 *     synthesised heading). Stored, because nothing can re-derive them.
 *   - **Not** `INCOMPLETE_DATA` / `ZERO_PROPOSED_BUDGET`. Those are derived per
 *     read from genuinely missing fields and no acknowledgement touches them;
 *     they clear when the office fills the data in.
 *
 * Run:
 *   DATABASE_URL="…" pnpm --filter api exec tsx prisma/acknowledge-imports.ts \
 *     --year 2027 --dry-run --as admin@example.gov
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
import { MemoryCacheStore } from '../src/cache/memory-cache.store';
import { RedisCacheStore } from '../src/cache/redis-cache.store';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { CacheStore } from '../src/cache/cache-store.interface';
import type { JwtPayload } from '../src/auth/decorators/current-user.decorator';
import 'dotenv/config';

const arg = (flag: string): string | undefined => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

const DRY_RUN = process.argv.includes('--dry-run');
const YEAR = Number(arg('--year') ?? 2027);
const AS_EMAIL = arg('--as');

async function main(): Promise<void> {
  if (!Number.isInteger(YEAR)) {
    throw new Error(`--year must be a fiscal year, got “${arg('--year')}”`);
  }

  // Same two settings, for the same reason as publish-cycle.ts: this is usually
  // pointed at a remote pooled database whose client limits are far lower than
  // a co-located Postgres.
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

  try {
    const cycle = await client.aIPCycle.findUnique({
      where: { fiscalYear: YEAR },
      select: { id: true, status: true },
    });
    if (!cycle) throw new Error(`No AIP cycle for ${YEAR}.`);

    const actor = await client.user.findFirst({
      where: {
        role: Role.SUPER_ADMIN,
        isActive: true,
        ...(AS_EMAIL ? { email: AS_EMAIL } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, role: true },
    });
    if (!actor) {
      throw new Error(
        AS_EMAIL
          ? `No active SUPER_ADMIN with email ${AS_EMAIL}.`
          : 'No active SUPER_ADMIN found; pass --as <email>.',
      );
    }

    const flagged = await client.program.findMany({
      where: {
        aipCycleId: cycle.id,
        deletedAt: null,
        importWarnings: { isEmpty: false },
      },
      select: { importWarnings: true },
    });

    const byWarning = new Map<string, number>();
    for (const p of flagged) {
      for (const w of p.importWarnings) {
        // Group by the sentence's opening clause; the parenthetical names the
        // specific office and would make every row unique.
        const key = w.split(/[(;]/)[0].trim();
        byWarning.set(key, (byWarning.get(key) ?? 0) + 1);
      }
    }

    console.log(
      `Cycle ${YEAR} (${cycle.status})\n` +
        `  acknowledging as : ${actor.email} (${actor.role})\n` +
        `  flagged programs : ${flagged.length}`,
    );
    for (const [w, n] of [...byWarning].sort((a, b) => b[1] - a[1])) {
      console.log(`      ${String(n).padStart(4)}  ${w}`);
    }

    if (DRY_RUN) {
      console.log(
        `\n[DRY RUN] Nothing was cleared. Re-run without --dry-run to acknowledge ${flagged.length}.`,
      );
      return;
    }
    if (flagged.length === 0) {
      console.log('\nNothing to acknowledge.');
      return;
    }

    // Every cluster, so "the cycle" means the cycle — same reasoning as
    // publish-cycle.ts, where `Office.clusterId` is non-nullable.
    const clusters = await client.cluster.findMany({ select: { id: true } });
    const clusterIds = clusters.map((c) => c.id);

    const user: JwtPayload = {
      sub: actor.id,
      email: actor.email,
      role: actor.role,
    } as JwtPayload;

    console.log(`\nAcknowledging ${flagged.length}…`);
    const result = await publish.acknowledgeImportsForClusters(
      cycle.id,
      clusterIds,
      user,
    );
    console.log(
      `\nAcknowledged ${result.acknowledged} of ${result.total}` +
        (result.failed.length > 0 ? `, ${result.failed.length} failed.` : '.'),
    );
    for (const f of result.failed) {
      console.log(`  ${f.programId}: ${f.error}`);
    }
    if (result.failed.length > 0) process.exitCode = 1;

    const left = await client.program.count({
      where: {
        aipCycleId: cycle.id,
        deletedAt: null,
        importWarnings: { isEmpty: false },
      },
    });
    console.log(
      left === 0
        ? 'No program in this cycle still carries an import warning.'
        : `${left} program(s) still carry an import warning.`,
    );
  } finally {
    await client.$disconnect();
    if (redis) redis.disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
