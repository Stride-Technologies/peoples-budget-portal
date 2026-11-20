import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupPpmpsByOffice,
  sortGroupedPpmps,
  type SortablePpmp,
} from './ppmp-grouping.ts';

function ppmp(
  id: string,
  office: string,
  grandTotal: string,
  createdAt: string,
  updatedAt: string,
  feedbackCount = 0,
): SortablePpmp {
  return {
    id,
    officeId: office,
    officeName: `Office of the ${office.toUpperCase()}`,
    officeAcronym: office.toUpperCase(),
    grandTotal,
    createdAt,
    updatedAt,
    feedbackCount,
  };
}

test('recently_updated sorts groups and within-group plans by most recent updatedAt', () => {
  const groups = groupPpmpsByOffice([
    ppmp('1', 'aaa', '100.00', '2026-01-01', '2026-01-05'),
    ppmp('2', 'bbb', '100.00', '2026-01-01', '2026-01-10'),
    ppmp('3', 'bbb', '100.00', '2026-01-01', '2026-01-02'),
  ]);

  const sorted = sortGroupedPpmps(groups, 'recently_updated');

  assert.deepEqual(sorted.map((g) => g.officeId), ['bbb', 'aaa']);
  assert.deepEqual(
    sorted[0].ppmps.map((p) => p.id),
    ['2', '3'],
  );
});

test('newest sorts by createdAt, ignoring later edits', () => {
  const groups = groupPpmpsByOffice([
    ppmp('1', 'aaa', '100.00', '2026-01-10', '2026-01-10'),
    ppmp('2', 'bbb', '100.00', '2026-01-01', '2026-02-01'),
  ]);

  const sorted = sortGroupedPpmps(groups, 'newest');

  // '2' was edited most recently but created first — newest must ignore that.
  assert.deepEqual(sorted.map((g) => g.officeId), ['aaa', 'bbb']);
});

test('highest_budget sorts groups by their aggregated total, descending', () => {
  const groups = groupPpmpsByOffice([
    ppmp('1', 'aaa', '50.00', '2026-01-01', '2026-01-01'),
    ppmp('2', 'bbb', '30.00', '2026-01-01', '2026-01-01'),
    ppmp('3', 'bbb', '40.00', '2026-01-01', '2026-01-01'),
  ]);

  const sorted = sortGroupedPpmps(groups, 'highest_budget');

  // bbb's group total (70) beats aaa's (50).
  assert.deepEqual(sorted.map((g) => g.officeId), ['bbb', 'aaa']);
  assert.deepEqual(
    sorted[0].ppmps.map((p) => p.id),
    ['3', '2'],
  );
});

test('lowest_budget sorts ascending', () => {
  const groups = groupPpmpsByOffice([
    ppmp('1', 'aaa', '50.00', '2026-01-01', '2026-01-01'),
    ppmp('2', 'bbb', '10.00', '2026-01-01', '2026-01-01'),
  ]);

  const sorted = sortGroupedPpmps(groups, 'lowest_budget');

  assert.deepEqual(sorted.map((g) => g.officeId), ['bbb', 'aaa']);
});

test('exact ties keep the prior (alphabetical) relative order — no jitter', () => {
  const groups = groupPpmpsByOffice([
    ppmp('1', 'aaa', '100.00', '2026-01-01', '2026-01-01'),
    ppmp('2', 'bbb', '100.00', '2026-01-01', '2026-01-01'),
    ppmp('3', 'ccc', '100.00', '2026-01-01', '2026-01-01'),
  ]);

  const sorted = sortGroupedPpmps(groups, 'highest_budget');

  assert.deepEqual(sorted.map((g) => g.officeId), ['aaa', 'bbb', 'ccc']);
});

test('most_feedback sorts groups by their summed feedback count, descending', () => {
  const groups = groupPpmpsByOffice([
    ppmp('1', 'aaa', '100.00', '2026-01-01', '2026-01-01', 1),
    ppmp('2', 'bbb', '100.00', '2026-01-01', '2026-01-01', 5),
    ppmp('3', 'bbb', '100.00', '2026-01-01', '2026-01-01', 2),
  ]);

  const sorted = sortGroupedPpmps(groups, 'most_feedback');

  assert.deepEqual(sorted.map((g) => g.officeId), ['bbb', 'aaa']);
  assert.deepEqual(
    sorted[0].ppmps.map((p) => p.id),
    ['2', '3'],
  );
});

test('does not mutate its input', () => {
  const groups = groupPpmpsByOffice([
    ppmp('1', 'aaa', '10.00', '2026-01-01', '2026-01-01'),
    ppmp('2', 'bbb', '90.00', '2026-01-01', '2026-01-01'),
  ]);
  const originalOrder = groups.map((g) => g.officeId);

  sortGroupedPpmps(groups, 'highest_budget');

  assert.deepEqual(groups.map((g) => g.officeId), originalOrder);
});
