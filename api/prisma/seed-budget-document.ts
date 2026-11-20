/**
 * Seed an enacted budget as an ORDINANCE Budget Document (specs/012 P3,
 * docs/adr/0003), then enact it and retire the old Program rows.
 *
 *   1. seed     book JSON (+ the ordinance .xls)  →  DRAFT document
 *   2. verify   `verify-budget-document.ts`        →  must exit 0
 *   3. review   clear import warnings (staff viewer, or acknowledge in the API)
 *   4. --enact                                     →  ENACTED; comments move to it
 *   5. --retire-programs                           →  old 2026 Programs soft-deleted
 *      (--restore-programs undoes 5)
 *
 * Reads `ab-2026-book.json` (the output of `db:import:2026`) and plans PPAs with
 * the old seed's own grouping rules (`budget-document-plan.ts`). Where the old
 * 2026 Program and PA rows exist, their **ids are reused**: public links,
 * comments and tags carry over. A fresh database simply gets new ids.
 *
 * Re-running while the document is DRAFT replaces it (unseed + reseed). A
 * SUBMITTED or ENACTED document is never touched. `--dry-run` performs every
 * write in a transaction and rolls it back.
 *
 *   pnpm --filter api db:seed:document -- --year 2026 [--objects <ordinance.xls>]
 *        [--ordinance-number 2025-131] [--dry-run]
 *   pnpm --filter api db:seed:document -- --year 2026 --enact [--approved-at 2025-12-29]
 *   pnpm --filter api db:seed:document -- --year 2026 --retire-programs | --restore-programs
 *
 * A year the city portal posts only as the Mayor's proposal (FY2023–2025,
 * specs/017) is seeded as an LEP instead, and `--submit` makes it the year's
 * public Annual document — refused while any PPA carries an import warning:
 *
 *   pnpm --filter api db:seed:document -- --year 2025 --kind LEP --book prisma/data/ab-2025-book.json
 *   pnpm --filter api db:seed:document -- --year 2025 --kind LEP --submit [--submitted-at 2024-10-16]
 *
 * The rest of the book (receipts, Forms 5 and 6, printed totals, the by-object
 * lines' earlier-year columns; specs/017) comes with the seed, or is written onto
 * a document that already exists — even an enacted one, whose PPAs it never
 * touches — with `--backfill-sections` (refused if any office's budget-year
 * object total would change):
 *
 *   pnpm --filter api db:seed:document -- --year 2026 --backfill-sections --objects <ordinance.xls>
 *   pnpm --filter api db:seed:document -- --year 2025 --kind LEP --backfill-sections --sections prisma/data/ab-2025-sections.json
 *
 * On a SUBMITTED or ENACTED document a sections file whose import report lists
 * problems is refused unless `--accept-problems` (a reviewer's sign-off).
 *
 * Runs under tsx (it imports NestJS services). Against a remote database, run it
 * detached: a full seed holds one long transaction.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AIPCycleStatus,
  BudgetDocumentAuditAction,
  BudgetDocumentKind,
  BudgetDocumentStatus,
  Prisma,
  PrismaClient,
  Role,
} from '../src/generated/prisma/index';
import { BudgetDocumentsService } from '../src/budget-documents/budget-documents.service';
import {
  createAipCycle,
  ensureBudgetCycle,
} from '../src/budget-cycles/ensure-budget-cycle';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { OfficeScopeService } from '../src/permissions/office-scope.service';
import type { RegistryCacheService } from '../src/cache/registry-cache.service';
import { BOOK_PATH, readBook, type OfficeRow } from './ab-2026-book';
import {
  loadSpecialFundOffices,
  planBookItems,
  type OfficeProfile,
  type PlannedItem,
} from './budget-document-plan';
import {
  parseObjectSheets,
  readXls,
  type ObjectLinePlan,
  type ObjectSheetReport,
} from './budget-document-objects';
import {
  parseXlsBookSections,
  resolveAccount,
  type BookSections,
  type Provenance,
} from './budget-book-sections';
import 'dotenv/config';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const documents = new BudgetDocumentsService(
  prisma as unknown as PrismaService,
  {} as OfficeScopeService,
  {
    invalidatePublicRegistry: async () => {},
  } as unknown as RegistryCacheService,
);

const TX = { timeout: 600_000, maxWait: 30_000 };

/**
 * This script cannot clear the running API's cache (it is in-process, or in
 * Redis behind the API). Public pages pick the change up when their entries
 * expire (PUBLIC_REGISTRY_TTL_SECONDS, 5 minutes). Open data keys its cache by
 * the Ordinance id, so it switches on enactment by itself.
 */
const CACHE_NOTE =
  '  The public site shows this within 5 minutes (cache expiry); restart the API to see it at once.';

class Rollback extends Error {}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const year = Number(arg('year'));
  if (!Number.isInteger(year)) throw new Error('--year is required');
  const kind = (arg('kind') ?? 'ORDINANCE').toUpperCase() as BudgetDocumentKind;
  if (!Object.values(BudgetDocumentKind).includes(kind)) {
    throw new Error(`--kind must be ORDINANCE or LEP, not ${kind}.`);
  }
  if (kind === BudgetDocumentKind.LEP) {
    if (flag('enact') || flag('retire-programs') || flag('restore-programs'))
      throw new Error('An LEP is submitted (--submit), never enacted.');
    if (flag('submit')) return submit(year);
  } else if (flag('submit')) {
    throw new Error('An Ordinance is enacted (--enact), not submitted.');
  }
  if (flag('headers')) return headers(year, kind);
  if (flag('backfill-sections')) return backfill(year, kind);
  if (flag('enact')) return enact(year);
  if (flag('retire-programs')) return retire(year, false);
  if (flag('restore-programs')) return retire(year, true);
  return seed(year, kind);
}

// ─── 1. Seed ────────────────────────────────────────────────────────────────

const LABEL: Record<BudgetDocumentKind, string> = {
  ORDINANCE: 'Ordinance',
  LEP: 'LEP',
};

/** The book and its plan: PPAs, office headers and problems (shared by seed and backfill). */
async function planOf(year: number) {
  const book = readBook(arg('book') ? resolve(arg('book')!) : BOOK_PATH);
  if (book.fiscalYear !== year) {
    throw new Error(`The book is FY${book.fiscalYear}, not FY${year}.`);
  }
  const offices = (await prisma.office.findMany({
    select: {
      id: true,
      acronym: true,
      name: true,
      officeCode: true,
      papSectorId: true,
      clusterId: true,
    },
  })) as OfficeRow[];
  const clusters = await prisma.cluster.findMany({
    select: {
      id: true,
      finishLineClusters: { select: { finishLineId: true } },
    },
  });
  const fallback = await prisma.finishLine.findFirst({
    select: { id: true },
    orderBy: { visionNumber: 'asc' },
  });
  const finishLineByCluster = new Map(
    clusters.map((c) => [c.id, c.finishLineClusters[0]?.finishLineId ?? null]),
  );
  // specs/016: a year's special-fund sheets are seeded once their office
  // mapping is checked in; without one they stay out, as before.
  const specialOffices = loadSpecialFundOffices(year);
  const plan = planBookItems(
    book,
    offices,
    (clusterId) => finishLineByCluster.get(clusterId) ?? fallback?.id ?? null,
    specialOffices,
  );
  return { book, offices, plan, specialOffices };
}

/**
 * Each office's header block as this book prints it (`BudgetOfficeHeader`).
 * An office with several sheets takes each field from the first sheet that
 * prints it. The office's own header (its current one, printed on the AIP's
 * LBP Form 4) is never touched: seeding FY2023 after FY2026 used to overwrite
 * it with the older year's OCR text.
 */
async function writeOfficeHeaders(
  tx: Prisma.TransactionClient,
  documentId: string,
  profiles: OfficeProfile[],
  fileOf: (name: string, url?: string | null) => Promise<{ id: string }>,
  bookSourceId: string,
) {
  const byOffice = new Map<string, OfficeProfile>();
  for (const p of profiles) {
    const m = byOffice.get(p.officeId);
    if (!m) byOffice.set(p.officeId, { ...p });
    else {
      m.mandateLegalBasis ??= p.mandateLegalBasis;
      m.vision ??= p.vision;
      m.mission ??= p.mission;
      if (!m.organizationalOutcomes?.length)
        m.organizationalOutcomes = p.organizationalOutcomes;
    }
  }
  await tx.budgetOfficeHeader.deleteMany({ where: { documentId } });
  const data: Prisma.BudgetOfficeHeaderCreateManyInput[] = [];
  for (const p of byOffice.values()) {
    if (
      !p.mandateLegalBasis &&
      !p.vision &&
      !p.mission &&
      !p.organizationalOutcomes?.length
    )
      continue;
    data.push({
      documentId,
      officeId: p.officeId,
      mandateLegalBasis: p.mandateLegalBasis ?? null,
      vision: p.vision ?? null,
      mission: p.mission ?? null,
      organizationalOutcomes: p.organizationalOutcomes ?? [],
      sourceDocumentId: p.sourceFile
        ? (await fileOf(p.sourceFile, p.sourceUrl ?? null)).id
        : bookSourceId,
      sourcePage: p.sourceFile ? 1 : null,
      sourceRef: p.sheetName,
    });
  }
  if (data.length) await tx.budgetOfficeHeader.createMany({ data });
  return data.length;
}

async function seed(year: number, kind: BudgetDocumentKind) {
  const { book, offices, plan, specialOffices } = await planOf(year);
  const admin = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN },
    select: { id: true },
  });
  if (!admin) throw new Error('No SUPER_ADMIN user; run the base seed first.');

  console.log(
    specialOffices
      ? `  special-fund sheets: seeded, offices from special-fund-offices-${year}.json`
      : `  special-fund sheets: left out (no special-fund-offices-${year}.json)`,
  );

  // ── Old ids: the 2026 Program and PA rows the old seed wrote ──
  const aipCycle = await prisma.aIPCycle.findUnique({
    where: { fiscalYear: year },
  });
  const oldPrograms = aipCycle
    ? await prisma.program.findMany({
        where: { aipCycleId: aipCycle.id },
        select: {
          id: true,
          officeId: true,
          aipReferenceCode: true,
          name: true,
          importWarnings: true,
          projectActivities: { select: { id: true, orderIndex: true } },
          thematicTags: { select: { tagId: true, appliedByUserId: true } },
        },
      })
    : [];
  const byCode = new Map<string, (typeof oldPrograms)[number]>();
  const byName = new Map<string, (typeof oldPrograms)[number]>();
  for (const p of oldPrograms) {
    if (p.aipReferenceCode)
      byCode.set(`${p.officeId}|${p.aipReferenceCode}`, p);
    else byName.set(`${p.officeId}|${p.name.toLowerCase()}`, p);
  }
  const paTags = new Map(
    (
      await prisma.projectActivityThematicTag.findMany({
        where: {
          projectActivity: { program: { aipCycleId: aipCycle?.id ?? '' } },
        },
        select: { projectActivityId: true, tagId: true, appliedByUserId: true },
      })
    ).reduce(
      (m, t) =>
        m.set(t.projectActivityId, [...(m.get(t.projectActivityId) ?? []), t]),
      new Map<string, { tagId: string; appliedByUserId: string }[]>(),
    ),
  );

  // Assign ids: reuse where the old row is found, otherwise new.
  const idOf = new Map<string, string>();
  const oldProgramOf = new Map<string, (typeof oldPrograms)[number]>();
  const sourceOf = new Map<string, { program?: string; pa?: string }>();
  const used = new Set<string>();
  let reused = 0;
  const unmatchedRoots: string[] = [];
  for (const item of plan.items) {
    let id: string | undefined;
    if (item.legacy.kind === 'program') {
      const l = item.legacy;
      const old =
        (l.code ? byCode.get(`${l.officeId}|${l.code}`) : undefined) ??
        byName.get(`${l.officeId}|${l.name.toLowerCase()}`);
      if (old && !used.has(old.id)) {
        id = old.id;
        oldProgramOf.set(item.key, old);
        sourceOf.set(item.key, { program: old.id });
      } else if (oldPrograms.length > 0) {
        unmatchedRoots.push(
          `${item.aipReferenceCode ?? '(uncoded)'} ${item.name}`,
        );
      }
    } else if (item.legacy.kind === 'pa') {
      const old = oldProgramOf.get(item.rootKey);
      const paIndex = item.legacy.paIndex;
      const pa = old?.projectActivities.find(
        (p) => p.orderIndex === paIndex + 1,
      );
      if (pa && !used.has(pa.id)) {
        id = pa.id;
        sourceOf.set(item.key, { pa: pa.id });
      }
    }
    if (id) reused++;
    id ??= randomUUID();
    used.add(id);
    idOf.set(item.key, id);
  }
  // A root's import warnings: the old program's, where it exists — that is
  // what this environment's staff have already reviewed (acknowledged rows are
  // empty). A fresh database gets the plan's.
  for (const item of plan.items) {
    const old = oldProgramOf.get(item.key);
    if (old) item.importWarnings = old.importWarnings;
  }

  const xls = arg('objects') ? readXls(resolve(arg('objects')!)) : null;
  const objects = xls ? parseObjectSheets(xls) : null;
  // The rest of the book (specs/017): from the same .xls, or a scanned book's
  // sections file (`--sections ab-<year>-sections.json`, from the OCR import).
  const sections: BookSections | null = arg('sections')
    ? (JSON.parse(
        readFileSync(resolve(arg('sections')!), 'utf8'),
      ) as BookSections)
    : xls
      ? parseXlsBookSections(xls)
      : null;
  const objectLines = objects?.lines ?? sections?.objectLines ?? null;
  const chart = new Set(
    (await prisma.chartAccount.findMany({ select: { code: true } })).map(
      (a) => a.code,
    ),
  );
  const officeByAcronym = new Map(offices.map((o) => [o.acronym, o.id]));
  const uacs = new Map(
    (
      await prisma.uACSObject.findMany({ select: { id: true, code: true } })
    ).map((u) => [u.code, u.id]),
  );

  const budgetCycle = await ensureBudgetCycle(prisma, year);
  const dryRun = flag('dry-run');
  // ponytail: the public site keys a year on its AIP cycle, so a year with no
  // AIP (one imported from scans) gets an empty, adopted one. Reading years off
  // the Budget Cycle instead is P8 work.
  if (!aipCycle && !dryRun) {
    await createAipCycle(prisma, {
      fiscalYear: year,
      status: AIPCycleStatus.ADOPTED,
      lockedAt: new Date(),
    });
    console.log(`  FY${year} had no AIP cycle: created an empty, adopted one.`);
  }
  let summary: {
    items: number;
    total: string;
    objectLines: number;
    receiptLines: number;
    loans: number;
    obligations: number;
    printedTotals: number;
    headers: number;
  } | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.budgetDocument.findUnique({
        where: {
          budgetCycleId_kind: { budgetCycleId: budgetCycle.id, kind },
        },
      });
      if (existing && existing.status !== BudgetDocumentStatus.DRAFT) {
        throw new Error(
          `FY${year}'s ${LABEL[kind]} is ${existing.status}; it is frozen and is not reseeded.`,
        );
      }
      if (existing)
        await tx.budgetDocument.delete({ where: { id: existing.id } });

      // Provenance: every row names the city's file it was read from (plus
      // `sourceRef`, the table/sheet and row). A .doc has no pages to cite.
      // A book read from the portal's PDFs has one file per sheet, each hosted
      // there: every row cites its own file and page, and links to it.
      const fileOf = (name: string, url: string | null = null) =>
        tx.sourceDocument.upsert({
          where: { name },
          create: { name, url },
          update: url ? { url } : {},
          select: { id: true },
        });
      const bookSource = await fileOf(
        book.sourceFile ?? `ab-${year}-book.json`,
      );
      const sheetSources = new Map<string, string>();
      for (const i of plan.items)
        if (i.sourceFile && !sheetSources.has(i.sourceFile))
          sheetSources.set(
            i.sourceFile,
            (await fileOf(i.sourceFile, i.sourceUrl)).id,
          );
      const objectsSource = arg('objects')
        ? await fileOf(resolve(arg('objects')!).split('/').pop()!)
        : null;

      const doc = await tx.budgetDocument.create({
        data: {
          budgetCycleId: budgetCycle.id,
          kind,
          sourceDocumentName: `ab-${year}-book.json${arg('objects') ? ` + ${resolve(arg('objects')!).split('/').pop()}` : ''}`,
          ...(kind === BudgetDocumentKind.ORDINANCE
            ? {
                ordinanceDetail: {
                  create: { ordinanceNumber: arg('ordinance-number') ?? null },
                },
              }
            : { lepDetail: { create: {} } }),
        },
      });

      // Parents before children: `createMany` may split into several statements.
      const byKey = new Map(plan.items.map((x) => [x.key, x]));
      const depth = (i: PlannedItem): number => {
        let d = 0;
        let k = i.parentKey;
        while (k) {
          d++;
          k = byKey.get(k)!.parentKey;
        }
        return d;
      };
      const ordered = [...plan.items].sort((a, b) => depth(a) - depth(b));
      await tx.budgetItem.createMany({
        data: ordered.map((i) => ({
          id: idOf.get(i.key)!,
          documentId: doc.id,
          parentId: i.parentKey ? idOf.get(i.parentKey)! : null,
          rootItemId: idOf.get(i.rootKey)!,
          officeId: i.officeId,
          hostOfficeId: i.hostOfficeId,
          finishLineId: i.finishLineId,
          papSectorId: i.papSectorId,
          papClass: i.papClass,
          fundSource: i.fundSource,
          aipReferenceCode: i.aipReferenceCode,
          name: i.name,
          majorFinalOutput: i.majorFinalOutput,
          performanceIndicator: i.performanceIndicator,
          target: i.target,
          ps: i.ps,
          mooe: i.mooe,
          fe: i.fe,
          co: i.co,
          unsplit: i.unsplit,
          // Own money to start with; recomputeTotals adds the children below.
          total: [i.ps, i.mooe, i.fe, i.co, i.unsplit]
            .reduce((t, v) => t.plus(v), new Prisma.Decimal(0))
            .toFixed(2),
          orderIndex: i.orderIndex,
          importWarnings: i.importWarnings,
          sourceRef: i.sourceRef,
          sourcePage: i.sourcePage,
          sourceDocumentId: i.sourceFile
            ? sheetSources.get(i.sourceFile)!
            : bookSource.id,
          sourceProgramId: sourceOf.get(i.key)?.program ?? null,
          sourceProjectActivityId: sourceOf.get(i.key)?.pa ?? null,
        })),
      });

      // Thematic tags carry over: a program's to its root, a PA's to its PPA,
      // and the old mirror PA's (the program row) to the root as well.
      const tagRows = new Map<
        string,
        { budgetItemId: string; tagId: string; appliedByUserId: string }
      >();
      for (const item of plan.items) {
        const itemId = idOf.get(item.key)!;
        const add = (t: { tagId: string; appliedByUserId: string }) =>
          tagRows.set(`${itemId}|${t.tagId}`, { budgetItemId: itemId, ...t });
        const old = oldProgramOf.get(item.key);
        if (old) {
          old.thematicTags.forEach(add);
          const mirror = old.projectActivities.find(
            (p) =>
              p.orderIndex === 1 &&
              !plan.items.some((x) => idOf.get(x.key) === p.id),
          );
          if (mirror) (paTags.get(mirror.id) ?? []).forEach(add);
        }
        const pa = sourceOf.get(item.key)?.pa;
        if (pa) (paTags.get(pa) ?? []).forEach(add);
      }
      if (tagRows.size > 0)
        await tx.budgetItemThematicTag.createMany({
          data: [...tagRows.values()],
        });

      // A line cites its own file and page when it has one (a scan), else the .xls.
      const locate = async (p: Provenance) =>
        p.sourceFile
          ? {
              sourceDocumentId: (
                await fileOf(p.sourceFile, p.sourceUrl ?? null)
              ).id,
              sourcePage: p.sourcePage ?? null,
              sourceRef: p.sourceRef,
            }
          : {
              sourceDocumentId: objectsSource?.id ?? null,
              sourcePage: null,
              sourceRef: p.sourceRef,
            };

      if (objectLines)
        plan.problems.push(
          ...(await writeObjectLines(
            tx,
            doc.id,
            objectLines,
            locate,
            officeByAcronym,
            uacs,
            chart,
          )),
        );

      if (sections) {
        await writeSections(
          tx,
          doc.id,
          sections,
          locate,
          officeByAcronym,
          chart,
        );
        plan.problems.push(...sections.problems);
      }

      const headers = await writeOfficeHeaders(
        tx,
        doc.id,
        plan.profiles,
        fileOf,
        bookSource.id,
      );

      await documents.recomputeTotals(doc.id, tx);
      const total = await tx.budgetItem.aggregate({
        where: { documentId: doc.id, parentId: null },
        _sum: { total: true },
      });
      summary = {
        items: plan.items.length,
        total: (total._sum.total ?? new Prisma.Decimal(0)).toFixed(2),
        objectLines: objectLines?.length ?? 0,
        receiptLines: sections?.receipts.length ?? 0,
        loans: sections?.indebtedness.length ?? 0,
        obligations: sections?.obligations.length ?? 0,
        printedTotals: sections?.printedTotals.length ?? 0,
        headers,
      };
      await documents.record(
        tx,
        doc.id,
        BudgetDocumentAuditAction.IMPORTED,
        admin.id,
        {
          ...summary,
          reusedIds: reused,
          flagged: plan.items.filter((i) => i.importWarnings.length > 0).length,
        },
      );
      if (dryRun) throw new Rollback();
    }, TX);
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }

  writeReport(
    year,
    kind,
    plan.items,
    plan.problems,
    unmatchedRoots,
    reused,
    objects?.reports ?? [],
    summary,
    sections,
    dryRun,
  );
  console.log(
    `${dryRun ? '[dry run, rolled back] ' : ''}FY${year} ${LABEL[kind]} (DRAFT): ${plan.items.length} PPAs, ` +
      `${reused} old ids reused, ${unmatchedRoots.length} old programs unmatched, ` +
      `${objectLines?.length ?? 0} object lines, ${sections?.receipts.length ?? 0} receipt lines, ` +
      `${sections?.indebtedness.length ?? 0} loans, ${sections?.obligations.length ?? 0} obligations, ` +
      `${sections?.printedTotals.length ?? 0} printed totals.`,
  );
  if (summary) {
    const { total, headers } = summary as { total: string; headers: number };
    console.log(`  total ₱${total}; office headers for ${headers} offices`);
  }
  if (plan.problems.length) {
    console.log(`${plan.problems.length} problem(s):`);
    plan.problems.forEach((p) => console.log(`  ⚠️  ${p}`));
    process.exitCode = 1;
  }
}

function writeReport(
  year: number,
  kind: BudgetDocumentKind,
  items: PlannedItem[],
  problems: string[],
  unmatchedRoots: string[],
  reused: number,
  sheets: ObjectSheetReport[],
  summary: {
    objectLines: number;
    receiptLines: number;
    loans: number;
    obligations: number;
    printedTotals: number;
    total: string;
  } | null,
  sections: BookSections | null,
  dryRun: boolean,
) {
  // The demo's Naga template (seed-demo-lgu.ts) reseeds the same book: it must not rewrite the checked-in report.
  if (process.env.BUDGET_DOCUMENT_NO_REPORT === '1') return;
  const flagged = items.filter((i) => i.importWarnings.length > 0);
  const path = resolve(
    __dirname,
    `../../docs/design/budget-document-${kind.toLowerCase()}-${year}-report.md`,
  );
  const lines = [
    `# FY${year} ${LABEL[kind]}: seed report`,
    '',
    `Generated by \`seed-budget-document.ts\`${dryRun ? ' (dry run)' : ''} on ${new Date().toISOString().slice(0, 10)}. specs/012 P3.`,
    '',
    `| | |`,
    `|---|---|`,
    `| PPAs planned | ${items.length} (${items.filter((i) => !i.parentKey).length} top-level) |`,
    `| Old ids reused | ${reused} |`,
    `| Total (Σ top-level) | ₱${summary?.total ?? '—'} |`,
    `| Object lines | ${summary?.objectLines ?? 0} |`,
    `| Receipt lines | ${summary?.receiptLines ?? 0} |`,
    `| Loans (Form 5) | ${summary?.loans ?? 0} |`,
    `| Obligations (Form 6) | ${summary?.obligations ?? 0} |`,
    `| Printed totals | ${summary?.printedTotals ?? 0} |`,
    `| PPAs with import warnings | ${flagged.length} |`,
    '',
    '## Old programs with no match',
    '',
    unmatchedRoots.length
      ? unmatchedRoots.map((r) => `- ${r}`).join('\n')
      : 'None.',
    '',
    '## By-object sheets (budget-year column vs printed total)',
    '',
    '| Sheet | Office | Lines | Σ lines | Printed | Ties |',
    '|---|---|---:|---:|---:|---|',
    ...sheets.map(
      (s) =>
        `| ${s.sheet} | ${s.officeAcronym} | ${s.lines} | ${s.sum} | ${s.printedTotal ?? '—'}${s.rolledUp ? ` (incl. ${s.rolledUp} roll-ups, not stored)` : ''} | ${s.matches === null ? '—' : s.matches ? 'yes' : '**no**'} |`,
    ),
    '',
    '## Totals the book prints (checked, never summed)',
    '',
    '| Kind | Scope | Label | Amount | Where |',
    '|---|---|---|---:|---|',
    ...(sections?.printedTotals ?? []).map(
      (t) =>
        `| ${t.kind} | ${t.scope} | ${t.label} | ${t.amount} | ${t.sourceRef}${t.sourcePage ? ` p.${t.sourcePage}` : ''} |`,
    ),
    '',
    `## Import warnings (must be reviewed before ${kind === BudgetDocumentKind.LEP ? 'submitting' : 'enacting'})`,
    '',
    flagged.length
      ? flagged
          .map(
            (i) =>
              `- \`${i.aipReferenceCode ?? '—'}\` ${i.name}: ${i.importWarnings.join(' ')}`,
          )
          .join('\n')
      : 'None.',
    '',
    '## Problems',
    '',
    problems.length ? problems.map((p) => `- ${p}`).join('\n') : 'None.',
    '',
  ];
  writeFileSync(path, lines.join('\n'));
  console.log(
    `  report: docs/design/budget-document-${kind.toLowerCase()}-${year}-report.md`,
  );
}

// ─── 4. Enact ───────────────────────────────────────────────────────────────

async function enact(year: number) {
  const doc = await ordinanceOf(year);
  const admin = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN },
    select: { id: true },
  });
  const approvedAt = arg('approved-at') ? new Date(arg('approved-at')!) : null;
  const moved = { comments: 0 };
  await documents.finalize(
    doc.id,
    admin?.id ?? null,
    async (tx) => {
      // Comments follow their rows: a program's to its root PPA (same id), a
      // PA-targeted comment to that PA's PPA (same id), or to the root when the
      // PA was the old mirror row.
      const itemIds = new Set(
        (
          await tx.budgetItem.findMany({
            where: { documentId: doc.id },
            select: { id: true },
          })
        ).map((i) => i.id),
      );
      const comments = await tx.programComment.findMany({
        where: { programId: { in: [...itemIds] } },
        select: { id: true, programId: true, targetType: true, targetId: true },
      });
      for (const c of comments) {
        const onPa =
          c.targetType === 'PROJECT_ACTIVITY' &&
          c.targetId &&
          itemIds.has(c.targetId);
        await tx.programComment.update({
          where: { id: c.id },
          data: {
            budgetItemId: onPa ? c.targetId! : c.programId!,
            programId: null,
            programVersionId: null,
          },
        });
      }
      moved.comments = comments.length;
      if (approvedAt) {
        await tx.ordinanceDetail.update({
          where: { documentId: doc.id },
          data: { approvedAt },
        });
      }
    },
    TX,
  );
  console.log(
    `FY${year} Ordinance ENACTED; ${moved.comments} comment(s) moved to its PPAs.`,
  );
  console.log(CACHE_NOTE);
}

// ─── 4b. Submit a historical LEP ───────────────────────────────────────────

/**
 * Makes a historical year's LEP its public Annual document (specs/017
 * FR-002). `finalize` refuses while any PPA carries an import warning.
 */
async function submit(year: number) {
  const doc = await documentOf(year, BudgetDocumentKind.LEP);
  const admin = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN },
    select: { id: true },
  });
  const submittedAt = arg('submitted-at')
    ? new Date(arg('submitted-at')!)
    : null;
  await documents.finalize(
    doc.id,
    admin?.id ?? null,
    async (tx) => {
      if (submittedAt)
        await tx.lepDetail.update({
          where: { documentId: doc.id },
          data: { submittedAt },
        });
    },
    TX,
  );
  console.log(`FY${year} LEP SUBMITTED; it is now the year's Annual document.`);
  console.log(CACHE_NOTE);
}

// ─── 5. Retire / restore the old Program rows ───────────────────────────────

async function retire(year: number, restore: boolean) {
  const doc = await ordinanceOf(year);
  if (doc.status !== BudgetDocumentStatus.ENACTED) {
    throw new Error(
      `Enact FY${year}'s Ordinance before ${restore ? 'restoring' : 'retiring'} its Program rows.`,
    );
  }
  const admin = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN },
    select: { id: true },
  });
  if (restore) {
    const last = await prisma.budgetDocumentAuditLog.findFirst({
      where: {
        documentId: doc.id,
        action: BudgetDocumentAuditAction.RETIRED_SOURCE,
      },
      orderBy: { createdAt: 'desc' },
    });
    const ids =
      (last?.detail as { programIds?: string[] } | null)?.programIds ?? [];
    await prisma.$transaction(async (tx) => {
      await tx.program.updateMany({
        where: { id: { in: ids } },
        data: { deletedAt: null },
      });
      await documents.record(
        tx,
        doc.id,
        BudgetDocumentAuditAction.RESTORED_SOURCE,
        admin?.id ?? null,
        { programIds: ids },
      );
    });
    console.log(`Restored ${ids.length} FY${year} Program row(s).`);
    return;
  }
  const aipCycle = await prisma.aIPCycle.findUnique({
    where: { fiscalYear: year },
  });
  const programs = aipCycle
    ? await prisma.program.findMany({
        where: { aipCycleId: aipCycle.id, deletedAt: null },
        select: { id: true },
      })
    : [];
  const ids = programs.map((p) => p.id);
  await prisma.$transaction(async (tx) => {
    await tx.program.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
    // Soft-deleted, not removed: their audit trail, versions and read state stay,
    // and `--restore-programs` puts them back (specs/012 OV-6).
    await documents.record(
      tx,
      doc.id,
      BudgetDocumentAuditAction.RETIRED_SOURCE,
      admin?.id ?? null,
      { programIds: ids },
    );
  });
  console.log(
    `Retired ${ids.length} FY${year} Program row(s) (soft-deleted; --restore-programs undoes it).`,
  );
  console.log(CACHE_NOTE);
}

async function documentOf(year: number, kind: BudgetDocumentKind) {
  const doc = await prisma.budgetDocument.findFirst({
    where: { kind, budgetCycle: { fiscalYear: year } },
  });
  if (!doc) throw new Error(`FY${year} has no ${LABEL[kind]}; seed it first.`);
  return doc;
}

const ordinanceOf = (year: number) =>
  documentOf(year, BudgetDocumentKind.ORDINANCE);

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());

// ─── The rest of the book (specs/017) ───────────────────────────────────────

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Receipts, Forms 5 and 6, and the printed totals. Receipt headings before
 * their rows, so a row's parent id exists when it is written; ids are made
 * here so one pass can link them.
 */
async function writeSections(
  tx: Tx,
  documentId: string,
  sections: BookSections,
  locate: Locate,
  officeByAcronym: Map<string, string>,
  chart: ReadonlySet<string>,
) {
  const idOf = new Map(sections.receipts.map((r) => [r.key, randomUUID()]));
  const receipts: Prisma.BudgetReceiptLineCreateManyInput[] = [];
  for (const [n, r] of sections.receipts.entries()) {
    const officeId = r.officeAcronym
      ? (officeByAcronym.get(r.officeAcronym) ?? null)
      : null;
    if (r.officeAcronym && !officeId)
      sections.problems.push(`receipts: no office ${r.officeAcronym}`);
    receipts.push({
      id: idOf.get(r.key)!,
      documentId,
      parentId: r.parentKey ? idOf.get(r.parentKey)! : null,
      officeId,
      particulars: r.particulars,
      printedCode: r.printedCode,
      ...resolveAccount(r.printedCode, chart),
      incomeClass: r.incomeClass,
      pastYearActual: r.pastYearActual,
      currentFirstSemActual: r.currentFirstSemActual,
      currentSecondSemEstimate: r.currentSecondSemEstimate,
      currentYearTotal: r.currentYearTotal,
      amount: r.amount,
      orderIndex: n,
      ...(await locate(r)),
    });
  }
  // Parents first: `createMany` may split into several statements.
  const depth = new Map<string, number>();
  for (const r of sections.receipts)
    depth.set(r.key, r.parentKey ? depth.get(r.parentKey)! + 1 : 0);
  const keyOfId = new Map<string, string>([...idOf].map(([k, id]) => [id, k]));
  receipts.sort(
    (a, b) => depth.get(keyOfId.get(a.id!)!)! - depth.get(keyOfId.get(b.id!)!)!,
  );
  await tx.budgetReceiptLine.createMany({ data: receipts });

  const rows = async <T extends Provenance>(xs: T[]) => {
    const out: (Omit<T, keyof Provenance> &
      Awaited<ReturnType<typeof locate>> & {
        documentId: string;
        orderIndex: number;
      })[] = [];
    for (const [n, x] of xs.entries()) {
      const {
        sourceFile: _f,
        sourceUrl: _u,
        sourcePage: _p,
        sourceRef: _r,
        ...rest
      } = x;
      out.push({ ...rest, documentId, orderIndex: n, ...(await locate(x)) });
    }
    return out;
  };
  await tx.budgetIndebtedness.createMany({
    data: await rows(sections.indebtedness),
  });
  await tx.budgetStatutoryObligation.createMany({
    data: await rows(sections.obligations),
  });
  await tx.budgetPrintedTotal.createMany({
    data: (await rows(sections.printedTotals)).map(
      ({ orderIndex: _o, ...t }) => t,
    ),
  });
}

async function writeObjectLines(
  tx: Tx,
  documentId: string,
  lines: ObjectLinePlan[],
  locate: Locate,
  officeByAcronym: Map<string, string>,
  uacs: Map<string, string>,
  chart: ReadonlySet<string>,
): Promise<string[]> {
  const missing = new Set<string>();
  const located: Awaited<ReturnType<Locate>>[] = [];
  for (const l of lines) located.push(await locate(l));
  await tx.budgetObjectLine.createMany({
    data: lines.flatMap((l, n) => {
      const officeId = officeByAcronym.get(l.officeAcronym);
      if (!officeId) {
        missing.add(l.officeAcronym);
        return [];
      }
      return [
        {
          documentId,
          officeId,
          uacsObjectId: uacs.get(l.uacsCode) ?? null,
          uacsCode: l.uacsCode,
          ...resolveAccount(l.uacsCode, chart),
          accountTitle: l.accountTitle,
          expenseClass: l.expenseClass,
          amount: l.amount,
          pastYearActual: l.pastYearActual,
          currentFirstSemActual: l.currentFirstSemActual ?? null,
          currentSecondSemEstimate: l.currentSecondSemEstimate ?? null,
          currentYearTotal: l.currentYearTotal,
          orderIndex: n,
          ...located[n],
        },
      ];
    }),
  });
  return missing.size
    ? [`object lines: no office for ${[...missing].join(', ')}`]
    : [];
}

type Locate = (p: Provenance) => Promise<{
  sourceDocumentId: string | null;
  sourcePage: number | null;
  sourceRef: string;
}>;

/**
 * Write each office's header block (mandate, vision, mission, outcomes) from the
 * book onto a document that already exists, whatever its status: headers are
 * text, not money, and the PPAs are not touched. Replaces the document's headers.
 */
async function headers(year: number, kind: BudgetDocumentKind) {
  const doc = await documentOf(year, kind);
  const { book, plan } = await planOf(year);
  let n = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const fileOf = (name: string, url: string | null = null) =>
        tx.sourceDocument.upsert({
          where: { name },
          create: { name, url },
          update: url ? { url } : {},
          select: { id: true },
        });
      const bookSource = await fileOf(
        book.sourceFile ?? `ab-${year}-book.json`,
      );
      n = await writeOfficeHeaders(
        tx,
        doc.id,
        plan.profiles,
        fileOf,
        bookSource.id,
      );
      if (flag('dry-run')) throw new Rollback();
    }, TX);
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log(
    `${flag('dry-run') ? '[dry run, rolled back] ' : ''}FY${year} ${LABEL[kind]} (${doc.status}): office headers for ${n} offices.`,
  );
}

/**
 * Write the rest of the book onto an existing document, whatever its status.
 * The PPAs are not touched. Object lines are replaced only if every office's
 * budget-year total stays the same to the centavo: the appropriation is the
 * enacted figure, and this only adds the columns printed beside it.
 */
async function backfill(year: number, kind: BudgetDocumentKind) {
  const doc = await documentOf(year, kind);
  const xls = arg('objects') ? readXls(resolve(arg('objects')!)) : null;
  const objects = xls ? parseObjectSheets(xls) : null;
  const sections: BookSections | null = arg('sections')
    ? (JSON.parse(
        readFileSync(resolve(arg('sections')!), 'utf8'),
      ) as BookSections)
    : xls
      ? parseXlsBookSections(xls)
      : null;
  if (!sections)
    throw new Error(
      '--backfill-sections needs --objects <xls> or --sections <json>.',
    );
  const objectLines = objects?.lines ?? sections.objectLines ?? null;
  const offices = await prisma.office.findMany({
    select: { id: true, acronym: true },
  });
  const officeByAcronym = new Map(offices.map((o) => [o.acronym, o.id]));
  const uacs = new Map(
    (
      await prisma.uACSObject.findMany({ select: { id: true, code: true } })
    ).map((u) => [u.code, u.id]),
  );
  const chart = new Set(
    (await prisma.chartAccount.findMany({ select: { code: true } })).map(
      (a) => a.code,
    ),
  );
  const admin = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN },
    select: { id: true },
  });
  const xlsName = arg('objects')
    ? resolve(arg('objects')!).split('/').pop()!
    : null;
  const problems = [...sections.problems];
  // Nothing unreviewed goes public (invariant 25): on a SUBMITTED or ENACTED
  // document the sections are on the public site at once, so a file whose
  // import report still lists problems needs a person's explicit say-so.
  if (
    doc.status !== BudgetDocumentStatus.DRAFT &&
    problems.length &&
    !flag('accept-problems')
  ) {
    throw new Error(
      `Refused: FY${year}'s ${LABEL[kind]} is ${doc.status} (public), and the sections file lists ${problems.length} problem(s). ` +
        'Review the import report, fix the JSON, or pass --accept-problems once a reviewer has signed off.',
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const fileOf = (name: string, url: string | null = null) =>
        tx.sourceDocument.upsert({
          where: { name },
          create: { name, url },
          update: url ? { url } : {},
          select: { id: true },
        });
      const xlsSource = xlsName ? await fileOf(xlsName) : null;
      const locate: Locate = async (p) =>
        p.sourceFile
          ? {
              sourceDocumentId: (
                await fileOf(p.sourceFile, p.sourceUrl ?? null)
              ).id,
              sourcePage: p.sourcePage ?? null,
              sourceRef: p.sourceRef,
            }
          : {
              sourceDocumentId: xlsSource?.id ?? null,
              sourcePage: null,
              sourceRef: p.sourceRef,
            };

      if (objectLines) {
        const byOffice = async () =>
          new Map(
            (
              await tx.budgetObjectLine.groupBy({
                by: ['officeId'],
                where: { documentId: doc.id },
                _sum: { amount: true },
              })
            ).map((g) => [
              g.officeId,
              (g._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
            ]),
          );
        const before = await byOffice();
        await tx.budgetObjectLine.deleteMany({ where: { documentId: doc.id } });
        problems.push(
          ...(await writeObjectLines(
            tx,
            doc.id,
            objectLines,
            locate,
            officeByAcronym,
            uacs,
            chart,
          )),
        );
        const after = await byOffice();
        if (before.size) {
          const changed = [
            ...new Set([...before.keys(), ...after.keys()]),
          ].filter((o) => before.get(o) !== after.get(o));
          if (changed.length)
            throw new Error(
              `Refused: the budget-year object total would change for ${changed.length} office(s) (${changed
                .map(
                  (o) =>
                    `${offices.find((x) => x.id === o)?.acronym}: ${before.get(o) ?? '0'} → ${after.get(o) ?? '0'}`,
                )
                .join('; ')}).`,
            );
        }
      }
      await tx.budgetReceiptLine.deleteMany({ where: { documentId: doc.id } });
      await tx.budgetIndebtedness.deleteMany({ where: { documentId: doc.id } });
      await tx.budgetStatutoryObligation.deleteMany({
        where: { documentId: doc.id },
      });
      await tx.budgetPrintedTotal.deleteMany({ where: { documentId: doc.id } });
      await writeSections(tx, doc.id, sections, locate, officeByAcronym, chart);
      await documents.record(
        tx,
        doc.id,
        BudgetDocumentAuditAction.IMPORTED,
        admin?.id ?? null,
        {
          backfill: 'sections',
          objectLines: objectLines?.length ?? 0,
          receiptLines: sections.receipts.length,
          loans: sections.indebtedness.length,
          obligations: sections.obligations.length,
          printedTotals: sections.printedTotals.length,
        },
      );
      if (flag('dry-run')) throw new Rollback();
    }, TX);
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log(
    `${flag('dry-run') ? '[dry run, rolled back] ' : ''}FY${year} ${LABEL[kind]} (${doc.status}): ` +
      `${objectLines?.length ?? 0} object lines, ${sections.receipts.length} receipt lines, ${sections.indebtedness.length} loans, ` +
      `${sections.obligations.length} obligations, ${sections.printedTotals.length} printed totals.`,
  );
  if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    problems.forEach((p) => console.log(`  ⚠️  ${p}`));
  }
}
