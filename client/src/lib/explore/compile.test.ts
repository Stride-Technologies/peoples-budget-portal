import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as vl from 'vega-lite';
import { parse } from 'vega';
import { allowedMarks, chartData, compile, markOf, resultCsv, showMe, type QueryResult, type Theme } from './compile.ts';
import type { WorkbookQuery } from './workbook.ts';

const theme: Theme = { series: ['#111', '#222', '#333'], ink: '#000', muted: '#555', grid: '#eee', paper: '#fff', font: 'sans' };
const q1: WorkbookQuery = {
  source: 'aip-programs',
  documents: [{ kind: 'aip', years: [2027] }],
  dimensions: ['office'],
  measures: [{ field: 'amount', agg: 'sum' }],
  filters: [],
  limit: 2,
};
const result = (q: WorkbookQuery, rows: QueryResult['rows'], draft = false): QueryResult => ({
  catalogueVersion: 'x',
  query: q,
  columns: [
    ...q.dimensions.map((f) => ({ field: f, label: f, role: 'dimension' as const })),
    ...q.measures.map((m) => ({ field: m.field, label: m.field, role: 'money' as const })),
  ],
  rows,
  other: q.dimensions.length === 1 ? { label: 'Other (3)', values: q.measures.map(() => '100.00'), n: 3 } : null,
  totals: null,
  n: 5,
  documents: q.documents.flatMap((d) => d.years.map((year) => ({ kind: d.kind, year, label: `FY${year}`, draft: draft && year === 2026 }))),
});
const r1 = result(q1, [
  { keys: [{ code: 'CEO', label: 'City Engineer' }], values: ['2398718000.00'], calcs: [] },
  { keys: [{ code: 'SWMO', label: 'Solid Waste' }], values: ['2006069000.00'], calcs: [] },
]);

test('labels come from the decimal string; Other is appended', () => {
  const { data } = chartData(r1, theme);
  assert.deepEqual(data.map((d) => [d.y, d.t]), [['City Engineer', '₱2.40B'], ['Solid Waste', '₱2.01B'], ['Other (3)', '₱100.00']]);
});

test('Show Me and the mark menu', () => {
  assert.equal(showMe(q1, r1), 'bar');
  assert.equal(showMe({ ...q1, dimensions: ['year'] }, r1), 'line');
  assert.equal(showMe({ ...q1, measures: [...q1.measures, { field: 'ps', agg: 'sum' }] }, r1), 'scatter');
  // Years are never stacked (never added together).
  assert.ok(!allowedMarks({ ...q1, dimensions: ['office', 'year'] }).includes('stacked'));
  assert.ok(allowedMarks({ ...q1, dimensions: ['office', 'fund'] }).includes('stacked'));
  assert.equal(markOf('scatter', q1, r1), 'bar'); // not allowed → Show Me
});

test('a draft document year is hatched', () => {
  const q: WorkbookQuery = { ...q1, documents: [{ kind: 'ordinance', years: [2025, 2026] }], dimensions: ['office', 'year'] };
  const r = result(q, [
    { keys: [{ code: 'CEO', label: 'CEO' }, { code: '2025', label: 'FY2025' }], values: ['1.00'], calcs: [] },
    { keys: [{ code: 'CEO', label: 'CEO' }, { code: '2026', label: 'FY2026' }], values: ['2.00'], calcs: [] },
  ], true);
  const { data, series } = chartData(r, theme);
  assert.deepEqual(series, ['FY2025', 'FY2026']);
  assert.deepEqual(data.map((d) => d.fill), ['#111', 'url(#ws-hatch-1)']);
});

test('every mark compiles to a spec Vega can parse', () => {
  const q2: WorkbookQuery = { ...q1, dimensions: ['office', 'fund'] };
  const r2 = result(q2, [
    { keys: [{ code: 'CEO', label: 'CEO' }, { code: 'GF', label: 'General Fund' }], values: ['5.00'], calcs: [] },
    { keys: [{ code: 'CEO', label: 'CEO' }, { code: 'SEF', label: 'SEF' }], values: ['2.00'], calcs: [] },
  ]);
  const qm: WorkbookQuery = { ...q1, measures: [...q1.measures, { field: 'ps', agg: 'sum' }] };
  const rm = result(qm, [{ keys: [{ code: 'CEO', label: 'CEO' }], values: ['5.00', '1.00'], calcs: [] }]);
  const cases: [Parameters<typeof compile>[0], QueryResult][] = [
    ['bar', r1], ['bar', r2], ['stacked', r2], ['line', r1], ['area', r2], ['scatter', rm], ['heatmap', r2], ['treemap', r1],
  ];
  for (const [mark, r] of cases) {
    const out = compile(mark, r, theme, { width: 600, height: 400 })!;
    const vgSpec = out.kind === 'vega-lite' ? vl.compile(out.spec as unknown as vl.TopLevelSpec).spec : out.spec;
    assert.doesNotThrow(() => parse(vgSpec as never, undefined, { ast: true }), mark);
  }
  assert.equal(compile('table', r1, theme, { width: 1, height: 1 }), null);
});

test('CSV keeps full precision and quotes commas', () => {
  const csv = resultCsv(result(q1, [{ keys: [{ code: 'A', label: 'Office, A' }], values: ['1234.50'], calcs: [] }]));
  assert.equal(csv, 'office,amount\n"Office, A",1234.50\nOther (3),100.00\n');
});

test('full pesos keep every centavo of the decimal string', async () => {
  const { pesoFull } = await import('./compile.ts');
  assert.equal(pesoFull('9352961174.07'), '₱9,352,961,174.07');
  assert.equal(pesoFull('-1200'), '−₱1,200.00');
  assert.equal(pesoFull('0.5'), '₱0.50');
});

test('a bar chart leaves room past the longest bar for its figure', async () => {
  const { compile } = await import('./compile.ts');
  const r: QueryResult = {
    catalogueVersion: 'x',
    query: { source: 'aip-programs', documents: [{ kind: 'aip', years: [2027] }], dimensions: ['office'], measures: [{ field: 'amount', agg: 'sum' }], filters: [] },
    columns: [{ field: 'office', label: 'Office', role: 'dimension' }, { field: 'amount', label: 'Cost', role: 'money' }],
    rows: [{ keys: [{ code: 'A', label: 'A' }], values: ['1000'], calcs: [] }],
    other: null,
    totals: ['1000'],
    n: 1,
    documents: [{ kind: 'aip', year: 2027, label: 'AIP', draft: false }],
  };
  const theme = { series: ['#000'], ink: '#000', muted: '#000', grid: '#000', paper: '#fff', font: 'x' };
  const spec = compile('bar', r, theme, { width: 400, height: 300 })!.spec as { encoding: { x: { scale: { domainMax: number } } } };
  assert.ok(spec.encoding.x.scale.domainMax > 1000 * 1.3, String(spec.encoding.x.scale.domainMax));
});

// ---- specs/020 A1–A2 ----------------------------------------------------------------

const parses = (out: ReturnType<typeof compile>) => {
  const vgSpec = out!.kind === 'vega-lite' ? vl.compile(out!.spec as unknown as vl.TopLevelSpec).spec : out!.spec;
  return parse(vgSpec as never, undefined, { ast: true });
};
const many = (n: number, q: WorkbookQuery = { ...q1, documents: [{ kind: 'aip', years: [2022, 2023, 2024, 2025, 2026, 2027] }], dimensions: ['year', 'fund'] }) =>
  result(
    q,
    Array.from({ length: n }, (_, i) => [2026, 2027].map((y) => ({ keys: [{ code: String(y), label: `FY${y}` }, { code: `F${i}`, label: `Fund ${i}` }], values: [`${(i + 1) * 10}.00`], calcs: [] }))).flat(),
  );

test('A1.1 one theme: v6 schema, config from the theme, no inline axis styling', async () => {
  const { vegaConfig } = await import('./theme.ts');
  const out = compile('bar', r1, theme, { width: 600, height: 400 })!;
  assert.equal(out.spec.$schema, 'https://vega.github.io/schema/vega-lite/v6.json');
  assert.deepEqual(out.spec.config, vegaConfig(theme));
  assert.equal((out.spec.config as { axis: { gridColor: string } }).axis.gridColor, theme.grid);
});

test('A1.2 axis titles carry the unit', async () => {
  const { axisTitle } = await import('./compile.ts');
  assert.equal(axisTitle('Estimated cost', 'money'), 'Estimated cost (₱)');
  assert.equal(axisTitle('Share', 'ratio'), 'Share (%)');
  assert.equal(axisTitle('Rows', 'count'), 'Rows');
  const spec = compile('bar', r1, theme, { width: 600, height: 400 })!.spec as { encoding: { x: { title: string } } };
  assert.equal(spec.encoding.x.title, 'amount (₱)');
});

test('A1.3 more than four series become small multiples on one shared scale', () => {
  const four = compile('line', many(4), theme, { width: 800, height: 500 })!.spec;
  assert.ok(!('facet' in four));
  const five = compile('line', many(5), theme, { width: 800, height: 500 })!;
  assert.ok('facet' in five.spec && 'columns' in five.spec);
  assert.equal((five.spec as { resolve?: unknown }).resolve, undefined); // shared scales: a common baseline
  assert.doesNotThrow(() => parses(five));
  const bars = compile('bar', many(6, { ...q1, dimensions: ['office', 'fund'] }), theme, { width: 800, height: 500 })!;
  assert.ok('facet' in bars.spec);
  assert.doesNotThrow(() => parses(bars));
  // The panels fit the canvas: each one's width plus its own label column, per column.
  const fb = bars.spec as { columns: number; spec: { width: number } };
  assert.ok(fb.columns * (fb.spec.width + 142) <= 800, JSON.stringify(fb));
  // Stacked stays one panel: it is a part-to-whole.
  assert.ok(!('facet' in compile('stacked', many(6, { ...q1, dimensions: ['office', 'fund'] }), theme, { width: 800, height: 500 })!.spec));
});

test('A1.4 KPI tiles: a block per value, its text measured against the block', () => {
  const t2 = { ...theme, series: ['#2a78d6', '#eda100'] };
  const out = compile('kpi', r1, t2, { width: 600, height: 300 })!;
  assert.equal(out.kind, 'vega');
  const tiles = (out.spec.data as { values: { fill: string; fg: string; t: string }[] }[])[0].values;
  assert.deepEqual(tiles.map((x) => x.t), ['₱2.40B', '₱2.01B', '₱100.00']);
  assert.equal(tiles[0].fg, '#FFFFFF'); // white on blue
  assert.equal(tiles[1].fg, '#151414'); // ink on amber: white fails AA there
  assert.doesNotThrow(() => parses(out));
  assert.equal(showMe({ ...q1, dimensions: [] }, r1), 'kpi');
  assert.ok(allowedMarks({ ...q1, dimensions: [] }).includes('kpi'));
});

test('A2 heatmap: ordered by total, labelled when roomy, diverging for change', () => {
  const q: WorkbookQuery = { ...q1, dimensions: ['office', 'fund'] };
  const r = result(q, [
    { keys: [{ code: 'A', label: 'A' }, { code: 'GF', label: 'GF' }], values: ['1.00'], calcs: [] },
    { keys: [{ code: 'A', label: 'A' }, { code: 'SEF', label: 'SEF' }], values: ['9.00'], calcs: [] },
    { keys: [{ code: 'B', label: 'B' }, { code: 'GF', label: 'GF' }], values: ['50.00'], calcs: [] },
    { keys: [{ code: 'B', label: 'B' }, { code: 'SEF', label: 'SEF' }], values: ['2.00'], calcs: [] },
  ]);
  type H = { encoding: { y: { sort: string[] }; x: { sort: string[] } }; layer: { encoding: { color: { scale?: { range: string[]; domain: number[] } } } }[] };
  const h = compile('heatmap', r, theme, { width: 800, height: 400 })!.spec as unknown as H;
  assert.deepEqual(h.encoding.y.sort, ['B', 'A']);
  assert.deepEqual(h.encoding.x.sort, ['GF', 'SEF']);
  assert.equal(h.layer.length, 2); // cell labels
  assert.equal(h.layer[0].encoding.color.scale!.domain[0], 0);
  const qc: WorkbookQuery = { ...q, calcs: [{ type: 'differenceFromPrevious', measure: 0 }] };
  const rc = { ...r, query: qc, columns: [...r.columns, { field: 'diff', label: 'Change', role: 'money' as const }], rows: r.rows.map((x, i) => ({ ...x, calcs: [i % 2 ? '-5.00' : '3.00'] })) };
  const d = compile('heatmap', rc, theme, { width: 800, height: 400 })!.spec as unknown as H;
  const sc = d.layer[0].encoding.color.scale!;
  assert.equal(sc.domain[0], -sc.domain[1]); // symmetric around zero
  assert.equal(sc.range[2], '#f0efec'); // grey midpoint
  assert.doesNotThrow(() => parses(compile('heatmap', rc, theme, { width: 800, height: 400 })));
});

test('A1.5 the linter refuses misleading charts', async () => {
  const { lint } = await import('./compile.ts');
  const q2: WorkbookQuery = { ...q1, dimensions: ['office', 'fund'] };
  const row = (a: string, b: string, v: string) => ({ keys: [{ code: a, label: a }, { code: b, label: b }], values: [v], calcs: [] });
  assert.equal(lint('bar', r1), null);
  assert.equal(lint('table', r1), null);
  assert.equal(lint('bar', result(q1, [{ keys: [{ code: 'A', label: 'A' }], values: ['0.00'], calcs: [] }])), 'empty');
  assert.equal(lint('line', r1), 'lineUnordered');
  assert.equal(lint('line', result({ ...q1, dimensions: ['year'] }, [{ keys: [{ code: '2027', label: 'FY2027' }], values: ['5.00'], calcs: [] }])), 'onePoint');
  assert.equal(lint('stacked', result(q2, [row('A', 'GF', '5.00'), row('A', 'SEF', '-2.00')])), 'negativeArea');
  assert.equal(lint('treemap', result(q1, [{ keys: [{ code: 'A', label: 'A' }], values: ['-1.00'], calcs: [] }, { keys: [{ code: 'B', label: 'B' }], values: ['3.00'], calcs: [] }])), 'negativeArea');
  assert.equal(lint('scatter', result({ ...q1, measures: [...q1.measures, { field: 'ps', agg: 'sum' }] }, [{ keys: [{ code: 'A', label: 'A' }], values: ['1.00', '2.00'], calcs: [] }])), 'fewPoints');
  assert.equal(lint('heatmap', result(q2, [row('A', 'GF', '5.00'), row('B', 'GF', '5.00')])), 'heatmapThin');
  const big = result(q1, Array.from({ length: 41 }, (_, i) => ({ keys: [{ code: `O${i}`, label: `O${i}` }], values: ['1.00'], calcs: [] })));
  assert.equal(lint('bar', { ...big, other: null }), 'tooManyCategories');
  assert.equal(lint('kpi', { ...big, other: null }), 'kpiMany');
  assert.equal(lint('treemap', { ...r1, other: { label: 'Other', values: ['9999999999.00'], n: 30 } }), 'otherDominates');
  const ranked = { ...r1, query: { ...q1, calcs: [{ type: 'rank', measure: 0 }] }, columns: [...r1.columns, { field: 'rank', label: 'Rank', role: 'rank' as const }], rows: r1.rows.map((x, i) => ({ ...x, calcs: [String(i + 1)] })) };
  assert.equal(lint('bar', ranked), 'rankAsLength');
  const pct = { ...r1, query: { ...q2, calcs: [{ type: 'percentOfTotal', measure: 0 }] }, columns: [...r1.columns, { field: 'x', label: 'x', role: 'dimension' as const }, { field: 'pct', label: 'Share', role: 'ratio' as const }], rows: [row('A', 'GF', '5.00'), row('A', 'SEF', '2.00')].map((x) => ({ ...x, calcs: ['0.5'] })) };
  assert.equal(lint('stacked', pct), 'ratioStacked');
  const mixed = { ...r1, query: { ...q1, measures: [q1.measures[0], { field: 'n', agg: 'count' }] }, columns: [...r1.columns, { field: 'n', label: 'n', role: 'count' as const }] };
  assert.equal(lint('bar', mixed), 'mixedUnits');
  const nine = many(9, { ...q1, dimensions: ['office', 'fund'] });
  assert.equal(lint('stacked', nine), 'tooManySeries');
});

test('A3.4 the barangay map: per resident on the shapes, city-wide money beside them', async () => {
  const { lint, CITY_WIDE, BARANGAY_TOPOJSON } = await import('./compile.ts');
  const q: WorkbookQuery = { source: 'aip-activities', documents: [{ kind: 'aip', years: [2027] }], dimensions: ['barangay'], measures: [{ field: 'amount', agg: 'perCapita' }], filters: [] };
  const r = result(q, [
    { keys: [{ code: '0501724004', label: 'Balatas' }], values: ['55.00'], calcs: [] },
    { keys: [{ code: CITY_WIDE, label: 'LGU-wide or no barangay named' }], values: ['16.31'], calcs: [] },
  ]);
  r.other = null;
  assert.equal(showMe(q, r), 'map');
  assert.ok(allowedMarks(q).includes('map'));
  assert.ok(!allowedMarks({ ...q, dimensions: ['office'] }).includes('map'));
  assert.equal(lint('map', r), null);
  assert.equal(lint('map', { ...r, query: { ...q, measures: [{ field: 'amount', agg: 'sum' }] } }), 'mapTotals');
  const out = compile('map', r, theme, { width: 900, height: 560 })!;
  type M = { hconcat: [{ data: { url: string; format: { feature: string } }; transform: { from?: { data: { values: { k0: string }[] } } }[] }, { data: { values: { t: string; label: string }[] } }] };
  const m = out.spec as unknown as M;
  assert.equal(m.hconcat[0].data.url, BARANGAY_TOPOJSON);
  assert.equal(m.hconcat[0].data.format.feature, 'barangays');
  // The city-wide bucket is never painted on a place; it is the figure beside the map.
  assert.deepEqual(m.hconcat[0].transform[0].from!.data.values.map((d) => d.k0), ['0501724004']);
  assert.equal(m.hconcat[1].data.values[0].t, '₱16.31');
  assert.doesNotThrow(() => parses(out));
});

test('A4.2 the word map: sized by pesos, coloured by label, a ranked list beside it', async () => {
  const { WORDS_LISTED } = await import('./compile.ts');
  const { narrow } = await import('./sheets.ts');
  const q: WorkbookQuery = { source: 'terms', documents: [{ kind: 'aip', years: [2027] }], dimensions: ['term', 'termLabel'], measures: [{ field: 'amount', agg: 'sum' }], filters: [], sort: { by: 'm0', dir: 'desc' }, limit: 60 };
  const words = Array.from({ length: 20 }, (_, i) => ({ keys: [{ code: `w${i}`, label: `word ${i}` }, { code: i % 2 ? 'infra' : 'health', label: i % 2 ? 'Infrastructure' : 'Health' }], values: [`${(20 - i) * 1000}.00`], calcs: [] }));
  const r = { ...result(q, words), other: null };
  assert.equal(showMe(q, r), 'words');
  assert.ok(allowedMarks(q).includes('words'));
  assert.ok(!allowedMarks({ ...q, source: 'aip-programs' }).includes('words'));
  const out = compile('words', r, theme, { width: 900, height: 500 })!;
  type W = { data: [{ values: { word: string; stroke: string }[]; transform: { type: string; text: { field: string }; fontSize: { field: string }; rotate: number }[] }, { values: { y: string }[] }] };
  const w = out.spec as unknown as W;
  assert.equal(w.data[0].transform[0].type, 'wordcloud');
  assert.equal(w.data[0].transform[0].fontSize.field, 'v'); // pesos, not frequency
  assert.equal(w.data[0].transform[0].rotate, 0);
  // The cloud's text mark reads the word itself (the transform writes no text field).
  const cloud = (out.spec as { marks: { from?: { data: string }; encode: { update: { text: { field: string } } } }[] }).marks[0];
  // The transform overwrites x and y, so the word is in its own field.
  assert.equal(cloud.encode.update.text.field, 'word');
  assert.equal(w.data[0].transform[0].text.field, 'word');
  assert.equal(w.data[0].values[0].word, 'word 0');
  // The biggest word must fit: a long one at the top shrinks the largest size.
  const long = { ...r, rows: [{ ...words[0], keys: [{ code: 'hr', label: 'human resource development' }, words[0].keys[1]] }, ...words.slice(1)] };
  type F = { data: [{ transform: { fontSizeRange: [number, number]; size: [number, number] }[] }] };
  const lf = (compile('words', long, theme, { width: 900, height: 500 })!.spec as unknown as F).data[0].transform[0];
  assert.ok(lf.fontSizeRange[1] * 0.62 * 'human resource development'.length <= lf.size[0], JSON.stringify(lf));
  assert.equal(w.data[1].values.length, WORDS_LISTED);
  assert.equal(w.data[1].values[0].y, 'word 0');
  // Colour follows the label (the series), not the rank.
  assert.equal(w.data[0].values[0].stroke, w.data[0].values[2].stroke);
  assert.notEqual(w.data[0].values[0].stroke, w.data[0].values[1].stroke);
  assert.doesNotThrow(() => parses(out));
  // Clicking a word keeps the rows whose names use it.
  const kept = narrow(q, { field: 'term', code: 'road widening', label: 'road widening' }, 'keep', [{ id: 'term' }, { id: 'name' }]);
  assert.deepEqual(kept.filters, [{ field: 'name', op: 'contains', text: 'road widening' }]);
});
