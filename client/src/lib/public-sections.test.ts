import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountLabelOf, cyclesIn, landingHref, newestYearIn, primarySection, resolveCycle, tabsFor, METHODOLOGY_PUBLIC } from './public-sections.ts';
import type { PublicCycleRecord } from './api.ts';

type Sections = PublicCycleRecord['sections'];

// `sections` comes from the API (computeSections); the client only reads it.
// The defaults mirror what the API returns for these years today.
const cycle = (fiscalYear: number, status: string, over: Partial<PublicCycleRecord> = {}): PublicCycleRecord => ({
  id: String(fiscalYear), fiscalYear, status, aipStatus: status as PublicCycleRecord['aipStatus'],
  sections: (status === 'LOCKED' ? ['annual'] : ['aip']) as Sections,
  currentStage: 0, alongsideStages: [], publicComparisonEnabled: false,
  publicAipOverviewEnabled: false, publicAnnualOverviewEnabled: true, publicPpmpOverviewEnabled: false,
  lastPublishedAt: null, statedTotal: null, statedOfficeTotal: null, statedSpecialTotal: null, statedSource: null, hasEnactedOrdinance: false, annualDocumentKind: null,
  ...over,
});

test('an Overview switched off drops its tab, and the section lands on Browse', () => {
  const y2027 = cycle(2027, 'OPEN');
  assert.deepEqual(tabsFor(y2027, 'aip'), METHODOLOGY_PUBLIC ? ['browse', 'methodology'] : ['browse']);
  assert.equal(landingHref(y2027, 'aip'), '/aip/2027/browse');
  assert.equal(landingHref(y2027, 'ppmp'), '/ppmp/2027/browse');
});

test('Methodology is hidden everywhere while its switch is off', () => {
  const on = cycle(2027, 'OPEN', { publicAipOverviewEnabled: true })
  for (const kind of ['aip', 'ppmp'] as const) {
    assert.equal(tabsFor(on, kind).includes('methodology'), METHODOLOGY_PUBLIC)
  }
})

test('each section reads its own switch', () => {
  const on = cycle(2027, 'OPEN', { publicAipOverviewEnabled: true });
  assert.equal(landingHref(on, 'aip'), '/aip/2027/overview');
  assert.equal(landingHref(on, 'ppmp'), '/ppmp/2027/browse');
  assert.equal(landingHref(cycle(2026, 'LOCKED'), 'annual'), '/annual/2026/overview');
});

test('the PPMP section offers every year, whatever its status', () => {
  const all = [cycle(2026, 'LOCKED'), cycle(2027, 'OPEN')];
  assert.deepEqual(cyclesIn(all, 'ppmp').map((c) => c.fiscalYear), [2027, 2026]);
  assert.deepEqual(cyclesIn(all, 'aip').map((c) => c.fiscalYear), [2027]);
});

// specs/012: a year may sit in both sections once its Ordinance is enacted.
test('a year in both sections resolves in both and is newest in each', () => {
  const all = [
    cycle(2026, 'LOCKED'),
    cycle(2027, 'ADOPTED', { sections: ['aip', 'annual'] }),
    cycle(2028, 'OPEN'),
  ];
  assert.deepEqual(cyclesIn(all, 'aip').map((c) => c.fiscalYear), [2028, 2027]);
  assert.deepEqual(cyclesIn(all, 'annual').map((c) => c.fiscalYear), [2027, 2026]);
  assert.equal(newestYearIn(all, 'annual'), 2027);
  assert.equal(resolveCycle(all, 'aip', '2027')?.fiscalYear, 2027);
  assert.equal(resolveCycle(all, 'annual', '2027')?.fiscalYear, 2027);
  assert.equal(primarySection(all[1]), 'annual');
});

// CRITICAL (specs/012 FR-017): adopting 2027's AIP leaves it a proposal, and
// 2026 stays enacted only — the API decides, and the client must follow it.
test('section membership follows the API, not the AIP status', () => {
  const all = [
    cycle(2026, 'ADOPTED', { sections: ['annual'] }),
    cycle(2027, 'ADOPTED', { sections: ['aip'] }),
  ];
  assert.equal(resolveCycle(all, 'annual', '2027'), null);
  assert.equal(resolveCycle(all, 'aip', '2026'), null);
  assert.equal(newestYearIn(all, 'aip'), 2027);
  assert.equal(newestYearIn(all, 'annual'), 2026);
  assert.equal(primarySection(all[1]), 'aip');
});

test('a year in no section (an adopted AIP with nothing public) is in neither', () => {
  const all = [cycle(2028, 'ADOPTED', { sections: [] })];
  assert.equal(newestYearIn(all, 'aip'), null);
  assert.equal(newestYearIn(all, 'annual'), null);
  assert.deepEqual(cyclesIn(all, 'ppmp').map((c) => c.fiscalYear), [2028]);
});

test('an LEP year in Annual: Proposed Budget, no Overview (specs/017)', () => {
  const lep = cycle(2025, 'LOCKED', { annualDocumentKind: 'LEP', publicAnnualOverviewEnabled: true });
  assert.equal(amountLabelOf(lep), 'Proposed Budget');
  assert.deepEqual(tabsFor(lep, 'annual'), METHODOLOGY_PUBLIC ? ['browse', 'methodology'] : ['browse']);
  const ord = cycle(2025, 'LOCKED', { annualDocumentKind: 'ORDINANCE' });
  assert.equal(amountLabelOf(ord), 'Appropriation');
  assert.equal(amountLabelOf(ord, 'aip'), 'Estimated Cost');
});

test('Income and Spending tabs show only where the Annual book carries them (specs/017)', () => {
  const full = cycle(2026, 'LOCKED', {
    publicAnnualOverviewEnabled: true,
    annualBook: { receipts: true, objects: true, debt: true },
  });
  assert.deepEqual(tabsFor(full, 'annual'), ['overview', 'browse', 'receipts', 'spending']);
  assert.deepEqual(tabsFor(full, 'aip'), tabsFor({ ...full, annualBook: undefined }, 'aip'));
  const byPpaOnly = cycle(2024, 'LOCKED', { annualDocumentKind: 'LEP', annualBook: { receipts: false, objects: false, debt: false } });
  assert.deepEqual(tabsFor(byPpaOnly, 'annual'), ['browse']);
  // An older API sends no `annualBook`: the section looks as it always did.
  assert.deepEqual(tabsFor(cycle(2026, 'LOCKED', { publicAnnualOverviewEnabled: true }), 'annual'), ['overview', 'browse']);
});
