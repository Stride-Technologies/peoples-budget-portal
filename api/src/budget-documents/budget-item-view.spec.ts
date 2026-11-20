import { Prisma } from '../generated/prisma/index';
import { mapProgram } from '../open-data/open-data.mapper.js';
import { leafIds, toSheetProgram } from '../aip-registry/lbp-figures.js';
import {
  asProgramView,
  itemIdOf,
  ownLeafId,
  subtreeAmounts,
  type BudgetItemNode,
} from './budget-item-view.js';

const d = (v: string | number) => new Prisma.Decimal(v);

function item(
  id: string,
  parentId: string | null,
  own: {
    ps?: number;
    mooe?: number;
    fe?: number;
    co?: number;
    unsplit?: number;
  },
  extra: Partial<BudgetItemNode> = {},
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
    fe: d(own.fe ?? 0),
    co: d(own.co ?? 0),
    unsplit: d(own.unsplit ?? 0),
    total: d(0),
    fundSource: 'GF',
    orderIndex: 0,
    ...extra,
  };
}

// root own 100 (MOOE) ─ A own 50 (PS) ─ A1 own 200 (CO, FE 5) ; B own 0
const tree = [
  item('r', null, { mooe: 100 }),
  item('A', 'r', { ps: 50 }, { orderIndex: 1 }),
  item('A1', 'A', { co: 200, fe: 5 }, { orderIndex: 1 }),
  item('B', 'r', {}, { orderIndex: 2 }),
];

describe('subtreeAmounts', () => {
  it('adds own amounts up the tree, per class', () => {
    const a = subtreeAmounts(tree);
    expect(a.get('A1')!.total.toFixed(2)).toBe('205.00');
    expect(a.get('A')!.total.toFixed(2)).toBe('255.00');
    expect(a.get('r')!.total.toFixed(2)).toBe('355.00');
    expect(a.get('r')!.ps.toFixed(2)).toBe('50.00');
    expect(a.get('r')!.fe.toFixed(2)).toBe('5.00');
    expect(a.get('B')!.total.toFixed(2)).toBe('0.00');
  });
});

describe('asProgramView', () => {
  const { snapshot, live } = asProgramView(tree[0], tree, {
    office: { name: 'City Engineering Office', acronym: 'CEO' },
  });

  it('states the whole tree on the program, per class', () => {
    expect(snapshot.proposedTotal).toBe('355.00');
    expect(snapshot.psProposedTotal).toBe('50.00');
    expect(snapshot.mooeProposedTotal).toBe('100.00');
    expect(snapshot.feProposedTotal).toBe('5.00');
    expect(snapshot.coProposedTotal).toBe('200.00');
    expect(live.publishedProposedTotal).toBe('355.00');
  });

  it('gives every parent with own money a synthetic leaf, so leaves sum to the total', () => {
    const sheet = toSheetProgram(snapshot, {
      name: 'City Engineering Office',
      acronym: 'CEO',
    });
    const leaves = leafIds(sheet);
    const leafSum = sheet.activities
      .filter((a) => leaves.has(a.id))
      .reduce((s, a) => s.plus(a.total), d(0));
    expect(leafSum.toFixed(2)).toBe(sheet.total.toFixed(2));
    expect(leaves).toEqual(
      new Set([ownLeafId('r'), ownLeafId('A'), 'A1', 'B']),
    );
    expect(itemIdOf(ownLeafId('A'))).toBe('A');
    expect(itemIdOf('A1')).toBe('A1');
  });

  it('passes through the open-data mapper unchanged', () => {
    const mapped = mapProgram(snapshot, live, { fiscalYear: 2026 });
    expect(mapped.program).toMatchObject({
      id: 'r',
      fiscalYear: 2026,
      aipCode: 'code-r',
      codeIsFinal: true,
      officeCode: 'CEO',
      proposedTotal: '355.00',
      ps: '50.00',
      fe: '5.00',
      co: '200.00',
    });
    expect(mapped.activities.map((a) => a.id)).toEqual([
      ownLeafId('r'),
      'A',
      ownLeafId('A'),
      'A1',
      'B',
    ]);
    expect(mapped.activities.find((a) => a.id === 'A')!.proposedBudget).toBe(
      '255.00',
    );
  });

  it('a lone root is a direct-cost program with no activities', () => {
    const lone = item('solo', null, { ps: 10, co: 5 }, { rootItemId: 'solo' });
    const v = asProgramView(lone, [lone]);
    expect(v.snapshot.costMode).toBe('DIRECT_COSTS');
    expect(v.snapshot.projectActivities).toEqual([]);
    expect(v.snapshot.proposedTotal).toBe('15.00');
  });

  it('a parent with no own money gets no synthetic leaf', () => {
    const r = item('r2', null, {});
    const c = item('c', 'r2', { ps: 7 });
    const v = asProgramView(r, [r, c]);
    expect(
      (v.snapshot.projectActivities as { id: string }[]).map((a) => a.id),
    ).toEqual(['c']);
  });

  it('counts unsplit own money in the total but in no class', () => {
    const r = item('u', null, { ps: 10, unsplit: 90 }, { rootItemId: 'u' });
    const v = asProgramView(r, [r]);
    expect(v.snapshot.proposedTotal).toBe('100.00');
    expect(v.snapshot.psProposedTotal).toBe('10.00');
    expect(v.snapshot.mooeProposedTotal).toBe('0.00');
  });
});
