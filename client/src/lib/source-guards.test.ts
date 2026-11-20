import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * Bugs that only show on a deployed site, checked against the source instead.
 */

const srcDir = new URL('../', import.meta.url);

function files(suffix: RegExp): { path: string; text: string }[] {
  return (readdirSync(srcDir, { recursive: true }) as string[])
    .filter((p) => suffix.test(p))
    .map((p) => ({ path: p, text: readFileSync(new URL(p, srcDir), 'utf8') }));
}

// Base UI modals (Dialog/Sheet, and Menu/Select by default) lock page scroll themselves. A
// second hand-rolled lock that snapshots `overflow` and writes it back can capture Base UI's
// "hidden" and restore it after Base UI has unlocked: the page then cannot scroll until reload.
// section-outline.tsx is not a Base UI modal; it clears rather than restores.
test('no hand-rolled body/html scroll lock beside Base UI', () => {
  const offenders = files(/\.tsx?$/)
    .filter(({ path }) => !path.endsWith('section-outline.tsx') && !path.endsWith('.test.ts'))
    .filter(({ text }) => /(body|documentElement)\.style\.(overflow|overscrollBehavior)\s*=[^=]/.test(text))
    .map(({ path }) => path);
  assert.deepEqual(offenders, [], 'Base UI modals lock scroll themselves; a second lock freezes the page');
});

// In the standalone container a route handler's `request.url` is the bind address
// (http://0.0.0.0:3000), not the public host, so a redirect built from it sends the visitor
// there. Send a relative Location instead. (Middleware is not affected.)
test('route handlers do not build redirects from request.url', () => {
  const offenders = files(/(^|\/)route\.ts$/)
    // Two-argument form only (`new URL(request.url)` to read search params is fine); comments skipped.
    .filter(({ text }) => /new URL\([^()]*,\s*(request|req)\.url\)/.test(text.replace(/^\s*\/\/.*$/gm, '')))
    .map(({ path }) => path);
  assert.deepEqual(offenders, [], 'redirect with a relative Location, not new URL(path, request.url): it resolves to 0.0.0.0:3000');
});

// `/fil/x` is a middleware rewrite of `/x`, so a `next/link` between languages is the same
// route to the client router: the URL changed, the page and `<html lang>` did not (specs/014).
test('the language switcher does a full page load', () => {
  const [switcher] = files(/language-switcher\.tsx$/);
  assert.ok(switcher, 'language-switcher.tsx not found');
  assert.doesNotMatch(switcher.text, /from 'next\/link'|useRouter/, 'switch languages with a plain anchor, not a soft navigation');
});

// DESIGN.md: public pages draw no chart library. The explorer's page charts are
// hand-written SVG with the table always beside them (specs/018 FR-020). The one
// exception is the desktop workspace, which draws with Vega (redesign W4).
test('the explorer imports no chart library outside the workspace', () => {
  const offenders = files(/^(components\/explore|app\/\(public\)\/explore)\/.*\.tsx?$/)
    .filter(({ path }) => !path.startsWith('components/explore/workspace/'))
    .filter(({ text }) => /from '(recharts|chart\.js|react-chartjs-2|d3[^']*|@nivo\/[^']*|victory[^']*|echarts[^']*|plotly[^']*|vega[^']*)'|import\('vega/.test(text))
    .map(({ path }) => path);
  assert.deepEqual(offenders, [], 'draw page charts as SVG in components/explore/charts.tsx; Vega lives in components/explore/workspace/');
});

// specs/018: Ask must stay a native, labelled text field — phone voice typing,
// dictation software and screen readers only work on one — and the visitor's
// question never goes into the URL (a shared link shows the chart, not what was asked).
test('the Ask box is a native labelled field and keeps the question out of the URL', () => {
  const [ask] = files(/^components\/explore\/ask-box\.tsx$/);
  assert.ok(ask, 'components/explore/ask-box.tsx exists');
  assert.match(ask.text, /<textarea[\s\S]*?id="explore-ask-input"/);
  assert.match(ask.text, /<label htmlFor="explore-ask-input"/);
  assert.doesNotMatch(ask.text, /contentEditable/);
  for (const m of ask.text.matchAll(/router\.(push|replace)\(([^)]*\))/g))
    assert.match(m[2], /viewHref\(r\.view\)/, 'Ask navigates to the view only');
});
