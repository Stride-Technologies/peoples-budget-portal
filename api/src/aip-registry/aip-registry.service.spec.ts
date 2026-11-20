import { AIPRegistryService } from './aip-registry.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ProgramsService } from '../programs/programs.service.js';
import type { CacheService } from '../cache/cache.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { Prisma } from '../generated/prisma/index';

/**
 * The office scope `buildVisibilityWhere` hands back for a scoped user — anyone
 * who is not SUPER_ADMIN, not LFC, without ALL_OFFICES scope and not a citywide
 * endorser. It is an `OR`, which is what made it easy to lose.
 */
const SCOPED_VISIBILITY = {
  deletedAt: null,
  OR: [{ officeId: { in: ['office-a'] } }],
};

/**
 * Recursively looks for a clause anywhere in a Prisma `where` tree.
 *
 * Deliberately structural rather than a shape assertion on `where.AND[0]`: the
 * point is "the scope still constrains the query", not "the scope sits at a
 * particular index", so composing the filter differently must not break this.
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

function makeService() {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    program: {
      findMany,
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({
        _sum: {
          psProposedTotal: new Prisma.Decimal(0),
          mooeProposedTotal: new Prisma.Decimal(0),
          feProposedTotal: new Prisma.Decimal('0'),
          coProposedTotal: new Prisma.Decimal(0),
          proposedTotal: new Prisma.Decimal(0),
        },
      }),
    },
    // The service batches the four counts + the aggregate; resolve in that order.
    $transaction: jest.fn().mockResolvedValue([
      0,
      0,
      0,
      0,
      0,
      {
        _sum: {
          psProposedTotal: new Prisma.Decimal(0),
          mooeProposedTotal: new Prisma.Decimal(0),
          feProposedTotal: new Prisma.Decimal('0'),
          coProposedTotal: new Prisma.Decimal(0),
          proposedTotal: new Prisma.Decimal(0),
        },
      },
    ]),
  } as unknown as PrismaService;

  const programs = {
    buildVisibilityWhere: jest.fn().mockResolvedValue(SCOPED_VISIBILITY),
  } as unknown as ProgramsService;

  // Always miss, so the loader runs and the counts are really queried.
  const cache = {
    getOrSet: jest.fn(
      (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
    ),
  } as unknown as CacheService;

  return {
    service: new AIPRegistryService(prisma, programs, cache),
    findMany,
  };
}

const USER = { sub: 'user-1', role: 'STAFF' } as unknown as JwtPayload;

describe('AIPRegistryService.list — office scope survives every filter', () => {
  /**
   * The regression this file exists for.
   *
   * `baseWhere` used to be built by spreading `visibility` and then spreading
   * the office and search filters, each of which carries its own `OR` key. Later
   * keys win in an object spread, so the scope was deleted the moment a scoped
   * user typed in the search box — the query degraded to `deletedAt: null` and
   * returned every office's programs, drafts included.
   */
  it.each([
    ['search alone', { search: 'road' }],
    ['office filter alone', { officeId: 'office-b' }],
    ['both together', { search: 'road', officeId: 'office-b' }],
    [
      'with every other filter too',
      {
        search: 'road',
        officeId: 'office-b',
        clusterId: 'cluster-1',
        cycleId: 'cycle-1',
        finishLineIds: ['fl-1'],
        thematicTagIds: ['tag-1'],
      },
    ],
  ])('keeps the visibility scope with %s', async (_label, filters) => {
    const { service, findMany } = makeService();

    await service.list({ tab: 'ALL', ...filters }, USER);

    const where = findMany.mock.calls[0][0].where as unknown;
    expect(containsClause(where, 'office-a')).toBe(true);
  });

  it('applies the search filter alongside the scope rather than instead of it', async () => {
    const { service, findMany } = makeService();

    await service.list(
      { tab: 'ALL', search: 'road', officeId: 'office-b' },
      USER,
    );

    const where = findMany.mock.calls[0][0].where as unknown;
    // All three must coexist: scope, office filter, search term.
    expect(containsClause(where, 'office-a')).toBe(true);
    expect(containsClause(where, 'office-b')).toBe(true);
    expect(containsClause(where, 'road')).toBe(true);
  });

  it('narrows an office filter to the owner, not supporting offices', async () => {
    const { service, findMany } = makeService();

    await service.list({ tab: 'ALL', officeId: 'office-b' }, USER);

    const where = findMany.mock.calls[0][0].where as unknown;
    // "This office's AIP" means the programs it proposes. Matching supporting
    // offices too put other offices' money in this office's total.
    expect(containsClause(where, 'supportingOffices')).toBe(false);
    expect(containsClause(where, 'office-b')).toBe(true);
  });

  it('still scopes the tab counts, not just the rows', async () => {
    const { service } = makeService();
    const spy = jest.spyOn(
      (service as unknown as { prisma: { program: { count: jest.Mock } } })
        .prisma.program,
      'count',
    );

    await service.list({ tab: 'ALL', search: 'road' }, USER);

    // A count that ignores the scope would report other offices' programs in the
    // tab badges even if the rows themselves were filtered correctly.
    for (const call of spy.mock.calls) {
      expect(containsClause(call[0]?.where, 'office-a')).toBe(true);
    }
  });
});

describe('AIPRegistryService.list — ordering', () => {
  /**
   * The client groups the list by run-length: it emits an office header when the
   * office changes and a section header when papClass changes, without
   * re-sorting. That only produces one header per office and per section if the
   * server hands the rows over already ordered this way, so the order is a
   * contract rather than a preference.
   */
  it('orders office → papClass → orderIndex, matching the export', async () => {
    const { service, findMany } = makeService();

    await service.list({ tab: 'ALL' }, USER);

    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { aipCycle: { fiscalYear: 'desc' } },
      { office: { acronym: 'asc' } },
      { papClass: { sort: 'asc', nulls: 'last' } },
      { orderIndex: 'asc' },
      { createdAt: 'asc' },
    ]);
  });

  it('can fetch a whole cycle in one page', async () => {
    const { service, findMany } = makeService();

    await service.list({ tab: 'ALL', pageSize: 1000 }, USER);

    // Grouping by office is only correct over the complete set; a page boundary
    // would split an office and repeat its header.
    expect(findMany.mock.calls[0][0].take).toBe(1000);
    expect(findMany.mock.calls[0][0].skip).toBe(0);
  });

  it('still clamps an absurd page size', async () => {
    const { service, findMany } = makeService();

    await service.list({ tab: 'ALL', pageSize: 100_000 }, USER);

    expect(findMany.mock.calls[0][0].take).toBe(1000);
  });
});

describe('AIPRegistryService.list — thematic tag filter composition', () => {
  it('composes thematicTagIds as one more AND entry, never an empty OR', async () => {
    const { service, findMany } = makeService();

    await service.list(
      { tab: 'ALL', thematicTagIds: ['tag-1', 'tag-2'] },
      USER,
    );

    const where = findMany.mock.calls[0][0].where as unknown;
    expect(containsClause(where, 'tagId:{"in":["tag-1","tag-2"]}')).toBe(true);
    // Still composed alongside the scope, not instead of it.
    expect(containsClause(where, 'office-a')).toBe(true);
  });

  it('omits the tag condition entirely when no tag is selected (never OR: [])', async () => {
    const { service, findMany } = makeService();

    await service.list({ tab: 'ALL' }, USER);

    const where = findMany.mock.calls[0][0].where as unknown;
    expect(containsClause(where, 'tagId')).toBe(false);
  });

  it('matches a program whose own tags miss but whose PA carries the tag', async () => {
    const { service, findMany } = makeService();

    await service.list({ tab: 'ALL', thematicTagIds: ['tag-1'] }, USER);

    const where = findMany.mock.calls[0][0].where as unknown;
    // Both the program-level and the PA-level branch of the OR must be present.
    expect(
      containsClause(where, 'thematicTags:{"some":{"tagId":{"in":["tag-1"]}}}'),
    ).toBe(true);
    expect(containsClause(where, 'projectActivities')).toBe(true);
  });

  it('extends search to match a tag name, alongside the existing name/code matches', async () => {
    const { service, findMany } = makeService();

    await service.list({ tab: 'ALL', search: 'senior' }, USER);

    const where = findMany.mock.calls[0][0].where as unknown;
    // The pre-existing name/code match still fires…
    expect(containsClause(where, 'name:{"contains":"senior"')).toBe(true);
    // …and so does the new tag-name branch, on both the program and its PAs.
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

describe('AIPRegistryService.list — effective thematic tags on the row', () => {
  const pa = (over: Record<string, unknown> = {}) => ({
    id: 'pa-1',
    name: 'Barangay Health Station Upgrade',
    parentProjectActivityId: null,
    proposedBudget: new Prisma.Decimal('100000.00'),
    psEstimate: null,
    mooeEstimate: null,
    feEstimate: null,
    coEstimate: null,
    fundSources: ['GENERAL_FUND'],
    expectedOutput: '1 health station upgraded',
    implementationStartYear: 2027,
    implementationEndYear: 2027,
    thematicTags: [],
    ...over,
  });

  const program = (
    projectActivities: unknown[],
    thematicTags: unknown[] = [],
  ) => ({
    id: 'prog-1',
    papClass: 'OPERATIONS',
    aipCycle: { fiscalYear: 2027 },
    updatedAt: new Date('2026-01-01'),
    projectActivities,
    comments: [],
    readStates: [],
    supportingOffices: [],
    thematicTags,
  });

  const tagRow = (id: string, name: string) => ({ tag: { id, name } });

  it("reports a program's own direct tags, never inherited", async () => {
    const { service, findMany } = makeService();
    findMany.mockResolvedValue([
      program([pa()], [tagRow('tag-1', 'Senior Citizens')]),
    ]);

    const res = await service.list({ tab: 'ALL' }, USER);

    expect(res.items[0].thematicTags).toEqual([
      { id: 'tag-1', name: 'Senior Citizens', inherited: false },
    ]);
  });

  it("flags a PA's tag as inherited only when it came solely from the parent program", async () => {
    const { service, findMany } = makeService();
    findMany.mockResolvedValue([
      program(
        [
          pa({ thematicTags: [tagRow('tag-2', 'PWD')] }),
          pa({ id: 'pa-2', thematicTags: [] }),
        ],
        [tagRow('tag-1', 'Senior Citizens'), tagRow('tag-2', 'PWD')],
      ),
    ]);

    const res = await service.list({ tab: 'ALL' }, USER);
    const [direct, inheritedOnly] = res.items[0].projectActivities;

    // pa-1 carries tag-2 directly, so it is not re-flagged inherited; it still
    // inherits tag-1 from the program.
    expect(direct.thematicTags).toEqual(
      expect.arrayContaining([
        { id: 'tag-2', name: 'PWD', inherited: false },
        { id: 'tag-1', name: 'Senior Citizens', inherited: true },
      ]),
    );
    expect(direct.thematicTags).toHaveLength(2);

    // pa-2 carries neither directly, so both of the program's tags show as inherited.
    expect(inheritedOnly.thematicTags).toEqual(
      expect.arrayContaining([
        { id: 'tag-1', name: 'Senior Citizens', inherited: true },
        { id: 'tag-2', name: 'PWD', inherited: true },
      ]),
    );
    expect(inheritedOnly.thematicTags).toHaveLength(2);
  });
});

describe('AIPRegistryService.list — derived data warnings on the row', () => {
  const pa = (over: Record<string, unknown> = {}) => ({
    id: 'pa-1',
    name: 'Barangay Health Station Upgrade',
    parentProjectActivityId: null,
    proposedBudget: new Prisma.Decimal('100000.00'),
    psEstimate: null,
    mooeEstimate: null,
    feEstimate: null,
    coEstimate: null,
    fundSources: ['GENERAL_FUND'],
    expectedOutput: '1 health station upgraded',
    implementationStartYear: 2027,
    implementationEndYear: 2027,
    ...over,
  });

  const program = (
    projectActivities: unknown[],
    papClass = 'OPERATIONS',
    fiscalYear = 2027,
  ) => ({
    id: 'prog-1',
    papClass,
    // Waives the fund-source and expected-output sentences for a historical
    // cycle, so the row says only what an office can still act on.
    aipCycle: { fiscalYear },
    updatedAt: new Date('2026-01-01'),
    projectActivities,
    comments: [],
    readStates: [],
    supportingOffices: [],
  });

  async function listOne(row: unknown) {
    const { service, findMany } = makeService();
    findMany.mockResolvedValue([row]);
    const res = await service.list({ tab: 'ALL' }, USER);
    return { item: res.items[0], select: findMany.mock.calls[0][0] };
  }

  /**
   * The three fields the registry select carries *only* for the derivation.
   * Nothing on screen reads them, so dropping one would look harmless — and
   * would silently make every row report a gap it does not have.
   */
  it.each(['fundSources', 'implementationStartYear', 'implementationEndYear'])(
    'still selects %s, which only deriveDataWarnings reads',
    async (field) => {
      const { select } = await listOne(program([pa()]));
      expect(select.include.projectActivities.select[field]).toBe(true);
    },
  );

  it('says nothing about a complete program', async () => {
    const { item } = await listOne(program([pa()]));
    expect(item.dataWarnings).toEqual([]);
  });

  it('reports the gaps on a row, in the publish panel’s own words', async () => {
    const { item } = await listOne(
      program([pa({ expectedOutput: null }), pa({ id: 'pa-2' })]),
    );
    expect(item.dataWarnings).toEqual(['1 of 2 PPAs have no expected output.']);
  });

  // The leaf rule has to hold here exactly as it does in readinessFor: a parent
  // draws its money from its children, so its own null amount is by design.
  it('counts only leaves, so a cost-derived parent is not a gap', async () => {
    const { item } = await listOne(
      program([
        pa({ id: 'parent', proposedBudget: null, expectedOutput: null }),
        pa({ id: 'kid', parentProjectActivityId: 'parent' }),
      ]),
    );
    expect(item.dataWarnings).toEqual([]);
  });
});
