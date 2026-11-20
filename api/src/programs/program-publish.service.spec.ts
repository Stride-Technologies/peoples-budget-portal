import { ProgramPublishService } from './program-publish.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AIPCodesService } from '../aip-codes/aip-codes.service.js';
import type { ProgramsService } from './programs.service.js';
import type { ProgramVersionsService } from './program-versions.service.js';
import type { ProgramAuditLogService } from '../program-audit/program-audit-log.service.js';
import type { RegistryCacheService } from '../cache/registry-cache.service.js';
import type { EstimateRollupService } from '../budget-rollup/estimate-rollup.service.js';
import type { BudgetRollupService } from '../budget-rollup/budget-rollup.service.js';
import { Prisma, ProgramStatus } from '../generated/prisma/index';

/**
 * `readinessFor` only touches Prisma, so the other five collaborators stay
 * stubs throughout this file.
 *
 * A leaf PPA with nothing missing. The ceiling tests care only about money, so
 * their fixture has to be otherwise publishable — every field here is one the
 * INCOMPLETE_DATA blocker checks.
 */
function completePA(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pa-1',
    name: 'A PPA',
    proposedBudget: new Prisma.Decimal('1000.00'),
    parentProjectActivityId: null,
    costMode: 'DIRECT_COSTS',
    fundSources: ['GF'],
    expectedOutput: 'An output',
    implementationStartYear: 2027,
    implementationEndYear: 2027,
    // No trio at all, so the derived PS+MOOE+CO check has nothing to contradict.
    psEstimate: null,
    mooeEstimate: null,
    feEstimate: null,
    coEstimate: null,
    ...overrides,
  };
}

/**
 * `warnings` carries two independent advisories — ceiling overruns and the
 * derived data warnings. Tests for one filter out the other rather than
 * asserting the whole array, so adding a check to either never breaks the tests
 * for the other.
 */
const ceilingOnly = (warnings: string[]) =>
  warnings.filter((w) => w.includes('over its ceiling'));
const dataOnly = (warnings: string[]) =>
  warnings.filter((w) => !w.includes('over its ceiling'));

function makeService(opts: {
  proposedTotal: string;
  ceiling: string | null;
  othersPublished?: string;
  projectActivities?: Record<string, unknown>[];
  importWarnings?: string[];
  papClass?: string | null;
  fiscalYear?: number;
}) {
  const prisma = {
    program: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'p-1',
        name: 'Test Program',
        status: ProgramStatus.DRAFT,
        officeId: 'co-1',
        finishLineId: 'fl-1',
        aipCycleId: 'cy-1',
        aipCycle: { fiscalYear: opts.fiscalYear ?? 2027 },
        proposedTotal: new Prisma.Decimal(opts.proposedTotal),
        importWarnings: opts.importWarnings ?? [],
        papClass: opts.papClass === undefined ? 'OPERATIONS' : opts.papClass,
        projectActivities: opts.projectActivities ?? [
          completePA({
            proposedBudget: new Prisma.Decimal(opts.proposedTotal),
          }),
        ],
        _count: { comments: 0 },
      }),
      aggregate: jest.fn().mockResolvedValue({
        _sum: {
          proposedTotal: new Prisma.Decimal(opts.othersPublished ?? '0'),
        },
      }),
    },
    finishLineBudgetCeiling: {
      findUnique: jest.fn().mockResolvedValue(
        opts.ceiling === null
          ? null
          : {
              id: 'ceil-1',
              aipCycleId: 'cy-1',
              finishLineId: 'fl-1',
              totalCeiling: new Prisma.Decimal(opts.ceiling),
            },
      ),
    },
  } as unknown as PrismaService;

  const stub = <T>() => ({}) as T;
  const service = new ProgramPublishService(
    prisma,
    stub<ProgramsService>(),
    stub<ProgramVersionsService>(),
    stub<AIPCodesService>(),
    stub<EstimateRollupService>(),
    stub<BudgetRollupService>(),
    stub<ProgramAuditLogService>(),
    // Not a bare `stub<T>()`: the publish paths call these, so they must resolve.
    {
      invalidatePublicRegistry: jest.fn().mockResolvedValue(undefined),
      invalidateRegistryCounts: jest.fn().mockResolvedValue(undefined),
      invalidateAll: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegistryCacheService,
  );
  return { service, prisma };
}

describe('ProgramPublishService.readinessFor — ceiling warnings', () => {
  it('warns when a ₱0 ceiling is exceeded by any positive proposal', async () => {
    const { service } = makeService({
      proposedTotal: '1000.00',
      ceiling: '0.00',
    });

    const readiness = await service.readinessFor('p-1');

    expect(ceilingOnly(readiness.warnings)).toEqual([
      'Publishing brings this development priority to 1000.00, over its ceiling of 0.00.',
    ]);
    // Advisory only — a zero ceiling must never block.
    expect(readiness.ready).toBe(true);
  });

  it('does not warn at a ₱0 ceiling when nothing is proposed against it', async () => {
    const { service } = makeService({ proposedTotal: '0.00', ceiling: '0.00' });

    const readiness = await service.readinessFor('p-1');

    expect(ceilingOnly(readiness.warnings)).toEqual([]);
  });

  it('skips the check entirely when no ceiling row exists', async () => {
    const { service, prisma } = makeService({
      proposedTotal: '1000.00',
      ceiling: null,
    });

    const readiness = await service.readinessFor('p-1');

    expect(ceilingOnly(readiness.warnings)).toEqual([]);
    // Missing row short-circuits before the aggregate.
    expect(prisma.program.aggregate).not.toHaveBeenCalled();
  });

  it('warns when a positive ceiling is exceeded by already-published siblings', async () => {
    const { service } = makeService({
      proposedTotal: '500.00',
      ceiling: '1000.00',
      othersPublished: '800.00',
    });

    const readiness = await service.readinessFor('p-1');

    expect(ceilingOnly(readiness.warnings)).toEqual([
      'Publishing brings this development priority to 1300.00, over its ceiling of 1000.00.',
    ]);
  });
});

describe('ProgramPublishService.readinessFor — completeness blockers', () => {
  const ready = { proposedTotal: '1000.00', ceiling: null };

  it('does not require an amount on a PPA whose children carry it', async () => {
    // The shape the 2027 workbook uses throughout: a cost-derived parent with
    // its money on the child. Requiring an amount on every row would fail every
    // nested program in the registry.
    const { service } = makeService({
      ...ready,
      projectActivities: [
        completePA({
          id: 'parent',
          costMode: 'ACTIVITY_CHILDREN',
          proposedBudget: null,
          fundSources: [],
          expectedOutput: null,
        }),
        completePA({ id: 'child', parentProjectActivityId: 'parent' }),
      ],
    });

    const readiness = await service.readinessFor('p-1');

    expect(readiness.blockers).toEqual([]);
    expect(readiness.ready).toBe(true);
  });

  it('blocks a cost-derived PPA that has no children to derive from', async () => {
    const { service } = makeService({
      ...ready,
      projectActivities: [
        completePA({ costMode: 'ACTIVITY_CHILDREN', proposedBudget: null }),
      ],
    });

    const readiness = await service.readinessFor('p-1');

    expect(readiness.blockers).toContain('EMPTY_PARENT_PPA');
    expect(readiness.ready).toBe(false);
  });

  it.each([['no implementation dates', { implementationStartYear: null }]])(
    'blocks a leaf PPA with %s',
    async (_label, missing) => {
      const { service } = makeService({
        ...ready,
        projectActivities: [completePA(missing)],
      });

      const readiness = await service.readinessFor('p-1');

      expect(readiness.blockers).toContain('INCOMPLETE_DATA');
      expect(readiness.ready).toBe(false);
    },
  );

  // The 2026 Annual Budget is copied verbatim from a printed book that states
  // neither a fund source nor an expected output for most rows. Enforcing them
  // there would mean never publishing the enacted budget at all.
  it.each([
    ['no funding source', { fundSources: [] }],
    ['no expected output', { expectedOutput: null }],
  ])(
    'publishes a historical-cycle leaf PPA with %s',
    async (_label, missing) => {
      const { service } = makeService({
        ...ready,
        fiscalYear: 2026,
        projectActivities: [
          completePA({
            ...missing,
            implementationStartYear: 2026,
            implementationEndYear: 2026,
          }),
        ],
      });

      const readiness = await service.readinessFor('p-1');

      expect(readiness.blockers).toEqual([]);
      expect(readiness.ready).toBe(true);
    },
  );

  // specs/013: from 2027 a missing fund source or expected output publishes
  // ("Not yet stated" on the public page) but stays a warning for staff.
  it('publishes a current-cycle gap in fund source or output, and still warns', async () => {
    const { service } = makeService({
      ...ready,
      fiscalYear: 2027,
      projectActivities: [
        completePA({ fundSources: [], expectedOutput: null }),
      ],
    });

    const readiness = await service.readinessFor('p-1');

    expect(readiness.blockers).toEqual([]);
    expect(readiness.ready).toBe(true);
    expect(dataOnly(readiness.warnings)).toEqual([
      '1 of 1 PPAs have no funding source.',
      '1 of 1 PPAs have no expected output.',
    ]);
  });

  it('never waives the implementation period, even for 2026', async () => {
    const { service } = makeService({
      ...ready,
      fiscalYear: 2026,
      projectActivities: [completePA({ implementationStartYear: null })],
    });

    const readiness = await service.readinessFor('p-1');

    expect(readiness.blockers).toContain('INCOMPLETE_DATA');
  });

  it('blocks while import warnings are outstanding, and reports them', async () => {
    const warnings = [
      'Finish line inferred from the implementing office (CPO → vision 8).',
    ];
    const { service } = makeService({ ...ready, importWarnings: warnings });

    const readiness = await service.readinessFor('p-1');

    expect(readiness.blockers).toContain('INCOMPLETE_IMPORT');
    expect(readiness.importWarnings).toEqual(warnings);
    expect(readiness.ready).toBe(false);
  });

  it('leaves a hand-authored program publishable', async () => {
    const { service } = makeService(ready);

    const readiness = await service.readinessFor('p-1');

    expect(readiness.blockers).toEqual([]);
    expect(readiness.importWarnings).toEqual([]);
    expect(readiness.ready).toBe(true);
  });
});

describe('ProgramPublishService.acknowledgeImport', () => {
  function makeAckService(importWarnings: string[]) {
    const update = jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'p-1', officeId: 'co-1', ...data }),
      );
    const record = jest.fn().mockResolvedValue({ id: 'log-1' });

    const prisma = {
      program: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'p-1',
          officeId: 'co-1',
          status: ProgramStatus.DRAFT,
          importWarnings,
        }),
        update,
      },
      $transaction: (fn: (tx: unknown) => unknown) =>
        fn({ program: { update } }),
    } as unknown as PrismaService;

    const stub = <T>() => ({}) as T;
    const service = new ProgramPublishService(
      prisma,
      {
        assertOwner: jest.fn().mockResolvedValue(undefined),
      } as unknown as ProgramsService,
      stub<ProgramVersionsService>(),
      stub<AIPCodesService>(),
      stub<EstimateRollupService>(),
      stub<BudgetRollupService>(),
      { record },
      stub<RegistryCacheService>(),
    );
    return { service, update, record };
  }

  const inferred =
    'Finish line inferred from the implementing office (CPO → vision 8).';

  it('clears the stored warnings and logs what it cleared', async () => {
    const { service, update, record } = makeAckService([inferred]);
    const user = { sub: 'u-1', role: 'HEAD' } as unknown as Parameters<
      typeof service.acknowledgeImport
    >[1];

    await service.acknowledgeImport('p-1', user);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { importWarnings: [] },
    });
    // The audit row is the only surviving record of the cleared sentences.
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'IMPORT_REVIEWED',
        summary: 'Confirmed 1 import decision',
        changes: { importWarnings: { from: [inferred], to: [] } },
      }),
      expect.anything(),
    );
  });

  it('pluralises the summary', async () => {
    const { service, record } = makeAckService([
      inferred,
      'The workbook lists this program twice for CHO (r1 and r2).',
    ]);
    const user = { sub: 'u-1' } as unknown as Parameters<
      typeof service.acknowledgeImport
    >[1];

    await service.acknowledgeImport('p-1', user);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Confirmed 2 import decisions' }),
      expect.anything(),
    );
  });

  // Two reviewers clicking the button is not an error.
  it('is idempotent on a program with nothing to confirm', async () => {
    const { service, update, record } = makeAckService([]);
    const user = { sub: 'u-1' } as unknown as Parameters<
      typeof service.acknowledgeImport
    >[1];

    await service.acknowledgeImport('p-1', user);

    expect(update).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});

describe('ProgramPublishService.readinessFor — derived data warnings', () => {
  const ready = { proposedTotal: '1000.00', ceiling: null };

  it('says in words what INCOMPLETE_DATA only names', async () => {
    const { service } = makeService({
      ...ready,
      projectActivities: [completePA({ implementationEndYear: null })],
    });

    const readiness = await service.readinessFor('p-1');

    expect(readiness.blockers).toContain('INCOMPLETE_DATA');
    expect(dataOnly(readiness.warnings)).toEqual([
      '1 of 1 PPAs have no implementation dates set.',
    ]);
  });

  /**
   * The regression this whole change exists for. These sentences used to be
   * stored on the row, so filling the field in left them in place and the
   * program stayed unpublishable forever. Derived, the same edit clears them.
   */
  it('drops the warning once the data is filled in', async () => {
    const gapped = makeService({
      ...ready,
      projectActivities: [completePA({ implementationStartYear: null })],
    });
    const filled = makeService({
      ...ready,
      projectActivities: [completePA({ implementationStartYear: 2027 })],
    });

    const before = await gapped.service.readinessFor('p-1');
    const after = await filled.service.readinessFor('p-1');

    expect(dataOnly(before.warnings)).toHaveLength(1);
    expect(dataOnly(after.warnings)).toEqual([]);
    expect(before.ready).toBe(false);
    expect(after.ready).toBe(true);
  });

  it('reports a missing AIP form section without blocking', async () => {
    const { service } = makeService({ ...ready, papClass: null });

    const readiness = await service.readinessFor('p-1');

    expect(dataOnly(readiness.warnings)).toEqual([
      'No AIP form section (GAS / STO / Operations) set.',
    ]);
    // Advisory by decision: the section is needed to print the AIP form, but
    // holding the whole program hostage to it helps nobody.
    expect(readiness.blockers).toEqual([]);
    expect(readiness.ready).toBe(true);
  });

  it('reports a PS+MOOE+CO split that disagrees with the total, without blocking', async () => {
    const { service } = makeService({
      ...ready,
      projectActivities: [
        completePA({
          proposedBudget: new Prisma.Decimal('1000.00'),
          psEstimate: new Prisma.Decimal('400.00'),
          mooeEstimate: new Prisma.Decimal('300.00'),
          feEstimate: null,
          coEstimate: new Prisma.Decimal('200.00'),
        }),
      ],
    });

    const readiness = await service.readinessFor('p-1');

    expect(dataOnly(readiness.warnings)).toEqual([
      '"A PPA": PS+MOOE+FE+CO 900.00 does not equal the stated total 1000.00.',
    ]);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.ready).toBe(true);
  });

  // The parent's own null fields are by design, so the derived warnings must
  // read the leaf set — not every row — exactly as the blockers do.
  it('ignores a cost-derived parent whose children carry the data', async () => {
    const { service } = makeService({
      ...ready,
      projectActivities: [
        completePA({
          id: 'parent',
          costMode: 'ACTIVITY_CHILDREN',
          proposedBudget: null,
          fundSources: [],
          expectedOutput: null,
          implementationStartYear: null,
        }),
        completePA({ id: 'child', parentProjectActivityId: 'parent' }),
      ],
    });

    const readiness = await service.readinessFor('p-1');

    expect(dataOnly(readiness.warnings)).toEqual([]);
  });

  it('carries ceiling and data warnings side by side', async () => {
    const { service } = makeService({
      proposedTotal: '1000.00',
      ceiling: '0.00',
      projectActivities: [completePA({ fundSources: [] })],
    });

    const readiness = await service.readinessFor('p-1');

    expect(ceilingOnly(readiness.warnings)).toHaveLength(1);
    expect(dataOnly(readiness.warnings)).toEqual([
      '1 of 1 PPAs have no funding source.',
    ]);
  });

  it('does not put derived warnings in importWarnings', async () => {
    const { service } = makeService({
      ...ready,
      papClass: null,
      projectActivities: [completePA({ expectedOutput: null })],
    });

    const readiness = await service.readinessFor('p-1');

    expect(readiness.importWarnings).toEqual([]);
    expect(readiness.blockers).not.toContain('INCOMPLETE_IMPORT');
  });
});

describe('ProgramPublishService.discardDraft — restores the money', () => {
  // A published direct-cost program as its snapshot holds it: JSON, so
  // decimals are strings. The revision changed its MOOE and fund split; the
  // discard must put back the snapshot's, not keep the draft's.
  const snapshot = {
    name: 'Feeding Program',
    description: null,
    remarks: null,
    expectedOutput: 'Meals',
    finishLineId: 'fl-1',
    subFinishLineId: null,
    papSectorId: 'ps-1',
    papSubsectorCode: '000',
    papClass: 'OPERATIONS',
    sglgIndicatorId: null,
    implementationStartMonth: 1,
    implementationStartYear: 2027,
    implementationEndMonth: 12,
    implementationEndYear: 2027,
    costMode: 'DIRECT_COSTS',
    fundSources: ['GF', 'SHF'],
    psProposedTotal: '0',
    mooeProposedTotal: '300.00',
    feProposedTotal: '0',
    coProposedTotal: '0',
    fundAllocations: [
      { fundSource: 'GF', ps: '0', mooe: '100.00', fe: '0', co: '0' },
      { fundSource: 'SHF', ps: '0', mooe: '200.00', fe: '0', co: '0' },
    ],
    climateChangeTag: {
      id: 'tag-p',
      ccaAmount: '50.00',
      ccmAmount: '0',
      remarks: null,
      codes: [{ ccetCodeId: 'ccet-1' }],
    },
    projectActivities: [
      {
        ...completePA({ id: 'pa-1' }),
        proposedBudget: '10.00',
        tentativeAipReferenceCode: 'X',
        aipReferenceCode: null,
        orderIndex: 0,
        createdByUserId: 'u-1',
        fundAllocations: [
          { fundSource: 'GF', ps: '0', mooe: '10.00', co: '0' }, // pre-FE line
        ],
        climateChangeTag: {
          id: 'tag-pa',
          ccaAmount: '1.00',
          ccmAmount: '0',
          remarks: null,
        },
      },
    ],
  };

  function setup() {
    const tx = {
      program: { update: jest.fn() },
      climateChangeTag: { deleteMany: jest.fn(), create: jest.fn() },
      projectActivity: { deleteMany: jest.fn(), create: jest.fn() },
      // A PPMP line on pa-1 (restored) and one on pa-gone (added during the
      // revision, so discarded); the same for a document PPA's source.
      pPMPLineItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'li-1', projectActivityId: 'pa-1' },
          { id: 'li-2', projectActivityId: 'pa-gone' },
        ]),
        update: jest.fn(),
      },
      budgetItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'item-1', sourceProjectActivityId: 'pa-1' },
          ]),
        update: jest.fn(),
      },
    };
    const prisma = {
      program: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'p-1',
          officeId: 'co-1',
          status: ProgramStatus.PUBLISHED_REVISION,
          publishedVersionId: 'v-1',
        }),
      },
      programVersion: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'v-1', version: 1, snapshot }),
      },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    } as unknown as PrismaService;
    const service = new ProgramPublishService(
      prisma,
      { assertOwner: jest.fn() } as unknown as ProgramsService,
      {} as ProgramVersionsService,
      {
        resyncTentativePACodes: jest.fn(),
      } as unknown as AIPCodesService,
      { recomputeProgram: jest.fn() } as unknown as EstimateRollupService,
      { recomputeProgram: jest.fn() } as unknown as BudgetRollupService,
      { record: jest.fn() },
      { invalidateAll: jest.fn() } as unknown as RegistryCacheService,
    );
    return { service, tx };
  }

  type Line = { fundSource: string; mooe: Prisma.Decimal; fe: Prisma.Decimal };
  type Tag = {
    programId?: string;
    ccaAmount: Prisma.Decimal;
    codes: { create: unknown[] };
  };
  type ProgramData = {
    costMode: string;
    fundSources: string[];
    mooeProposedTotal: Prisma.Decimal;
    fundAllocations: { deleteMany: object; create: Line[] };
  };
  type PAData = {
    fundAllocations: { create: Line[] };
    climateChangeTag: { create: Tag };
  };
  const dataOf = <T>(fn: jest.Mock): T =>
    (fn.mock.calls[0] as [{ data: T }])[0].data;

  it("restores the program's cost columns, fund split and climate tag", async () => {
    const { service, tx } = setup();
    await service.discardDraft('p-1', {} as never);

    const data = dataOf<ProgramData>(tx.program.update);
    expect(data.costMode).toBe('DIRECT_COSTS');
    expect(data.fundSources).toEqual(['GF', 'SHF']);
    expect(data.mooeProposedTotal.toFixed(2)).toBe('300.00');
    expect(data.fundAllocations.deleteMany).toEqual({});
    expect(
      data.fundAllocations.create.map(
        (l) => `${l.fundSource}:${l.mooe.toFixed(2)}`,
      ),
    ).toEqual(['GF:100.00', 'SHF:200.00']);

    expect(tx.climateChangeTag.deleteMany).toHaveBeenCalledWith({
      where: { programId: 'p-1' },
    });
    const tag = dataOf<Tag>(tx.climateChangeTag.create);
    expect(tag.programId).toBe('p-1');
    expect(tag.ccaAmount.toFixed(2)).toBe('50.00');
    expect(tag.codes.create).toEqual([{ ccetCodeId: 'ccet-1' }]);
  });

  it("restores each PA's fund split and climate tag, which the rebuild cascades away", async () => {
    const { service, tx } = setup();
    await service.discardDraft('p-1', {} as never);

    const pa = dataOf<PAData>(tx.projectActivity.create);
    const [line] = pa.fundAllocations.create;
    expect(line.fundSource).toBe('GF');
    expect(line.mooe.toFixed(2)).toBe('10.00');
    expect(line.fe.toFixed(2)).toBe('0.00');
    expect(pa.climateChangeTag.create.ccaAmount.toFixed(2)).toBe('1.00');
    expect(pa.climateChangeTag.create.codes.create).toEqual([]);
  });

  it('puts back PPMP line and document links to restored PAs (specs/012 D8)', async () => {
    const { service, tx } = setup();
    await service.discardDraft('p-1', {} as never);
    expect(tx.pPMPLineItem.update.mock.calls).toEqual([
      [{ where: { id: 'li-1' }, data: { projectActivityId: 'pa-1' } }],
    ]);
    expect(tx.budgetItem.update.mock.calls).toEqual([
      [{ where: { id: 'item-1' }, data: { sourceProjectActivityId: 'pa-1' } }],
    ]);
  });

  it('restores a pre-column snapshot to the column defaults', async () => {
    const { service, tx } = setup();
    const {
      costMode: _c,
      fundSources: _f,
      fundAllocations: _a,
      climateChangeTag: _t,
      ...old
    } = snapshot;
    (
      (service as unknown as { prisma: PrismaService }).prisma.programVersion
        .findUnique as jest.Mock
    ).mockResolvedValue({ id: 'v-1', version: 1, snapshot: old });
    await service.discardDraft('p-1', {} as never);

    const data = dataOf<ProgramData>(tx.program.update);
    expect(data.costMode).toBe('ACTIVITY_CHILDREN');
    expect(data.fundSources).toEqual([]);
    expect(data.fundAllocations.create).toEqual([]);
    expect(tx.climateChangeTag.create).not.toHaveBeenCalled();
  });
});
