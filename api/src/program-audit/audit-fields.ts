import { Prisma } from '../generated/prisma/index';

/**
 * Explicit per-entity allow-lists for the audit diff.
 *
 * Never diff blindly: dumping whole rows into JSON ages badly (new columns leak
 * in silently, and rollups would churn a row on every recompute). Both the audit
 * log and the phase-5 draft/published compare read from here, so "what counts as
 * a change" has exactly one definition.
 *
 * Deliberately excluded: derived rollups (psTotal / mooeTotal / feTotal / coTotal /
 * grandTotal / proposedTotal / proposedBudget), timestamps, and ids. They move
 * as a *consequence* of an edit, so logging them would double-report it.
 */
export const PROGRAM_AUDIT_FIELDS = [
  'name',
  'description',
  'expectedOutput',
  'majorFinalOutput',
  'targetForBudgetYear',
  'remarks',
  'officeId',
  'hostOfficeId',
  'finishLineId',
  'subFinishLineId',
  'papSectorId',
  'sglgIndicatorId',
  'implementationStartMonth',
  'implementationStartYear',
  'implementationEndMonth',
  'implementationEndYear',
] as const;

export const PROJECT_ACTIVITY_AUDIT_FIELDS = [
  'name',
  'description',
  'type',
  'costMode',
  'expectedOutput',
  'majorFinalOutput',
  'targetForBudgetYear',
  'remarks',
  'implementationStartMonth',
  'implementationStartYear',
  'implementationEndMonth',
  'implementationEndYear',
] as const;

/**
 * Cost estimates are diffed separately so `ESTIMATE_UPDATED` can be its own
 * action — "who moved MOOE from 200k to 250k" is the single most-asked question
 * the edit history exists to answer, and burying it inside PA_UPDATED would make
 * it unfilterable.
 */
export const ESTIMATE_AUDIT_FIELDS = [
  'psEstimate',
  'mooeEstimate',
  'feEstimate',
  'coEstimate',
] as const;

export type FieldDiff = Record<string, { from: unknown; to: unknown }>;

/**
 * Diff `before` against `after` over `fields`, returning only the keys that
 * actually moved. An empty result means "no change" — callers use that to skip
 * writing a log row entirely (D22), which is what keeps a no-op PATCH silent.
 *
 * `after` is a DTO, so a field that is `undefined` means "not being changed"
 * and is skipped; an explicit `null` is a real clearing edit and is reported.
 * Test for `undefined`, not `in`: ValidationPipe builds a DTO *instance*, and
 * with ES2022 class fields every declared property is an own key — present and
 * `undefined` — so `in` reported every unsent field as cleared (#82).
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
): FieldDiff | null {
  const changes: FieldDiff = {};

  for (const field of fields) {
    if (after[field] === undefined) continue;

    const from = normalize(before[field]);
    const to = normalize(after[field]);
    if (from === to) continue;

    changes[field] = { from, to };
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/**
 * Compare by value, not identity. Prisma hands back `Decimal` and `Date`
 * instances while a DTO carries strings, so the DB's `Decimal('180000.00')` and
 * the wire's `'180000.00'` must not read as a change.
 *
 * Numeric values are normalized through `Prisma.Decimal` rather than `Number` —
 * money is `Decimal(18,2)` and exceeds what a float compares safely, and the
 * naive `toString()` comparison is exactly the phantom-diff bug this guards
 * against (`Decimal('180000.00').toString()` is `'180000'`).
 */
function normalize(value: unknown): string | boolean | null {
  // A blank text field and a never-set one are the same thing to a reader.
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'object') {
    // Prisma.Decimal and Date both round-trip correctly through toString().
    const asString = (value as { toString(): string }).toString();
    return NUMERIC.test(asString)
      ? new Prisma.Decimal(asString).toString()
      : asString;
  }

  if (typeof value === 'number') return new Prisma.Decimal(value).toString();

  if (typeof value === 'string' && NUMERIC.test(value)) {
    return new Prisma.Decimal(value).toString();
  }

  return value as string | boolean;
}

/**
 * One-liner for the History tab, written at log time so rendering never depends
 * on re-resolving rows that may since have been deleted.
 */
export function summarizeFieldChanges(changes: FieldDiff | null): string {
  if (!changes) return 'No changes';
  const fields = Object.keys(changes);
  if (fields.length === 1) return `Changed ${fields[0]}`;
  return `Changed ${fields.length} fields: ${fields.join(', ')}`;
}
