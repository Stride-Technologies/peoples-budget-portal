import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { defaultQuery, fitQuery, viewToQuery } from './sheets.ts';

test('an old two-document view becomes one over-time query that never adds across documents', () => {
  const { query, mark } = viewToQuery({
    v: 1,
    series: [
      { document: 'aip', years: [2027], measure: 'money', filters: { office: ['CHO'] } },
      { document: 'ordinance', years: [2026], measure: 'money', filters: {} },
    ],
    groupBy: 'office',
    chart: 'bar',
    top: 10,
  });
  assert.equal(mark, 'bar');
  assert.deepEqual(query, {
    source: 'over-time',
    documents: [{ kind: 'aip', years: [2027] }, { kind: 'ordinance', years: [2026] }],
    dimensions: ['office', 'kind'],
    measures: [{ field: 'amount', agg: 'sum' }],
    filters: [{ field: 'office', op: 'in', values: ['CHO'] }],
    limit: 10,
  });
});

test('a by-year view keeps its years apart and in order', () => {
  const { query } = viewToQuery({ v: 1, series: [{ document: 'aip', years: [2026, 2027], measure: 'count', filters: {} }], groupBy: 'year', chart: 'line' });
  assert.deepEqual(query.dimensions, ['year']);
  assert.equal(query.source, 'aip-programs');
  assert.deepEqual(query.sort, { by: 'year', dir: 'asc' });
  assert.deepEqual(query.measures, [{ field: '', agg: 'count' }]);
});

test('the default is the latest AIP', () => {
  const q = defaultQuery([{ kind: 'ordinance', year: 2026 }, { kind: 'aip', year: 2026 }, { kind: 'aip', year: 2027 }]);
  assert.deepEqual(q.documents, [{ kind: 'aip', years: [2027] }]);
});

test('fitQuery adds the breakdowns several documents need and drops unknown fields', () => {
  const fields = ['year', 'kind', 'office', 'fund', 'amount'].map((id) => ({ id, role: id === 'amount' ? 'money' : 'dimension' }));
  const q = fitQuery(
    {
      source: 'budget-ppas',
      documents: [{ kind: 'lep', years: [2025, 2026] }, { kind: 'ordinance', years: [2026] }],
      dimensions: ['office', 'fund', 'theme'],
      measures: [{ field: 'ps', agg: 'sum' }],
      filters: [{ field: 'topic', op: 'in', values: ['x'] }],
      sort: { by: 'theme', dir: 'asc' },
    },
    fields,
  );
  assert.deepEqual(q, {
    source: 'budget-ppas',
    documents: [{ kind: 'lep', years: [2025, 2026] }, { kind: 'ordinance', years: [2026] }],
    dimensions: ['office', 'kind', 'year'],
    measures: [{ field: 'amount', agg: 'sum' }],
    filters: [],
  });
});

test('a second document goes on Colour, not Detail', () => {
  const fields = ['kind', 'office', 'fund', 'amount'].map((id) => ({ id, role: 'dimension' }));
  const q = fitQuery(
    { source: 'over-time', documents: [{ kind: 'aip', years: [2027] }, { kind: 'lep', years: [2025] }], dimensions: ['office', 'fund'], measures: [{ field: 'amount', agg: 'sum' }], filters: [] },
    fields,
  );
  assert.deepEqual(q.dimensions, ['office', 'kind', 'fund']);
});

test('drill-down keeps the value and moves Rows one level down; exclude accumulates', async () => {
  const { narrow, linked } = await import('./sheets.ts');
  const fields = ['office', 'cluster', 'sector', 'name', 'amount'].map((id) => ({ id }));
  const q = defaultQuery([{ kind: 'aip', year: 2027 }]);
  const office = { field: 'office', code: 'CHO', label: 'City Health Office' };
  const d = narrow(q, office, 'drill', fields);
  assert.deepEqual(d.dimensions, ['name']);
  assert.deepEqual(d.filters, [{ field: 'office', op: 'in', values: ['CHO'] }]);
  const cl = narrow({ ...q, dimensions: ['cluster'] }, { field: 'cluster', code: 'S', label: 'Social' }, 'drill', fields);
  assert.deepEqual(cl.dimensions, ['sector']);
  const x = narrow(narrow(q, office, 'exclude', fields), { ...office, code: 'CEO' }, 'exclude', fields);
  assert.deepEqual(x.filters, [{ field: 'office', op: 'notIn', values: ['CHO', 'CEO'] }]);
  // Keep replaces an exclusion on the same field rather than stacking with it.
  assert.deepEqual(narrow(x, office, 'keep', fields).filters, [{ field: 'office', op: 'in', values: ['CHO'] }]);
  // A linked tile without the field is left alone.
  assert.equal(linked(q, { field: 'pillar', code: 'A', label: 'A' }, fields), q);
});

test('a blank sheet keeps the source, one document and the first amount, and nothing else', async () => {
  const { blankQuery, isBlank } = await import('./sheets.ts');
  const b = blankQuery({ source: 'over-time', documents: [{ kind: 'aip', years: [2026, 2027] }, { kind: 'lep', years: [2025] }], dimensions: ['year', 'kind'], measures: [{ field: 'co', agg: 'sum' }, { field: '', agg: 'count' }], filters: [{ field: 'office', op: 'in', values: ['CHO'] }], limit: 10 });
  assert.deepEqual(b, { source: 'over-time', documents: [{ kind: 'aip', years: [2027] }], dimensions: [], measures: [{ field: 'co', agg: 'sum' }], filters: [] });
  assert.ok(isBlank(b));
  // A total narrowed by a filter is an answer, not a blank sheet.
  assert.ok(!isBlank({ ...b, filters: [{ field: 'label', op: 'in', values: ['education'] }] }));
  // fitQuery leaves it blank: one document and one year need no breakdown.
  assert.ok(isBlank(fitQuery(b, [{ id: 'year', role: 'dimension' }, { id: 'kind', role: 'dimension' }, { id: 'co', role: 'money' }])));
});
