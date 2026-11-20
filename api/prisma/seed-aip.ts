/**
 * Seeds one fiscal year's Annual Investment Program from a JSON file (the shape is
 * `ProgramSeed` below; `data/sample-city/aip-2027.json` is a worked example).
 *
 * **Additive.** Nothing is deleted or overwritten: a program already present for
 * the cycle (matched on name) is skipped.
 *
 * ## AIP reference codes
 *
 * Never written directly. Rows are created on a `~{uuid}` placeholder and
 * `AIPCodesService.resyncTentativeProgramCodes` derives the real code inside the
 * same transaction, exactly as `ProgramsService.create` does — the ordinal is a
 * rank among live siblings, not a counter (aip-reference.md §7, invariants
 * 15–18). `orderIndex` comes from the file's row order so the ranking is stable
 * and a re-run reproduces the same codes.
 *
 * This is why the script runs under `tsx` rather than `ts-node`: importing a
 * NestJS service means resolving its relative `.js` specifiers, which the seed
 * tsconfig's CommonJS resolution cannot do.
 *
 * ## PAP sector
 *
 * Always the office's configured `papSectorId`, never a value from the JSON:
 * the office catalog is what the portal pre-selects for users.
 *
 * Run:
 *   AIP_SEED_YEAR=2027 AIP_SEED_FILE=sample-city/aip-2027.json \
 *     DATABASE_URL="<target-db-url>" pnpm --filter api db:seed:aip
 *
 * `AIP_SEED_FILE` is under `prisma/data/`, or an absolute path. Optional:
 *   AIP_SEED_SOURCE_NAME, AIP_SEED_SOURCE_URL   the file the rows cite as their source
 *   AIP_SEED_CYCLE_STATUS=OPEN|LOCKED
 *   AIP_SEED_PROGRAM_STATUS=DRAFT|SUBMITTED|...
 *   AIP_SEED_UPDATE_CYCLE_STATUS=1
 */

import {
  AIPCycleStatus,
  PapClass,
  PPACostMode,
  Prisma,
  PrismaClient,
  ProgramStatus,
  FundSource,
} from '../src/generated/prisma/index';
import { PrismaPg } from '@prisma/adapter-pg';
import { AIPCodesService } from '../src/aip-codes/aip-codes.service';
import { createAipCycle } from '../src/budget-cycles/ensure-budget-cycle';
import {
  EstimateRollupService,
  replaceFundAllocations,
} from '../src/budget-rollup/estimate-rollup.service';
import { isProvenanceWarning } from '../src/programs/import-data-warnings';
import type { PrismaService } from '../src/prisma/prisma.service';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Tx = Prisma.TransactionClient;

const TARGET_YEAR = Number(process.env.AIP_SEED_YEAR);
if (
  !Number.isInteger(TARGET_YEAR) ||
  TARGET_YEAR < 2000 ||
  !process.env.AIP_SEED_FILE
)
  throw new Error(
    'Set AIP_SEED_YEAR (e.g. 2027) and AIP_SEED_FILE (a JSON file under prisma/data/, or an absolute path).',
  );
const DEFAULT_PROGRAM_STATUS = ProgramStatus.DRAFT;
const DEFAULT_CYCLE_STATUS = AIPCycleStatus.OPEN;

/**
 * The PA tree is one round trip per level plus a resync, against a possibly
 * remote database. Prisma's 5 s interactive-transaction default is not enough
 * for the wider programs (the City Engineer's capital list runs to ~50 rows).
 */
const TX_OPTIONS = { timeout: 120_000, maxWait: 30_000 };

// ─── Seed shapes ──────────────────────────────────────────────────────────────

interface PASeed {
  name: string;
  type: 'PROJECT' | 'ACTIVITY';
  costMode?: 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN';
  expectedOutput?: string | null;
  fundSources?: string[];
  proposedBudget: string | null;
  psEstimate?: string | null;
  mooeEstimate?: string | null;
  coEstimate?: string | null;
  implementationStartMonth: number | null;
  implementationStartYear: number | null;
  implementationEndMonth: number | null;
  implementationEndYear: number | null;
  climate?: ClimateSeed;
  /** The row's funding lines, one per fund (pre-final workbook). */
  fundAllocations?: FundAllocationSeed[];
  /** `Sheet!rN` in the workbook — stored as `sourceRef`. */
  sourceRow?: string;
  children?: PASeed[];
}

/** One funding line: a fund and what it pays, in pesos. */
interface FundAllocationSeed {
  fundSource: string;
  ps: string;
  mooe: string;
  co: string;
}

/** A row's funding lines → `fund_allocations`; the rollup derives the row's figures from them. */
async function createFundAllocations(
  tx: Tx,
  owner: { programId: string } | { projectActivityId: string },
  lines: FundAllocationSeed[] | undefined,
): Promise<void> {
  if (!lines?.length) return;
  await replaceFundAllocations(
    owner,
    lines.map((l) => ({ ...l, fundSource: l.fundSource as FundSource })),
    tx,
  );
}

/** A climate tag from the workbook: amounts in pesos, CCET codes as text. */
interface ClimateSeed {
  codes: string[];
  rawCodes: string;
  ccaAmount: string | null;
  ccmAmount: string | null;
}

interface ProgramSeed {
  name: string;
  officeAcronym: string;
  supportingOfficeAcronyms?: string[];
  finishLineVision: number;
  /** Substring matched against SubFinishLine.name. Only the legacy set has one. */
  subFinishLineKey?: string;
  papClass?: PapClass | null;
  expectedOutput: string | null;
  implementationStartMonth: number | null;
  implementationStartYear: number | null;
  implementationEndMonth: number | null;
  implementationEndYear: number | null;
  importWarnings?: string[];
  /** The `MFO n -` line the program is filed under (pre-final workbook). */
  majorFinalOutput?: string | null;
  /**
   * Set when the workbook states the money on the program row itself — a `N.`
   * the city numbers as a program with no `N.M` rows under it. Optional so the
   * legacy set, which has no such rows, keeps its shape.
   */
  costMode?: 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN';
  fundSources?: string[];
  psProposedTotal?: string | null;
  mooeProposedTotal?: string | null;
  coProposedTotal?: string | null;
  climate?: ClimateSeed;
  /** The row's funding lines, one per fund (pre-final workbook). */
  fundAllocations?: FundAllocationSeed[];
  /** `Sheet!rN` in the workbook — stored as `sourceRef`. */
  sourceRow?: string;
  projectActivities: PASeed[];
}

function load<T>(file: string): T {
  const path = isAbsolute(file)
    ? file
    : join(process.cwd(), 'prisma', 'data', file);
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

const loadAllPrograms = (): ProgramSeed[] =>
  load<ProgramSeed[]>(process.env.AIP_SEED_FILE!);

// ─── Env knobs ────────────────────────────────────────────────────────────────

function parseEnum<T extends Record<string, string>>(
  name: string,
  values: T,
  fallback: T[keyof T],
): T[keyof T] {
  const raw = process.env[name] ?? fallback;
  if (!Object.values(values).includes(raw)) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return raw as T[keyof T];
}

function dec(value: string | null | undefined): Prisma.Decimal | null {
  return value === null || value === undefined
    ? null
    : new Prisma.Decimal(value);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// AIP_SEED_SOURCE_NAME (+ _URL): the file the rows cite as their source. Without it, rows cite none.
const SOURCE_DOCUMENT = process.env.AIP_SEED_SOURCE_NAME
  ? {
      name: process.env.AIP_SEED_SOURCE_NAME,
      url: process.env.AIP_SEED_SOURCE_URL ?? null,
      sheetGids: {} as Record<string, string>,
    }
  : null;

let ccetIdByCode = new Map<string, string>();
let sourceDocumentId: string | null = null;

/** Provenance columns for a seeded row, when the file and the row both name a source. */
function source(sourceRow: string | undefined) {
  return sourceRow && sourceDocumentId
    ? { sourceDocumentId, sourceRef: sourceRow }
    : {};
}

/** Writes a climate tag on a program or a PA, with whichever of its codes the catalog holds. */
async function createClimateTag(
  tx: Tx,
  owner: { programId: string } | { projectActivityId: string },
  climate: ClimateSeed | undefined,
): Promise<void> {
  if (!climate) return;
  const ids = [
    ...new Set(
      climate.codes
        .map((code) => ccetIdByCode.get(code))
        .filter((id): id is string => !!id),
    ),
  ];
  await tx.climateChangeTag.create({
    data: {
      ...owner,
      ccaAmount: new Prisma.Decimal(climate.ccaAmount ?? 0),
      ccmAmount: new Prisma.Decimal(climate.ccmAmount ?? 0),
      // The workbook's own text, so an unmatched or partial code stays visible.
      remarks: climate.rawCodes ? `Workbook code: ${climate.rawCodes}` : null,
      codes: { create: ids.map((ccetCodeId) => ({ ccetCodeId })) },
    },
  });
}

async function main() {
  const cycleStatus = parseEnum(
    'AIP_SEED_CYCLE_STATUS',
    AIPCycleStatus,
    DEFAULT_CYCLE_STATUS,
  );
  const programStatus = parseEnum(
    'AIP_SEED_PROGRAM_STATUS',
    ProgramStatus,
    DEFAULT_PROGRAM_STATUS,
  );

  console.log(`AIP ${TARGET_YEAR} seed — start (programs as ${programStatus})`);

  const codes = new AIPCodesService(prisma as unknown as PrismaService);
  const estimates = new EstimateRollupService(
    prisma as unknown as PrismaService,
  );

  // ── 1. Prerequisites, all validated before anything is written ────────────
  const [finishLines, subFinishLines, offices, superAdmin] = await Promise.all([
    prisma.finishLine.findMany({ select: { id: true, visionNumber: true } }),
    prisma.subFinishLine.findMany({
      select: {
        id: true,
        name: true,
        finishLine: { select: { visionNumber: true } },
      },
    }),
    prisma.office.findMany({
      where: { isActive: true },
      select: {
        id: true,
        acronym: true,
        officeCode: true,
        officeType: true,
        papSectorId: true,
      },
    }),
    prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } }),
  ]);

  const missing =
    'Run the main reference seed first: pnpm --filter api exec prisma db seed';
  if (finishLines.length === 0) throw new Error(`No finish lines. ${missing}`);
  if (offices.length === 0) throw new Error(`No city offices. ${missing}`);
  if (!superAdmin) {
    throw new Error(
      `No SUPER_ADMIN. ${missing} (with SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD set)`,
    );
  }

  // CCET typology codes by code; a workbook code missing here was already
  // turned into an import warning, so it is simply not attached.
  ccetIdByCode = new Map(
    (
      await prisma.climateTypologyCode.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      })
    ).map((c) => [c.code, c.id]),
  );

  sourceDocumentId = SOURCE_DOCUMENT
    ? (
        await prisma.sourceDocument.upsert({
          where: { name: SOURCE_DOCUMENT.name },
          create: SOURCE_DOCUMENT,
          update: {
            url: SOURCE_DOCUMENT.url,
            sheetGids: SOURCE_DOCUMENT.sheetGids,
          },
          select: { id: true },
        })
      ).id
    : null;

  const finishLineByVision = new Map(
    finishLines
      .filter((fl) => fl.visionNumber !== null)
      .map((fl) => [fl.visionNumber!, fl.id]),
  );
  const officeByAcronym = new Map(
    offices.map((o) => [o.acronym.trim().toLowerCase(), o]),
  );
  // ── 2. The cycle ──────────────────────────────────────────────────────────
  let cycle = await prisma.aIPCycle.findUnique({
    where: { fiscalYear: TARGET_YEAR },
  });
  if (!cycle) {
    cycle = await createAipCycle(prisma, {
      fiscalYear: TARGET_YEAR,
      status: cycleStatus,
      lockedAt: cycleStatus === AIPCycleStatus.LOCKED ? new Date() : null,
    });
    console.log(`  created AIP cycle ${TARGET_YEAR} (${cycleStatus})`);
  } else if (
    process.env.AIP_SEED_UPDATE_CYCLE_STATUS === '1' &&
    cycle.status !== cycleStatus
  ) {
    cycle = await prisma.aIPCycle.update({
      where: { id: cycle.id },
      data: {
        status: cycleStatus,
        lockedAt: cycleStatus === AIPCycleStatus.LOCKED ? new Date() : null,
      },
    });
    console.log(`  cycle ${TARGET_YEAR} status set to ${cycleStatus}`);
  } else {
    console.log(`  cycle ${TARGET_YEAR} already exists (${cycle.status})`);
  }

  // ── 3. Programs ───────────────────────────────────────────────────────────
  const programs = loadAllPrograms();
  console.log(`  ${programs.length} program(s) to consider`);

  let created = 0;
  let skipped = 0;
  const problems: string[] = [];

  /**
   * Next `orderIndex` to hand out per code scope, seeded from whatever is
   * already there.
   *
   * This is what makes the seed genuinely additive. The tentative code's ordinal
   * is a rank among live siblings by (orderIndex, createdAt), so a new program
   * that sorts *ahead* of an existing one pushes that one's ordinal up and
   * rewrites its code. Offices in the live database start at orderIndex 1, so
   * numbering this run from 0 would have moved the code of every program the
   * city has already published.
   *
   * Appending after the current maximum leaves existing rows exactly where they
   * are, which is the whole point of "nothing is overwritten".
   */
  const nextOrderIndex = new Map<string, number>();
  async function claimOrderIndex(
    officeId: string,
    papSectorId: string,
  ): Promise<number> {
    const key = `${officeId}:${papSectorId}`;
    let next = nextOrderIndex.get(key);
    if (next === undefined) {
      const highest = await prisma.program.aggregate({
        where: {
          aipCycleId: cycle!.id,
          officeId,
          papSectorId,
          deletedAt: null,
        },
        _max: { orderIndex: true },
      });
      next = (highest._max.orderIndex ?? 0) + 1;
    }
    nextOrderIndex.set(key, next + 1);
    return next;
  }

  for (const seed of programs) {
    const office = officeByAcronym.get(seed.officeAcronym.trim().toLowerCase());
    if (!office) {
      problems.push(`"${seed.name}": unknown office ${seed.officeAcronym}`);
      continue;
    }
    if (!office.officeCode || !office.officeType) {
      problems.push(
        `"${seed.name}": office ${office.acronym} has no AIP office code or type; ` +
          `an admin must set both before codes can be derived`,
      );
      continue;
    }
    if (!office.papSectorId) {
      problems.push(
        `"${seed.name}": office ${office.acronym} has no configured PAP sector`,
      );
      continue;
    }

    const finishLineId = finishLineByVision.get(seed.finishLineVision);
    if (!finishLineId) {
      problems.push(
        `"${seed.name}": no finish line for vision ${seed.finishLineVision}`,
      );
      continue;
    }

    // Only the legacy set names a sub-finish-line, and it does so by substring.
    let subFinishLineId: string | null = null;
    if (seed.subFinishLineKey) {
      const key = seed.subFinishLineKey.toLowerCase();
      const hit = subFinishLines.find(
        (sfl) =>
          sfl.finishLine.visionNumber === seed.finishLineVision &&
          sfl.name.toLowerCase().includes(key),
      );
      if (!hit) {
        problems.push(
          `"${seed.name}": no sub-finish-line matching "${seed.subFinishLineKey}"`,
        );
        continue;
      }
      subFinishLineId = hit.id;
    }

    // Additive: an existing program of this name for this office and cycle is
    // left alone. The office is part of the key on purpose — seven different
    // offices each run an "Administrative Governance and Organizational Support
    // Program", and a name-only key silently collapsed 24 of them into one.
    //
    // Case-insensitive, because the importer now title-cases the workbook's
    // shouted headings: rows seeded before that change are still stored in caps,
    // and an exact match would treat every one of them as a new program and
    // duplicate it. `mergeDuplicatePrograms` in the importer keys on
    // `name.toLowerCase()` too, so the two agree on what "same program" means.
    //
    // Live rows only. A soft-deleted program is not "already present" — it is a
    // row someone discarded, and letting it match silently drops the workbook's
    // real program along with its whole PPA tree. Staging carried 13 such
    // leftovers and lost 43 PPAs worth ₱364M to them before this filter existed.
    const existing = await prisma.program.findFirst({
      where: {
        name: { equals: seed.name, mode: 'insensitive' },
        aipCycleId: cycle.id,
        officeId: office.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const supporting = (seed.supportingOfficeAcronyms ?? [])
      .map((acr) => officeByAcronym.get(acr.trim().toLowerCase())?.id)
      .filter((id): id is string => Boolean(id) && id !== office.id);

    const orderIndex = await claimOrderIndex(office.id, office.papSectorId);

    // One transaction per program. A failure part-way must not leave a program
    // with some of its PPAs — the name-based skip above would then treat that
    // half-built row as done on the next run and never repair it.
    await prisma.$transaction(async (tx) => {
      const program = await tx.program.create({
        data: {
          aipCycleId: cycle.id,
          officeId: office.id,
          papSectorId: office.papSectorId!,
          papSubsectorCode: '000',
          papClass: seed.papClass ?? null,
          finishLineId,
          subFinishLineId,
          name: seed.name,
          majorFinalOutput: seed.majorFinalOutput ?? null,
          expectedOutput: seed.expectedOutput,
          implementationStartMonth: seed.implementationStartMonth,
          implementationStartYear: seed.implementationStartYear,
          implementationEndMonth: seed.implementationEndMonth,
          implementationEndYear: seed.implementationEndYear,
          // Appended after whatever the scope already holds, so existing
          // programs keep their rank — and therefore their code.
          orderIndex,
          status: programStatus,
          currentVersion: programStatus === ProgramStatus.DRAFT ? 0 : 1,
          // Only the import's own decisions are stored. The data-gap sentences
          // in the JSON are recomputed on every read now
          // (src/programs/import-data-warnings.ts), so storing them would
          // recreate the bug the derivation exists to fix: the sentence would
          // outlive the fix and keep the program unpublishable. The committed
          // workbook JSON still holds all ten kinds and cannot be regenerated
          // without the workbook, so the filter lives here rather than there.
          importWarnings: (seed.importWarnings ?? []).filter(
            isProvenanceWarning,
          ),
          // A program that states its own costs. `proposedTotal` is not set
          // here — `EstimateRollupService.forceRecomputeProgram` below derives
          // it from these three, the one place entitled to write it.
          costMode:
            seed.costMode === 'DIRECT_COSTS'
              ? PPACostMode.DIRECT_COSTS
              : PPACostMode.ACTIVITY_CHILDREN,
          fundSources: (seed.fundSources ?? []).filter(
            (fund): fund is FundSource =>
              (Object.values(FundSource) as string[]).includes(fund),
          ),
          psProposedTotal: new Prisma.Decimal(seed.psProposedTotal ?? 0),
          mooeProposedTotal: new Prisma.Decimal(seed.mooeProposedTotal ?? 0),
          coProposedTotal: new Prisma.Decimal(seed.coProposedTotal ?? 0),
          // Derived by the resync below; never written directly (§7).
          tentativeAipReferenceCode: `~${randomUUID()}`,
          ...source(seed.sourceRow),
          createdByUserId: superAdmin.id,
        },
      });

      if (supporting.length > 0) {
        await tx.programSupportingOffice.createMany({
          data: supporting.map((officeId) => ({
            programId: program.id,
            officeId,
          })),
        });
      }

      await createClimateTag(tx, { programId: program.id }, seed.climate);
      await createFundAllocations(
        tx,
        { programId: program.id },
        seed.fundAllocations,
      );
      await createPATree(tx, program.id, seed.projectActivities, superAdmin.id);

      // Derives this program's code and, because its code moved off the
      // placeholder, all of its PA codes with it.
      await codes.resyncTentativeProgramCodes(
        {
          aipCycleId: cycle.id,
          officeId: office.id,
          papSectorId: office.papSectorId!,
        },
        tx,
      );

      // Fills cost-derived parents from their children (amounts *and* the union
      // of their fund sources) and the program's proposedTotal from its roots.
      // Without this, seeded programs sort and display as ₱0.
      await estimates.forceRecomputeProgram(program.id, tx);

      // A submitted-or-later program must carry a v1 snapshot: the real submit()
      // path writes one, and markHeadReviewed rejects programs without it.
      if (programStatus !== ProgramStatus.DRAFT) {
        const snapshot = await tx.program.findUnique({
          where: { id: program.id },
          include: {
            finishLine: true,
            papSector: true,
            sglgIndicator: true,
            office: { include: { cluster: true } },
            projectActivities: {
              orderBy: { orderIndex: 'asc' },
              include: {
                lineItems: { orderBy: { orderIndex: 'asc' } },
                climateChangeTag: {
                  include: { codes: { include: { ccetCode: true } } },
                },
              },
            },
          },
        });
        await tx.programVersion.create({
          data: {
            programId: program.id,
            version: 1,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            submittedByUserId: superAdmin.id,
          },
        });
      }
    }, TX_OPTIONS);

    created++;
    if (created % 25 === 0) console.log(`  … ${created} created`);
  }

  // ── 4. Report ─────────────────────────────────────────────────────────────
  const totals = await prisma.program.aggregate({
    where: { aipCycleId: cycle.id, deletedAt: null },
    _sum: { proposedTotal: true },
    _count: true,
  });
  const flagged = await prisma.program.count({
    where: {
      aipCycleId: cycle.id,
      deletedAt: null,
      NOT: { importWarnings: { equals: [] } },
    },
  });

  console.log(`\n  created  ${created}`);
  console.log(`  skipped  ${skipped} (already present)`);
  if (problems.length > 0) {
    console.log(`\n  ${problems.length} program(s) could not be seeded:`);
    for (const problem of problems.slice(0, 30))
      console.log(`    - ${problem}`);
    if (problems.length > 30) {
      console.log(`    … and ${problems.length - 30} more`);
    }
  }
  console.log(
    `\n  cycle ${TARGET_YEAR} now holds ${totals._count} program(s), ` +
      `₱${(totals._sum.proposedTotal ?? new Prisma.Decimal(0)).toFixed(2)} proposed`,
  );
  console.log(
    `  ${flagged} awaiting import review (an inferred finish line, a merge, ` +
      `or a synthesised heading — clear with "Mark import reviewed")`,
  );
  console.log(
    '  data gaps are not counted here: they are derived per read and show up ' +
      'as advisory warnings on each program',
  );

  if (problems.length > 0) process.exitCode = 1;
}

/**
 * Creates a PA subtree, parents before children so `parentProjectActivityId`
 * always resolves. Codes are placeholders — the caller's resync derives them.
 */
async function createPATree(
  tx: Tx,
  programId: string,
  rows: PASeed[],
  userId: string,
  parentId: string | null = null,
): Promise<void> {
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const children = row.children ?? [];

    const pa = await tx.projectActivity.create({
      data: {
        programId,
        parentProjectActivityId: parentId,
        type: row.type,
        // Trust the row's own shape: the workbook mixes two- and three-level
        // structures freely and the portal supports both.
        costMode:
          row.costMode ??
          (children.length > 0
            ? PPACostMode.ACTIVITY_CHILDREN
            : PPACostMode.DIRECT_COSTS),
        name: row.name,
        expectedOutput: row.expectedOutput ?? null,
        fundSources: (row.fundSources ?? []) as FundSource[],
        proposedBudget: dec(row.proposedBudget),
        psEstimate: dec(row.psEstimate),
        mooeEstimate: dec(row.mooeEstimate),
        coEstimate: dec(row.coEstimate),
        implementationStartMonth: row.implementationStartMonth,
        implementationStartYear: row.implementationStartYear,
        implementationEndMonth: row.implementationEndMonth,
        implementationEndYear: row.implementationEndYear,
        orderIndex: index,
        tentativeAipReferenceCode: `~${randomUUID()}`,
        ...source(row.sourceRow),
        createdByUserId: userId,
      },
    });

    await createClimateTag(tx, { projectActivityId: pa.id }, row.climate);
    await createFundAllocations(
      tx,
      { projectActivityId: pa.id },
      row.fundAllocations,
    );

    if (children.length > 0) {
      await createPATree(tx, programId, children, userId, pa.id);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
