import { Prisma } from '../generated/prisma/index';

/**
 * Data gaps on a program, recomputed from live rows on every read.
 *
 * These sentences used to be *stored* in `Program.importWarnings` by the 2027
 * workbook import, which meant fixing the underlying data changed nothing: the
 * sentence stayed, and `INCOMPLETE_IMPORT` kept the program unpublishable
 * forever. Deriving them instead is what makes an edit anywhere clear them with
 * no bookkeeping — the same reasoning as the `INCOMPLETE_DATA` blocker in
 * `program-publish.service.ts`, which these sentences exist to explain.
 *
 * `Program.importWarnings` now stores only the three warnings that *cannot* be
 * re-derived, because they record a decision the import made rather than a
 * condition of the data (see `isProvenanceWarning`).
 *
 * Wording is present tense on purpose. The import report says "…in the
 * workbook" because it describes a frozen spreadsheet; these describe the row
 * as it stands right now, so the workbook is not the subject.
 */

/**
 * The subset of a leaf PPA these checks read. Structural rather than a Prisma
 * type so `readinessFor` can pass its already-selected rows straight in.
 */
export type WarnableProjectActivity = {
  name: string;
  proposedBudget: Prisma.Decimal | null;
  psEstimate: Prisma.Decimal | null;
  mooeEstimate: Prisma.Decimal | null;
  feEstimate: Prisma.Decimal | null;
  coEstimate: Prisma.Decimal | null;
  fundSources: readonly unknown[];
  expectedOutput: string | null;
  implementationStartYear: number | null;
  implementationEndYear: number | null;
};

/**
 * The workbook's own expense-class split is allowed to disagree with its stated
 * total by a centavo — that is rounding, not a data-entry error. Anything wider
 * is worth a human looking at it.
 */
const ROUNDING_TOLERANCE = new Prisma.Decimal('0.01');

/**
 * The leaf PPAs of a program: every row no other row names as its parent.
 *
 * A PPA with children derives its money from them (costMode
 * ACTIVITY_CHILDREN), so its own null amount is by design and must not be
 * reported as a gap. Leafness is read off the *actual* child set rather than
 * `costMode`, so a parent whose children were all deleted correctly becomes a
 * leaf again.
 *
 * Shared rather than inlined because two callers need the same answer:
 * `readinessFor`, which turns it into the `ZERO_PROPOSED_BUDGET` /
 * `INCOMPLETE_DATA` blockers, and the AIP registry list, which derives the
 * row's warning sentences. If those two ever disagreed about what a leaf is,
 * a row would carry a blocker its own sentence denied.
 */
export function leavesOf<
  T extends { id: string; parentProjectActivityId: string | null },
>(projectActivities: readonly T[]): T[] {
  const parentIds = new Set(
    projectActivities
      .map((pa) => pa.parentProjectActivityId)
      .filter((id): id is string => id !== null),
  );
  return projectActivities.filter((pa) => !parentIds.has(pa.id));
}

/**
 * The last fiscal year the portal holds as a historical record rather than as a
 * submission it governs.
 *
 * The enacted 2026 Annual Budget is copied verbatim from the city's printed
 * book, and that book states neither a fund source nor an expected output for
 * most of its rows. Requiring them would leave two options — never publish
 * 2026, or invent text the city never wrote into a record whose whole point is
 * that it is verbatim. So both are advisory up to and including this year, and
 * mandatory from the next one, which is the first cycle authored in the portal
 * itself.
 *
 * The implementation period is deliberately *not* on this list: the seed writes
 * the budget year onto every row, so a null there is a real gap rather than
 * something the book declined to say.
 */
export const LAST_HISTORICAL_FISCAL_YEAR = 2026;

export function isHistoricalCycle(fiscalYear: number): boolean {
  return fiscalYear <= LAST_HISTORICAL_FISCAL_YEAR;
}

/**
 * `leaves` is the caller's leaf set, not the whole tree — see `leavesOf`. It is
 * passed in rather than recomputed so the sentence and the blocker it explains
 * can never disagree.
 *
 * `fiscalYear` decides whether the fund-source and expected-output sentences
 * are produced at all — see `isHistoricalCycle`. Suppressed rather than
 * softened, because "581 of 581 PPAs have no funding source" on every row of a
 * cycle where none can ever be filled in is noise, not advice.
 */
export function deriveDataWarnings(program: {
  papClass: string | null;
  fiscalYear: number;
  leaves: readonly WarnableProjectActivity[];
  /**
   * True when the program states its own costs rather than deriving them
   * (`costMode: DIRECT_COSTS`). Then the program *is* the leaf: having no PPAs
   * is the design, not a gap, so the sentence that explains `NO_PPAS` must not
   * fire. Optional so every existing caller keeps its behaviour.
   */
  statesOwnCosts?: boolean;
  /**
   * The program's own fields. When it states its own costs it *is* the leaf
   * the blockers check, so its gaps need sentences too — without these, a
   * direct-cost program blocked by `INCOMPLETE_DATA` showed only "One or more
   * PPAs are missing…" while having no PPAs at all (43 of the 2027 drafts).
   */
  ownRow?: {
    proposedTotal: Prisma.Decimal | null;
    fundSources: readonly unknown[];
    expectedOutput: string | null;
    implementationStartYear: number | null;
    implementationEndYear: number | null;
  };
}): string[] {
  const {
    papClass,
    fiscalYear,
    leaves,
    statesOwnCosts = false,
    ownRow,
  } = program;
  const statesOwnDetail = !isHistoricalCycle(fiscalYear);
  const warnings: string[] = [];
  const total = leaves.length;

  if (total === 0 && !statesOwnCosts) {
    warnings.push('This program has no project or activity rows.');
  }

  if (statesOwnCosts && ownRow) {
    if (!ownRow.proposedTotal || ownRow.proposedTotal.lessThanOrEqualTo(0)) {
      warnings.push('This program has no proposed amount.');
    }
    if (statesOwnDetail && ownRow.fundSources.length === 0) {
      warnings.push('This program has no funding source.');
    }
    if (
      ownRow.implementationStartYear === null ||
      ownRow.implementationEndYear === null
    ) {
      warnings.push('This program has no implementation dates set.');
    }
    if (statesOwnDetail && !ownRow.expectedOutput) {
      warnings.push('This program has no expected output.');
    }
  }

  // Mirrors the ZERO_PROPOSED_BUDGET predicate exactly: a row explicitly set to
  // ₱0 is as unpublishable as one never filled in, so both read as missing.
  const noBudget = leaves.filter(
    (pa) => !pa.proposedBudget || pa.proposedBudget.lessThanOrEqualTo(0),
  ).length;
  if (noBudget > 0) {
    warnings.push(`${noBudget} of ${total} PPAs have no proposed amount.`);
  }

  const noFunds = statesOwnDetail
    ? leaves.filter((pa) => pa.fundSources.length === 0).length
    : 0;
  if (noFunds > 0) {
    warnings.push(`${noFunds} of ${total} PPAs have no funding source.`);
  }

  const noDates = leaves.filter(
    (pa) =>
      pa.implementationStartYear === null || pa.implementationEndYear === null,
  ).length;
  if (noDates > 0) {
    warnings.push(
      `${noDates} of ${total} PPAs have no implementation dates set.`,
    );
  }

  const noOutput = statesOwnDetail
    ? leaves.filter((pa) => !pa.expectedOutput).length
    : 0;
  if (noOutput > 0) {
    warnings.push(`${noOutput} of ${total} PPAs have no expected output.`);
  }

  if (!papClass) {
    warnings.push('No AIP form section (GAS / STO / Operations) set.');
  }

  // Advisory: the estimate rollup recomputes proposedBudget from the trio the
  // moment anyone touches an estimate, so this resolves itself on the next edit.
  for (const pa of leaves) {
    if (!pa.proposedBudget) continue;
    const parts = [
      pa.psEstimate,
      pa.mooeEstimate,
      pa.feEstimate,
      pa.coEstimate,
    ];
    if (!parts.some((p) => p !== null)) continue;

    const sum = parts.reduce<Prisma.Decimal>(
      (acc, p) => acc.plus(p ?? 0),
      new Prisma.Decimal(0),
    );
    if (
      sum.minus(pa.proposedBudget).abs().lessThanOrEqualTo(ROUNDING_TOLERANCE)
    ) {
      continue;
    }

    warnings.push(
      `"${pa.name.slice(0, 60)}": PS+MOOE+FE+CO ${sum.toFixed(2)} does not equal the stated total ${pa.proposedBudget.toFixed(2)}.`,
    );
  }

  return warnings;
}

/**
 * The three warnings that record what the import *decided*, not what the data
 * says. Nothing in the rows can re-derive them — an inferred finish line leaves
 * no trace once it is stored — so they stay in `Program.importWarnings` and are
 * cleared only by an explicit review (`acknowledgeImport`).
 *
 * Keyed on the literal openers because the stored sentences interpolate office
 * names and row numbers. Kept in lockstep with the `LIKE` patterns in
 * `migrations/20260806000000_prune_derived_import_warnings/migration.sql` —
 * change one, change the other.
 */
const PROVENANCE_OPENERS = [
  // The stored sentence, as importers wrote it: not the configured goal word.
  'Finish line inferred from the implementing office',
  'The workbook lists this program twice',
  'The workbook lists these PPAs with no program heading',
  // FY2027 pre-final: the workbook's code text is not kept anywhere once it
  // fails to match the catalog, so only the warning remembers it. (Added after
  // the prune migration ran; that one-off migration needs no matching pattern.)
  'The workbook gives a climate typology code',
  // A PPA the workbook gives no amount of its own (its parent states one
  // figure for all of them), and a row whose split came from hidden rows.
  'The workbook states no amount for',
  "The workbook's PS/MOOE/CO for",
  'The workbook may count this money twice',
] as const;

/**
 * A climate tag stating an amount with no CCET typology code. The city's AIP
 * has them (HSDO's drainage works), so the tag is kept — but a published AIP
 * must say which climate action each amount is, so this blocks publishing
 * (`INCOMPLETE_DATA`) until a code is entered, which clears it by itself.
 */
export type WarnableClimateTag = {
  owner: string;
  ccaAmount: Prisma.Decimal;
  ccmAmount: Prisma.Decimal;
  codeCount: number;
  /** The owning row's proposed amount; null when it derives from its children. */
  budget: Prisma.Decimal | null;
};

export function uncodedClimateTags(
  tags: readonly WarnableClimateTag[],
): WarnableClimateTag[] {
  return tags.filter(
    (t) =>
      t.codeCount === 0 &&
      (t.ccaAmount.greaterThan(0) || t.ccmAmount.greaterThan(0)),
  );
}

export function climateWarnings(tags: readonly WarnableClimateTag[]): string[] {
  return [
    ...uncodedClimateTags(tags).map(
      (t) => `The climate amount on "${t.owner}" has no CCET typology code.`,
    ),
    // Advisory: the workbook states it (CAgO's nursery: ₱1.061M of climate
    // spending on a ₱0.601M row), and only the office can say which is wrong.
    ...tags
      .filter(
        (t) => t.budget && t.ccaAmount.plus(t.ccmAmount).greaterThan(t.budget),
      )
      .map(
        (t) =>
          `The climate amount on "${t.owner}" (₱${t.ccaAmount.plus(t.ccmAmount).toFixed(2)}) is more than its proposed amount (₱${t.budget!.toFixed(2)}).`,
      ),
  ];
}

export function isProvenanceWarning(warning: string): boolean {
  return PROVENANCE_OPENERS.some((opener) => warning.startsWith(opener));
}
