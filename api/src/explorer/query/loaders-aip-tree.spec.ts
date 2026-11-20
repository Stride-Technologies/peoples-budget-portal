import { toSheetProgram } from '../../aip-registry/lbp-figures.js';
import { Prisma } from '../../generated/prisma/index';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { CAT } from '../test-catalogue.js';
import { runQuery } from './engine.js';
import {
  activityRecords,
  climateRecords,
  loadRecords,
  UNCODED,
} from './loaders.js';

type Tree = Parameters<typeof activityRecords>[0];
const doc = CAT.documents[0];
const sum = (field = 'amount') => ({ field, agg: 'sum' as const });

const pa = (id: string, extra: Record<string, unknown>) => ({
  id,
  name: `PA ${id}`,
  type: 'PROJECT',
  parentProjectActivityId: null,
  fundSources: ['GF'],
  fundAllocations: [],
  psEstimate: '0',
  mooeEstimate: '0',
  feEstimate: '0',
  coEstimate: '0',
  proposedBudget: '0',
  climateChangeTag: null,
  ...extra,
});

/** A published snapshot (strings, as stored) under a live row for joins. */
const program = (
  id: string,
  raw: Record<string, unknown>,
  live: Record<string, unknown> = {},
) => ({
  live: {
    officeId: 'db-CHO',
    papSectorId: 'db-3000',
    finishLineId: 'db-fl-1',
    subFinishLineId: null,
    thematicTags: [],
    projectActivities: [],
    ...live,
  },
  raw: { id, name: `Program ${id}`, costMode: 'ACTIVITY_CHILDREN', ...raw },
});

const TREE = (() => {
  const nested = program('p1', {
    proposedTotal: '100',
    projectActivities: [
      // A parent restating its children's sum: never counted with them.
      pa('a', { proposedBudget: '100', type: 'PROJECT' }),
      pa('a1', {
        parentProjectActivityId: 'a',
        proposedBudget: '60',
        psEstimate: '60',
        type: 'ACTIVITY',
        fundSources: ['GF', 'SEF'],
        fundAllocations: [
          { fundSource: 'GF', ps: '40', mooe: '0', fe: '0', co: '0' },
          { fundSource: 'SEF', ps: '20', mooe: '0', fe: '0', co: '0' },
        ],
        climateChangeTag: {
          ccaAmount: '30',
          ccmAmount: '5',
          codes: [
            {
              ccetCode: {
                code: 'A111-01',
                pillar: 'ADAPTATION',
                name: 'Policy',
              },
            },
            {
              ccetCode: {
                code: 'M111-01',
                pillar: 'MITIGATION',
                name: 'Energy',
              },
            },
          ],
        },
      }),
      pa('a2', {
        parentProjectActivityId: 'a',
        proposedBudget: '40',
        coEstimate: '40',
        fundSources: ['SEF'],
        climateChangeTag: { ccaAmount: '10', ccmAmount: '0', codes: [] },
      }),
    ],
  });
  nested.live.thematicTags = [{ tagId: 'db-gad' }] as never;
  const direct = program('p2', {
    costMode: 'DIRECT_COSTS',
    proposedTotal: '25',
    projectActivities: [],
    climateChangeTag: {
      ccaAmount: '0',
      ccmAmount: '25',
      codes: [
        { ccetCode: { code: 'M111-01', pillar: 'MITIGATION', name: 'Energy' } },
      ],
    },
  });
  return [nested, direct].map((p) => ({
    ...p,
    sheet: toSheetProgram(p.raw, null),
  })) as unknown as Tree;
})();

describe('aip-activities', () => {
  it('reads leaf PAs only, so they add up to the program, never parent + children', () => {
    const recs = activityRecords(TREE, doc, CAT, null);
    expect(recs.map((r) => r.dims.rowId)).toEqual(['a1', 'a2']);
    const r = runQuery(
      recs,
      { dimensions: ['program'], measures: [sum()], filters: [] },
      () => false,
    );
    expect(r.rows).toEqual([{ keys: ['Program p1'], values: ['100.00'] }]);
    expect(recs[0].dims).toMatchObject({
      paType: 'Activity',
      program: 'Program p1',
      name: 'PA a1',
      office: 'CHO',
      theme: ['gad'], // inherited from the program
    });
  });

  it('splits by fund through the PA fund lines', () => {
    const r = runQuery(
      activityRecords(TREE, doc, CAT, 'fund'),
      { dimensions: ['fund'], measures: [sum()], filters: [] },
      () => false,
    );
    expect(
      Object.fromEntries(r.rows.map((x) => [x.keys[0], x.values[0]])),
    ).toEqual({ GF: '40.00', SEF: '60.00' });
    expect(r.totals).toEqual(['100.00']);
  });
});

describe('climate-tags', () => {
  const recs = climateRecords(TREE, doc, CAT);

  it('one record per tag, on programs and PAs, CCA + CCM as money', () => {
    expect(recs.map((r) => [r.dims.rowId, r.dims.level])).toEqual([
      ['a1', 'Project or activity'],
      ['a2', 'Project or activity'],
      ['p2', 'Program'],
    ]);
    const r = runQuery(
      recs,
      {
        dimensions: ['level'],
        measures: [sum('cca'), sum('ccm'), sum()],
        filters: [],
      },
      () => false,
    );
    expect(r.totals).toEqual(['40.00', '30.00', '70.00']);
  });

  it('labels a tag with no code, and never totals across codes', () => {
    expect(recs[1].dims).toMatchObject({
      ccetCode: [],
      ccet: [UNCODED],
      pillar: [],
    });
    expect(recs[0].dims.pillar).toEqual(['Adaptation', 'Mitigation']);
    const r = runQuery(
      recs,
      { dimensions: ['ccetCode'], measures: [sum()], filters: [] },
      (f) => f === 'ccetCode',
    );
    expect(r.additive).toBe(false);
    expect(
      Object.fromEntries(r.rows.map((x) => [x.keys[0], x.values[0]])),
    ).toMatchObject({ 'A111-01': '35.00', 'M111-01': '60.00' });
  });
});

describe('projects', () => {
  const findMany = jest.fn().mockResolvedValue([
    {
      id: 'pp1',
      name: 'Laptops',
      officeId: 'db-CPDO',
      classification: 'SUPPORT_TO_OPERATIONS',
      kind: 'INDICATIVE',
      fundingProgram: 'ICT program',
      office: { acronym: 'CPDO' },
      lineItems: [
        { lineTotal: d('100.10'), fundSource: 'GF', expenseClass: 'MOOE' },
        { lineTotal: d('50'), fundSource: 'SEF', expenseClass: 'CO' },
      ],
    },
  ]);
  const prisma = {
    pPMP: { findMany },
    explorerAnnotation: { findMany: () => Promise.resolve([]) },
  } as unknown as PrismaService;

  it('reads published Projects only, total from line items', async () => {
    const recs = await loadRecords(prisma, 'projects', doc, CAT, null);
    expect(findMany.mock.calls[0][0].where).toEqual({
      aipCycleId: 'c27',
      isPublished: true,
    });
    expect(recs[0].dims).toMatchObject({
      office: 'CPDO',
      classification: 'Support to Operations',
      plan: 'Indicative',
      fund: ['GF', 'SEF'],
    });
    expect(recs[0].money.amount?.toFixed(2)).toBe('150.10');
    expect(recs[0].money.co?.toFixed(2)).toBe('50.00');
  });

  it('splits by the line items own fund, adding back to the Project', async () => {
    const r = runQuery(
      await loadRecords(prisma, 'projects', doc, CAT, 'fund'),
      {
        dimensions: ['fund'],
        measures: [sum(), { field: 'name', agg: 'countDistinct' }],
        filters: [],
      },
      () => false,
    );
    expect(r.rows.map((x) => [x.keys[0], x.values[0]])).toEqual([
      ['GF', '100.10'],
      ['SEF', '50.00'],
    ]);
    expect(r.totals?.[0]).toBe('150.10');
  });
});

function d(v: string) {
  return new Prisma.Decimal(v);
}
