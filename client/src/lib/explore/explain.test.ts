import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { explain } from './explain.ts';
import type { FactSheet, ResolvedSeries } from './view-url.ts';

const series = (key: string, measure: 'money' | 'count' = 'money') =>
  ({ key, label: key, measure, countWord: 'programs' }) as ResolvedSeries;
const row = (id: string, value: string, share: number) => ({ id, label: id.toUpperCase(), value, share });
const facts = (over: Partial<FactSheet> = {}): FactSheet => ({
  documents: [{ kind: 'aip', year: 2027, label: 'FY2027 AIP', moneyWord: 'Estimated cost' }],
  groupBy: 'office',
  series: [{
    key: 'a', label: 'Estimated cost, FY2027 AIP', total: '6000000000.00', n: 492,
    top: [row('cho', '3000000000.00', 0.5), row('ceo', '1200000000.00', 0.2), row('cpdo', '600000000.00', 0.1)],
    bottom: [row('x', '20000000.00', 0.0033), row('y', '10000000.00', 0.0017)],
    biggestChange: null,
  }],
  caveats: ['estimated-cost-not-spent', 'other-row'],
  ...over,
});

test('headline states the total and count; bullets name the largest, top three and smallest', () => {
  const e = explain(facts(), [series('a')]);
  assert.equal(e.headline.key, 'explore.explain.headline');
  assert.deepEqual(e.headline.vars, { series: 'Estimated cost, FY2027 AIP', n: 492, countWord: 'programs' });
  assert.equal(e.headline.figures.total.href, null);
  assert.deepEqual(e.bullets.map((b) => b.key), ['explore.explain.largest', 'explore.explain.topThree', 'explore.explain.smallest']);
  assert.equal(e.bullets[0].vars.pct, 50);
  assert.equal(e.bullets[0].figures.value.href, '#row-cho');
  assert.equal(e.bullets[1].vars.pct, 80);
  assert.equal(e.bullets[2].figures.value.href, '#row-y');
});

test('every figure is one the fact sheet holds (no invented numbers)', () => {
  const f = facts();
  const e = explain(f, [series('a')]);
  const shown = [e.headline, ...e.bullets].flatMap((b) => Object.values(b.figures).map((x) => x.href));
  for (const h of shown.filter(Boolean)) assert.ok(f.series[0].top.concat(f.series[0].bottom).some((r) => h === `#row-${r.id}`));
});

test('overlapping themes never claim a "together" share', () => {
  const e = explain(facts({ caveats: ['tags-overlap'] }), [series('a')]);
  assert.ok(!e.bullets.some((b) => b.key === 'explore.explain.topThree'));
});

test('limits voice each caveat but "Other", and a default when nothing says money was not spent', () => {
  assert.deepEqual(explain(facts(), [series('a')]).limits.map((l) => l.key), ['explore.explain.limit.estimated-cost-not-spent']);
  assert.deepEqual(explain(facts({ caveats: [] }), [series('a')]).limits.map((l) => l.key), ['explore.explain.limit.default']);
});

test('over years: the biggest change, signed by word not by minus', () => {
  const f = facts({ groupBy: 'year' });
  f.series[0].biggestChange = { label: '2026 → 2027', from: '5', to: '3', delta: '-2000000.00', pct: -40 };
  const [b] = explain(f, [series('a')]).bullets;
  assert.equal(b.key, 'explore.explain.changeDown');
  assert.equal(b.vars.pct, ' (40%)');
  assert.ok(!b.figures.delta.text.includes('-'));
});

test('compared: a total per extra series, and the largest of each, named', () => {
  const f = facts();
  f.series.push({ ...f.series[0], key: 'b', label: 'Appropriation, FY2026 Annual Budget' });
  const e = explain(f, [series('a'), series('b')]);
  assert.deepEqual(e.bullets.map((b) => b.key), ['explore.explain.headline', 'explore.explain.largestIn', 'explore.explain.largestIn']);
  assert.equal(e.bullets[2].vars.series, 'Appropriation, FY2026 Annual Budget');
});

test('a count reads as a count; sources link the public section', () => {
  const e = explain(facts(), [series('a', 'count')]);
  assert.equal(e.headline.key, 'explore.explain.headlineCount');
  assert.deepEqual(e.sources, [{ label: 'FY2027 AIP', href: '/aip/2027/browse' }]);
});
