import {
  aggregateDashboard,
  aggregateFundSources,
  isoWeekStart,
  type DashboardOfficeRow,
  type DashboardPARow,
  type DashboardProgramRow,
} from './dashboard.service.js';
import { AIPCycleStatus, FundSource, Prisma } from '../generated/prisma/index';

const CYCLE = {
  id: 'cycle-1',
  fiscalYear: 2027,
  status: AIPCycleStatus.OPEN,
};

const FL = {
  id: 'fl-1',
  name: 'FL1',
  color: '#123456',
  visionNumber: 1,
};

function program(over: Partial<DashboardProgramRow> = {}): DashboardProgramRow {
  return {
    officeId: 'office-a',
    finishLineId: FL.id,
    publishedVersionId: null,
    publishedAt: null,
    proposedTotal: new Prisma.Decimal(0),
    psProposedTotal: new Prisma.Decimal(0),
    mooeProposedTotal: new Prisma.Decimal(0),
    feProposedTotal: new Prisma.Decimal(0),
    coProposedTotal: new Prisma.Decimal(0),
    finishLine: FL,
    ...over,
  };
}

function office(
  id: string,
  acronym: string,
  clusterId = 'cluster-1',
): DashboardOfficeRow {
  return {
    id,
    acronym,
    name: `${acronym} Office`,
    cluster: { id: clusterId, name: 'Cluster One' },
  };
}

// office-a has one published program, office-b only a draft, office-c nothing.
const OFFICES = [
  office('office-a', 'AAA'),
  office('office-b', 'BBB'),
  office('office-c', 'CCC'),
];

const ROWS: DashboardProgramRow[] = [
  program({
    officeId: 'office-a',
    publishedVersionId: 'ver-1',
    publishedAt: new Date('2027-03-03T00:00:00.000Z'), // a Wednesday
    proposedTotal: new Prisma.Decimal('1000.50'),
    psProposedTotal: new Prisma.Decimal('600.50'),
    mooeProposedTotal: new Prisma.Decimal('400.00'),
  }),
  program({
    officeId: 'office-b',
    proposedTotal: new Prisma.Decimal('250.25'),
    coProposedTotal: new Prisma.Decimal('250.25'),
  }),
  // Legacy SUPER_ADMIN row with no owning office.
  program({
    officeId: null,
    publishedVersionId: 'ver-2',
    publishedAt: new Date('2027-03-03T00:00:00.000Z'),
    proposedTotal: new Prisma.Decimal('99.00'),
  }),
];

const NOW = new Date('2027-03-17T00:00:00.000Z');

describe('aggregateDashboard', () => {
  const result = aggregateDashboard(CYCLE, ROWS, OFFICES, NOW);

  it('splits published from draft on publishedVersionId, not status', () => {
    expect(result.totals).toEqual({
      programs: 3,
      published: 2,
      drafts: 1,
      unassignedPrograms: 1,
    });
  });

  it('sums proposedTotal as a decimal string — the ₱0 regression guard', () => {
    // The old dashboard summed grandTotal, which is structurally 0 while
    // line-item entry is deferred, so every peso figure rendered as ₱0.
    expect(result.budget.published.total).toBe('1099.50');
    expect(result.budget.draft.total).toBe('250.25');
    expect(result.budget.published.ps).toBe('600.50');
    expect(result.budget.published.mooe).toBe('400.00');
    expect(result.budget.draft.co).toBe('250.25');
  });

  it('keeps zero-submission offices in the cluster denominator', () => {
    const [cluster] = result.byCluster;
    expect(cluster.officeCount).toBe(3);
    // office-a published; office-b drafted only; office-c has nothing.
    expect(cluster.officesWithPublished).toBe(1);
    expect(result.officesWithNoSubmissions.map((o) => o.acronym)).toEqual([
      'CCC',
    ]);
  });

  it('counts an office-less program in totals but in no office row', () => {
    const rows = result.byCluster.flatMap((c) => c.offices);
    expect(rows.reduce((n, o) => n + o.total, 0)).toBe(2);
    expect(rows.find((o) => o.officeId === 'office-b')).toMatchObject({
      total: 1,
      drafts: 1,
      published: 0,
    });
  });

  it('rolls finish-line money up per bucket', () => {
    expect(result.byFinishLine).toHaveLength(1);
    expect(result.byFinishLine[0]).toMatchObject({
      finishLineId: FL.id,
      color: '#123456',
      published: { count: 2, total: '1099.50' },
      draft: { count: 1, total: '250.25' },
    });
  });

  it('buckets publications by ISO week and gap-fills the quiet weeks', () => {
    expect(result.publishedByWeek).toEqual([
      { weekStart: '2027-03-01', count: 2 },
      { weekStart: '2027-03-08', count: 0 },
      { weekStart: '2027-03-15', count: 0 },
    ]);
  });

  it('returns an empty series when nothing is published', () => {
    const drafts = aggregateDashboard(CYCLE, [program()], OFFICES, NOW);
    expect(drafts.publishedByWeek).toEqual([]);
  });
});

describe('aggregateFundSources', () => {
  const pa = (
    amount: string | null,
    fundSources: FundSource[],
  ): DashboardPARow => ({
    proposedBudget: amount === null ? null : new Prisma.Decimal(amount),
    fundSources,
  });

  it('attributes single-fund PPAs to their fund and sums as decimals', () => {
    const result = aggregateFundSources([
      pa('100.25', [FundSource.GF]),
      pa('200.25', [FundSource.GF]),
      pa('50.00', [FundSource.SEF]),
    ]);
    expect(result).toEqual([
      { key: 'GF', total: '300.50' },
      { key: 'SEF', total: '50.00' },
    ]);
  });

  it('buckets a multi-fund PPA once, never split and never double-counted', () => {
    const result = aggregateFundSources([
      pa('900.00', [FundSource.GF, FundSource.SEF]),
    ]);
    // Not two rows of 900, and not two rows of 450 — the city never split it.
    expect(result).toEqual([{ key: 'MULTIPLE', total: '900.00' }]);
  });

  it('puts a PPA split by fund into each fund exactly', () => {
    const D = (v: string) => new Prisma.Decimal(v);
    const result = aggregateFundSources([
      {
        ...pa('285.00', [FundSource.GF, FundSource.SHF]),
        fundAllocations: [
          {
            fundSource: FundSource.GF,
            ps: D('0'),
            mooe: D('0'),
            fe: D('0'),
            co: D('3.00'),
          },
          {
            fundSource: FundSource.SHF,
            ps: D('0'),
            mooe: D('2.00'),
            fe: D('1.00'),
            co: D('280.00'),
          },
        ],
      },
    ]);
    expect(result).toEqual([
      { key: 'SHF', total: '283.00' }, // FE counts too
      { key: 'GF', total: '3.00' },
    ]);
  });

  it('reports fundless rows as NONE instead of defaulting them to GF', () => {
    expect(aggregateFundSources([pa('10.00', [])])).toEqual([
      { key: 'NONE', total: '10.00' },
    ]);
  });

  it('sorts funds by size but keeps MULTIPLE and NONE last', () => {
    const result = aggregateFundSources([
      pa('1.00', [FundSource.GF]),
      pa('5.00', [FundSource.SEF]),
      pa('999.00', [FundSource.GF, FundSource.LDRRMF]),
      pa('998.00', []),
    ]);
    expect(result.map((r) => r.key)).toEqual(['SEF', 'GF', 'MULTIPLE', 'NONE']);
  });

  it('skips PPAs with no proposed budget and totals to the same grand total', () => {
    const rows = [
      pa(null, [FundSource.GF]),
      pa('100.00', [FundSource.GF]),
      pa('25.50', [FundSource.SEF, FundSource.GAD]),
      pa('4.50', []),
    ];
    const sum = aggregateFundSources(rows).reduce(
      (acc, r) => acc.plus(r.total),
      new Prisma.Decimal(0),
    );
    expect(sum.toFixed(2)).toBe('130.00');
  });
});

describe('aggregateDashboard — fund breakdown', () => {
  const D = (v: string) => new Prisma.Decimal(v);

  it('counts a program with no PPAs as its own funding entry, so funds sum to the budget', () => {
    const rows = [
      // Rolls up from PPAs: covered by its leaf PPA below, never counted twice.
      program({ proposedTotal: D('100.00'), _count: { projectActivities: 1 } }),
      // States its own costs, one fund.
      program({
        publishedVersionId: 'v-1',
        proposedTotal: D('40.00'),
        fundSources: [FundSource.SEF],
        _count: { projectActivities: 0 },
      }),
      // States its own costs, split by fund.
      program({
        proposedTotal: D('5.00'),
        fundSources: [FundSource.GF, FundSource.SHF],
        fundAllocations: [
          {
            fundSource: FundSource.GF,
            ps: D('3'),
            mooe: D('0'),
            fe: D('0'),
            co: D('0'),
          },
          {
            fundSource: FundSource.SHF,
            ps: D('0'),
            mooe: D('1'),
            fe: D('1'),
            co: D('0'),
          },
        ],
        _count: { projectActivities: 0 },
      }),
      // A fresh ₱0 draft opens no empty bucket.
      program({ _count: { projectActivities: 0 } }),
    ];
    const paRows: DashboardPARow[] = [
      { proposedBudget: D('100.00'), fundSources: [FundSource.GF] },
    ];
    const result = aggregateDashboard(CYCLE, rows, OFFICES, NOW, paRows);

    expect(result.byFundSource).toEqual([
      { key: 'GF', total: '103.00' },
      { key: 'SEF', total: '40.00' },
      { key: 'SHF', total: '2.00' },
    ]);
    const funds = result.byFundSource.reduce((a, r) => a.plus(r.total), D('0'));
    const budget = D(result.budget.published.total).plus(
      result.budget.draft.total,
    );
    expect(funds.toFixed(2)).toBe(budget.toFixed(2));
  });
});

describe('isoWeekStart', () => {
  it('snaps every weekday back to its Monday', () => {
    expect(isoWeekStart(new Date('2027-03-01T00:00:00.000Z'))).toBe(
      '2027-03-01',
    );
    expect(isoWeekStart(new Date('2027-03-03T23:59:59.000Z'))).toBe(
      '2027-03-01',
    );
    // Sunday belongs to the week that started six days earlier, not the next one.
    expect(isoWeekStart(new Date('2027-03-07T12:00:00.000Z'))).toBe(
      '2027-03-01',
    );
    expect(isoWeekStart(new Date('2027-03-08T00:00:00.000Z'))).toBe(
      '2027-03-08',
    );
  });
});
