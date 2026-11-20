/**
 * Archive (or unarchive) programs in bulk — specs/013.
 *
 * This adds **no archiving logic**: it calls `ProgramPublishService.archive` /
 * `unarchive`, the same methods the staff UI calls, so every program goes
 * through the identical guard (PUBLISHED only, SUPER_ADMIN, reason required),
 * code release, audit row and cache invalidation.
 *
 * Which programs:
 *   --ids a,b,c               exactly these
 *   --published <year>        every PUBLISHED / PUBLISHED_REVISION program in
 *                             the year. For the 2027 launch this is the 12
 *                             legacy programs — run it *before* publishing the
 *                             workbook drafts, and pass --expect 12 so a
 *                             different count stops the run instead of
 *                             archiving the wrong set.
 *   --archived <year>         every ARCHIVED program in the year (with --restore)
 *
 * Options: --reason "<text>" (required), --as <super admin email>, --expect <n>,
 * --dry-run, --restore (unarchive → DRAFT instead).
 *
 * A PUBLISHED_REVISION is refused by the service (its draft must be discarded
 * first), so the dry run lists any and stops.
 *
 * Run (production, through the migrate service):
 *   docker compose --profile tools run --rm migrate sh -c \
 *     "cd /app/api && node_modules/.bin/tsx prisma/archive-programs.ts \
 *        --published 2027 --expect 12 --reason '…' --dry-run"
 */

import { Prisma, ProgramStatus } from '../src/generated/prisma/index';
import { arg, programServices } from './program-services';
import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');
const RESTORE = process.argv.includes('--restore');
const REASON = arg('--reason');
const AS_EMAIL = arg('--as');
const EXPECT = arg('--expect');
const IDS = arg('--ids');
const PUBLISHED_YEAR = arg('--published');
const ARCHIVED_YEAR = arg('--archived');

async function main(): Promise<void> {
  if (!REASON?.trim()) throw new Error('--reason "<why>" is required.');
  const selectors = [IDS, PUBLISHED_YEAR, ARCHIVED_YEAR].filter(Boolean);
  if (selectors.length !== 1) {
    throw new Error(
      'Pass exactly one of --ids, --published <year>, --archived <year>.',
    );
  }

  const { client, publish, cacheNote, superAdmin, close } = programServices();
  try {
    console.log(cacheNote);
    const user = await superAdmin(AS_EMAIL);

    const where = IDS
      ? { id: { in: IDS.split(',').map((s) => s.trim()) } }
      : PUBLISHED_YEAR
        ? {
            aipCycle: { fiscalYear: Number(PUBLISHED_YEAR) },
            status: {
              in: [ProgramStatus.PUBLISHED, ProgramStatus.PUBLISHED_REVISION],
            },
          }
        : {
            aipCycle: { fiscalYear: Number(ARCHIVED_YEAR) },
            status: ProgramStatus.ARCHIVED,
          };
    const programs = await client.program.findMany({
      where: { ...where, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        proposedTotal: true,
        tentativeAipReferenceCode: true,
        office: { select: { acronym: true } },
      },
      orderBy: [{ officeId: 'asc' }, { orderIndex: 'asc' }],
    });

    const total = programs.reduce(
      (sum, p) => sum.plus(p.proposedTotal),
      new Prisma.Decimal(0),
    );
    console.log(
      `${RESTORE ? 'Unarchive' : 'Archive'} as ${user.email} — ${programs.length} program(s), ₱${total.toFixed(2)}:`,
    );
    for (const p of programs) {
      console.log(
        `  ${p.status.padEnd(18)} ${(p.office?.acronym ?? '—').padEnd(8)} ${p.tentativeAipReferenceCode.padEnd(24)} ₱${p.proposedTotal.toFixed(2).padStart(16)}  ${p.name}`,
      );
    }

    if (EXPECT !== undefined && programs.length !== Number(EXPECT)) {
      throw new Error(
        `Expected ${EXPECT} program(s), found ${programs.length}. Nothing was changed.`,
      );
    }
    const wrong = programs.filter((p) =>
      RESTORE
        ? p.status !== ProgramStatus.ARCHIVED
        : p.status !== ProgramStatus.PUBLISHED,
    );
    if (wrong.length > 0) {
      throw new Error(
        `${wrong.length} program(s) are not ${RESTORE ? 'ARCHIVED' : 'PUBLISHED'}` +
          (RESTORE ? '' : ' (discard any open revision first)') +
          '. Nothing was changed.',
      );
    }
    if (DRY_RUN) {
      console.log('\n[DRY RUN] Nothing was changed.');
      return;
    }

    let done = 0;
    for (const p of programs) {
      if (RESTORE) await publish.unarchive(p.id, REASON, user);
      else await publish.archive(p.id, REASON, user);
      done++;
    }
    console.log(`\n${RESTORE ? 'Unarchived' : 'Archived'} ${done} program(s).`);
  } finally {
    await close();
  }
}

void main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
