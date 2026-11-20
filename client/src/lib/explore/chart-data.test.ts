import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { joinRows, maxStack, maxValue, toCsv } from './chart-data.ts';
import type { ResolvedSeries } from './view-url.ts';

const s = (key: string, rows: [string, string][], other: { value: string; n: number } | null = null): ResolvedSeries => ({
  key,
  label: key,
  document: 'aip',
  years: [2027],
  moneyWord: 'Estimated cost',
  countWord: 'programs',
  measure: 'money',
  rows: rows.map(([id, value]) => ({ id, label: id, value, share: 0.5 })),
  other,
  total: '0.00',
  n: rows.length,
});

test('joins series on row id, keeps first-series order, puts Other last', () => {
  const lines = joinRows([s('a', [['X', '10.00'], ['Y', '5.00']], { value: '1.00', n: 3 }), s('b', [['Y', '7.00'], ['Z', '2.00']])], (n) => `Other (${n})`);
  assert.deepEqual(lines.map((l) => [l.id, l.cells.map((c) => c.value)]), [
    ['X', ['10.00', null]],
    ['Y', ['5.00', '7.00']],
    ['Z', [null, '2.00']],
    ['_other', ['1.00', null]],
  ]);
  assert.equal(lines.at(-1)?.label, 'Other (3)');
  assert.equal(maxValue(lines), 10);
  assert.equal(maxStack(lines), 12);
});

test('CSV keeps full precision and quotes commas', () => {
  const series = [s('a', [['Health, Nutrition', '1234567.89']])];
  assert.equal(toCsv(series, joinRows(series, () => ''), 'Sector'), 'Sector,a\n"Health, Nutrition",1234567.89\nTotal,0.00\n');
});

test('by year, rows run in year order across series of different kinds', () => {
  const byYear = (key: string, rows: [string, string][]) => ({ ...s(key, rows), total: null });
  const lines = joinRows(
    [
      byYear('aip', [['2026', '1.00'], ['2027', '2.00']]),
      byYear('lep', [['2023', '3.00'], ['2024', '4.00'], ['2026', '5.00']]),
    ],
    () => '',
  );
  assert.deepEqual(lines.map((l) => l.id), ['2023', '2024', '2026', '2027']);
});
