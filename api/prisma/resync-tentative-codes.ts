/**
 * One-off resync: rewrite every program's (and PA's) **tentative** AIP code
 * after office AIP segments were changed outside the app.
 *
 * `ReferenceService.updateOffice` already resyncs codes whenever `officeCode` or
 * `officeType` changes (see `resyncCodesForOffice`). A bulk office sync applied
 * as raw SQL — e.g. copying the office catalog from one environment to another —
 * bypasses that hook, leaving stale codes behind. This closes that gap.
 *
 * ## Why a script and not SQL
 *
 * Same reason as `backfill-final-aip-codes.ts`: the segments, the per-scope
 * ranking, the frozen-row ordinal reservation, and the nested-PA rule all
 * already exist and are tested in `AIPCodesService`. Reimplementing them in SQL
 * would duplicate rules that must agree exactly.
 *
 * ## Safety
 *
 * - **Tentative codes only.** `resyncTentativeProgramCodes` skips frozen rows
 *   (APPROVED, or in a non-OPEN cycle) and never touches `aipReferenceCode`, so
 *   issued final codes are immutable here.
 * - **Idempotent.** The service only writes rows whose recomputed code differs,
 *   so a second run is a no-op.
 * - **One transaction per code scope** (`aipCycleId` × `officeId` ×
 *   `papSectorId`) — the unit the service ranks within — so a failure part-way
 *   leaves earlier scopes done rather than rolling back the whole run.
 * - **`--dry-run`** wraps the whole batch in one transaction and rolls it back by
 *   throwing at the end. It must be one transaction, not one per scope: codes
 *   are ranked against siblings, so per-scope rollback would make every scope
 *   preview from a counter the previous rollback undid.
 *
 * ## Usage
 *
 *   DATABASE_URL=... npx tsx prisma/resync-tentative-codes.ts --dry-run
 *   DATABASE_URL=... npx tsx prisma/resync-tentative-codes.ts
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/index';
import { PrismaPg } from '@prisma/adapter-pg';
import { AIPCodesService } from '../src/aip-codes/aip-codes.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const dryRun = process.argv.includes('--dry-run');

/**
 * Prisma's 5 s interactive-transaction default is not enough here: the PA walk
 * is one round trip per tree level, and this runs against a remote database.
 */
const TX_OPTIONS = { timeout: 120_000, maxWait: 30_000 };

/** Sentinel used to roll a dry-run transaction back. Never surfaces to the user. */
class DryRun extends Error {}

async function main() {
  // The service only needs Prisma; a PrismaClient satisfies it structurally.
  const codes = new AIPCodesService(prisma as unknown as PrismaService);

  // Every code scope that has at least one live program. Resyncing by scope
  // rather than by office covers all offices while matching the service's own
  // ranking unit exactly.
  const scopes = await prisma.program.findMany({
    where: { deletedAt: null },
    select: { aipCycleId: true, officeId: true, papSectorId: true },
    distinct: ['aipCycleId', 'officeId', 'papSectorId'],
  });

  const before = new Map(
    (
      await prisma.program.findMany({
        where: { deletedAt: null },
        select: { id: true, tentativeAipReferenceCode: true },
      })
    ).map((p) => [p.id, p.tentativeAipReferenceCode]),
  );

  console.log(`${scopes.length} code scope(s) to resync${dryRun ? ' (dry run)' : ''}`);

  const run = async () => {
    for (const scope of scopes) {
      if (scope.officeId === null) continue; // orphaned program; no office segments to derive
      await prisma.$transaction(
        (tx) =>
          codes.resyncTentativeProgramCodes(
            {
              aipCycleId: scope.aipCycleId,
              officeId: scope.officeId!,
              papSectorId: scope.papSectorId,
            },
            tx,
          ),
        TX_OPTIONS,
      );
    }
  };

  if (dryRun) {
    // One transaction for the whole batch, rolled back by throwing.
    await prisma
      .$transaction(async (tx) => {
        for (const scope of scopes) {
          if (scope.officeId === null) continue;
          await codes.resyncTentativeProgramCodes(
            {
              aipCycleId: scope.aipCycleId,
              officeId: scope.officeId,
              papSectorId: scope.papSectorId,
            },
            tx,
          );
        }
        await report(tx, before);
        throw new DryRun();
      }, TX_OPTIONS)
      .catch((error: unknown) => {
        if (!(error instanceof DryRun)) throw error;
      });
    return;
  }

  await run();
  await report(prisma, before);
}

type Reader = Pick<PrismaClient, 'program'>;

async function report(db: Reader, before: Map<string, string>) {
  const after = await db.program.findMany({
    where: { deletedAt: null },
    select: { id: true, tentativeAipReferenceCode: true, name: true },
    orderBy: { tentativeAipReferenceCode: 'asc' },
  });
  const moved = after.filter(
    (p) => before.get(p.id) !== p.tentativeAipReferenceCode,
  );
  for (const p of moved) {
    console.log(
      `  ${before.get(p.id)} → ${p.tentativeAipReferenceCode}  ${p.name}`,
    );
  }
  console.log(`${moved.length} of ${after.length} program code(s) changed`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
