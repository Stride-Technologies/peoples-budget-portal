import { Prisma } from '../../generated/prisma/index';
import type { Row } from '../sources.js';
import { CAT } from '../test-catalogue.js';
import { runQuery } from './engine.js';
import { rowRecords } from './loaders.js';

const d = (v: string | number) => new Prisma.Decimal(v);
const ROWS: Row[] = [
  {
    id: 'p1',
    label: 'Barangay clinic upgrade',
    officeId: 'db-CHO',
    sectorId: 'db-3000',
    finishLineId: 'db-fl-1',
    subFinishLineId: null,
    themeIds: ['db-gad'],
    money: { ps: d(60), mooe: d(30), fe: d(0), co: d(10), total: d(100) },
    byFund: { GF: d(70), SHF: d(30) },
  },
  {
    id: 'p2',
    label: 'Planning study',
    officeId: 'db-CPDO',
    sectorId: 'db-1000',
    finishLineId: null,
    subFinishLineId: null,
    themeIds: [],
    money: {
      ps: d(0),
      mooe: d('25.50'),
      fe: d(0),
      co: d(0),
      total: d('25.50'),
    },
    byFund: { _multi: d('25.50') },
  },
];
const doc = CAT.documents[0];
const sum = { field: 'amount', agg: 'sum' as const };
const total = (split: 'fund' | 'expenseClass' | null, dim: string) =>
  runQuery(
    rowRecords(ROWS, doc, CAT, split),
    { dimensions: [dim], measures: [sum], filters: [] },
    () => false,
  );

describe('rowRecords', () => {
  it('splits money by fund, never the whole row under each fund', () => {
    const r = total('fund', 'fund');
    expect(
      Object.fromEntries(r.rows.map((x) => [x.keys[0], x.values[0]])),
    ).toEqual({
      GF: '70.00',
      SHF: '30.00',
      _multi: '25.50', // unsplit multi-fund money keeps its own bucket (invariant 21)
    });
    expect(r.totals).toEqual(['125.50']);
  });

  it('splits money by class, leaving out a class with none', () => {
    const r = total('expenseClass', 'expenseClass');
    expect(r.rows.map((x) => x.keys[0]).sort()).toEqual(['CO', 'MOOE', 'PS']);
    expect(r.totals).toEqual(['125.50']);
  });

  it('keeps what a split leaves over as "Not specified", so it adds up to the rows', () => {
    const short: Row = {
      ...ROWS[0],
      id: 'qa',
      money: { ps: d(0), mooe: d(0), fe: d(0), co: d(0), total: d(50000) },
      byFund: { GF: d(10000) },
    };
    const r = runQuery(
      rowRecords([short], doc, CAT, 'fund'),
      { dimensions: ['fund'], measures: [sum], filters: [] },
      () => false,
    );
    expect(
      Object.fromEntries(r.rows.map((x) => [x.keys[0], x.values[0]])),
    ).toEqual({
      GF: '10000.00',
      _none: '40000.00',
    });
    const byClass = runQuery(
      rowRecords([short], doc, CAT, 'expenseClass'),
      { dimensions: ['expenseClass'], measures: [sum], filters: [] },
      () => false,
    );
    expect(byClass.totals).toEqual(['50000.00']); // a book's unsplit money
  });

  it('carries codes, topics and the row name, one record per row unsplit', () => {
    const recs = rowRecords(ROWS, doc, CAT, null);
    expect(recs).toHaveLength(2);
    expect(recs[0].dims).toMatchObject({
      office: 'CHO',
      cluster: 'social',
      year: '2027',
      kind: 'aip',
      theme: ['gad'],
      topic: ['health'],
      fund: ['GF', 'SHF'],
    });
    expect(recs[1].dims.topic).toEqual(['planning']);
    expect(recs[1].dims.fund).toEqual([]); // _multi is a bucket, not a fund
  });
});
