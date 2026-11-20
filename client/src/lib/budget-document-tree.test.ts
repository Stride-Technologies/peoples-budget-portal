import { test } from 'node:test';
import assert from 'node:assert/strict';
import { officeGroups } from './budget-document-tree.ts';

const office = (acronym: string) => ({ id: acronym, acronym, name: acronym });
const item = (
  id: string,
  parentId: string | null,
  orderIndex: number,
  papClass: string | null,
  o = 'CHO',
) => ({ id, parentId, orderIndex, papClass, total: '1.00', office: office(o) });

test('orders offices, PAP classes and trees depth-first', () => {
  const groups = officeGroups([
    item('ops', null, 1, 'OPERATIONS'),
    item('gas', null, 2, 'GAS'),
    item('ops-b', 'ops', 2, null),
    item('ops-a', 'ops', 1, null),
    item('ops-a-1', 'ops-a', 1, null),
    item('none', null, 0, null),
    item('bfp', null, 1, 'GAS', 'BFP'),
  ]);
  assert.deepEqual(
    groups.map((g) => g.office.acronym),
    ['BFP', 'CHO'],
  );
  assert.deepEqual(
    groups[1].rows.map((r) => `${r.item.id}@${r.depth}`),
    ['gas@0', 'ops@0', 'ops-a@1', 'ops-a-1@2', 'ops-b@1', 'none@0'],
  );
  assert.deepEqual(
    groups[1].roots.map((r) => r.id),
    ['gas', 'ops', 'none'],
  );
});

test('a child whose parent is out of scope reads as a root', () => {
  const [g] = officeGroups([item('orphan', 'elsewhere', 1, null)]);
  assert.deepEqual(g.rows, [{ item: g.roots[0], depth: 0 }]);
});
