import { Prisma } from '../../generated/prisma/index';
import { OTHER, runQuery, type QueryRecord } from './engine.js';

const d = (v: string) => new Prisma.Decimal(v);
const rec = (
  dims: QueryRecord['dims'],
  money: Record<string, string | null>,
): QueryRecord => ({
  dims,
  money: Object.fromEntries(
    Object.entries(money).map(([k, v]) => [k, v === null ? null : d(v)]),
  ),
});

const RECS = [
  rec(
    { office: 'CHO', cls: 'PS', topic: ['health'] },
    { amount: '100.10', co: '0' },
  ),
  rec(
    { office: 'CHO', cls: 'MOOE', topic: ['health', 'youth'] },
    { amount: '50.00', co: '0' },
  ),
  rec(
    { office: 'CEO', cls: 'CO', topic: [] },
    { amount: '300.00', co: '300.00' },
  ),
  rec(
    { office: 'NCYDO', cls: 'MOOE', topic: ['youth'] },
    { amount: '20.00', co: null },
  ),
  rec({ office: null, cls: 'PS', topic: [] }, { amount: '5.00', co: '0' }),
];
const multi = (f: string) => f === 'topic';
const sum = { field: 'amount', agg: 'sum' as const };

describe('runQuery', () => {
  it('sums money exactly by one dimension, biggest first, nothing lost', () => {
    const r = runQuery(
      RECS,
      { dimensions: ['office'], measures: [sum], filters: [] },
      multi,
    );
    expect(r.rows.map((x) => [x.keys[0], x.values[0]])).toEqual([
      ['CEO', '300.00'],
      ['CHO', '150.10'],
      ['NCYDO', '20.00'],
      [null, '5.00'],
    ]);
    expect(r.totals).toEqual(['475.10']);
    expect(r.n).toBe(5);
  });

  it('puts a multi-valued record in each of its groups and gives no total (R12)', () => {
    const r = runQuery(
      RECS,
      { dimensions: ['topic'], measures: [sum], filters: [] },
      multi,
    );
    expect(
      Object.fromEntries(r.rows.map((x) => [String(x.keys[0]), x.values[0]])),
    ).toEqual({
      health: '150.10',
      youth: '70.00',
      null: '305.00',
    });
    expect(r.additive).toBe(false); // groups overlap: no grand total shown
    expect(r.totals).toEqual(['475.10']); // each record once
  });

  it('breaks down by two dimensions (rows × colour)', () => {
    const r = runQuery(
      RECS,
      {
        dimensions: ['office', 'cls'],
        measures: [sum],
        filters: [{ field: 'office', op: 'in', values: ['CHO'] }],
      },
      multi,
    );
    expect(r.rows.map((x) => [...x.keys, x.values[0]])).toEqual([
      ['CHO', 'PS', '100.10'],
      ['CHO', 'MOOE', '50.00'],
    ]);
  });

  it('keeps the top N by the first dimension and folds the rest into Other', () => {
    const r = runQuery(
      RECS,
      { dimensions: ['office'], measures: [sum], filters: [], limit: 2 },
      multi,
    );
    expect(r.rows.map((x) => x.keys[0])).toEqual(['CEO', 'CHO']);
    expect(r.other).toEqual({ keys: [OTHER], values: ['25.00'], n: 2 });
  });

  it('treats a missing amount as not there, not as zero', () => {
    const r = runQuery(
      RECS,
      {
        dimensions: [],
        measures: [
          { field: 'co', agg: 'avg' },
          { field: 'co', agg: 'min' },
        ],
        filters: [],
      },
      multi,
    );
    // NCYDO has no CO figure: averaged over 4, not 5
    expect(r.totals).toEqual(['75.00', '0.00']);
  });

  it('counts records and distinct values, and filters by range and name', () => {
    const r = runQuery(
      RECS,
      {
        dimensions: [],
        measures: [
          { field: '', agg: 'count' },
          { field: 'office', agg: 'countDistinct' },
        ],
        filters: [
          { field: 'amount', op: 'between', min: '10' },
          { field: 'cls', op: 'notIn', values: ['CO'] },
        ],
      },
      multi,
    );
    expect(r.totals).toEqual(['3', '2']); // CHO PS, CHO MOOE, NCYDO MOOE
    const named = runQuery(
      [
        rec({ name: 'Farm-to-market road' }, { amount: '1' }),
        rec({ name: 'Clinic' }, { amount: '1' }),
      ],
      {
        dimensions: [],
        measures: [sum],
        filters: [{ field: 'name', op: 'contains', text: 'FARM' }],
      },
      multi,
    );
    expect(named.n).toBe(1);
  });

  it('sorts by a dimension when asked (years in order)', () => {
    const years = [
      rec({ y: '2027' }, { amount: '1' }),
      rec({ y: '2023' }, { amount: '9' }),
      rec({ y: '2025' }, { amount: '5' }),
    ];
    const r = runQuery(
      years,
      {
        dimensions: ['y'],
        measures: [sum],
        filters: [],
        sort: { by: 'y', dir: 'asc' },
      },
      multi,
    );
    expect(r.rows.map((x) => x.keys[0])).toEqual(['2023', '2025', '2027']);
  });
});

describe('two measures on one field (specs/020 A3)', () => {
  it('accumulate it once', () => {
    const res = runQuery(
      [
        rec({ office: 'A' }, { amount: '10.00' }),
        rec({ office: 'A' }, { amount: '30.00' }),
      ],
      {
        dimensions: ['office'],
        measures: [
          { field: 'amount', agg: 'sum' },
          { field: 'amount', agg: 'avg' },
          { field: 'amount', agg: 'max' },
        ],
        filters: [],
      },
      () => false,
    );
    expect(res.rows[0].values).toEqual(['40.00', '20.00', '30.00']);
  });
});
