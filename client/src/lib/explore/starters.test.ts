import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { starters } from './starters.ts';
import { checkWorkbook } from './workbook.ts';

const words = (key: string, vars?: Record<string, string | number>) => `${key}${vars?.year ?? ''}`.slice(-60);
const DOCS = [
  { kind: 'aip' as const, year: 2026 },
  { kind: 'aip' as const, year: 2027 },
  { kind: 'lep' as const, year: 2025, draft: true as const },
  { kind: 'ordinance' as const, year: 2026 },
];

test('every starter is a valid workbook that reads only documents the site holds', () => {
  const list = starters(DOCS, words);
  assert.deepEqual(list.map((s) => s.id), ['aip', 'climate', 'income', 'overTime', 'places', 'words']);
  for (const s of list) {
    const r = checkWorkbook(s.workbook);
    assert.ok(r.workbook, `${s.id}: ${r.errors?.join(' ')}`);
    for (const sh of s.workbook.sheets)
      for (const d of sh.query.documents) for (const y of d.years) assert.ok(DOCS.some((x) => x.kind === d.kind && x.year === y), `${s.id} reads ${d.kind} ${y}`);
  }
});

test('starters read the newest published document; the over-time one keeps kinds and years apart', () => {
  const [aip, , income, over] = starters(DOCS, words);
  assert.deepEqual(aip.workbook.sheets[0].query.documents, [{ kind: 'aip', years: [2027] }]);
  // The FY2025 LEP is a draft: the published FY2026 ordinance is preferred.
  assert.deepEqual(income.workbook.sheets[0].query.documents, [{ kind: 'ordinance', years: [2026] }]);
  assert.equal(aip.workbook.board, 'd1');
  const q = over.workbook.sheets[0].query;
  assert.deepEqual(q.dimensions, ['year', 'kind']);
  assert.deepEqual(q.documents.find((d) => d.kind === 'aip')?.years, [2026, 2027]);
  assert.equal(over.workbook.board, undefined);
});

test('no AIP and a single book: only the income starter', () => {
  assert.deepEqual(starters([{ kind: 'lep', year: 2025 }], words).map((s) => s.id), ['income']);
  assert.deepEqual(starters([], words), []);
});
