import { Prisma } from '../generated/prisma/index';
import { budgetOverruns, type BudgetNode } from './ppmp-budget-warnings.js';

const D = (v: number) => new Prisma.Decimal(v);
const node = (
  key: string,
  parentKey: string | null,
  budget: number | null,
): BudgetNode => ({
  key,
  parentKey,
  field: key.startsWith('p:') ? 'programId' : 'projectActivityId',
  id: key.slice(2),
  name: key,
  code: `code-${key}`,
  budget: budget === null ? null : D(budget),
});
// Program 1,000 over PA a1 (600) over PA a2 (200).
const NODES = [
  node('p:p1', null, 1000),
  node('a:a1', 'p:p1', 600),
  node('a:a2', 'a:a1', 200),
];
const line = (id: string, ppmpId: string, total: number, key: string) => ({
  id,
  ppmpId,
  lineTotal: D(total),
  key,
});

describe('budgetOverruns', () => {
  it('counts a line against its row and every row above it, across PPMPs', () => {
    const w = budgetOverruns(
      NODES,
      [line('l1', 'mine', 250, 'a:a2'), line('l2', 'other', 400, 'a:a1')],
      'mine',
    );
    // a2: 250 > 200; a1: 250 + 400 = 650 > 600; p1: 650 ≤ 1,000.
    expect(
      w.map((x) => [x.id, x.linkedTotal, x.over, x.thisPpmpTotal, x.ppmpCount]),
    ).toEqual([
      ['a2', '250.00', '50.00', '250.00', 1],
      ['a1', '650.00', '50.00', '250.00', 2],
    ]);
    expect(w[0].lineItemIds).toEqual(['l1']);
  });

  it('warns only on rows this PPMP touches, and never without a budget', () => {
    expect(
      budgetOverruns(NODES, [line('l2', 'other', 5000, 'p:p1')], 'mine'),
    ).toEqual([]);
    expect(
      budgetOverruns(
        [node('p:p1', null, null)],
        [line('l1', 'mine', 5000, 'p:p1')],
        'mine',
      ),
    ).toEqual([]);
  });

  it("leaves out a parent that only repeats its child's overrun", () => {
    const solo = [node('p:p1', null, 200), node('a:a1', 'p:p1', 200)];
    const w = budgetOverruns(solo, [line('l1', 'mine', 250, 'a:a1')], 'mine');
    expect(w.map((x) => x.id)).toEqual(['a1']);
  });

  it('is quiet at exactly the budget', () => {
    expect(
      budgetOverruns(NODES, [line('l1', 'mine', 200, 'a:a2')], 'mine'),
    ).toEqual([]);
  });
});
