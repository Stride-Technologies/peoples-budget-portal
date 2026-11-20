import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { recordColumns, recordHref, type RowsColumn } from './records.ts';

const cols: RowsColumn[] = [
  { field: 'year', label: 'Fiscal year', role: 'dimension' },
  { field: 'office', label: 'Office', role: 'dimension' },
  { field: 'label', label: 'Label', role: 'dimension', derived: true },
  { field: 'term', label: 'Word', role: 'dimension', derived: true },
  { field: 'fund', label: 'Fund', role: 'dimension' },
  { field: 'name', label: 'Program', role: 'dimension' },
  { field: 'amount', label: 'Estimated cost', role: 'money' },
  { field: 'ps', label: 'Personnel Services', role: 'money' },
];
const row = (year: string, fund: string | null) => ({
  id: 'p1',
  parentId: null,
  year: [{ code: year, label: `FY${year}` }],
  office: [{ code: 'CEO', label: 'City Engineer' }],
  label: [{ code: 'unclassified', label: 'unclassified' }],
  term: [{ code: 'road', label: 'road' }],
  fund: fund ? [{ code: fund, label: fund }] : [],
  name: 'Road Program',
  amount: '100.00',
  ps: null,
});

test('Records shows the name, office and money; the explorer\'s own fields only in details', () => {
  const { name, primary, details, derived } = recordColumns(cols, [row('2027', 'GF'), row('2027', null)]);
  assert.equal(name?.field, 'name');
  assert.deepEqual(primary.map((c) => c.field), ['office', 'amount']);
  assert.deepEqual(derived.map((c) => c.field), ['label', 'term']);
  // Details: the city's data, filled somewhere on the page; never the derived, never empty.
  assert.deepEqual(details.map((c) => c.field), ['year', 'office', 'fund', 'amount']);
});

test('the year joins the columns only when the page mixes years', () => {
  const { primary } = recordColumns(cols, [row('2026', 'GF'), row('2027', 'GF')]);
  assert.deepEqual(primary.map((c) => c.field), ['year', 'office', 'amount']);
});

test('a record links to its page only where the site has one', () => {
  const aip = [{ kind: 'aip', years: [2027] }];
  assert.equal(recordHref({ source: 'aip-programs', documents: aip }, { id: 'p1' }), '/budget/p1');
  assert.equal(recordHref({ source: 'aip-activities', documents: aip }, { id: 'a1', parentId: 'p1' }), '/budget/p1/a1');
  assert.equal(recordHref({ source: 'terms', documents: aip }, { id: 'p1' }), '/budget/p1');
  assert.equal(recordHref({ source: 'budget-ppas', documents: [{ kind: 'ordinance', years: [2026] }] }, { id: 'x' }), null);
  assert.equal(recordHref({ source: 'receipts', documents: aip }, { id: 'x' }), null);
});
