import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PPACostMode, Prisma } from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EstimateRollupService } from './estimate-rollup.service.js';

const D = (v: string) => new Prisma.Decimal(v);

function makeTx(
  pa: Record<string, unknown>,
  childSums = {},
  /** Children read for the fund-source union (ACTIVITY_CHILDREN branch only). */
  children: { fundSources: string[] }[] = [],
  /**
   * The program `recomputeProgram` reads to decide whether it owns its total.
   * Defaults to the derived mode, which is what every pre-existing row is.
   */
  program: Record<string, unknown> = {
    costMode: PPACostMode.ACTIVITY_CHILDREN,
    psProposedTotal: D('0'),
    mooeProposedTotal: D('0'),
    feProposedTotal: D('0'),
    coProposedTotal: D('0'),
  },
) {
  const updates: { where: unknown; data: Record<string, unknown> }[] = [];
  const tx = {
    fundAllocation: { deleteMany: jest.fn().mockResolvedValue({}) },
    projectActivity: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ fundAllocations: [], feEstimate: null, ...pa }),
      findMany: jest.fn().mockResolvedValue(children),
      aggregate: jest.fn().mockResolvedValue({ _sum: childSums }),
      update: jest.fn(
        (a: { where: unknown; data: Record<string, unknown> }) => {
          updates.push(a);
          return Promise.resolve({});
        },
      ),
    },
    program: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ fundAllocations: [], ...program }),
      update: jest.fn(
        (a: { where: unknown; data: Record<string, unknown> }) => {
          updates.push(a);
          return Promise.resolve({});
        },
      ),
    },
  };
  return { tx, updates };
}

describe('EstimateRollupService', () => {
  const service = new EstimateRollupService({} as PrismaService);

  // NCGH "12." — GF CO 3M · SHF CO 2M · GAA CO 280M under one description.
  const split = [
    { fundSource: 'GF', ps: D('0'), mooe: D('0'), co: D('3000000') },
    { fundSource: 'SHF', ps: D('0'), mooe: D('1000000'), co: D('2000000') },
    { fundSource: 'NGA', ps: D('0'), mooe: D('0'), co: D('280000000') },
  ];

  it('derives a split PA’s estimates and funds from its fund lines', async () => {
    const { tx, updates } = makeTx({
      id: 'pa1',
      programId: 'p1',
      parentProjectActivityId: null,
      costMode: PPACostMode.DIRECT_COSTS,
      psEstimate: D('1'),
      mooeEstimate: D('1'),
      coEstimate: D('1'),
      proposedBudget: D('3'),
      fundAllocations: split,
    });
    await service.recomputeProjectActivity('pa1', tx as never);
    const pa = updates.find((u) => 'proposedBudget' in u.data)!.data;
    expect(String(pa.mooeEstimate)).toBe('1000000');
    expect(String(pa.coEstimate)).toBe('285000000');
    expect(String(pa.proposedBudget)).toBe('286000000');
    // Enum order, not line order.
    expect(pa.fundSources).toEqual(['GF', 'NGA', 'SHF']);
  });

  it('derives a split program’s own figures from its fund lines', async () => {
    const { tx, updates } = makeTx({}, {}, [], {
      costMode: PPACostMode.DIRECT_COSTS,
      psProposedTotal: D('0'),
      mooeProposedTotal: D('0'),
      coProposedTotal: D('0'),
      fundAllocations: split,
    });
    await service.recomputeProgram('p1', tx as never);
    const p = updates.find((u) => 'proposedTotal' in u.data)!.data;
    expect(String(p.coProposedTotal)).toBe('285000000');
    expect(String(p.proposedTotal)).toBe('286000000');
  });

  it('drops a split once the PA derives its money from children', async () => {
    const { tx } = makeTx(
      {
        id: 'pa1',
        programId: 'p1',
        parentProjectActivityId: null,
        costMode: PPACostMode.ACTIVITY_CHILDREN,
        fundAllocations: split,
      },
      {
        psEstimate: D('0'),
        mooeEstimate: D('0'),
        coEstimate: D('0'),
        proposedBudget: D('0'),
      },
    );
    await service.recomputeProjectActivity('pa1', tx as never);
    expect(tx.fundAllocation.deleteMany).toHaveBeenCalledWith({
      where: { projectActivityId: 'pa1' },
    });
  });

  it('sums the three estimates into proposedBudget for a direct-cost PA', async () => {
    const { tx, updates } = makeTx({
      id: 'pa1',
      programId: 'p1',
      parentProjectActivityId: null,
      costMode: PPACostMode.DIRECT_COSTS,
      psEstimate: null,
      mooeEstimate: D('450000.00'),
      coEstimate: D('500000.00'),
      proposedBudget: null,
    });

    await service.recomputeProjectActivity('pa1', tx as never);

    const paUpdate = updates.find((u) => 'proposedBudget' in u.data);
    expect((paUpdate?.data.proposedBudget as Prisma.Decimal).toString()).toBe(
      '950000',
    );
  });

  it('leaves a legacy lump-sum alone when all three estimates are NULL', async () => {
    // Rows imported from the 2027 shortlist carry a manual figure and no class
    // breakdown. Overwriting it with zero would blank a published budget line.
    const { tx, updates } = makeTx({
      id: 'pa1',
      programId: 'p1',
      parentProjectActivityId: null,
      costMode: PPACostMode.DIRECT_COSTS,
      psEstimate: null,
      mooeEstimate: null,
      coEstimate: null,
      proposedBudget: D('2300000.00'),
    });

    await service.recomputeProjectActivity('pa1', tx as never);

    expect(tx.projectActivity.update).not.toHaveBeenCalled();
    // The program rollup still runs, so the parent stays consistent.
    expect(tx.program.update).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
  });

  it('treats a zeroed estimate as a real value, not as absent', async () => {
    const { tx, updates } = makeTx({
      id: 'pa1',
      programId: 'p1',
      parentProjectActivityId: null,
      costMode: PPACostMode.DIRECT_COSTS,
      psEstimate: D('0'),
      mooeEstimate: null,
      coEstimate: null,
      proposedBudget: D('999'),
    });

    await service.recomputeProjectActivity('pa1', tx as never);

    const paUpdate = updates.find((u) => 'proposedBudget' in u.data);
    expect((paUpdate?.data.proposedBudget as Prisma.Decimal).toString()).toBe(
      '0',
    );
  });

  it('sums children for an ACTIVITY_CHILDREN parent', async () => {
    const { tx, updates } = makeTx(
      {
        id: 'pa1',
        programId: 'p1',
        parentProjectActivityId: null,
        costMode: PPACostMode.ACTIVITY_CHILDREN,
        psEstimate: null,
        mooeEstimate: null,
        coEstimate: null,
        proposedBudget: null,
      },
      {
        psEstimate: D('100'),
        mooeEstimate: D('200'),
        coEstimate: null,
        proposedBudget: D('300'),
      },
      // Overlapping and out-of-order on purpose: the union is deduped and comes
      // back in declared enum order.
      [{ fundSources: ['SEF', 'GF'] }, { fundSources: ['GF', 'LDRRMF'] }],
    );

    await service.recomputeProjectActivity('pa1', tx as never);

    const paUpdate = updates[0];
    expect((paUpdate.data.psEstimate as Prisma.Decimal).toString()).toBe('100');
    expect(paUpdate.data.coEstimate as Prisma.Decimal | null).toBeNull();
    expect((paUpdate.data.proposedBudget as Prisma.Decimal).toString()).toBe(
      '300',
    );
    expect(paUpdate.data.fundSources).toEqual(['GF', 'SEF', 'LDRRMF']);
  });

  it("clears a derived parent's fund sources when it has no children", async () => {
    const { tx, updates } = makeTx(
      {
        id: 'pa1',
        programId: 'p1',
        parentProjectActivityId: null,
        costMode: PPACostMode.ACTIVITY_CHILDREN,
        psEstimate: null,
        mooeEstimate: null,
        coEstimate: null,
        proposedBudget: null,
      },
      {},
      [],
    );

    await service.recomputeProjectActivity('pa1', tx as never);

    expect(updates[0].data.fundSources).toEqual([]);
  });

  it('rolls the program up from root PAs only', async () => {
    const { tx, updates } = makeTx(
      {},
      {
        psEstimate: D('10'),
        mooeEstimate: D('20'),
        coEstimate: D('30'),
        proposedBudget: D('60'),
      },
    );

    await service.recomputeProgram('p1', tx as never);

    expect(tx.projectActivity.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { programId: 'p1', parentProjectActivityId: null },
      }),
    );
    expect((updates[0].data.proposedTotal as Prisma.Decimal).toString()).toBe(
      '60',
    );
    expect((updates[0].data.coProposedTotal as Prisma.Decimal).toString()).toBe(
      '30',
    );
  });

  it("sums the program's own three figures when it states its costs", async () => {
    // The mirror of the direct-cost PA case, one level up: the three class
    // columns are the input and only proposedTotal is written.
    const { tx, updates } = makeTx({}, {}, [], {
      costMode: PPACostMode.DIRECT_COSTS,
      psProposedTotal: D('1.50'),
      mooeProposedTotal: D('2.25'),
      feProposedTotal: D('0'),
      coProposedTotal: D('0.25'),
    });

    await service.recomputeProgram('p1', tx as never);

    expect((updates[0].data.proposedTotal as Prisma.Decimal).toString()).toBe(
      '4',
    );
    // The class columns are the office's own figures — never overwritten here.
    expect(updates[0].data.psProposedTotal).toBeUndefined();
    expect(updates[0].data.coProposedTotal).toBeUndefined();
    // And no PA is read at all: a direct-cost program has none by definition.
    expect(tx.projectActivity.aggregate).not.toHaveBeenCalled();
  });

  // FE (Financial Expenses, specs/008) is a fourth class: summed like the others,
  // and on a split row it comes only from the fund lines.
  it('sums FE into a direct-cost PA’s proposedBudget', async () => {
    const { tx, updates } = makeTx({
      id: 'pa1',
      programId: 'p1',
      parentProjectActivityId: null,
      costMode: PPACostMode.DIRECT_COSTS,
      psEstimate: null,
      mooeEstimate: D('100.00'),
      feEstimate: D('2000.00'),
      coEstimate: null,
      proposedBudget: null,
    });
    await service.recomputeProjectActivity('pa1', tx as never);
    const pa = updates.find((u) => 'proposedBudget' in u.data)!.data;
    expect(String(pa.proposedBudget)).toBe('2100');
  });

  it('takes a split row’s FE only from its fund lines', async () => {
    const lines = [
      { fundSource: 'GF', ps: D('0'), mooe: D('0'), fe: D('2000'), co: D('0') },
      // A line from a client that predates FE: no key at all reads as 0.
      { fundSource: 'SEF', ps: D('0'), mooe: D('500'), co: D('0') },
    ];
    const { tx, updates } = makeTx({
      id: 'pa1',
      programId: 'p1',
      parentProjectActivityId: null,
      costMode: PPACostMode.DIRECT_COSTS,
      feEstimate: D('999999'),
      fundAllocations: lines,
    });
    await service.recomputeProjectActivity('pa1', tx as never);
    const pa = updates.find((u) => 'proposedBudget' in u.data)!.data;
    expect(String(pa.feEstimate)).toBe('2000');
    expect(String(pa.proposedBudget)).toBe('2500');
  });

  it("sums a direct-cost program's own FE into proposedTotal", async () => {
    const { tx, updates } = makeTx({}, {}, [], {
      costMode: PPACostMode.DIRECT_COSTS,
      psProposedTotal: D('1'),
      mooeProposedTotal: D('2'),
      feProposedTotal: D('3'),
      coProposedTotal: D('4'),
    });
    await service.recomputeProgram('p1', tx as never);
    expect(String(updates[0].data.proposedTotal)).toBe('10');
  });

  it('rolls root PAs’ FE up to the program', async () => {
    const { tx, updates } = makeTx(
      {},
      { feEstimate: D('7'), proposedBudget: D('7') },
    );
    await service.recomputeProgram('p1', tx as never);
    expect(String(updates[0].data.feProposedTotal)).toBe('7');
  });

  it('never coerces money through Number', () => {
    // Guard on the repo-wide rule: Decimal(18,2) exceeds float-safe range, so a
    // stray Number()/parseFloat in this file would corrupt accounting silently.
    const source = readFileSync(
      join(__dirname, 'estimate-rollup.service.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/Number\(/);
    expect(source).not.toMatch(/parseFloat/);
  });
});
