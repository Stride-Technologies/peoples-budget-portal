import { Prisma } from '../../generated/prisma/index';
import { CAT } from '../test-catalogue.js';
import type { QueryRecord } from './engine.js';
import { QueryService } from './query.service.js';
import type { Query } from './query.js';

const d = (v: string) => new Prisma.Decimal(v);
const program = (id: string, name: string, amount: string): QueryRecord => ({
  dims: {
    rowId: id,
    name,
    office: 'CEO',
    label: ['infra'],
    year: '2027',
    kind: 'aip',
  },
  money: { amount: d(amount) },
});
const activity = (
  id: string,
  parentId: string,
  name: string,
  amount: string,
): QueryRecord => ({
  dims: { rowId: id, parentId, name, office: 'CEO' },
  money: { amount: d(amount) },
});

function service(by: Record<string, QueryRecord[]>) {
  const s = new QueryService(
    {} as never,
    {} as never,
    { get: () => Promise.resolve(CAT) } as never,
  );
  jest
    .spyOn(
      s as unknown as { records: (src: string) => Promise<QueryRecord[]> },
      'records',
    )
    .mockImplementation((src: string) => Promise.resolve(by[src] ?? []));
  return s;
}

const aip = CAT.documents.find((x) => x.kind === 'aip')!;
const q = (source: Query['source']): Query => ({
  source,
  documents: [{ kind: 'aip', years: [aip.year] }],
  dimensions: [],
  measures: [],
  filters: [],
});

describe('Records rows (specs/020)', () => {
  const by = {
    'aip-programs': [
      program('p1', 'Road Program', '300.00'),
      program('p2', 'Health Program', '100.00'),
    ],
    'aip-activities': [
      activity('a1', 'p1', 'Road Widening, Balatas', '100.00'),
      activity('a2', 'p1', 'Drainage, Tinago', '200.00'),
      activity('a3', 'p9', 'Not listed', '1.00'),
    ],
    terms: [
      {
        ...program('p1', 'Road Program', '300.00'),
        dims: { ...program('p1', 'Road Program', '300.00').dims, term: 'road' },
      },
      {
        ...program('p1', 'Road Program', '300.00'),
        dims: {
          ...program('p1', 'Road Program', '300.00').dims,
          term: 'program',
        },
      },
    ],
  };

  it('gives each listed program its projects and activities, largest first', async () => {
    const r = await service(by).rows(q('aip-programs'), {
      offset: 0,
      size: 50,
    });
    expect(r.rows.map((x) => x.id)).toEqual(['p1', 'p2']);
    expect(r.children).toEqual({
      p1: [
        { id: 'a2', name: 'Drainage, Tinago', amount: '200.00' },
        { id: 'a1', name: 'Road Widening, Balatas', amount: '100.00' },
      ],
    });
  });

  it("lists a row of the words source once, and flags the explorer's own fields", async () => {
    const r = await service(by).rows(q('terms'), { offset: 0, size: 50 });
    expect(r.total).toBe(1);
    const derived = r.columns.filter((c) => c.derived).map((c) => c.field);
    expect(derived).toEqual(
      expect.arrayContaining(['term', 'termLabel', 'label', 'subLabel']),
    );
    expect(
      r.columns.find((c) => c.field === 'office')?.derived,
    ).toBeUndefined();
  });
});
