import { PPACostMode } from '../generated/prisma/index';
import type { FundSource, PapClass, Prisma } from '../generated/prisma/index';
import { ZERO } from './excel-style.js';

/**
 * Flattening a program's Project/Activity tree into printable rows, shared by
 * the cluster and complete-AIP .xlsx exports.
 *
 * The input types are structural rather than derived from either service's
 * Prisma query, so each can select what its own sheets need. The optional
 * members are the ones only the cluster export's Extended sheet reads.
 */

export type RowProjectActivity = {
  id: string;
  parentProjectActivityId: string | null;
  type: string;
  name: string;
  aipReferenceCode: string | null;
  tentativeAipReferenceCode: string;
  expectedOutput: string | null;
  fundSources: FundSource[];
  implementationStartMonth: number | null;
  implementationStartYear: number | null;
  implementationEndMonth: number | null;
  implementationEndYear: number | null;
  psEstimate: Prisma.Decimal | null;
  mooeEstimate: Prisma.Decimal | null;
  feEstimate: Prisma.Decimal | null;
  coEstimate: Prisma.Decimal | null;
  proposedBudget: Prisma.Decimal | null;
  orderIndex: number;
  createdAt: Date;
  climateChangeTag: RowClimateTag | null;
  fundAllocations?: RowFundAllocation[];
};

/** One line of a row's per-fund split. */
export type RowFundAllocation = {
  fundSource: FundSource;
  ps: Prisma.Decimal;
  mooe: Prisma.Decimal;
  fe: Prisma.Decimal;
  co: Prisma.Decimal;
};

/** How every export loads a row's per-fund split. */
export const FUND_ALLOCATION_INCLUDE = {
  orderBy: { orderIndex: 'asc' },
} as const;

/** A climate tag as the exports read it: amounts plus 0..n typology codes. */
export type RowClimateTag = {
  ccaAmount: Prisma.Decimal;
  ccmAmount: Prisma.Decimal;
  codes: { ccetCode: { code: string } }[];
};

/** The include every export uses to load a tag (PPA- or program-level). */
export const CLIMATE_TAG_INCLUDE = {
  include: { codes: { include: { ccetCode: { select: { code: true } } } } },
} as const;

const tagCodes = (tag: RowClimateTag | null | undefined) =>
  (tag?.codes ?? []).map((c) => c.ccetCode.code);

export type RowProgram = {
  papClass: PapClass | null;
  name: string;
  aipReferenceCode: string | null;
  tentativeAipReferenceCode: string;
  expectedOutput: string | null;
  implementationStartMonth: number | null;
  implementationStartYear: number | null;
  implementationEndMonth: number | null;
  implementationEndYear: number | null;
  office: { acronym: string } | null;
  supportingOffices?: { office: { acronym: string } }[];
  sdgGoals?: { sdgGoal: { code: string } }[];
  projectActivities: RowProjectActivity[];
  /**
   * Set when the program states its own costs rather than deriving them.
   * Optional so every existing caller keeps compiling and keeps its behaviour —
   * absent reads as the derived default.
   */
  costMode?: PPACostMode;
  fundSources?: FundSource[];
  psProposedTotal?: Prisma.Decimal | null;
  mooeProposedTotal?: Prisma.Decimal | null;
  feProposedTotal?: Prisma.Decimal | null;
  coProposedTotal?: Prisma.Decimal | null;
  proposedTotal?: Prisma.Decimal | null;
  /** A tag on the program itself — one that states its own costs, or a parent row. */
  climateChangeTag?: RowClimateTag | null;
  fundAllocations?: RowFundAllocation[];
};

export type ExportRow = {
  kind: 'PROGRAM' | 'PROJECT' | 'ACTIVITY';
  /** Parent grouping row (program, or a project with child activities): rendered as
   *  code + bold description only, with budget/schedule columns left blank. */
  isParent: boolean;
  /** Which of the three AIP sections this row prints under. Inherited from the
   *  owning program, so a program and its whole subtree stay together. */
  papClass: PapClass | null;
  /** Funds the row draws on. Empty on program rows and legacy data; the sheet
   *  falls back to GF, which is what it printed before the field existed. */
  fundSources: FundSource[];
  code: string;
  description: string;
  level: number;
  numbering: number[];
  implementingOfficeLabel: string;
  expectedOutput: string;
  startMonth: number | null;
  startYear: number | null;
  endMonth: number | null;
  endYear: number | null;
  // Phase 1 D17: money comes from the estimate/proposed family, never from the
  // line-item rollups (psTotal/grandTotal), which are structurally 0 while line
  // items are hidden. Same source the registry reads.
  psAmount: Prisma.Decimal;
  mooeAmount: Prisma.Decimal;
  feAmount: Prisma.Decimal;
  coAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  ccaTotal: Prisma.Decimal;
  ccmTotal: Prisma.Decimal;
  climateCodes: string[];
  /** SDG goal codes, inherited from the owning program onto every row of its
   *  subtree — the Extended sheet prints one row per entry, not per program. */
  sdgCodes: string[];
  /** A second (third…) funding line of the row above: fund and money only,
   *  printed under the same description the way the city's form writes it. */
  continuation?: boolean;
};

/**
 * A leaf row split by fund prints one line per fund: the first carries the
 * row, the rest only a fund and its money. Leaf totals still add up to the
 * row's, and each fund's money lands in its own Fund Source bucket.
 */
function byFund(
  row: ExportRow,
  lines: RowFundAllocation[] | undefined,
): ExportRow[] {
  if (!lines || lines.length < 2 || row.isParent) return [row];
  return lines.map((line, index) => ({
    ...row,
    ...(index > 0
      ? {
          continuation: true,
          code: '',
          description: '',
          expectedOutput: '',
          ccaTotal: ZERO,
          ccmTotal: ZERO,
          climateCodes: [],
        }
      : {}),
    fundSources: [line.fundSource],
    psAmount: line.ps,
    mooeAmount: line.mooe,
    feAmount: line.fe,
    coAmount: line.co,
    totalAmount: line.ps.plus(line.mooe).plus(line.fe).plus(line.co),
  }));
}

/** A record's issued code if it has one, else the derived tentative code. */
export function databaseAipCode(record: {
  aipReferenceCode: string | null;
  tentativeAipReferenceCode: string;
}): string {
  return record.aipReferenceCode ?? record.tentativeAipReferenceCode;
}

export function buildImplementingOfficeLabel(program: RowProgram): string {
  const owner = program.office?.acronym ?? '';
  const supporting = (program.supportingOffices ?? []).map(
    (support) => support.office.acronym,
  );
  return [...new Set([owner, ...supporting].filter(Boolean))].join(', ');
}

export function buildProgramRows(programs: RowProgram[]): ExportRow[] {
  return programs.flatMap((program, programIndex) => {
    const rows: ExportRow[] = [];
    const sdgCodes = (program.sdgGoals ?? []).map((r) => r.sdgGoal.code);
    const childMap = new Map<string, RowProjectActivity[]>();
    for (const activity of program.projectActivities) {
      const parentId = activity.parentProjectActivityId ?? '__root__';
      const existing = childMap.get(parentId) ?? [];
      existing.push(activity);
      childMap.set(parentId, existing);
    }
    for (const children of childMap.values()) {
      children.sort(
        (left, right) =>
          left.orderIndex - right.orderIndex ||
          left.createdAt.getTime() - right.createdAt.getTime(),
      );
    }

    const summariseActivity = (
      activity: RowProjectActivity,
      level: number,
      numbering: number[],
    ): ExportRow[] => {
      const childActivities = childMap.get(activity.id) ?? [];
      const descendants = childActivities.flatMap((child, childIndex) =>
        summariseActivity(child, level + 1, [...numbering, childIndex + 1]),
      );
      const ownClimateCodes = tagCodes(activity.climateChangeTag);
      const descendantClimateCodes = descendants.flatMap(
        (row) => row.climateCodes,
      );
      const climateCodes = [
        ...new Set([...ownClimateCodes, ...descendantClimateCodes]),
      ];
      const ccaTotal = descendants.reduce(
        (acc, row) => acc.plus(row.ccaTotal),
        activity.climateChangeTag?.ccaAmount ?? ZERO,
      );
      const ccmTotal = descendants.reduce(
        (acc, row) => acc.plus(row.ccmTotal),
        activity.climateChangeTag?.ccmAmount ?? ZERO,
      );
      const hasChildren = childActivities.length > 0;
      const own: ExportRow = {
        kind: activity.type === 'PROJECT' ? 'PROJECT' : 'ACTIVITY',
        isParent: hasChildren,
        papClass: program.papClass ?? null,
        fundSources: activity.fundSources ?? [],
        code: databaseAipCode(activity),
        description: activity.name,
        level,
        numbering,
        implementingOfficeLabel: buildImplementingOfficeLabel(program),
        expectedOutput: activity.expectedOutput ?? '',
        startMonth: activity.implementationStartMonth,
        startYear: activity.implementationStartYear,
        endMonth: activity.implementationEndMonth,
        endYear: activity.implementationEndYear,
        psAmount: hasChildren ? ZERO : (activity.psEstimate ?? ZERO),
        mooeAmount: hasChildren ? ZERO : (activity.mooeEstimate ?? ZERO),
        feAmount: hasChildren ? ZERO : (activity.feEstimate ?? ZERO),
        coAmount: hasChildren ? ZERO : (activity.coEstimate ?? ZERO),
        // Rows imported from the shortlist carry only a proposedBudget with
        // no per-expense-class split, so the total is its own column value.
        totalAmount: hasChildren ? ZERO : (activity.proposedBudget ?? ZERO),
        ccaTotal,
        ccmTotal,
        climateCodes,
        sdgCodes,
      };
      return [...byFund(own, activity.fundAllocations), ...descendants];
    };

    const descendants = (childMap.get('__root__') ?? []).flatMap(
      (activity, activityIndex) =>
        summariseActivity(activity, 1, [programIndex + 1, activityIndex + 1]),
    );
    // A program that states its own costs is a leaf: it carries the money and
    // `isParent` is already false, so the export's `!isParent` total filter
    // picks it up exactly once. A derived program still prints ₱0 on its
    // heading row, with the money on the PPAs beneath it.
    const statesOwnCosts = program.costMode === PPACostMode.DIRECT_COSTS;

    const programRow: ExportRow = {
      kind: 'PROGRAM',
      isParent: descendants.length > 0,
      papClass: program.papClass ?? null,
      fundSources: statesOwnCosts ? (program.fundSources ?? []) : [],
      code: databaseAipCode(program),
      description: program.name,
      level: 0,
      numbering: [programIndex + 1],
      implementingOfficeLabel: buildImplementingOfficeLabel(program),
      expectedOutput: program.expectedOutput ?? '',
      startMonth: program.implementationStartMonth,
      startYear: program.implementationStartYear,
      endMonth: program.implementationEndMonth,
      endYear: program.implementationEndYear,
      psAmount: statesOwnCosts ? (program.psProposedTotal ?? ZERO) : ZERO,
      mooeAmount: statesOwnCosts ? (program.mooeProposedTotal ?? ZERO) : ZERO,
      feAmount: statesOwnCosts ? (program.feProposedTotal ?? ZERO) : ZERO,
      coAmount: statesOwnCosts ? (program.coProposedTotal ?? ZERO) : ZERO,
      totalAmount: statesOwnCosts ? (program.proposedTotal ?? ZERO) : ZERO,
      // Root PPA rows already carry their subtree's climate amounts; adding
      // every descendant row would count a nested tag once per ancestor.
      ccaTotal: descendants
        .filter((row) => row.level === 1)
        .reduce(
          (acc, row) => acc.plus(row.ccaTotal),
          program.climateChangeTag?.ccaAmount ?? ZERO,
        ),
      ccmTotal: descendants
        .filter((row) => row.level === 1)
        .reduce(
          (acc, row) => acc.plus(row.ccmTotal),
          program.climateChangeTag?.ccmAmount ?? ZERO,
        ),
      climateCodes: [
        ...new Set([
          ...tagCodes(program.climateChangeTag),
          ...descendants.flatMap((row) => row.climateCodes),
        ]),
      ],
      sdgCodes,
    };
    rows.push(
      ...(statesOwnCosts
        ? byFund(programRow, program.fundAllocations)
        : [programRow]),
    );
    rows.push(...descendants);
    return rows;
  });
}
