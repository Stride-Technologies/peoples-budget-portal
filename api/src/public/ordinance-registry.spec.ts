import { Prisma } from '../generated/prisma/index';
import type { BudgetItemNode } from '../budget-documents/budget-item-view.js';
import { feedbackTargetOf, getOrdinancePA } from './ordinance-registry.js';

const d = (v: number) => new Prisma.Decimal(v);

function item(
  id: string,
  parentId: string | null,
  own: { ps?: number; mooe?: number } = {},
): BudgetItemNode {
  return {
    id,
    parentId,
    rootItemId: 'r',
    officeId: 'office-1',
    hostOfficeId: null,
    papClass: 'OPERATIONS',
    aipReferenceCode: `code-${id}`,
    name: `Item ${id}`,
    majorFinalOutput: null,
    performanceIndicator: null,
    target: null,
    ps: d(own.ps ?? 0),
    mooe: d(own.mooe ?? 0),
    fe: d(0),
    co: d(0),
    unsplit: d(0),
    total: d(0),
    fundSource: 'GF',
    orderIndex: 0,
  };
}

/**
 * A Prisma stand-in over one enacted tree. `visibleItem` (findFirst by id) only
 * sees ids in `tree`; `mirrorPAs` are old `project_activities` rows.
 */
function db(tree: BudgetItemNode[], mirrorPAs: string[] = []) {
  const byId = new Map(tree.map((t) => [t.id, t]));
  const withDoc = (t: BudgetItemNode) => ({
    ...t,
    documentId: 'doc',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    document: {
      finalizedAt: new Date(0),
      budgetCycle: { fiscalYear: 2026, aipCycle: { id: 'cycle' } },
    },
  });
  return {
    budgetItem: {
      findFirst: jest.fn(
        ({ where }: { where: { id: string; rootItemId?: string } }) => {
          const t = byId.get(where.id);
          if (!t || (where.rootItemId && t.rootItemId !== where.rootItemId))
            return Promise.resolve(null);
          return Promise.resolve(withDoc(t));
        },
      ),
      findMany: jest.fn(
        ({
          where,
        }: {
          where: { rootItemId?: string; id?: { in: string[] } };
        }) =>
          Promise.resolve(
            where.rootItemId
              ? tree.filter((t) => t.rootItemId === where.rootItemId)
              : (where.id?.in ?? []).map((id) => ({ id, thematicTags: [] })),
          ),
      ),
      findUniqueOrThrow: jest.fn(() => Promise.resolve({ thematicTags: [] })),
    },
    projectActivity: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(mirrorPAs.includes(where.id) ? { id: where.id } : null),
      ),
    },
    budgetDocument: {},
    programComment: {},
  } as unknown as Parameters<typeof getOrdinancePA>[0];
}

// root r own 100 (MOOE) ─ A own 50 (PS)
const tree = [item('r', null, { mooe: 100 }), item('A', 'r', { ps: 50 })];

describe('feedbackTargetOf', () => {
  const prisma = db(tree);

  it('names the root when no PPA is given', async () => {
    expect(await feedbackTargetOf(prisma, 'r')).toBe('r');
  });

  it('names a PPA under the root', async () => {
    expect(await feedbackTargetOf(prisma, 'r', 'A')).toBe('A');
  });

  it('maps a synthetic own-money leaf to the item that owns it', async () => {
    expect(await feedbackTargetOf(prisma, 'r', 'r~own')).toBe('r');
  });

  it('is null for a non-root, an unknown PPA, or an id not in an enacted Ordinance', async () => {
    expect(await feedbackTargetOf(prisma, 'A')).toBeNull();
    expect(await feedbackTargetOf(prisma, 'r', 'nope')).toBeNull();
    expect(await feedbackTargetOf(prisma, 'program-uuid')).toBeNull();
  });
});

describe('getOrdinancePA', () => {
  it('returns a real PPA with its parent', async () => {
    const pa = await getOrdinancePA(db(tree), 'r', 'A');
    expect(pa?.id).toBe('A');
    expect(String(pa?.proposedBudget)).toBe('50.00');
  });

  it('returns the root own-money leaf', async () => {
    const pa = await getOrdinancePA(db(tree), 'r', 'r~own');
    expect(String(pa?.proposedBudget)).toBe('100.00');
  });

  it("lands an old mirror PA link on the root's own money", async () => {
    const pa = await getOrdinancePA(db(tree, ['old-pa']), 'r', 'old-pa');
    expect(pa?.id).toBe('r~own');
    expect(String(pa?.proposedBudget)).toBe('100.00');
  });

  it('lands an old mirror PA on a single-row root itself', async () => {
    const single = [item('r', null, { mooe: 100 })];
    const pa = await getOrdinancePA(db(single, ['old-pa']), 'r', 'old-pa');
    expect(pa?.id).toBe('r~own');
    expect(String(pa?.proposedBudget)).toBe('100.00');
  });

  it('is null for an unknown PPA or a non-root parent', async () => {
    expect(await getOrdinancePA(db(tree), 'r', 'nope')).toBeNull();
    expect(await getOrdinancePA(db(tree), 'A', 'A')).toBeNull();
  });
});
