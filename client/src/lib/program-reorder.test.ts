import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  reorderPayload,
  sectionSectors,
  type ReorderScopeProgram,
} from './program-reorder.ts';

const p = (
  id: string,
  papClass: ReorderScopeProgram['papClass'],
  papSectorId: string,
  orderIndex: number,
): ReorderScopeProgram => ({
  id,
  name: id,
  code: id,
  papClass,
  papSectorId,
  papSectorLabel: `sector ${papSectorId}`,
  orderIndex,
});

const scope = [
  p('gas-a', 'GAS', 's1', 3),
  p('ops-a', 'OPERATIONS', 's1', 2),
  p('gas-b', 'GAS', 's1', 1),
  p('ops-null', null, 's1', 4),
  p('gas-other-sector', 'GAS', 's2', 1),
];

test('a section lists its programs by sector, in their current order', () => {
  assert.deepEqual(
    sectionSectors(scope, 'GAS').map((g) => [g.papSectorId, g.programs.map((x) => x.id)]),
    [
      ['s1', ['gas-b', 'gas-a']],
      ['s2', ['gas-other-sector']],
    ],
  );
  // A null papClass prints under Operations.
  assert.deepEqual(
    sectionSectors(scope, 'OPERATIONS')[0].programs.map((x) => x.id),
    ['ops-a', 'ops-null'],
  );
});

test('the payload lists every program in the sector once, keeping the rest in order', () => {
  const ids = reorderPayload(scope, 's1', ['gas-a', 'gas-b']);
  assert.deepEqual(ids, ['gas-a', 'gas-b', 'ops-a', 'ops-null']);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('gas-other-sector'));
});
