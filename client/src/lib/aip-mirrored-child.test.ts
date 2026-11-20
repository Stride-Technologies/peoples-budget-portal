import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapseMirroredChildren } from './aip-mirrored-child.ts';
import type { AIPEntry } from '@/components/aip/aip-master-list';

function program(over: Partial<AIPEntry> = {}): AIPEntry {
  return {
    id: 'p1',
    program_name: 'General Administrative Services',
    program_code: '1000-2-01-01-001-000-000',
    ppa_type: 'Program',
    status: 'Approved',
    expected_output_mfo: null,
    ps_amount: '0.00',
    mooe_amount: '0.00',
    co_amount: '0.00',
    total_amount: '122813122.58',
    proposedBudget: '122813122.58',
    children: [],
    ...over,
  } as AIPEntry;
}

function mirror(over: Partial<AIPEntry> = {}): AIPEntry {
  return program({
    id: 'pa1',
    ppa_type: 'Activity',
    ...over,
  });
}

test('drops the mirrored PA a money-carrying program row was written as', () => {
  const [row] = collapseMirroredChildren([program({ children: [mirror()] })]);

  assert.equal(row.children?.length, 0);
  // The money stays on the program, so the row still prints its own figure.
  assert.equal(row.total_amount, '122813122.58');
});

test('keeps a child whose name genuinely differs', () => {
  const [row] = collapseMirroredChildren([
    program({ children: [mirror({ program_name: 'Procurement training to barangays' })] }),
  ]);

  assert.equal(row.children?.length, 1);
});

test('keeps a same-named child carrying a different amount', () => {
  // Same title, different money means it is a real PPA, not the program restated.
  const [row] = collapseMirroredChildren([
    program({ children: [mirror({ total_amount: '500.00', proposedBudget: '500.00' })] }),
  ]);

  assert.equal(row.children?.length, 1);
});

test('keeps a same-named child that differs only on proposedBudget', () => {
  // The public table reads proposedBudget while the staff one reads total_amount,
  // so either field disagreeing has to be enough to keep the row.
  const [row] = collapseMirroredChildren([
    program({ children: [mirror({ proposedBudget: '1.00' })] }),
  ]);

  assert.equal(row.children?.length, 1);
});

test('keeps an identical child that has a subtree of its own', () => {
  const [row] = collapseMirroredChildren([
    program({ children: [mirror({ children: [mirror({ id: 'pa2' })] })] }),
  ]);

  assert.equal(row.children?.length, 1);
});

test('keeps a program with more than one child', () => {
  const [row] = collapseMirroredChildren([
    program({ children: [mirror(), mirror({ id: 'pa2', program_name: 'Something else' })] }),
  ]);

  assert.equal(row.children?.length, 2);
});

test('leaves a childless program alone', () => {
  const [row] = collapseMirroredChildren([program()]);

  assert.equal(row.children?.length, 0);
});

test('treats a null and an absent proposedBudget as the same', () => {
  const [row] = collapseMirroredChildren([
    program({
      proposedBudget: null,
      children: [mirror({ proposedBudget: undefined })],
    }),
  ]);

  assert.equal(row.children?.length, 0);
});
