import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AIPCycleStatus, FundSource, Prisma } from '../generated/prisma/index';
import { LIVE_PROGRAM } from '../programs/program-filters.js';

/**
 * The city-wide AIP progress tracker behind `GET /dashboard/summary`.
 *
 * Two deliberate departures from the rest of the codebase, both load-bearing:
 *
 * 1. **No visibility scoping.** Every other program read runs through
 *    `ProgramsService.buildVisibilityWhere`, which limits STAFF/HEAD to their own
 *    office and cluster. This one does not, on purpose: the whole point is that
 *    every office sees the same denominator. Adding scoping here would silently
 *    give each role a different, partial city and make the percentages
 *    incomparable between users.
 *
 * 2. **Published means `publishedVersionId != null`**, never a status list.
 *    This mirrors `PUBLICLY_VISIBLE` in `public.service.ts` — PUBLISHED and
 *    PUBLISHED_REVISION are both live to the public, and keying on the snapshot
 *    pointer means the dashboard cannot drift from the public registry.
 *
 * Money is `proposedTotal`, matching the public registry's total
 * (`public.service.ts` → `_sum.proposedTotal`). `grandTotal` is structurally 0
 * while line-item entry is deferred, so summing it — as the old dashboard did —
 * renders every peso figure as ₱0.
 */

// ─── shapes ──────────────────────────────────────────────────────────────────

/** The per-program columns the aggregation needs. */
export interface DashboardProgramRow {
  officeId: string | null;
  finishLineId: string;
  publishedVersionId: string | null;
  publishedAt: Date | null;
  proposedTotal: Prisma.Decimal;
  psProposedTotal: Prisma.Decimal;
  mooeProposedTotal: Prisma.Decimal;
  feProposedTotal: Prisma.Decimal;
  coProposedTotal: Prisma.Decimal;
  finishLine: {
    id: string;
    name: string;
    color: string | null;
    visionNumber: number | null;
  };
  /**
   * Fund columns and PPA count, for the fund breakdown: a program with no PPAs
   * states its own costs, so it is its own funding entry.
   */
  fundSources?: FundSource[];
  fundAllocations?: DashboardPARow['fundAllocations'];
  _count?: { projectActivities: number };
}

/** The per-PPA columns the fund-source aggregation needs. */
export interface DashboardPARow {
  proposedBudget: Prisma.Decimal | null;
  fundSources: FundSource[];
  /** The per-fund split, when the PPA states one. */
  fundAllocations?: {
    fundSource: FundSource;
    ps: Prisma.Decimal;
    mooe: Prisma.Decimal;
    fe: Prisma.Decimal;
    co: Prisma.Decimal;
  }[];
}

/** The per-office columns the aggregation needs. */
export interface DashboardOfficeRow {
  id: string;
  acronym: string;
  name: string;
  cluster: { id: string; name: string };
}

export interface MoneyBucket {
  total: string;
  ps: string;
  mooe: string;
  fe: string;
  co: string;
}

/** `key` is a `FundSource` value, or `MULTIPLE` / `NONE` — see `aggregateFundSources`. */
export interface FundSourceTotal {
  key: string;
  total: string;
}

export interface DashboardSummary {
  cycleId: string;
  fiscalYear: number;
  cycleStatus: AIPCycleStatus;
  totals: {
    programs: number;
    drafts: number;
    published: number;
    /** Legacy SUPER_ADMIN-created rows with no owning office. */
    unassignedPrograms: number;
  };
  budget: { published: MoneyBucket; draft: MoneyBucket };
  /** Published + draft combined, so it reconciles with `budget`. Descending, `MULTIPLE`/`NONE` last. */
  byFundSource: FundSourceTotal[];
  byFinishLine: Array<{
    finishLineId: string;
    name: string;
    color: string | null;
    visionNumber: number | null;
    published: { count: number; total: string };
    draft: { count: number; total: string };
  }>;
  byCluster: Array<{
    clusterId: string;
    name: string;
    officeCount: number;
    officesWithPublished: number;
    offices: Array<{
      officeId: string;
      acronym: string;
      name: string;
      total: number;
      drafts: number;
      published: number;
    }>;
  }>;
  officesWithNoSubmissions: Array<{
    id: string;
    acronym: string;
    name: string;
    clusterName: string;
  }>;
  /** ISO-Monday buckets, gap-filled with zeroes. Empty when nothing is published. */
  publishedByWeek: Array<{ weekStart: string; count: number }>;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const zeroMoney = () => ({
  total: new Prisma.Decimal(0),
  ps: new Prisma.Decimal(0),
  mooe: new Prisma.Decimal(0),
  fe: new Prisma.Decimal(0),
  co: new Prisma.Decimal(0),
});

type MutableMoney = ReturnType<typeof zeroMoney>;

function addMoney(bucket: MutableMoney, row: DashboardProgramRow) {
  bucket.total = bucket.total.plus(row.proposedTotal);
  bucket.ps = bucket.ps.plus(row.psProposedTotal);
  bucket.mooe = bucket.mooe.plus(row.mooeProposedTotal);
  bucket.fe = bucket.fe.plus(row.feProposedTotal);
  bucket.co = bucket.co.plus(row.coProposedTotal);
}

function serializeMoney(bucket: MutableMoney): MoneyBucket {
  return {
    total: bucket.total.toFixed(2),
    ps: bucket.ps.toFixed(2),
    mooe: bucket.mooe.toFixed(2),
    fe: bucket.fe.toFixed(2),
    co: bucket.co.toFixed(2),
  };
}

/** UTC Monday of the week containing `date`, as `YYYY-MM-DD`. */
export function isoWeekStart(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // getUTCDay: 0 = Sunday. Shift so Monday is the start of the week.
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/**
 * Fills the weeks between the first publication and `now` with explicit zeroes.
 * Without this the area chart draws a straight line across a quiet fortnight,
 * which reads as steady progress rather than as nothing happening.
 */
function fillWeeks(
  counts: Map<string, number>,
  now: Date,
): Array<{ weekStart: string; count: number }> {
  if (counts.size === 0) return [];
  const first = [...counts.keys()].sort()[0];
  const out: Array<{ weekStart: string; count: number }> = [];
  const cursor = new Date(`${first}T00:00:00.000Z`);
  const end = new Date(`${isoWeekStart(now)}T00:00:00.000Z`);
  // ponytail: bounded by weeks-since-first-publish within one fiscal year.
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ weekStart: key, count: counts.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return out;
}

// ─── aggregation (pure — see dashboard.service.spec.ts) ──────────────────────

/**
 * Proposed budget per fund source, over funding entries: leaf PPAs, plus every
 * program with no PPAs (see `fundingEntries`).
 *
 * `fundSources` is a multi-valued enum with no per-fund amount — the budget office
 * lists the funds a PPA draws on, it never splits the estimate across them (see the
 * `FundSource` doc in schema.prisma). So a PPA naming two funds gets its own
 * `MULTIPLE` bucket: adding its full amount to each fund would double-count, and
 * dividing it would invent a split the city never made. Do not "fix" this into a
 * split — the totals here sum to the same grand total as `budget`, and that is the
 * property that makes the two cards comparable.
 *
 * The exception is a PPA split by fund (`fundAllocations`): it states what each
 * fund pays, so each line goes to its own fund.
 *
 * `NONE` is the legacy/imported rows that carry no fund at all. The Excel export
 * defaults those to GF; the dashboard deliberately does not, because that would hide
 * how much of the budget has no fund recorded.
 */
export function aggregateFundSources(
  paRows: DashboardPARow[],
): FundSourceTotal[] {
  const totals = new Map<string, Prisma.Decimal>();

  for (const pa of paRows) {
    // A PPA that states what each fund pays lands in each fund exactly.
    if (pa.fundAllocations?.length) {
      for (const line of pa.fundAllocations)
        totals.set(
          line.fundSource,
          (totals.get(line.fundSource) ?? new Prisma.Decimal(0))
            .plus(line.ps)
            .plus(line.mooe)
            .plus(line.fe)
            .plus(line.co),
        );
      continue;
    }
    if (!pa.proposedBudget) continue;
    const key =
      pa.fundSources.length === 0
        ? 'NONE'
        : pa.fundSources.length === 1
          ? pa.fundSources[0]
          : 'MULTIPLE';
    totals.set(
      key,
      (totals.get(key) ?? new Prisma.Decimal(0)).plus(pa.proposedBudget),
    );
  }

  // The two synthetic buckets sort last regardless of size — they are data
  // qualities, not funds, and reading them as the top fund would be wrong.
  const rank = (k: string) => (k === 'NONE' ? 2 : k === 'MULTIPLE' ? 1 : 0);

  return [...totals.entries()]
    .map(([key, total]) => ({ key, total, out: total.toFixed(2) }))
    .sort((a, b) => rank(a.key) - rank(b.key) || b.total.comparedTo(a.total))
    .map(({ key, out }) => ({ key, total: out }));
}

/**
 * The rows that carry funds. A program that rolls up from PPAs is covered by its
 * leaf PPAs; a program that states its own costs holds **no PPAs at all**, so it
 * is its own entry — the same rule as the public Overview (`budget-overview.ts`).
 * Reading PPAs alone dropped 396 of 492 published 2027 programs (₱2.54B), and the
 * breakdown summed to far less than the dashboard's own total. A ₱0 program with
 * no PPAs (a fresh draft) is skipped, so it opens no empty `NONE` bucket.
 */
export function fundingEntries(
  rows: DashboardProgramRow[],
  paRows: DashboardPARow[],
): DashboardPARow[] {
  const ownEntries = rows
    .filter(
      (r) => r._count?.projectActivities === 0 && !r.proposedTotal.isZero(),
    )
    .map((r) => ({
      proposedBudget: r.proposedTotal,
      fundSources: r.fundSources ?? [],
      fundAllocations: r.fundAllocations,
    }));
  return [...paRows, ...ownEntries];
}

export function aggregateDashboard(
  cycle: { id: string; fiscalYear: number; status: AIPCycleStatus },
  rows: DashboardProgramRow[],
  offices: DashboardOfficeRow[],
  now: Date = new Date(),
  paRows: DashboardPARow[] = [],
): DashboardSummary {
  const publishedMoney = zeroMoney();
  const draftMoney = zeroMoney();

  type FLAcc = {
    name: string;
    color: string | null;
    visionNumber: number | null;
    publishedCount: number;
    publishedTotal: Prisma.Decimal;
    draftCount: number;
    draftTotal: Prisma.Decimal;
  };
  const finishLines = new Map<string, FLAcc>();

  type OfficeAcc = { total: number; drafts: number; published: number };
  const officeCounts = new Map<string, OfficeAcc>();

  const weekCounts = new Map<string, number>();

  let published = 0;
  let unassignedPrograms = 0;

  for (const row of rows) {
    const isPublished = row.publishedVersionId !== null;
    if (isPublished) published += 1;

    addMoney(isPublished ? publishedMoney : draftMoney, row);

    const fl = finishLines.get(row.finishLineId) ?? {
      name: row.finishLine.name,
      color: row.finishLine.color,
      visionNumber: row.finishLine.visionNumber,
      publishedCount: 0,
      publishedTotal: new Prisma.Decimal(0),
      draftCount: 0,
      draftTotal: new Prisma.Decimal(0),
    };
    if (isPublished) {
      fl.publishedCount += 1;
      fl.publishedTotal = fl.publishedTotal.plus(row.proposedTotal);
    } else {
      fl.draftCount += 1;
      fl.draftTotal = fl.draftTotal.plus(row.proposedTotal);
    }
    finishLines.set(row.finishLineId, fl);

    if (row.officeId === null) {
      unassignedPrograms += 1;
    } else {
      const acc = officeCounts.get(row.officeId) ?? {
        total: 0,
        drafts: 0,
        published: 0,
      };
      acc.total += 1;
      if (isPublished) acc.published += 1;
      else acc.drafts += 1;
      officeCounts.set(row.officeId, acc);
    }

    if (isPublished && row.publishedAt) {
      const key = isoWeekStart(row.publishedAt);
      weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
    }
  }

  // Clusters are built from the **active office list**, not from programs, so an
  // office that has submitted nothing still counts against its cluster's
  // denominator instead of disappearing from the tracker entirely.
  type ClusterAcc = {
    name: string;
    offices: DashboardSummary['byCluster'][number]['offices'];
    officesWithPublished: number;
  };
  const clusters = new Map<string, ClusterAcc>();
  const officesWithNoSubmissions: DashboardSummary['officesWithNoSubmissions'] =
    [];

  for (const office of offices) {
    const counts = officeCounts.get(office.id) ?? {
      total: 0,
      drafts: 0,
      published: 0,
    };
    const acc = clusters.get(office.cluster.id) ?? {
      name: office.cluster.name,
      offices: [],
      officesWithPublished: 0,
    };
    acc.offices.push({
      officeId: office.id,
      acronym: office.acronym,
      name: office.name,
      total: counts.total,
      drafts: counts.drafts,
      published: counts.published,
    });
    if (counts.published > 0) acc.officesWithPublished += 1;
    clusters.set(office.cluster.id, acc);

    if (counts.total === 0) {
      officesWithNoSubmissions.push({
        id: office.id,
        acronym: office.acronym,
        name: office.name,
        clusterName: office.cluster.name,
      });
    }
  }

  return {
    cycleId: cycle.id,
    fiscalYear: cycle.fiscalYear,
    cycleStatus: cycle.status,
    totals: {
      programs: rows.length,
      drafts: rows.length - published,
      published,
      unassignedPrograms,
    },
    budget: {
      published: serializeMoney(publishedMoney),
      draft: serializeMoney(draftMoney),
    },
    byFundSource: aggregateFundSources(fundingEntries(rows, paRows)),
    byFinishLine: [...finishLines.entries()]
      .map(([finishLineId, fl]) => ({
        finishLineId,
        name: fl.name,
        color: fl.color,
        visionNumber: fl.visionNumber,
        published: {
          count: fl.publishedCount,
          total: fl.publishedTotal.toFixed(2),
        },
        draft: { count: fl.draftCount, total: fl.draftTotal.toFixed(2) },
      }))
      .sort((a, b) => (a.visionNumber ?? 99) - (b.visionNumber ?? 99)),
    byCluster: [...clusters.entries()]
      .map(([clusterId, c]) => ({
        clusterId,
        name: c.name,
        officeCount: c.offices.length,
        officesWithPublished: c.officesWithPublished,
        offices: c.offices,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    officesWithNoSubmissions,
    publishedByWeek: fillWeeks(weekCounts, now),
  };
}

// ─── service ─────────────────────────────────────────────────────────────────

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(cycleId?: string): Promise<DashboardSummary> {
    const cycle = cycleId
      ? await this.prisma.aIPCycle.findUnique({
          where: { id: cycleId },
          select: { id: true, fiscalYear: true, status: true },
        })
      : await this.resolveActiveCycle();
    if (!cycle) throw new NotFoundException('No AIP cycle found');

    const [rows, offices, paRows] = await Promise.all([
      // ponytail: whole-cycle scan aggregated in JS. A city AIP cycle is
      // hundreds of rows, and the per-row published/draft split makes a groupBy
      // awkward (Prisma has no conditional aggregates). If a cycle ever passes
      // ~10k programs, move this to $queryRaw with
      // `SUM(...) FILTER (WHERE published_version_id IS NOT NULL)`.
      this.prisma.program.findMany({
        where: { aipCycleId: cycle.id, ...LIVE_PROGRAM },
        select: {
          officeId: true,
          finishLineId: true,
          publishedVersionId: true,
          publishedAt: true,
          proposedTotal: true,
          psProposedTotal: true,
          mooeProposedTotal: true,
          feProposedTotal: true,
          coProposedTotal: true,
          finishLine: {
            select: {
              id: true,
              name: true,
              color: true,
              visionNumber: true,
            },
          },
          fundSources: true,
          fundAllocations: {
            select: {
              fundSource: true,
              ps: true,
              mooe: true,
              fe: true,
              co: true,
            },
          },
          _count: { select: { projectActivities: true } },
        },
      }),
      this.prisma.office.findMany({
        where: { isActive: true },
        select: {
          id: true,
          acronym: true,
          name: true,
          cluster: { select: { id: true, name: true } },
        },
        orderBy: [{ cluster: { name: 'asc' } }, { acronym: 'asc' }],
      }),
      // Leaves only: an ACTIVITY_CHILDREN parent's proposedBudget is the sum of its
      // children and its fundSources their union (estimate-rollup.service.ts), so
      // including parents would double-count the tree and attribute money to a fund
      // list nobody entered. Depth-agnostic, and the leaf sum equals the root sum.
      //
      // ponytail: same whole-cycle-scan-and-fold-in-JS shape as the program query
      // above. Postgres can group this, but Prisma cannot group by an element of a
      // scalar list, and the multi-fund bucketing is a per-row decision anyway. If a
      // cycle ever passes ~10k PPAs, move to $queryRaw keyed on array_length.
      this.prisma.projectActivity.findMany({
        where: {
          program: { aipCycleId: cycle.id, ...LIVE_PROGRAM },
          children: { none: {} },
        },
        select: {
          proposedBudget: true,
          fundSources: true,
          fundAllocations: {
            select: {
              fundSource: true,
              ps: true,
              mooe: true,
              fe: true,
              co: true,
            },
          },
        },
      }),
    ]);

    return aggregateDashboard(cycle, rows, offices, undefined, paRows);
  }

  /** OPEN → PLANNING → newest, matching what the dashboard page used to do. */
  private async resolveActiveCycle() {
    const cycles = await this.prisma.aIPCycle.findMany({
      select: { id: true, fiscalYear: true, status: true },
      orderBy: { fiscalYear: 'desc' },
    });
    return (
      cycles.find((c) => c.status === AIPCycleStatus.OPEN) ??
      cycles.find((c) => c.status === AIPCycleStatus.PLANNING) ??
      cycles[0] ??
      null
    );
  }
}
