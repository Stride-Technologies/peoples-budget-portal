import { Prisma } from '../../generated/prisma/index';
import { CAT } from '../test-catalogue.js';
import { runQuery, type QueryRecord } from './engine.js';
import { validateQuery, type Query } from './query.js';
import { distinctive, learnPhrases, termRecords, termsOf } from './terms.js';

describe('termsOf and phrases (specs/020 A4.1)', () => {
  it('without learned phrases, a name is its content words', () => {
    expect(termsOf('Drainage and Road Widening, City Proper')).toEqual([
      'drainage',
      'road',
      'widening',
      'proper',
    ]);
    expect(termsOf('Pagpapaunlad ng mga Sakahan')).toEqual([
      'pagpapaunlad',
      'sakahan',
    ]);
    expect(termsOf('Peñafrancia')).toEqual(termsOf('Penafrancia'));
  });

  const names = [
    'Human Resource and Administrative Support Services',
    'Human Resource Development Program',
    'Human Resource Information System',
    'Human Rights Desk',
    'Resource Mobilization',
    'Senior Citizens Assistance',
    'Senior Citizens Pension',
    'Senior Citizens Day',
    'Along Soriano Ave',
    'Drainage, Soriano Ave',
    'Budget Planning, Investment Programming',
    'Budget Planning, Investment Programming and Review',
    'Budget Planning, Investment Programming Support',
  ];
  const ph = learnPhrases(names);

  it('learns compounds by normalised PMI and keeps them whole', () => {
    expect(ph.has('human resource')).toBe(true);
    expect(ph.has('senior citizens')).toBe(true);
    // "Human Resource Development" is the compound and a word, not "human" and "resource" again.
    expect(termsOf('Human Resource Development', ph)).toEqual([
      'human resource',
      'development',
    ]);
    // Alone, "human" is still a word.
    expect(termsOf('Human Rights Desk', ph)).toEqual([
      'human',
      'rights',
      'desk',
    ]);
  });

  it('needs three rows, and never spans punctuation', () => {
    expect(ph.has('soriano ave')).toBe(false); // two rows: rare pairs score high by chance
    expect(ph.has('budget planning')).toBe(true);
    expect(ph.has('planning investment')).toBe(false); // across a comma
  });

  it('caps a phrase at three words', () => {
    for (const p of learnPhrases([...names, ...names]))
      expect(p.split(' ').length).toBeLessThanOrEqual(3);
  });
});

const rows = [
  { name: 'Drainage, Balatas', labels: ['infra'] },
  { name: 'Drainage, Tinago', labels: ['infra'] },
  { name: 'Road Widening, Sabang', labels: ['infra'] },
  { name: 'Road Widening, Pacol', labels: ['infra'] },
  { name: 'Road Widening, Tabuco', labels: ['infra'] },
  { name: 'Health Center Repair', labels: ['health'] },
  { name: 'Health Center Supplies', labels: ['health'] },
  { name: 'Repair of Vehicles', labels: ['health', 'infra'] },
  { name: 'Repair of Desks', labels: ['education'] },
];

describe('c-TF-IDF over labels', () => {
  it('gives each word the label it is most typical of, and drops one-row words', () => {
    const d = distinctive(rows);
    expect(d.get('drainage')?.home).toBe('infra');
    expect(d.get('health')?.home).toBe('health');
    expect(d.has('balatas')).toBe(false); // one row only
    // "repair" is in three labels; it is kept where it scores best, not everywhere.
    expect(['health', 'education', 'infra']).toContain(d.get('repair')?.home);
    expect(d.get('drainage')!.score).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    expect([...distinctive(rows)]).toEqual([...distinctive([...rows])]);
  });
});

describe('the terms source', () => {
  const recs: QueryRecord[] = rows.map((r, i) => ({
    dims: { rowId: `r${i}`, name: r.name, label: r.labels },
    money: { amount: new Prisma.Decimal((i + 1) * 100) },
  }));
  const out = termRecords(recs);

  it('is one record per (row, kept term), each with its home label', () => {
    const drainage = out.filter((r) => r.dims.term === 'drainage');
    expect(drainage.map((r) => r.dims.rowId)).toEqual(['r0', 'r1']);
    expect(drainage[0].dims.termLabel).toBe('infra');
  });

  it('sizes a word by the pesos of the rows that use it, with no total', () => {
    const res = runQuery(
      out,
      {
        dimensions: ['term'],
        measures: [{ field: 'amount', agg: 'sum' }],
        filters: [],
        sort: { by: 'm0', dir: 'desc' },
      },
      (f) => f === 'term',
    );
    const by = Object.fromEntries(
      res.rows.map((r) => [r.keys[0], r.values[0]]),
    );
    expect(by['drainage']).toBe('300.00'); // rows 1 and 2
    expect(by['road widening']).toBe('1200.00'); // rows 3, 4 and 5: a learned phrase
    expect(by['road']).toBeUndefined(); // inside the phrase, never on its own
    expect(res.additive).toBe(false);
  });

  const q = (over: Partial<Query>): Query => ({
    source: 'terms',
    documents: [{ kind: 'aip', years: [2027] }],
    dimensions: ['term', 'termLabel'],
    measures: [{ field: 'amount', agg: 'sum' }],
    filters: [],
    ...over,
  });
  it('must break down by word', () => {
    const msg = (x: Query) => validateQuery(x, CAT).map((e) => e.message);
    expect(msg(q({}))).toEqual([]);
    expect(msg(q({ dimensions: ['office'] }))).toContain(
      'Words overlap: break down by word.',
    );
  });
});
