import { BadRequestException } from '@nestjs/common';
import {
  BudgetDocumentKind,
  BudgetDocumentStatus,
  FundSource,
  PPACostMode,
  Prisma,
  type PapClass,
} from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  asProgramView,
  type BudgetItemNode,
} from '../budget-documents/budget-item-view.js';
import { ZERO } from './excel-style.js';
import { LIVE_PROGRAM } from '../programs/program-filters.js';

/**
 * The money LBP Forms 4 and 7 print, for one cycle and one fund (specs/008).
 *
 * Two choices are made at export (D10, D15):
 *
 * - **figures**: `working` reads each program's live row, drafts included;
 *   `published` reads its last published snapshot — a program being revised
 *   prints what the public sees, not the draft, and one never published is left
 *   out.
 * - **fund**: only money attributed to that fund prints. The rule is the one
 *   the dashboard, the public overview and the Fund Source sheet use
 *   (ARCHITECTURE-ESSENTIALS, invariant 21): a split row's fund line, or a
 *   single-fund row whose fund it is. A row with no fund counts as General Fund
 *   (D16, `DEFAULT_FUNDING_SOURCE`). An unsplit multi-fund row cannot be
 *   attributed and prints on no fund's form.
 *
 * Both readings go through one normaliser (`SheetProgram`), so the two forms,
 * the Word Annual Budget and the gap lists all read money the same way.
 */

/**
 * `document` (specs/012 D10) reads a finalized LEP or Ordinance instead of the
 * AIP: its PPAs, through `asProgramView`, in the same `SheetProgram` shape.
 */
export type LbpFigures = 'working' | 'published' | 'document';

export interface Money {
  ps: Prisma.Decimal;
  mooe: Prisma.Decimal;
  fe: Prisma.Decimal;
  co: Prisma.Decimal;
  total: Prisma.Decimal;
}

export const zeroMoney = (): Money => ({
  ps: ZERO,
  mooe: ZERO,
  fe: ZERO,
  co: ZERO,
  total: ZERO,
});

export const addMoney = (a: Money, b: Money): Money => ({
  ps: a.ps.plus(b.ps),
  mooe: a.mooe.plus(b.mooe),
  fe: a.fe.plus(b.fe),
  co: a.co.plus(b.co),
  total: a.total.plus(b.total),
});

/** One fund's line of a split row. */
export interface CostLine {
  fundSource: FundSource;
  ps: Prisma.Decimal;
  mooe: Prisma.Decimal;
  fe: Prisma.Decimal;
  co: Prisma.Decimal;
}

/** A row that can carry money: a program, or one of its PPAs. */
export interface Costed extends Money {
  fundSources: FundSource[];
  fundAllocations: CostLine[];
}

export interface SheetActivity extends Costed {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  majorFinalOutput: string;
  expectedOutput: string;
  target: string;
  orderIndex: number;
}

export interface SheetProgram extends Costed {
  id: string;
  /** The implementing office. */
  officeId: string | null;
  /** Set on a component program: the office whose sheet it prints on. */
  hostOfficeId: string | null;
  officeName: string | null;
  officeAcronym: string | null;
  papClass: PapClass | null;
  code: string;
  name: string;
  majorFinalOutput: string;
  expectedOutput: string;
  target: string;
  /** DIRECT_COSTS: the program row is the money; ACTIVITY_CHILDREN: its leaves are. */
  statesOwnCosts: boolean;
  activities: SheetActivity[];
}

/** The office a program's money belongs to on a form: its host, else its own. */
export const sheetOfficeId = (p: SheetProgram) => p.hostOfficeId ?? p.officeId;

// ─── Normalising a live row or a snapshot ────────────────────────────────────

type Json = Record<string, unknown>;

/** Live Decimals and snapshot strings alike; absent (a pre-FE snapshot) is 0. */
function dec(value: unknown): Prisma.Decimal {
  if (Prisma.Decimal.isDecimal(value)) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    try {
      return new Prisma.Decimal(value);
    } catch {
      return ZERO;
    }
  }
  return ZERO;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown) =>
  typeof value === 'string' ? value : null;
const list = (value: unknown): Json[] =>
  Array.isArray(value) ? (value as Json[]) : [];
const funds = (value: unknown): FundSource[] =>
  Array.isArray(value) ? (value as FundSource[]) : [];

const codeOf = (row: Json) =>
  textOrNull(row.aipReferenceCode) ?? text(row.tentativeAipReferenceCode);

function lines(value: unknown): CostLine[] {
  return list(value).map((line) => ({
    fundSource: line.fundSource as FundSource,
    ps: dec(line.ps),
    mooe: dec(line.mooe),
    fe: dec(line.fe),
    co: dec(line.co),
  }));
}

/**
 * A program as the forms read it. `row` is either the live Prisma row or a
 * `ProgramVersion.snapshot` — the snapshot *is* the raw row with its tree, so
 * the same keys apply; only the Decimals arrive as strings. `office` names
 * come from the live relation, since a name is not money.
 */
export function toSheetProgram(
  row: Json,
  office: { name: string; acronym: string } | null,
): SheetProgram {
  return {
    id: String(row.id),
    officeId: textOrNull(row.officeId),
    hostOfficeId: textOrNull(row.hostOfficeId),
    officeName: office?.name ?? null,
    officeAcronym: office?.acronym ?? null,
    papClass: (textOrNull(row.papClass) as PapClass | null) ?? null,
    code: codeOf(row),
    name: text(row.name),
    majorFinalOutput: text(row.majorFinalOutput),
    expectedOutput: text(row.expectedOutput),
    target: text(row.targetForBudgetYear),
    statesOwnCosts: row.costMode === PPACostMode.DIRECT_COSTS,
    fundSources: funds(row.fundSources),
    fundAllocations: lines(row.fundAllocations),
    ps: dec(row.psProposedTotal),
    mooe: dec(row.mooeProposedTotal),
    fe: dec(row.feProposedTotal),
    co: dec(row.coProposedTotal),
    total: dec(row.proposedTotal),
    activities: list(row.projectActivities).map((pa) => ({
      id: String(pa.id),
      parentId: textOrNull(pa.parentProjectActivityId),
      code: codeOf(pa),
      name: text(pa.name),
      majorFinalOutput: text(pa.majorFinalOutput),
      expectedOutput: text(pa.expectedOutput),
      target: text(pa.targetForBudgetYear),
      orderIndex: typeof pa.orderIndex === 'number' ? pa.orderIndex : 0,
      fundSources: funds(pa.fundSources),
      fundAllocations: lines(pa.fundAllocations),
      ps: dec(pa.psEstimate),
      mooe: dec(pa.mooeEstimate),
      fe: dec(pa.feEstimate),
      co: dec(pa.coEstimate),
      total: dec(pa.proposedBudget),
    })),
  };
}

/** PPAs nothing else hangs off — the rows that carry money. */
export function leafIds(program: SheetProgram): Set<string> {
  const parents = new Set(
    program.activities.map((a) => a.parentId).filter((id) => id !== null),
  );
  return new Set(
    program.activities.filter((a) => !parents.has(a.id)).map((a) => a.id),
  );
}

/**
 * The rows of a program that carry money: the program itself when it states
 * its own costs (or has no PPAs), else its leaf PPAs. Never both — a program's
 * figure is never re-derived (ARCHITECTURE-ESSENTIALS "proposedBudget").
 */
export function moneyRows(
  program: SheetProgram,
): (SheetProgram | SheetActivity)[] {
  if (program.statesOwnCosts || program.activities.length === 0)
    return [program];
  const leaves = leafIds(program);
  return program.activities.filter((a) => leaves.has(a.id));
}

// ─── Fund attribution ────────────────────────────────────────────────────────

const own = (row: Money): Money => ({
  ps: row.ps,
  mooe: row.mooe,
  fe: row.fe,
  co: row.co,
  total: row.total,
});

export interface Attribution {
  /** What this row contributes to the fund's form; null = nothing. */
  money: Money | null;
  /** No fund source set: counted as General Fund. */
  noFund: boolean;
  /** Unsplit with several funds: on no fund's form. */
  multiFund: boolean;
}

export function attribute(row: Costed, fund: FundSource): Attribution {
  if (row.fundAllocations.length) {
    const line = row.fundAllocations.find((l) => l.fundSource === fund);
    return {
      money: line
        ? {
            ps: line.ps,
            mooe: line.mooe,
            fe: line.fe,
            co: line.co,
            total: line.ps.plus(line.mooe).plus(line.fe).plus(line.co),
          }
        : null,
      noFund: false,
      multiFund: false,
    };
  }
  if (row.fundSources.length === 0)
    return {
      money: fund === FundSource.GF ? own(row) : null,
      noFund: true,
      multiFund: false,
    };
  if (row.fundSources.length === 1)
    return {
      money: row.fundSources[0] === fund ? own(row) : null,
      noFund: false,
      multiFund: false,
    };
  return { money: null, noFund: false, multiFund: true };
}

/** A row's money on `fund`'s form, zero when it has none there. */
export const moneyOnFund =
  (fund: FundSource) =>
  (row: Costed): Money =>
    attribute(row, fund).money ?? zeroMoney();

// ─── Gaps ────────────────────────────────────────────────────────────────────

export interface GapRow {
  officeAcronym: string;
  code: string;
  name: string;
  amount: Prisma.Decimal;
}

export interface LbpGaps {
  /** Working figures only: live programs never published. */
  unpublished: GapRow[];
  /** No fund source on a money row; counted as General Fund. */
  noFund: GapRow[];
  /** Unsplit multi-fund money rows; left off every fund's form. */
  multiFund: GapRow[];
}

/**
 * Every row whose fund attribution needed a call, plus (working figures) every
 * unpublished program. A PPA is listed under its program's code and its own
 * name, so an office can find it.
 */
export function gapsOf(
  programs: SheetProgram[],
  figures: LbpFigures,
  publishedIds: Set<string>,
): LbpGaps {
  const gaps: LbpGaps = { unpublished: [], noFund: [], multiFund: [] };
  for (const program of programs) {
    const office = program.officeAcronym ?? '';
    if (figures === 'working' && !publishedIds.has(program.id))
      gaps.unpublished.push({
        officeAcronym: office,
        code: program.code,
        name: program.name,
        amount: program.total,
      });
    for (const row of moneyRows(program)) {
      const { noFund, multiFund } = attribute(row, FundSource.GF);
      if (!noFund && !multiFund) continue;
      const entry: GapRow = {
        officeAcronym: office,
        code: row.code,
        name: row.name,
        amount: row.total,
      };
      (noFund ? gaps.noFund : gaps.multiFund).push(entry);
    }
  }
  return gaps;
}

/** The funds that carry money in these programs, in enum order; GF always. */
export function fundsWithMoney(programs: SheetProgram[]): FundSource[] {
  const seen = new Set<FundSource>([FundSource.GF]);
  for (const program of programs)
    for (const row of moneyRows(program)) {
      if (row.fundAllocations.length)
        row.fundAllocations.forEach((l) => seen.add(l.fundSource));
      else row.fundSources.forEach((f) => seen.add(f));
    }
  return Object.values(FundSource).filter((f) => seen.has(f));
}

// ─── Loading ─────────────────────────────────────────────────────────────────

const PROGRAM_INCLUDE = {
  office: { select: { id: true, name: true, acronym: true } },
  fundAllocations: { orderBy: { orderIndex: 'asc' } },
  projectActivities: {
    orderBy: { orderIndex: 'asc' },
    include: { fundAllocations: { orderBy: { orderIndex: 'asc' } } },
  },
  publishedVersion: { select: { snapshot: true } },
} satisfies Prisma.ProgramInclude;

export interface LoadedLbpPrograms {
  programs: SheetProgram[];
  /** Ids of programs with a published version, for the unpublished gap list. */
  publishedIds: Set<string>;
  /** Live rows read, for the export row cap. */
  rowCount: number;
}

/**
 * The cycle's programs whose sheet office (host, else own) is in `officeIds`,
 * read as `figures` asks. Ordered the way the registry and the Annual Budget
 * book print: papClass, then the office's own ranking.
 */
export async function loadLbpPrograms(
  prisma: PrismaService,
  cycleId: string,
  officeIds: string[] | 'ALL',
  figures: LbpFigures,
): Promise<LoadedLbpPrograms> {
  const rows = await prisma.program.findMany({
    where: {
      aipCycleId: cycleId,
      ...LIVE_PROGRAM,
      ...(officeIds === 'ALL'
        ? {}
        : {
            OR: [
              { hostOfficeId: { in: officeIds } },
              { hostOfficeId: null, officeId: { in: officeIds } },
            ],
          }),
      ...(figures === 'published' ? { publishedVersionId: { not: null } } : {}),
    },
    include: PROGRAM_INCLUDE,
    orderBy: [
      { papClass: { sort: 'asc', nulls: 'last' } },
      { orderIndex: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  // ponytail: published mode groups by the snapshot's office, filtered by the
  // live one; a program moved to another office mid-revision drops off both
  // sheets until republished. Filter in memory if that ever happens for real.
  const programs = rows.flatMap((row) => {
    const source =
      figures === 'published'
        ? (row.publishedVersion?.snapshot as Json | undefined)
        : (row as unknown as Json);
    // Published figures: a program never published has nothing to print.
    return source ? [toSheetProgram(source, row.office)] : [];
  });
  return {
    programs,
    publishedIds: new Set(
      rows.filter((r) => r.publishedVersionId).map((r) => r.id),
    ),
    rowCount: rows.reduce((n, r) => n + 1 + r.projectActivities.length, 0),
  };
}

const ITEM_NODE = {
  id: true,
  parentId: true,
  rootItemId: true,
  officeId: true,
  hostOfficeId: true,
  papClass: true,
  aipReferenceCode: true,
  name: true,
  majorFinalOutput: true,
  performanceIndicator: true,
  target: true,
  ps: true,
  mooe: true,
  fe: true,
  co: true,
  unsplit: true,
  total: true,
  fundSource: true,
  orderIndex: true,
} satisfies Prisma.BudgetItemSelect;

/**
 * A budget document's top-level PPAs whose sheet office (host, else own) is in
 * `officeIds`, each with its tree, as `SheetProgram`s in the book's order.
 * A document has no drafts, so every row counts as published.
 */
export async function loadDocumentPrograms(
  prisma: PrismaService,
  documentId: string,
  officeIds: string[] | 'ALL',
): Promise<LoadedLbpPrograms> {
  const roots = await prisma.budgetItem.findMany({
    where: {
      documentId,
      parentId: null,
      ...(officeIds === 'ALL'
        ? {}
        : {
            OR: [
              { hostOfficeId: { in: officeIds } },
              { hostOfficeId: null, officeId: { in: officeIds } },
            ],
          }),
    },
    select: {
      ...ITEM_NODE,
      office: { select: { id: true, name: true, acronym: true } },
    },
    orderBy: [
      { papClass: { sort: 'asc', nulls: 'last' } },
      { orderIndex: 'asc' },
    ],
  });
  const items = (await prisma.budgetItem.findMany({
    where: { documentId, rootItemId: { in: roots.map((r) => r.id) } },
    select: ITEM_NODE,
  })) as BudgetItemNode[];
  const treeOf = new Map<string, BudgetItemNode[]>();
  for (const i of items)
    treeOf.set(i.rootItemId, [...(treeOf.get(i.rootItemId) ?? []), i]);
  const programs = roots.map(({ office, ...root }) =>
    toSheetProgram(
      asProgramView(root, treeOf.get(root.id) ?? [root]).snapshot,
      office,
    ),
  );
  return {
    programs,
    publishedIds: new Set(programs.map((p) => p.id)),
    rowCount: items.length,
  };
}

/** What an export reads: the AIP's programs, or a budget document's PPAs. */
export interface LbpSource {
  cycleId: string;
  figures: LbpFigures;
  /** Required with `figures: 'document'`. */
  documentId?: string;
}

/**
 * The one dispatcher every LBP export loads through (specs/012 P6). A document
 * must belong to the cycle and be finalized: the LBP forms feed the LEP, so a
 * draft LEP is not a source, and a draft Ordinance is not yet the budget.
 */
export async function loadLbpSource(
  prisma: PrismaService,
  source: LbpSource,
  officeIds: string[] | 'ALL',
): Promise<LoadedLbpPrograms & { sourceLabel: string | null }> {
  if (source.figures !== 'document')
    return {
      ...(await loadLbpPrograms(
        prisma,
        source.cycleId,
        officeIds,
        source.figures,
      )),
      sourceLabel: null,
    };
  const doc = source.documentId
    ? await prisma.budgetDocument.findFirst({
        where: {
          id: source.documentId,
          budgetCycle: { aipCycle: { id: source.cycleId } },
        },
        select: {
          id: true,
          kind: true,
          status: true,
          budgetCycle: { select: { fiscalYear: true } },
        },
      })
    : null;
  if (!doc)
    throw new BadRequestException(
      'Choose a budget document of this fiscal year (documentId).',
    );
  if (doc.status === BudgetDocumentStatus.DRAFT)
    throw new BadRequestException(
      'That budget document is still a draft. Finalize it first, or export working figures.',
    );
  const loaded = await loadDocumentPrograms(prisma, doc.id, officeIds);
  return {
    ...loaded,
    sourceLabel:
      doc.kind === BudgetDocumentKind.ORDINANCE
        ? `FY${doc.budgetCycle.fiscalYear} Appropriation Ordinance (enacted)`
        : `FY${doc.budgetCycle.fiscalYear} Local Expenditure Program (submitted)`,
  };
}
