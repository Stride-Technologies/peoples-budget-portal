/**
 * Publish every ready program in a cycle, in bulk.
 *
 * This adds **no publishing logic**. It resolves the real
 * `ProgramPublishService` out of the Nest container and calls `publishCluster`
 * for every cluster at once — the same method the batch-publish dialog calls,
 * so a program published here goes through the identical readiness gate, the
 * identical version snapshot, the identical audit row and the identical cache
 * invalidation. A second implementation of publishing is the last thing this
 * repo needs.
 *
 * The collaborators are wired by hand in `program-services.ts` (shared with
 * `archive-programs.ts`), real cache included — see the note there.
 *
 * ## Attribution
 *
 * Every publish writes `publishedByUserId` and an audit row naming an actor.
 * 383 rows will carry whoever this runs as, so the account is printed before
 * anything is written and can be set explicitly with `--as <email>`. It must be
 * a SUPER_ADMIN: `assertOwner` short-circuits for that role, and anything else
 * is silently skipped for offices outside its scope — which would look like a
 * partial success rather than the wrong account.
 *
 * ## What it will not do
 *
 * Nothing is forced. A program that `readinessFor` reports as blocked is
 * **skipped and counted**, never published — including the 47 AB 2026 programs
 * still carrying row-specific import warnings. Clearing those is a separate,
 * deliberate act (`POST /aip-cycles/:id/acknowledge-imports`), and folding it in
 * here would turn "publish what is ready" into "publish everything", which is
 * not the same request.
 *
 * `--blocked-csv <path>` writes every blocked program — name, office, why — for
 * the office that has to clear it (specs/013: the list sent to CPDO).
 *
 * Run:
 *   docker compose --profile tools run --rm migrate sh -c \
 *     "cd /app/api && node_modules/.bin/tsx prisma/publish-cycle.ts --year 2026 --dry-run"
 */

import { writeFileSync } from 'node:fs';
import { ProgramStatus } from '../src/generated/prisma/index';
import { arg, programServices } from './program-services';
import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');
const YEAR = Number(arg('--year') ?? 2026);
const AS_EMAIL = arg('--as');
const BLOCKED_CSV = arg('--blocked-csv');

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

async function main(): Promise<void> {
  if (!Number.isInteger(YEAR)) {
    throw new Error(`--year must be a fiscal year, got “${arg('--year')}”`);
  }

  const { client, publish, cacheNote, superAdmin, close } = programServices();

  try {
    console.log(cacheNote);

    const cycle = await client.aIPCycle.findUnique({
      where: { fiscalYear: YEAR },
      select: { id: true, status: true },
    });
    if (!cycle) throw new Error(`No AIP cycle for ${YEAR}.`);

    const user = await superAdmin(AS_EMAIL);
    // Every cluster, so "the cycle" means the cycle. `publishCluster` filters
    // programs by their office's cluster and `Office.clusterId` is non-nullable,
    // so passing them all reaches every program — nothing can hide between
    // clusters. Cross-checked against the raw candidate count below.
    const clusters = await client.cluster.findMany({ select: { id: true } });
    const clusterIds = clusters.map((c) => c.id);

    const candidates = await client.program.count({
      where: {
        aipCycleId: cycle.id,
        deletedAt: null,
        status: {
          in: [
            ProgramStatus.DRAFT,
            ProgramStatus.PUBLISHED_REVISION,
            ProgramStatus.APPROVED,
          ],
        },
      },
    });

    const previews = await publish.publishPreview(cycle.id, clusterIds);
    const ready = previews.filter((p) => p.ready);
    const blocked = previews.filter((p) => !p.ready);

    const byBlocker = new Map<string, number>();
    for (const p of blocked) {
      for (const b of p.blockers) {
        byBlocker.set(b, (byBlocker.get(b) ?? 0) + 1);
      }
    }

    console.log(
      `Cycle ${YEAR} (${cycle.status})\n` +
        `  publishing as : ${user.email} (${user.role})\n` +
        `  candidates    : ${previews.length} in ${clusterIds.length} cluster(s)\n` +
        `  ready         : ${ready.length}\n` +
        `  blocked       : ${blocked.length}`,
    );
    for (const [blocker, n] of [...byBlocker].sort((a, b) => b[1] - a[1])) {
      console.log(`      ${String(n).padStart(4)}  ${blocker}`);
    }
    // The cluster route must see every candidate. If it does not, something is
    // unreachable and publishing "the cycle" would quietly mean part of it.
    if (previews.length !== candidates) {
      throw new Error(
        `${candidates} program(s) are publishable candidates but only ${previews.length} ` +
          `are reachable through the ${clusterIds.length} cluster(s). Nothing was published.`,
      );
    }

    if (BLOCKED_CSV) {
      const offices = new Map(
        (
          await client.office.findMany({ select: { id: true, name: true } })
        ).map((o) => [o.id, o.name]),
      );
      const lines = [
        [
          'Program',
          'Office',
          'Proposed',
          'Blocked by',
          'Import decisions to confirm',
        ]
          .map(csvCell)
          .join(','),
        ...blocked.map((p) =>
          [
            p.name,
            (p.officeId && offices.get(p.officeId)) ?? '',
            p.proposedTotal,
            p.blockers.join('; '),
            p.importWarnings.join(' | '),
          ]
            .map(csvCell)
            .join(','),
        ),
      ];
      writeFileSync(BLOCKED_CSV, lines.join('\n') + '\n');
      console.log(
        `  blocked list  : ${BLOCKED_CSV} (${blocked.length} row(s))`,
      );
    }

    if (DRY_RUN) {
      console.log(
        `\n[DRY RUN] Nothing was published. Re-run without --dry-run to publish ${ready.length}.`,
      );
      return;
    }
    if (ready.length === 0) {
      console.log('\nNothing ready to publish.');
      return;
    }

    console.log(`\nPublishing ${ready.length}…`);
    const result = await publish.publishCluster(cycle.id, clusterIds, user);

    console.log(
      `\nPublished ${result.published.length}, ` +
        `skipped ${result.skipped.length}, failed ${result.failed.length}.`,
    );
    if (result.failed.length > 0) {
      // A failure is per program and leaves earlier publishes intact, so this is
      // a list to act on rather than a reason to distrust the whole run.
      console.log('\nFailures:');
      for (const f of result.failed) {
        console.log(`  ${f.programId}: ${f.error}`);
      }
      process.exitCode = 1;
    }
  } finally {
    await close();
  }
}

void main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
