import { Prisma } from '../../generated/prisma/index';
import { CAT } from '../test-catalogue.js';
import {
  BARANGAYS,
  barangayLabel,
  barangayOf,
  CITY_POPULATION,
  CITY_WIDE,
  populationOf,
  withBarangay,
} from './barangay.js';
import { runQuery, type QueryRecord } from './engine.js';
import { validateQuery, type Query } from './query.js';

const code = (name: string) => BARANGAYS.find((b) => b.name === name)!.psgc;

describe('the gazetteer (specs/020 A3.1)', () => {
  it('holds 27 barangays with PSGC codes whose PSA 2020 counts add up to the city', () => {
    expect(BARANGAYS).toHaveLength(27);
    expect(new Set(BARANGAYS.map((b) => b.psgc)).size).toBe(27);
    for (const b of BARANGAYS) expect(b.psgc).toMatch(/^0501724\d{3}$/);
    expect(BARANGAYS.reduce((n, b) => n + b.population2020, 0)).toBe(
      CITY_POPULATION,
    );
    expect(CITY_POPULATION).toBe(209170);
  });
});

describe('barangayOf (specs/020 A3.2)', () => {
  it.each([
    ['Drainage at Kamagong St., Balatas', ['Balatas']],
    ['Drainage, Robredo Homes Subd., Bgy. Sabang, Naga City', ['Sabang']],
    // One line, two barangays: it counts in each.
    [
      'Road Rehabilitation at Felix Plazo St., Sabang-Igualdad, Naga City',
      ['Igualdad Interior', 'Sabang'],
    ],
    ['Drainage Rehabilitation at Dimasalang St., Sta. Cruz', ['Santa Cruz']],
    ['Drainage, Concepcion Pequena', ['Concepcion Pequeña']],
    [
      'Cross Drainage at Villa Grande Homes near Market, Concepcion Grande',
      ['Concepcion Grande'],
    ],
    ['Multi-purpose Building, Brgy. Peñafrancia', ['Peñafrancia']],
  ])('%s', (text, names) => {
    expect(barangayOf(text)).toEqual(names.map(code).sort());
  });

  it.each([
    // Whole words: Villa Sorabella is not Abella.
    'Road Rehabilitation, 4th st., Villa Sorabella',
    // The festival and the avenue are named after the Virgin, not the barangay.
    '2027 Penafrancia Football Festival (Sept 2027)',
    'Asphalt Overlay, Peñafrancia Ave.',
    // Grande or Pequeña? Left for a person (or B3's model) to place.
    'Drainage along the Concepcion boundary',
    'Legislative Leadership, Networking, and Barangay Governance Program',
    '',
  ])('places nothing in %p', (text) => {
    expect(barangayOf(text)).toEqual([]);
  });

  it('labels codes, with the city-wide bucket named', () => {
    expect(barangayLabel(code('Tinago'))).toBe('Tinago');
    expect(barangayLabel(CITY_WIDE)).toBe('City-wide or no barangay named');
    expect(populationOf(CITY_WIDE)!.toNumber()).toBe(209170);
    expect(populationOf('nope')).toBeNull();
  });
});

const rec = (name: string, amount: string): QueryRecord => ({
  dims: { rowId: name, name },
  money: { amount: new Prisma.Decimal(amount) },
});

describe('per resident by barangay', () => {
  const records = withBarangay('aip-activities', [
    rec('Drainage, Balatas', '1112.00'),
    rec('Road, Sabang-Igualdad', '3000.00'),
    rec('City-wide streetlights', '209170.00'),
  ]);
  const per = (keys: (string | null)[]) =>
    keys.length ? populationOf(keys[0]) : populationOf(CITY_WIDE);

  it('is derived at read time and multi-valued', () => {
    expect(records.map((r) => r.dims.barangay)).toEqual([
      [code('Balatas')],
      [code('Igualdad Interior'), code('Sabang')],
      [CITY_WIDE],
    ]);
    // A source with no barangay field is left alone.
    expect(
      withBarangay('receipts', [rec('Balatas', '1.00')])[0].dims.barangay,
    ).toBeUndefined();
  });

  it('divides each group by its own population, in Decimal', () => {
    const res = runQuery(
      records,
      {
        dimensions: ['barangay'],
        measures: [
          { field: 'amount', agg: 'perCapita' },
          { field: 'amount', agg: 'sum' },
        ],
        filters: [],
      },
      () => true,
      per,
    );
    const by = Object.fromEntries(res.rows.map((r) => [r.keys[0], r.values]));
    expect(by[code('Balatas')]).toEqual(['0.10', '1112.00']); // 1,112 / 11,112
    expect(by[code('Sabang')]).toEqual(['0.44', '3000.00']); // 3,000 / 6,838
    expect(by[code('Igualdad Interior')]).toEqual(['1.00', '3000.00']); // 3,000 / 3,008
    expect(by[CITY_WIDE]).toEqual(['1.00', '209170.00']);
    expect(res.additive).toBe(false); // no total across barangays
    expect(res.totals[1]).toBe('213282.00'); // each row once
  });

  const q = (over: Partial<Query>): Query => ({
    source: 'aip-activities',
    documents: [{ kind: 'aip', years: [2027] }],
    dimensions: ['barangay'],
    measures: [{ field: 'amount', agg: 'perCapita' }],
    filters: [],
    ...over,
  });
  const messages = (x: Query) => validateQuery(x, CAT).map((e) => e.message);

  it('is valid only by barangay and without Top N', () => {
    expect(messages(q({}))).toEqual([]);
    expect(messages(q({ dimensions: ['office'] }))).toContain(
      'A per-person figure needs a barangay breakdown.',
    );
    expect(messages(q({ limit: 10 }))).toContain(
      'A per-person figure shows every barangay: no Top N.',
    );
    expect(
      messages(
        q({
          source: 'receipts',
          documents: [{ kind: 'ordinance', years: [2026] }],
        }),
      ).join(' '),
    ).toMatch(/no breakdown "barangay"/);
  });
});
