import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { decodeView, encodeView, viewHref, type ExplorerView } from './view-url.ts';

const view: ExplorerView = {
  v: 1,
  series: [
    { document: 'aip', years: [2027, 2026], measure: 'money', filters: { office: ['CHO', 'CPDO'] }, label: 'Plan' },
    { document: 'ordinance', years: [2026], measure: 'count', filters: { fund: ['GF'] } },
  ],
  groupBy: 'year',
  chart: 'line',
  top: 5,
};

test('encode → decode is identity', () => {
  assert.deepEqual(decodeView(encodeView(view)), view);
});

test('reads global and per-series filters, drops unknown tokens, fills defaults', () => {
  const v = decodeView(new URLSearchParams('s=aip:2027&s=lep2:x&f=office:CHO&f0=sector:3000&f9=fund:GF&by=mood&chart=pie'));
  assert.deepEqual(v, {
    v: 1,
    series: [{ document: 'aip', years: [2027], measure: 'money', filters: { office: ['CHO'], sector: ['3000'] } }],
    groupBy: 'sector',
    chart: 'bar',
  });
  assert.equal(decodeView(new URLSearchParams('by=office')), null);
});

test('viewHref is the API grammar', () => {
  assert.equal(viewHref({ v: 1, series: [{ document: 'aip', years: [2027], measure: 'money', filters: {} }], groupBy: 'sector', chart: 'bar' }), '/explore?v=1&s=aip%3A2027%3Amoney&by=sector&chart=bar');
});
