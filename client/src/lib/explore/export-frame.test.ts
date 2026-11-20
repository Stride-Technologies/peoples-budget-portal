import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { frameSvg, queryHash, wrap, type Frame } from './export-frame.ts';

const f: Frame = {
  inner: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="10" height="10"/></svg>',
  width: 400,
  height: 200,
  title: 'Estimated cost by Office',
  subtitle: 'FY2027 AIP · Fund is General Fund · in pesos · 492 records',
  legend: [{ label: 'FY2026', colour: '#2a78d6', draft: false }, { label: 'FY2027', colour: '#eb6834', draft: true }],
  sources: 'Sources: Annual Investment Program FY2027',
  made: 'Made 13 Nov 2026',
  portal: "Naga City People's Budget Portal",
  link: 'https://budget.naga.gov.ph/explore/w/abc123',
  hash: 'query 0123456789ab',
  fontCss: "@font-face{font-family:'Mona Sans';src:url(data:font/woff2;base64,AAAA)}",
  font: "'Mona Sans', sans-serif",
  display: "'Figtree', sans-serif",
  colours: { paper: '#FDFDF8', ink: '#151414', muted: '#5A5754', rule: '#E5E3DC' },
};

test('an export carries title, subtitle, legend, sources, date, mark, link, hash and the font', () => {
  const svg = frameSvg(f);
  for (const s of ['Estimated cost by Office', 'in pesos', '1  FY2026', '2  FY2027 (draft)', 'Sources: Annual Investment Program FY2027', 'Made 13 Nov 2026', 'NAGA CITY PEOPLE&#39;S BUDGET PORTAL', 'budget.naga.gov.ph/explore/w/abc123', 'query 0123456789ab', '@font-face', '<rect width="10" height="10"/>'])
    assert.ok(svg.includes(s), s);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="480" height="\d+"/);
});

test('text is escaped, never injected', () => {
  const svg = frameSvg({ ...f, title: '<script>x</script> & "y"' });
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&#60;script&#62;'));
});

test('long lines wrap at spaces', () => {
  assert.deepEqual(wrap('one two three four', 9), ['one two', 'three', 'four']);
});

test('the query hash is stable and key-order sensitive (the workbook query is canonical)', async () => {
  const a = await queryHash({ source: 'aip-programs', dimensions: ['office'] });
  assert.equal(a, await queryHash({ source: 'aip-programs', dimensions: ['office'] }));
  assert.match(a, /^[0-9a-f]{12}$/);
  assert.notEqual(a, await queryHash({ source: 'aip-programs', dimensions: ['fund'] }));
});

test('gradient references point into the file, not at the page', async () => {
  const { localRefs } = await import('./export-frame.ts');
  assert.equal(localRefs('<rect fill="url(http://localhost:3200/explore#gradient_0)"/>'), '<rect fill="url(#gradient_0)"/>');
  assert.equal(localRefs('<rect fill="url(#ws-hatch-1)"/>'), '<rect fill="url(#ws-hatch-1)"/>');
  assert.equal(localRefs("<rect fill=\"url('https://x/y?a=1#g')\"/>"), "<rect fill=\"url('#g')\"/>");
});
