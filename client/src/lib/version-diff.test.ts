import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromCentavos, isEmptyChange, toCentavos, versionChanges, type VersionSnapshot } from './version-diff.ts';

const pa = (id: string, name: string, amount: string | null, parent: string | null = null, extra = {}) => ({
  id,
  name,
  proposedBudget: amount,
  parentProjectActivityId: parent,
  ...extra,
});

// Shaped like the final 2027 reload of LDRRMF's prevention program.
const v1: VersionSnapshot = {
  name: 'Disaster Prevention and Mitigation Program',
  office: { acronym: 'LDRRMF' },
  finishLine: { name: 'Safer Naga' },
  proposedTotal: '102620000',
  projectActivities: [
    pa('ins', 'Insurance Project', null),
    pa('cal', 'Calamity Insurance Premiums', '3500000', 'ins', { fundSources: ['LDRRMF'] }),
    pa('res', 'DRRM Research Fund', '1500000', 'ins'),
    pa('flood', 'Flood Mitigation Infrastructure Project', null),
    pa('d1', 'Drainage, Kamagong St.', '1350000', 'flood'),
    pa('d2', 'Drainage, Igualdad', '2000000', 'flood'),
  ],
};
const v2: VersionSnapshot = {
  ...v1,
  office: { acronym: 'CDRRMO' },
  proposedTotal: '87230000.50',
  projectActivities: [
    pa('ins', 'Insurance Project', null),
    pa('cal', 'Calamity Insurance Premiums', '10000000', 'ins', { fundSources: ['LDRRMF', 'GF'] }),
    // Deleted and re-created under the same name: still one row.
    pa('res-new', 'DRRM Research Fund', '1500000', 'ins'),
    pa('flood2', 'Flood Mitigation Infrastructure and Intervention Project', null),
    pa('e1', 'Drainage at Kamagong St.', '1600000', 'flood2'),
    pa('e2', 'Purchase of land for Detention Pond', '10000000', 'flood2'),
  ],
};

test('centavo arithmetic is exact and keeps the sign', () => {
  assert.equal(toCentavos('0.10') + toCentavos('0.20'), toCentavos('0.30'));
  assert.equal(fromCentavos(toCentavos('-15390000.5')), '-15390000.50');
  assert.equal(toCentavos('not money'), 0);
});

test('total, office, funds and a changed amount are reported old → new', () => {
  const c = versionChanges(v1, v2);
  assert.deepEqual(c.total, { from: '102620000.00', to: '87230000.50', delta: '15389999.50', up: false });
  assert.deepEqual(c.fields.map((f) => [f.label, f.from, f.to]), [
    ['Implementing office', 'LDRRMF', 'CDRRMO'],
    ['Fund sources', 'LDRRMF', 'GF, LDRRMF'],
  ]);
  assert.deepEqual(c.amounts, [
    { name: 'Calamity Insurance Premiums', under: 'Insurance Project', from: '3500000.00', to: '10000000.00' },
  ]);
});

test('a re-created row with the same name and place is not added and removed', () => {
  const c = versionChanges(v1, v2);
  assert.ok(!c.added.some((a) => a.name === 'DRRM Research Fund'));
  assert.ok(!c.removed.some((a) => a.name === 'DRRM Research Fund'));
});

test('a dissolved project is one removal with its total; its replacement one addition', () => {
  const c = versionChanges(v1, v2);
  assert.deepEqual(c.removed, [
    {
      name: 'Flood Mitigation Infrastructure Project', under: null, amount: '3350000.00', items: 2,
      children: [{ name: 'Drainage, Kamagong St.', amount: '1350000.00' }, { name: 'Drainage, Igualdad', amount: '2000000.00' }],
    },
  ]);
  assert.deepEqual(c.added.map(({ children, ...a }) => ({ ...a, items: children.length })), [
    { name: 'Flood Mitigation Infrastructure and Intervention Project', under: null, amount: '11600000.00', items: 2 },
  ]);
});

test('a renamed row keeps its id and is reported as a rename', () => {
  const c = versionChanges(
    { projectActivities: [pa('a', 'Old name', '5')] },
    { projectActivities: [pa('a', 'New name', '5')] },
  );
  assert.deepEqual(c.renamed, [{ from: 'Old name', to: 'New name', under: null }]);
  assert.equal(c.added.length + c.removed.length + c.amounts.length, 0);
});

test('identical versions show nothing', () => {
  assert.ok(isEmptyChange(versionChanges(v1, structuredClone(v1))));
});

test('each row of the newer version says what happened to it', () => {
  const c = versionChanges(v1, v2);
  assert.deepEqual(c.rowStatus.cal, { kind: 'amount', from: '3500000.00', to: '10000000.00' });
  assert.deepEqual(c.rowStatus.flood2, { kind: 'added' });
  assert.deepEqual(c.rowStatus.e1, { kind: 'added' });
  assert.equal(c.rowStatus['res-new'], undefined); // re-created, unchanged
  assert.equal(c.rowStatus.ins, undefined);
});

test('a renamed row whose amount also changed is listed once, with its old name', () => {
  const c = versionChanges(
    { projectActivities: [pa('a', 'Drainage, Kamagong St.', '1350000')] },
    { projectActivities: [pa('a', 'Drainage at Kamagong St.', '1600000')] },
  );
  assert.deepEqual(c.amounts, [
    { name: 'Drainage at Kamagong St.', under: null, from: '1350000.00', to: '1600000.00', was: 'Drainage, Kamagong St.' },
  ]);
  assert.equal(c.renamed.length, 0);
});
