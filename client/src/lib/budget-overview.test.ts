import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBudgetOverview,
  FUND_MULTIPLE,
  FUND_NOT_STATED,
} from './budget-overview.ts';
import type {
  PublicClusterRecord,
  PublicFinishLineRecord,
  PublicProgramItem,
  PublicRegistryProjectActivity,
} from './api.ts';

const FL: PublicFinishLineRecord[] = [
  { id: 'fl1', name: 'Thriving Economy', visionNumber: 1, shortName: null, color: '#E5243B', programCount: 0 },
  { id: 'fl2', name: 'Green Naga', visionNumber: 2, shortName: null, color: '#4C9F38', programCount: 0 },
];

const CLUSTERS: PublicClusterRecord[] = [
  {
    id: 'c1',
    name: 'Economy',
    offices: [],
    finishLineClusters: [{ finishLine: { id: 'fl1', name: 'Thriving Economy', visionNumber: 1 } }],
  },
  {
    id: 'c2',
    name: 'Governance',
    offices: [],
    // Spans two finish lines, so it must not be given either one's colour.
    finishLineClusters: [
      { finishLine: { id: 'fl1', name: 'Thriving Economy', visionNumber: 1 } },
      { finishLine: { id: 'fl2', name: 'Green Naga', visionNumber: 2 } },
    ],
  },
];

function pa(over: Partial<PublicRegistryProjectActivity> = {}): PublicRegistryProjectActivity {
  return {
    id: 'pa' + Math.random(),
    type: 'PROJECT',
    name: 'PA',
    parentProjectActivityId: null,
    orderIndex: 0,
    tentativeAipReferenceCode: '',
    aipReferenceCode: null,
    costMode: 'DIRECT_COSTS',
    psTotal: '0.00',
    mooeTotal: '0.00',
    feTotal: '0.00',
    coTotal: '0.00',
    grandTotal: '0.00',
    proposedBudget: '0.00',
    fundSources: ['GF'],
    ...over,
  };
}

function program(over: Partial<PublicProgramItem> = {}): PublicProgramItem {
  return {
    id: 'p' + Math.random(),
    name: 'Program',
    status: 'PUBLISHED',
    tentativeAipReferenceCode: null,
    aipReferenceCode: null,
    proposedTotal: '0.00',
    fundSources: [],
    grandTotal: '0.00',
    psTotal: '0.00',
    mooeTotal: '0.00',
    feTotal: '0.00',
    coTotal: '0.00',
    papClass: 'OPERATIONS',
    office: { id: 'o1', name: 'Office One', acronym: 'O1', cluster: { id: 'c1', name: 'Economy' } },
    hostOffice: null,
    finishLine: { id: 'fl1', name: 'Thriving Economy', visionNumber: 1 },
    papSector: null,
    projectActivities: [],
    feedbackCount: 0,
    lastUpdatedAt: null,
    ...over,
  };
}

const base = { finishLines: FL, clusters: CLUSTERS, totalOfficeCount: 63 };

test('an empty cycle still lists every finish line and cluster', () => {
  // The whole point of the AIP Overview: "one of eight" only reads as a fact if
  // the other seven are visible with nothing next to them.
  const o = buildBudgetOverview({ items: [], ...base });
  assert.equal(o.finishLines.length, 2);
  assert.equal(o.clusters.length, 2);
  assert.equal(o.coverage.finishLinesRepresented, 0);
  assert.equal(o.coverage.totalProposed, '0.00');
  assert.equal(o.coverage.publishedOfficeCount, 0);
  assert.equal(o.coverage.totalOfficeCount, 63);
});

test('centavos survive summation — no float drift', () => {
  const o = buildBudgetOverview({
    items: [
      program({ proposedTotal: '0.10' }),
      program({ proposedTotal: '0.20' }),
      program({ proposedTotal: '1664699680.00' }),
    ],
    ...base,
  });
  assert.equal(o.coverage.totalProposed, '1664699680.30');
});

test('a programme is counted by proposedTotal, never by summing its PAs', () => {
  // A revision in flight makes the two disagree; the snapshot column wins.
  const o = buildBudgetOverview({
    items: [
      program({
        proposedTotal: '500.00',
        projectActivities: [pa({ proposedBudget: '999999.00' })],
      }),
    ],
    ...base,
  });
  assert.equal(o.coverage.totalProposed, '500.00');
});

test('fund attribution walks root PAs only, so children never double-count', () => {
  const parent = pa({ id: 'root', proposedBudget: '100.00', fundSources: ['GF'] });
  const o = buildBudgetOverview({
    items: [
      program({
        proposedTotal: '100.00',
        projectActivities: [
          parent,
          pa({ parentProjectActivityId: 'root', proposedBudget: '100.00', fundSources: ['GF'] }),
        ],
      }),
    ],
    ...base,
  });
  const gf = o.fundSources.find((f) => f.key === 'GF');
  assert.equal(gf?.amount, '100.00');
  assert.equal(o.fundSourceCaveats.totalRootPAs, 1);
});

test('a multi-fund PPA is bucketed, never split and never counted twice', () => {
  const o = buildBudgetOverview({
    items: [
      program({
        proposedTotal: '300.00',
        projectActivities: [
          pa({ proposedBudget: '100.00', fundSources: ['GF'] }),
          pa({ proposedBudget: '100.00', fundSources: ['GF', 'LDF'] }),
          pa({ proposedBudget: '100.00', fundSources: [] }),
        ],
      }),
    ],
    ...base,
  });
  const byKey = new Map(o.fundSources.map((f) => [f.key, f.amount]));
  assert.equal(byKey.get('GF'), '100.00');
  assert.equal(byKey.get(FUND_MULTIPLE), '100.00');
  assert.equal(byKey.get(FUND_NOT_STATED), '100.00');
  // The sum over buckets equals the money, exactly once.
  const sum = o.fundSources.reduce((t, f) => t + Number(f.amount), 0);
  assert.equal(sum, 300);
  assert.equal(o.fundSourceCaveats.multiple, 1);
  assert.equal(o.fundSourceCaveats.notStated, 1);
});

test('expense mix reports how many programmes are actually classified', () => {
  const o = buildBudgetOverview({
    items: [
      program({ proposedTotal: '300.00', psTotal: '100.00', mooeTotal: '200.00' }),
      program({ proposedTotal: '500.00' }), // no breakdown at all
    ],
    ...base,
  });
  assert.equal(o.expenseMix.ps, '100.00');
  assert.equal(o.expenseMix.mooe, '200.00');
  assert.equal(o.expenseMix.co, '0.00');
  assert.equal(o.expenseMix.total, '300.00');
  assert.equal(o.expenseMix.classifiedProgramCount, 1);
});

test('FE is its own slice of the expense mix and counts in the total (specs/008)', () => {
  const o = buildBudgetOverview({
    items: [
      program({ proposedTotal: '1200.00', mooeTotal: '1000.00', feTotal: '200.00' }),
      // A program classified by FE alone still counts as classified.
      program({ proposedTotal: '50.00', feTotal: '50.00' }),
    ],
    ...base,
  });
  assert.equal(o.expenseMix.fe, '250.00');
  assert.equal(o.expenseMix.total, '1250.00');
  assert.equal(o.expenseMix.classifiedProgramCount, 2);
});

test('a null papClass lands in Operations, matching the printed book', () => {
  const o = buildBudgetOverview({
    items: [
      program({ proposedTotal: '100.00', papClass: null }),
      program({ proposedTotal: '400.00', papClass: 'OPERATIONS' }),
      program({ proposedTotal: '900.00', papClass: 'GAS' }),
    ],
    ...base,
  });
  // Fixed book order, not size order — GAS prints first even though it is smaller.
  assert.deepEqual(o.papClasses.map((p) => p.key), ['GAS', 'OPERATIONS']);
  assert.equal(o.papClasses.find((p) => p.key === 'OPERATIONS')?.amount, '500.00');
  assert.equal(o.papClasses.find((p) => p.key === 'OPERATIONS')?.count, 2);
});

test('a cluster spanning two finish lines gets no borrowed colour', () => {
  const o = buildBudgetOverview({
    items: [
      program({
        proposedTotal: '100.00',
        office: { id: 'o2', name: 'Office Two', acronym: 'O2', cluster: { id: 'c2', name: 'Governance' } },
      }),
    ],
    ...base,
  });
  assert.equal(o.clusters.find((c) => c.key === 'c1')?.accent, '#E5243B');
  assert.equal(o.clusters.find((c) => c.key === 'c2')?.accent, null);
});

test('offices rank by amount and keep both names', () => {
  const o = buildBudgetOverview({
    items: [
      program({ proposedTotal: '100.00' }),
      program({
        proposedTotal: '900.00',
        office: { id: 'o2', name: 'Office Two', acronym: 'O2', cluster: null },
      }),
    ],
    ...base,
  });
  assert.deepEqual(o.offices.map((x) => x.label), ['O2', 'O1']);
  assert.equal(o.offices[0].sublabel, 'Office Two');
  assert.equal(o.coverage.publishedOfficeCount, 2);
});

test('a finish line missing from the reference list is still counted', () => {
  // Otherwise the page total stops matching the sum of its own rows.
  const o = buildBudgetOverview({
    items: [
      program({
        proposedTotal: '250.00',
        finishLine: { id: 'fl9', name: 'Unlisted', visionNumber: 9 },
      }),
    ],
    ...base,
  });
  assert.equal(o.finishLines.length, 3);
  assert.equal(o.finishLines.find((f) => f.key === 'fl9')?.amount, '250.00');
});

test('a program that states its own costs is its own funding entry', () => {
  // No PAs at all — the shape that walking root PAs used to drop entirely.
  const o = buildBudgetOverview({
    items: [
      program({ proposedTotal: '800000.00', fundSources: ['GF'], projectActivities: [] }),
      program({ proposedTotal: '200000.00', fundSources: ['GF', 'LDF'], projectActivities: [] }),
    ],
    ...base,
  });
  const gf = o.fundSources.find((f) => f.key === 'GF');
  assert.equal(gf?.amount, '800000.00');
  // Two funds named, no split stated — one bucket, counted once.
  const multi = o.fundSources.find((f) => f.key === FUND_MULTIPLE);
  assert.equal(multi?.amount, '200000.00');
  // Both are entries, and neither is "not stated".
  assert.equal(o.fundSourceCaveats.totalRootPAs, 2);
  assert.equal(o.fundSourceCaveats.multiple, 1);
  assert.equal(o.fundSourceCaveats.notStated, 0);
  // The fund breakdown ties to the cycle total — the whole point.
  const summed = o.fundSources.reduce((n, f) => n + Number(f.amount), 0);
  assert.equal(summed.toFixed(2), o.coverage.totalProposed);
});

test('a row split by fund lands in each fund exactly, at any depth', () => {
  const parent = pa({ id: 'root', costMode: 'ACTIVITY_CHILDREN', proposedBudget: '300.00', fundSources: ['GF', 'SHF'] });
  const o = buildBudgetOverview({
    items: [
      // NCGH-style: GF ₱3 + SHF ₱2 + GAA ₱280 on a program that states its own costs.
      program({
        proposedTotal: '285.00',
        fundSources: ['GF', 'SHF', 'NGA'],
        fundAllocations: [
          { fundSource: 'GF', ps: '0.00', mooe: '0.00', fe: '0.00', co: '3.00' },
          { fundSource: 'SHF', ps: '0.00', mooe: '0.00', fe: '0.00', co: '2.00' },
          { fundSource: 'NGA', ps: '0.00', mooe: '0.00', fe: '0.00', co: '280.00' },
        ],
      }),
      // A split child under a rolled-up parent: the parent is walked into.
      program({
        proposedTotal: '300.00',
        projectActivities: [
          parent,
          pa({
            parentProjectActivityId: 'root',
            proposedBudget: '200.00',
            fundSources: ['GF', 'SHF'],
            fundAllocations: [
              { fundSource: 'GF', ps: '150.00', mooe: '0.00', fe: '0.00', co: '0.00' },
              { fundSource: 'SHF', ps: '0.00', mooe: '50.00', fe: '0.00', co: '0.00' },
            ],
          }),
          pa({ parentProjectActivityId: 'root', proposedBudget: '100.00', fundSources: ['GF'] }),
        ],
      }),
    ],
    ...base,
  });
  const byKey = new Map(o.fundSources.map((f) => [f.key, f.amount]));
  assert.equal(byKey.get('GF'), '253.00');
  assert.equal(byKey.get('SHF'), '52.00');
  assert.equal(byKey.get('NGA'), '280.00');
  assert.equal(byKey.get(FUND_MULTIPLE), undefined);
  const sum = o.fundSources.reduce((t, f) => t + Number(f.amount), 0);
  assert.equal(sum, 585);
});
