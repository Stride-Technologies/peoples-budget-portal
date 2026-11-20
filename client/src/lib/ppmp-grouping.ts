import { addDecimalStrings } from './currency-formatter.ts';
import { PPMP_CLASSIFICATIONS, type PpmpClassification } from './schemas.ts';

/**
 * Office-bucketing for the PPMP registry — mirrors `aip-grouping.ts`'s
 * `groupByOffice` shape, trimmed for PPMP: no component-program host-office
 * split, since that concept doesn't exist on PPMP. Just office -> PPMP[].
 * Classification sub-sectioning within an office group is a separate,
 * purely presentational step — see `groupByClassification` below.
 */
export interface GroupablePpmp {
  id: string;
  officeId: string;
  officeName: string;
  officeAcronym: string;
  grandTotal: string;
  /** Absent on the public list, which doesn't categorize by it. */
  classification?: PpmpClassification;
}

export interface PpmpClassificationSection<T extends GroupablePpmp> {
  classification: PpmpClassification;
  label: string;
  ppmps: T[];
}

/**
 * Sub-sections an already-ordered list of Projects by `classification`, in
 * `PPMP_CLASSIFICATIONS`' fixed order — mirrors how `aip-grouping.ts`
 * sections a Program group by `papClass`. Deliberately separate from
 * `groupPpmpsByOffice`/`sortGroupedPpmps`: those two remain the source of
 * truth for office totals and sort order (and their existing tests), this
 * is a render-only regroup of one office's already-sorted `ppmps` array —
 * relative order within each section is preserved (stable).
 */
export function groupByClassification<T extends GroupablePpmp>(
  ppmps: T[],
): PpmpClassificationSection<T>[] {
  return PPMP_CLASSIFICATIONS.map(({ value, label }) => ({
    classification: value,
    label,
    ppmps: ppmps.filter((p) => p.classification === value),
  })).filter((section) => section.ppmps.length > 0);
}

export const UNASSIGNED_OFFICE_KEY = '__unassigned_office__';

export function officeGroupKey(officeId: string | null): string {
  return officeId ?? UNASSIGNED_OFFICE_KEY;
}

export interface PpmpOfficeGroup<T extends GroupablePpmp> {
  officeId: string | null;
  officeAcronym: string;
  officeName: string;
  ppmpCount: number;
  total: string;
  ppmps: T[];
}

export function groupPpmpsByOffice<T extends GroupablePpmp>(
  entries: T[],
): PpmpOfficeGroup<T>[] {
  const groups = new Map<string, PpmpOfficeGroup<T>>();

  for (const entry of entries) {
    const key = officeGroupKey(entry.officeId);
    const existing = groups.get(key);
    if (existing) {
      existing.ppmps.push(entry);
      existing.ppmpCount += 1;
      existing.total = addDecimalStrings([existing.total, entry.grandTotal]);
    } else {
      groups.set(key, {
        officeId: entry.officeId,
        officeAcronym: entry.officeAcronym,
        officeName: entry.officeName,
        ppmpCount: 1,
        total: entry.grandTotal,
        ppmps: [entry],
      });
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.officeId === null) return 1;
    if (b.officeId === null) return -1;
    return a.officeAcronym.localeCompare(b.officeAcronym);
  });
}

/** Office keys whose group has at least one entry matching `predicate`. */
export function officeKeysMatching<T extends GroupablePpmp>(
  groups: PpmpOfficeGroup<T>[],
  predicate: (entry: T) => boolean,
): string[] {
  return groups
    .filter((group) => group.ppmps.some(predicate))
    .map((group) => officeGroupKey(group.officeId));
}

export type PpmpSortBy =
  | 'recently_updated'
  | 'newest'
  | 'highest_budget'
  | 'lowest_budget'
  | 'most_feedback';

/**
 * `GroupablePpmp` plus the fields needed to sort by recency and feedback —
 * additive, so `groupPpmpsByOffice`'s other callers (which don't sort) are
 * unaffected.
 */
export interface SortablePpmp extends GroupablePpmp {
  createdAt: string;
  updatedAt: string;
  /** Per-project public feedback count — enables "Most Feedback" (specs/005). */
  feedbackCount: number;
}

function ppmpMetric(entry: SortablePpmp, sortBy: PpmpSortBy): number {
  switch (sortBy) {
    case 'recently_updated':
      return new Date(entry.updatedAt).getTime();
    case 'newest':
      return new Date(entry.createdAt).getTime();
    case 'highest_budget':
    case 'lowest_budget':
      return parseFloat(entry.grandTotal) || 0;
    case 'most_feedback':
      return entry.feedbackCount;
  }
}

function groupMetric<T extends SortablePpmp>(
  group: PpmpOfficeGroup<T>,
  sortBy: PpmpSortBy,
): number {
  if (sortBy === 'highest_budget' || sortBy === 'lowest_budget') {
    return parseFloat(group.total) || 0;
  }
  if (sortBy === 'most_feedback') {
    return group.ppmps.reduce((sum, p) => sum + p.feedbackCount, 0);
  }
  // "Recently active" means *any* plan in the group just changed, not an
  // average diluted by older siblings.
  return Math.max(...group.ppmps.map((p) => ppmpMetric(p, sortBy)));
}

/**
 * Reorders both the groups and each group's `ppmps` by `sortBy`, using the
 * same metric aggregated per group (spec.md FR-008). Does not mutate its
 * input. `Array.prototype.sort` is stable (ES2019+), so exact ties keep
 * their prior relative order — no explicit tie-breaker needed.
 */
export function sortGroupedPpmps<T extends SortablePpmp>(
  groups: PpmpOfficeGroup<T>[],
  sortBy: PpmpSortBy,
): PpmpOfficeGroup<T>[] {
  const descending = sortBy !== 'lowest_budget';
  const direction = descending ? -1 : 1;

  const sorted = groups.map((group) => ({
    ...group,
    ppmps: [...group.ppmps].sort(
      (a, b) => direction * (ppmpMetric(a, sortBy) - ppmpMetric(b, sortBy)),
    ),
  }));

  sorted.sort(
    (a, b) => direction * (groupMetric(a, sortBy) - groupMetric(b, sortBy)),
  );

  return sorted;
}
