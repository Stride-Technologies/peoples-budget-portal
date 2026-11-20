import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countByFinishLine, filterPpmps } from './ppmp-filter.ts';
import type { PublicClusterRecord, PublicPpmpSummaryRecord } from './api.ts';

const fl = (id: string) => ({ finishLine: { id, name: id, visionNumber: null } });
const clusters: PublicClusterRecord[] = [
  { id: 'infra', name: 'Infra', offices: [{ id: 'ceo', name: 'Engineer', acronym: 'CEO' }], finishLineClusters: [fl('fl2'), fl('fl3')] },
  { id: 'health', name: 'Health', offices: [{ id: 'cho', name: 'Health Officer', acronym: 'CHO' }], finishLineClusters: [fl('fl4')] },
];
const plan = (id: string, officeId: string, acronym: string, name: string): PublicPpmpSummaryRecord => ({
  id, name, fundingProgram: 'Program X', officeId, office: { id: officeId, name: `${acronym} office`, acronym },
  classification: 'OPERATIONS', grandTotal: '1.00', lineItemCount: 1, publishedAt: '', createdAt: '', updatedAt: '', feedbackCount: 0,
});
const plans = [plan('a', 'ceo', 'CEO', 'Drainage'), plan('b', 'cho', 'CHO', 'Medicines'), plan('c', 'gso', 'GSO', 'Paper')];
const none = { finishLineIds: [], clusterId: 'all', officeId: 'all', search: '' };
const ids = (r: PublicPpmpSummaryRecord[]) => r.map((p) => p.id);

test('a plan belongs to a finish line through its office’s clusters', () => {
  assert.deepEqual(ids(filterPpmps(plans, { ...none, finishLineIds: ['fl3'] }, clusters)), ['a']);
  assert.deepEqual(ids(filterPpmps(plans, { ...none, finishLineIds: ['fl3', 'fl4'] }, clusters)), ['a', 'b']);
});

test('an office in no cluster matches no finish line, but still appears unfiltered', () => {
  assert.deepEqual(ids(filterPpmps(plans, { ...none, finishLineIds: ['fl2'] }, clusters)), ['a']);
  assert.deepEqual(ids(filterPpmps(plans, none, clusters)), ['a', 'b', 'c']);
});

test('cluster, office and search narrow together', () => {
  assert.deepEqual(ids(filterPpmps(plans, { ...none, clusterId: 'health' }, clusters)), ['b']);
  assert.deepEqual(ids(filterPpmps(plans, { ...none, officeId: 'gso' }, clusters)), ['c']);
  assert.deepEqual(ids(filterPpmps(plans, { ...none, search: 'cho' }, clusters)), ['b']);
});

test('chip counts are plans per finish line', () => {
  assert.deepEqual([...countByFinishLine(plans, clusters)].sort(), [['fl2', 1], ['fl3', 1], ['fl4', 1]]);
});
