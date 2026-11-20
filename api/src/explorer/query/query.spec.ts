import { CAT } from '../test-catalogue.js';
import { splitOf, validateQuery, type Query } from './query.js';

const q = (over: Partial<Query>): Query => ({
  source: 'aip-programs',
  documents: [{ kind: 'aip', years: [2027] }],
  dimensions: ['office'],
  measures: [{ field: 'amount', agg: 'sum' }],
  filters: [],
  ...over,
});
const messages = (x: Query) => validateQuery(x, CAT).map((e) => e.message);

describe('validateQuery', () => {
  it('accepts a plain query', () => {
    expect(messages(q({}))).toEqual([]);
  });

  it('never adds years or document kinds together', () => {
    expect(
      messages(q({ documents: [{ kind: 'aip', years: [2026, 2027] }] })),
    ).toContain('Years are never added together: break down by year.');
    expect(
      messages(
        q({
          source: 'over-time',
          documents: [
            { kind: 'aip', years: [2027] },
            { kind: 'ordinance', years: [2026] },
          ],
        }),
      ),
    ).toContain(
      'Different documents are not the same money: break down by document.',
    );
    expect(
      messages(
        q({
          source: 'over-time',
          dimensions: ['year', 'kind'],
          documents: [
            { kind: 'aip', years: [2026, 2027] },
            { kind: 'ordinance', years: [2026] },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('refuses a document, year or field the source does not have', () => {
    expect(
      messages(q({ documents: [{ kind: 'ordinance', years: [2026] }] })),
    ).toContain('AIP programs has no ORDINANCE data.');
    expect(
      messages(q({ documents: [{ kind: 'aip', years: [2019] }] })),
    ).toContain('FY2019 has no public AIP.');
    expect(messages(q({ dimensions: ['account'] }))).toContain(
      'AIP programs has no breakdown "account".',
    );
  });

  it('allows one money split, never with themes or topics', () => {
    expect(splitOf(q({ dimensions: ['fund'] }))).toBe('fund');
    expect(
      splitOf(
        q({ filters: [{ field: 'expenseClass', op: 'in', values: ['PS'] }] }),
      ),
    ).toBe('expenseClass');
    expect(messages(q({ dimensions: ['fund', 'expenseClass'] }))).toContain(
      'Break down by fund or by expense class, not both.',
    );
    expect(messages(q({ dimensions: ['fund', 'topic'] }))).toContain(
      'A fund or class split cannot be combined with themes, topics or labels.',
    );
  });

  it('sorts the records grid by any field, a chart only by what it drew', () => {
    const rows = (x: Query) =>
      validateQuery(x, CAT, 'rows').map((e) => e.message);
    expect(rows(q({ sort: { by: 'name', dir: 'asc' } }))).toEqual([]);
    expect(rows(q({ sort: { by: 'm0', dir: 'asc' } }))).toContain(
      'Sort the records by one of their fields.',
    );
    expect(messages(q({ sort: { by: 'name', dir: 'asc' } }))).toContain(
      'Sort by a measure or one of the breakdowns.',
    );
  });

  it('checks measures and filters', () => {
    expect(
      messages(q({ measures: [{ field: 'office', agg: 'sum' }] })),
    ).toContain('"office" cannot be added up.');
    expect(
      messages(q({ measures: [{ field: 'office', agg: 'countDistinct' }] })),
    ).toEqual([]);
    expect(
      messages(q({ filters: [{ field: 'name', op: 'contains', text: '' }] })),
    ).toContain('Search a name with 1 to 60 characters.');
    expect(
      messages(q({ filters: [{ field: 'office', op: 'between', min: '1' }] })),
    ).toContain('A range filter needs an amount.');
  });

  it('checks table calculations', () => {
    expect(
      messages(q({ calcs: [{ type: 'percentOfTotal', measure: 0 }] })),
    ).toEqual([]);
    expect(
      messages(q({ calcs: [{ type: 'differenceFromPrevious', measure: 0 }] })),
    ).toContain('Break down by year to compare with the one before.');
    expect(
      messages(
        q({
          dimensions: ['topic'],
          calcs: [{ type: 'percentOfTotal', measure: 0 }],
        }),
      ),
    ).toContain('There is no single total here to take a share of.');
    expect(messages(q({ calcs: [{ type: 'rank', measure: 2 }] }))).toContain(
      'A calculation needs one of the measures asked for.',
    );
  });
});
