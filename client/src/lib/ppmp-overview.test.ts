import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPpmpOverview, NOT_STATED } from './ppmp-overview.ts';
import type { PublicPpmpRecord } from './api.ts';

type Item = PublicPpmpRecord['lineItems'][number];

function item(over: Partial<Item>): Item {
  return {
    id: Math.random().toString(36), ppmpId: 'p', lineItemName: 'x',
    typeOfProject: null, modeOfProcurement: null,
    uacsObjectId: 'u', uacsCode: '5-02', uacsDescription: 'd',
    quantity: '1.00', unit: 'lot', unitCost: '0.00', lineTotal: '0.00',
    fundSource: 'GENERAL_FUND' as Item['fundSource'], expenseClass: 'MOOE',
    preProcurementConferenceRequired: false,
    procurementStartMonth: 1, procurementStartYear: 2027, procurementEndMonth: 12, procurementEndYear: 2027,
    deliveryPeriod: null, supportingDocumentUrl: null, supportingDocumentName: null, remarks: null, orderIndex: 0,
    ...over,
  };
}

function plan(id: string, officeId: string, acronym: string, lineItems: Item[]): PublicPpmpRecord {
  return {
    id, name: id, fundingProgram: '', officeId, office: { id: officeId, name: `${acronym} office`, acronym },
    aipCycle: { id: 'c', fiscalYear: 2027 }, classification: 'OPERATIONS', lineItems,
    grandTotal: '0.00', publishedAt: '2026-10-01',
  };
}

const plans = [
  plan('a', 'o1', 'CEO', [
    item({ lineTotal: '0.10', typeOfProject: 'GOODS', modeOfProcurement: 'COMPETITIVE_BIDDING', procurementStartMonth: 3 }),
    item({ lineTotal: '0.20', typeOfProject: 'GOODS', modeOfProcurement: null, procurementStartMonth: 3 }),
  ]),
  plan('b', 'o2', 'CHO', [
    item({ lineTotal: '1000000.05', typeOfProject: 'INFRASTRUCTURE_PROJECTS', modeOfProcurement: 'COMPETITIVE_BIDDING', procurementStartYear: 2028, procurementStartMonth: 2 }),
  ]),
  plan('c', 'o1', 'CEO', []),
];

test('every breakdown adds up to the total, to the centavo, and keeps unclassified items', () => {
  const o = buildPpmpOverview({ plans, fiscalYear: 2027, totalOfficeCount: 60 });
  assert.equal(o.total, '1000000.35');
  const sum = (s: { amount: string }[]) =>
    s.reduce((n, x) => n + Math.round(Number(x.amount) * 100), 0);
  for (const slices of [o.types, o.modes, o.months, o.offices]) assert.equal(sum(slices), 100000035);
  assert.deepEqual(o.modes.find((m) => m.key === NOT_STATED), { key: NOT_STATED, label: 'Not stated yet', amount: '0.20', count: 1 });
  assert.equal(o.types.find((t) => t.key === NOT_STATED), undefined);
});

test('all twelve months of the year appear in order, then any month outside it', () => {
  const o = buildPpmpOverview({ plans, fiscalYear: 2027, totalOfficeCount: 60 });
  assert.equal(o.months.length, 13);
  assert.equal(o.months[2].label, 'Mar 2027');
  assert.equal(o.months[2].amount, '0.30');
  assert.equal(o.months[12].label, 'Feb 2028');
});

test('offices rank by planned spend and count plans, not line items', () => {
  const o = buildPpmpOverview({ plans, fiscalYear: 2027, totalOfficeCount: 60 });
  assert.deepEqual(o.offices.map((x) => [x.label, x.count]), [['CHO', 1], ['CEO', 2]]);
  assert.equal(o.officeCount, 2);
  assert.equal(o.planCount, 3);
  assert.equal(o.lineItemCount, 3);
});
