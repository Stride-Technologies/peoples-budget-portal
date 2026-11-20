import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkWorkbook, MAX_SHEETS } from './workbook.ts';

test('the client copy is byte-for-byte the API file', () => {
  const here = new URL('./workbook.ts', import.meta.url);
  const api = new URL('../../../../api/src/explorer/workbook/workbook.ts', import.meta.url);
  assert.equal(readFileSync(here, 'utf8'), readFileSync(api, 'utf8'), 'cp api/src/explorer/workbook/workbook.ts client/src/lib/explore/');
});

const sheet = {
  id: 's1',
  name: 'By office',
  mark: 'auto',
  query: {
    source: 'aip-programs',
    documents: [{ kind: 'aip', years: [2027] }],
    dimensions: ['office'],
    measures: [{ field: 'amount', agg: 'sum' }],
    filters: [{ field: 'fund', op: 'in', values: ['GF'] }],
    limit: 10,
  },
};
const wb = { v: 2, name: 'My workbook', sheets: [sheet], active: 0 };

test('a workbook comes back rebuilt from its named fields only', () => {
  const r = checkWorkbook({ ...wb, extra: 'x', sheets: [{ ...sheet, note: '<b>hi</b>', query: { ...sheet.query, junk: 1 } }] });
  assert.deepEqual(r.workbook, wb);
  // Canonical: key order in the input does not change the output.
  const shuffled = JSON.parse(JSON.stringify({ active: 0, sheets: [sheet], name: 'My workbook', v: 2 }));
  assert.equal(JSON.stringify(checkWorkbook(shuffled).workbook), JSON.stringify(r.workbook));
});

test('refuses what is not a workbook', () => {
  const bad = (x: unknown) => assert.ok(checkWorkbook(x).errors?.length, JSON.stringify(x));
  bad(null);
  bad({ ...wb, v: 1 });
  bad({ ...wb, name: '<script>' });
  bad({ ...wb, name: 'x'.repeat(61) });
  bad({ ...wb, active: 1 });
  bad({ ...wb, sheets: [] });
  bad({ ...wb, sheets: Array.from({ length: MAX_SHEETS + 1 }, (_, i) => ({ ...sheet, id: `s${i}` })) });
  bad({ ...wb, sheets: [sheet, sheet] }); // duplicate id
  bad({ ...wb, sheets: [{ ...sheet, mark: 'pie' }] });
  bad({ ...wb, sheets: [{ ...sheet, query: { ...sheet.query, filters: [{ field: 'x', op: 'regex' }] } }] });
  bad({ ...wb, sheets: [{ ...sheet, name: 'a'.repeat(30), query: { ...sheet.query, dimensions: ['x'.repeat(70_000)] } }] });
});
