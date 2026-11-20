import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUDGET_PHASES,
  BUDGET_STAGES,
  liveBudgets,
  hasUnconfirmed,
  phaseState,
  resolveCopy,
  stageState,
  stageFromHash,
  visibleWho,
} from './budget-cycle.ts';
import { GLOSSARY, glossaryAnchor } from './glossary.ts';

test('stages are numbered 0..n in order, so prev/next and #stage-N line up', () => {
  BUDGET_STAGES.forEach((s, i) => assert.equal(s.n, i));
});

test('the API stage range (0–9) covers exactly the stages', () => {
  // budget_cycles.current_stage has CHECK 0..9; the diagram must have them all.
  assert.equal(BUDGET_STAGES.length, 10);
});

test('live budgets are the two newest years, at the stage staff set', () => {
  const live = liveBudgets([
    { fiscalYear: 2025, currentStage: 9, alongsideStages: [] },
    { fiscalYear: 2027, currentStage: 3, alongsideStages: [1, 2] },
    { fiscalYear: 2026, currentStage: 8, alongsideStages: [9] },
  ]);
  assert.deepEqual(live, [
    { fiscalYear: 2027, stage: 3, alongside: [1, 2] },
    { fiscalYear: 2026, stage: 8, alongside: [9] },
  ]);
  assert.deepEqual(liveBudgets([]), []);
});

test('overlapping stages: everything before the earliest is done, the rest upcoming', () => {
  const b = { fiscalYear: 2027, stage: 3, alongside: [1, 2] };
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((n) => stageState(b, n)),
    ['done', 'now', 'now', 'now', 'upcoming'],
  );
});

test('production never shows an unconfirmed statement', () => {
  for (const s of BUDGET_STAGES) {
    for (const copy of [s.what, s.you, s.know, ...s.who.map((w) => w.role)]) {
      assert.ok(resolveCopy(copy, true).every((p) => !p.unconfirmed), `stage ${s.n}`);
    }
  }
});

test('review builds mark unconfirmed statements; production swaps or drops them', () => {
  const copy = ['Known. ', { unconfirmed: 'Maybe.', fallback: '' }] as const;
  assert.deepEqual(resolveCopy(copy, false), [
    { text: 'Known. ', unconfirmed: false },
    { text: 'Maybe.', unconfirmed: true },
  ]);
  assert.deepEqual(resolveCopy(copy, true), [{ text: 'Known. ', unconfirmed: false }]);
});

test('a "who" row whose only role is unconfirmed disappears on production', () => {
  const stage2 = BUDGET_STAGES[2];
  assert.ok(hasUnconfirmed(stage2));
  assert.ok(visibleWho(stage2, true).length < visibleWho(stage2, false).length);
});

test('#stage-N deep links parse, and nothing else does', () => {
  assert.equal(stageFromHash('#stage-4'), 4);
  assert.equal(stageFromHash('#stage-99'), null);
  assert.equal(stageFromHash('#glossary'), null);
  assert.equal(stageFromHash(''), null);
});

test('every glossary term and section heading has its own anchor', () => {
  const anchors = GLOSSARY.flatMap((g) => [
    glossaryAnchor(g.heading),
    ...g.entries.map((e) => glossaryAnchor(e.term)),
  ]);
  assert.equal(new Set(anchors).size, anchors.length);
  assert.ok(anchors.every((a) => /^[a-z0-9-]+$/.test(a)));
});

test('the home page’s six stages cover every stage exactly once, in order', () => {
  const covered = BUDGET_PHASES.flatMap((p) => p.stages);
  assert.deepEqual(covered, BUDGET_STAGES.map((s) => s.n));
});

test('a phase is under way if any of its stages is', () => {
  const b = { fiscalYear: 2027, stage: 3, alongside: [1, 2] };
  assert.deepEqual(
    BUDGET_PHASES.map((p) => phaseState(b, p)),
    ['done', 'now', 'now', 'upcoming', 'upcoming', 'upcoming'],
  );
  const spending = { fiscalYear: 2026, stage: 8, alongside: [9] };
  assert.deepEqual(
    BUDGET_PHASES.map((p) => phaseState(spending, p)),
    ['done', 'done', 'done', 'done', 'done', 'now'],
  );
});
