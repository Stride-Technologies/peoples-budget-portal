import {
  PublicService,
  publicExpenseClassAmount,
  snapshotExpenseClassAmount,
  stripProvenance,
} from './public.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CacheService } from '../cache/cache.service.js';
import type { RegistryCacheService } from '../cache/registry-cache.service.js';
import { Prisma } from '../generated/prisma/index';

const d = (v: string) => new Prisma.Decimal(v);

/**
 * The public PS/MOOE/CO cards read ₱0.00 because they were served from the
 * line-item rollups, which are structurally zero while line-item entry is
 * deferred (D17). These cover the precedence rule that fixed it.
 */
describe('publicExpenseClassAmount', () => {
  it('prefers the proposed estimate over a zero rollup', () => {
    expect(publicExpenseClassAmount(d('6500000'), d('0'))).toBe('6500000.00');
  });

  it('falls back to the rollup when no estimate was entered', () => {
    expect(publicExpenseClassAmount(null, d('1234.5'))).toBe('1234.50');
    expect(publicExpenseClassAmount(undefined, d('10'))).toBe('10.00');
  });

  it('treats a zero estimate as absent so the rollup can win', () => {
    expect(publicExpenseClassAmount(d('0'), d('999.99'))).toBe('999.99');
  });

  it('reports zero when both families are zero', () => {
    expect(publicExpenseClassAmount(d('0'), d('0'))).toBe('0.00');
  });

  it('keeps full precision on values a float would round', () => {
    // 18,2 money: this is exactly the drift Number() would introduce.
    expect(publicExpenseClassAmount(d('12345678901234.56'), d('0'))).toBe(
      '12345678901234.56',
    );
  });
});

describe('snapshotExpenseClassAmount', () => {
  it('parses decimals that arrive as JSON strings', () => {
    expect(snapshotExpenseClassAmount('6500000.00', '0')).toBe('6500000.00');
  });

  it('falls back through null, undefined and unparseable values', () => {
    expect(snapshotExpenseClassAmount(null, '42')).toBe('42.00');
    expect(snapshotExpenseClassAmount(undefined, undefined)).toBe('0.00');
    expect(snapshotExpenseClassAmount('not-a-number', '7')).toBe('7.00');
  });

  it('treats a zero string estimate as absent', () => {
    expect(snapshotExpenseClassAmount('0.00', '500')).toBe('500.00');
  });

  it('accepts numeric JSON values', () => {
    expect(snapshotExpenseClassAmount(250000, 0)).toBe('250000.00');
  });
});

/**
 * The version-history drawer served the raw snapshot, so every figure it showed
 * came from the line-item rollups and read ₱0.00 — while the detail view beside
 * it showed the proposed budget. Same normalization, same numbers.
 */
describe('PublicService.getVersion', () => {
  const prisma = {
    program: { findFirst: jest.fn().mockResolvedValue({ id: 'prog-1' }) },
    programVersion: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ver-2',
        version: 2,
        submittedAt: new Date('2026-08-04T07:51:00Z'),
        submittedByUserId: 'user-1',
        snapshot: {
          name: 'Public Order and Ordinance Enforcement',
          proposedTotal: '2250000',
          grandTotal: '0',
          psProposedTotal: '0',
          mooeProposedTotal: '1650000',
          coProposedTotal: '600000',
          psTotal: '0',
          mooeTotal: '0',
          coTotal: '0',
          projectActivities: [
            { id: 'pa-1', proposedBudget: '2250000', grandTotal: '0' },
          ],
        },
      }),
    },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;

  // `getVersion` does not cache, so a pass-through loader keeps this test on the
  // code path it is actually about.
  const cache = {
    getOrSet: jest.fn(<T>(_k: string, _ttl: number, load: () => Promise<T>) =>
      load(),
    ),
    del: jest.fn(),
    delByPrefix: jest.fn(),
  } as unknown as CacheService;

  const registryCache = {
    invalidatePublicRegistry: jest.fn().mockResolvedValue(undefined),
    invalidateRegistryCounts: jest.fn().mockResolvedValue(undefined),
    invalidateAll: jest.fn().mockResolvedValue(undefined),
  } as unknown as RegistryCacheService;

  it('serves the proposed figures, not the zero line-item rollups', async () => {
    const result = await new PublicService(
      prisma,
      cache,
      registryCache,
    ).getVersion('prog-1', 'ver-2');
    const snapshot = result.snapshot as Record<string, unknown>;

    expect(snapshot.grandTotal).toBe('2250000.00');
    expect(snapshot.mooeTotal).toBe('1650000.00');
    expect(snapshot.coTotal).toBe('600000.00');
    expect(snapshot.psTotal).toBe('0.00'); // both families zero — genuinely zero
    expect(
      (snapshot.projectActivities as Array<Record<string, unknown>>)[0]
        .grandTotal,
    ).toBe('2250000.00');
    // Untouched snapshot fields still pass through.
    expect(snapshot.name).toBe('Public Order and Ordinance Enforcement');
  });
});

describe('PublicService.submitFeedback — cache invalidation', () => {
  it('drops the cached public registry so feedbackCount is not stale', async () => {
    // `feedbackCount` rides in the cached list payload and `most_feedback` sorts
    // on it, so a new comment has to expire the group or the count sits still
    // for the whole TTL.
    const prisma = {
      // No enacted Ordinance here: the AIP path (specs/012).
      budgetDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      budgetItem: { findFirst: jest.fn().mockResolvedValue(null) },
      program: { findFirst: jest.fn().mockResolvedValue({ id: 'prog-1' }) },
      programComment: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;

    const registryCache = {
      invalidatePublicRegistry: jest.fn().mockResolvedValue(undefined),
      invalidateRegistryCounts: jest.fn().mockResolvedValue(undefined),
      invalidateAll: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegistryCacheService;

    const cache = {
      getOrSet: jest.fn(),
      del: jest.fn(),
      delByPrefix: jest.fn(),
    } as unknown as CacheService;

    await new PublicService(prisma, cache, registryCache).submitFeedback(
      'prog-1',
      {
        message: 'Please widen the sidewalk.',
        // Verified by RecaptchaGuard before the service is reached.
        recaptchaToken: 'test-token',
      },
    );

    expect(registryCache.invalidatePublicRegistry).toHaveBeenCalledTimes(1);
  });
});

/**
 * Looks for a clause anywhere in a Prisma `where` tree — structural rather
 * than a shape assertion on a particular index, matching
 * `aip-registry.service.spec.ts`'s own `containsClause` helper.
 */
function containsClause(node: unknown, needle: string): boolean {
  if (node === null || node === undefined) return false;
  if (Array.isArray(node))
    return node.some((item) => containsClause(item, needle));
  if (typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).some(
      ([key, value]) =>
        `${key}:${JSON.stringify(value)}`.includes(needle) ||
        containsClause(value, needle),
    );
  }
  return false;
}

describe('PublicService.listPrograms — thematic tag filter reaches child PAs', () => {
  function makeService() {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      // No enacted Ordinance here: the AIP path (specs/012).
      budgetDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      budgetItem: { findFirst: jest.fn().mockResolvedValue(null) },
      program: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { publishedProposedTotal: d('7.50') } }),
        findMany,
      },
      office: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    } as unknown as PrismaService;

    const cache = {
      getOrSet: jest.fn(
        (_k: string, _ttl: number, load: () => Promise<unknown>) => load(),
      ),
      del: jest.fn(),
      delByPrefix: jest.fn(),
    } as unknown as CacheService;

    const registryCache = {} as unknown as RegistryCacheService;

    return {
      service: new PublicService(prisma, cache, registryCache),
      findMany,
      prisma,
    };
  }

  it('totals the published figure, so an open revision cannot leak into the headline', async () => {
    const { service, prisma } = makeService();

    const res = await service.listPrograms({ cycleId: 'cycle-1' });

    const call = (prisma.program.aggregate as jest.Mock).mock.calls[0][0];
    expect(call._sum).toEqual({ publishedProposedTotal: true });
    expect(res.totalBudget).toBe('7.50');
    expect(res.totalProposedBudget).toBe('7.50');
  });

  it('matches a program whose tag lives only on a child PA, not just its own', async () => {
    const { service, findMany } = makeService();

    await service.listPrograms({
      cycleId: 'cycle-1',
      thematicTagIds: ['tag-1'],
    });

    const where = findMany.mock.calls[0][0].where as unknown;
    expect(
      containsClause(where, 'thematicTags:{"some":{"tagId":"tag-1"}}'),
    ).toBe(true);
    expect(
      containsClause(where, 'projectActivities:{"some":{"thematicTags"'),
    ).toBe(true);
  });

  it('omits the tag condition entirely when no tag is selected', async () => {
    const { service, findMany } = makeService();

    await service.listPrograms({ cycleId: 'cycle-1' });

    const where = findMany.mock.calls[0][0].where as unknown;
    expect(containsClause(where, 'tagId')).toBe(false);
  });

  it('adds the PAP class and fund source filters as their own conjuncts (#107)', async () => {
    const { service, findMany } = makeService();

    await service.listPrograms({
      cycleId: 'cycle-1',
      papClasses: ['GAS'],
      fundSources: ['LDRRMF'],
    });

    const where = findMany.mock.calls[0][0].where as unknown;
    expect(containsClause(where, 'papClass:{"in":["GAS"]}')).toBe(true);
    expect(
      containsClause(
        where,
        'projectActivities:{"some":{"fundSources":{"hasSome":["LDRRMF"]}}}',
      ),
    ).toBe(true);
  });

  it('extends search to match a tag name on the program or a child PA', async () => {
    const { service, findMany } = makeService();

    await service.listPrograms({ cycleId: 'cycle-1', search: 'senior' });

    const where = findMany.mock.calls[0][0].where as unknown;
    expect(containsClause(where, 'name:{"contains":"senior"')).toBe(true);
    expect(
      containsClause(
        where,
        'thematicTags:{"some":{"tag":{"name":{"contains":"senior"',
      ),
    ).toBe(true);
    expect(
      containsClause(where, 'projectActivities:{"some":{"thematicTags"'),
    ).toBe(true);
  });
});

describe('stripProvenance', () => {
  it('keeps the internal workbook reference off public rows', () => {
    const row = {
      id: 'p1',
      name: 'X',
      sourceRef: 'ECON!r305',
      sourceDocumentId: 'd1',
    };
    expect(stripProvenance(row)).toEqual({ id: 'p1', name: 'X' });
  });
});

// specs/012 P0: the public cycle record says which sections a year belongs to,
// computed server-side, plus its Budget Cycle stage.
describe('PublicService.listCycles', () => {
  it('returns sections, aipStatus and the stage for each year', async () => {
    const prisma = {
      aIPCycle: {
        findMany: jest
          .fn()
          // first call: the public select; second: loadCycleSections
          .mockResolvedValueOnce([
            {
              id: 'c27',
              fiscalYear: 2027,
              status: 'ADOPTED',
              publicComparisonEnabled: false,
              publicAipOverviewEnabled: false,
              publicAnnualOverviewEnabled: true,
              publicPpmpOverviewEnabled: false,
              budgetCycle: { currentStage: 4, alongsideStages: [3] },
            },
            {
              id: 'c26',
              fiscalYear: 2026,
              status: 'LOCKED',
              publicComparisonEnabled: false,
              publicAipOverviewEnabled: false,
              publicAnnualOverviewEnabled: true,
              publicPpmpOverviewEnabled: false,
              budgetCycle: {
                currentStage: 8,
                alongsideStages: [9],
                statedTotal: new Prisma.Decimal('2122357059'),
                statedOfficeTotal: new Prisma.Decimal('1664699680'),
                statedSpecialTotal: new Prisma.Decimal('457657379'),
                statedSource: 'Ord. 2025-131',
                documents: [{ kind: 'ORDINANCE' }],
              },
            },
          ])
          .mockResolvedValueOnce([
            { id: 'c27', fiscalYear: 2027, status: 'ADOPTED' },
            { id: 'c26', fiscalYear: 2026, status: 'LOCKED' },
          ]),
      },
      program: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ aipCycleId: 'c27' }, { aipCycleId: 'c26' }]),
      },
      budgetDocument: { findMany: jest.fn().mockResolvedValue([]) },
      programVersion: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({
            _max: { submittedAt: new Date('2026-10-27T03:12:00Z') },
          })
          .mockResolvedValueOnce({ _max: { submittedAt: null } }),
      },
    } as unknown as PrismaService;
    const service = new PublicService(
      prisma,
      {} as CacheService,
      {} as RegistryCacheService,
    );
    const cycles = await service.listCycles();
    expect(cycles).toEqual([
      expect.objectContaining({
        fiscalYear: 2027,
        aipStatus: 'ADOPTED',
        sections: ['aip'],
        currentStage: 4,
        alongsideStages: [3],
      }),
      expect.objectContaining({
        fiscalYear: 2026,
        status: 'LOCKED',
        sections: ['annual'],
        currentStage: 8,
      }),
    ]);
    expect(cycles[0]).not.toHaveProperty('budgetCycle');
    // specs/013: the newest publish, and the ordinance's stated total as strings.
    expect(cycles[0].lastPublishedAt).toEqual(new Date('2026-10-27T03:12:00Z'));
    expect(cycles[0].statedTotal).toBeNull();
    expect(cycles[1]).toMatchObject({
      lastPublishedAt: null,
      statedTotal: '2122357059.00',
      statedOfficeTotal: '1664699680.00',
      statedSpecialTotal: '457657379.00',
      statedSource: 'Ord. 2025-131',
      hasEnactedOrdinance: true,
      annualDocumentKind: 'ORDINANCE',
    });
    expect(cycles[0].hasEnactedOrdinance).toBe(false);
    expect(cycles[0].annualDocumentKind).toBeNull();
  });
});

describe('PublicService.getFundRule', () => {
  const service = (findFirst: jest.Mock) =>
    new PublicService(
      { fundRule: { findFirst } } as unknown as PrismaService,
      {} as CacheService,
      {} as RegistryCacheService,
    );

  it('reads the newest rule in force for the year, minimum as a string', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      fundSource: 'LDF',
      effectiveFrom: 1992,
      legalBasis: 'RA 7160 §287',
      description: 'x',
      minimumPercent: new Prisma.Decimal('20'),
      minimumBase: 'NTA',
    });
    const rule = await service(findFirst).getFundRule('LDF', 2026);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fundSource: 'LDF', effectiveFrom: { lte: 2026 } },
        orderBy: { effectiveFrom: 'desc' },
      }),
    );
    expect(rule.minimumPercent).toBe('20.000');
  });

  it('404s an unknown fund without querying, and a fund with no rule', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await expect(service(findFirst).getFundRule('NOPE', 2026)).rejects.toThrow(
      'No such fund',
    );
    expect(findFirst).not.toHaveBeenCalled();
    await expect(service(findFirst).getFundRule('PPP', 2026)).rejects.toThrow(
      'No rule recorded',
    );
  });
});

/**
 * A program in PUBLISHED_REVISION is public at its published version. Its live
 * rows are the encoder's draft, which anonymous reads must never serve.
 */
describe('PublicService — a program under revision serves its published snapshot', () => {
  const snapshot = {
    name: 'Published name',
    remarks: 'Published remark',
    grandTotal: '100.00',
    psProposedTotal: '100.00',
    psTotal: '0',
    projectActivities: [
      {
        id: 'pa-pub',
        type: 'PROJECT',
        name: 'Published PA',
        remarks: null,
        proposedBudget: '100.00',
        grandTotal: '0',
        psEstimate: '100.00',
        psTotal: '0',
        orderIndex: 0,
        parentProjectActivityId: null,
        createdByUserId: 'staff-1',
        lineItems: [],
      },
    ],
  };

  function makeService(liveRows: unknown[] = []) {
    const prisma = {
      budgetDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      budgetItem: { findFirst: jest.fn().mockResolvedValue(null) },
      program: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ publishedVersion: { snapshot } }),
        count: jest.fn().mockResolvedValue(liveRows.length),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { publishedProposedTotal: d('100') } }),
        findMany: jest.fn((args: { where: unknown }) =>
          JSON.stringify(args.where).includes('"id":{"in"')
            ? Promise.resolve([{ id: 'p-1', publishedVersion: { snapshot } }])
            : Promise.resolve(liveRows),
        ),
      },
      projectActivity: { findFirst: jest.fn() },
      projectActivityThematicTag: { findMany: jest.fn().mockResolvedValue([]) },
      programThematicTag: { findMany: jest.fn().mockResolvedValue([]) },
      programComment: { create: jest.fn(), findMany: jest.fn() },
      office: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const cache = {
      getOrSet: jest.fn(
        (_k: string, _ttl: number, load: () => Promise<unknown>) => load(),
      ),
      del: jest.fn(),
      delByPrefix: jest.fn(),
    } as unknown as CacheService;
    return {
      service: new PublicService(
        prisma as unknown as PrismaService,
        cache,
        {} as RegistryCacheService,
      ),
      prisma,
    };
  }

  it('answers 404 for a PA that exists only in the draft', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.getProjectActivity('p-1', 'pa-draft-only'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.submitPAFeedback('p-1', 'pa-draft-only', {
        message: 'x',
        recaptchaToken: 't',
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.projectActivity.findFirst).not.toHaveBeenCalled();
    expect(prisma.programComment.create).not.toHaveBeenCalled();
  });

  it('serves a published PA from the snapshot, named fields only', async () => {
    const { service } = makeService();
    const pa = await service.getProjectActivity('p-1', 'pa-pub');
    expect(pa).toMatchObject({
      name: 'Published PA',
      proposedBudget: '100.00',
      psTotal: '100.00',
    });
    expect(pa).not.toHaveProperty('createdByUserId');
  });

  it('lists the snapshot PAs and figures, not the live draft tree', async () => {
    const liveRow = {
      id: 'p-1',
      name: 'Draft name',
      status: 'PUBLISHED_REVISION',
      versions: [],
      _count: { comments: 0 },
      grandTotal: d('999'),
      psTotal: d('0'),
      mooeTotal: d('0'),
      feTotal: d('0'),
      coTotal: d('0'),
      psProposedTotal: d('999'),
      mooeProposedTotal: d('0'),
      feProposedTotal: d('0'),
      coProposedTotal: d('0'),
      publishedName: 'Published name',
      publishedProposedTotal: d('100'),
      thematicTags: [],
      fundAllocations: [],
      updatedAt: new Date(),
      projectActivities: [
        {
          id: 'pa-draft-only',
          name: 'Draft PA',
          proposedBudget: d('899'),
          grandTotal: d('0'),
          psTotal: d('0'),
          mooeTotal: d('0'),
          feTotal: d('0'),
          coTotal: d('0'),
          psEstimate: d('899'),
          mooeEstimate: null,
          feEstimate: null,
          coEstimate: null,
        },
      ],
    };
    const { service } = makeService([liveRow]);
    const res = await service.listPrograms({ cycleId: 'cycle-1' });
    const [item] = res.items as Array<Record<string, unknown>>;
    expect(item.name).toBe('Published name');
    expect(item.psTotal).toBe('100.00');
    expect(
      (item.projectActivities as Array<{ id: string }>).map((p) => p.id),
    ).toEqual(['pa-pub']);
  });
});
