import type { AIPEntry } from '@/components/aip/aip-master-list';

/**
 * Hides the PA a program was mirrored into, so one printed row renders as one row.
 *
 * Money lives on PAs in this schema — a program's total is the sum of its **root**
 * PAs — so a budget row that carries money and has no sub-rows has to be written
 * twice: once as the program, once as a PA beneath it holding the amount. The AB
 * 2026 seed does exactly that (`api/prisma/ab-2026-book.ts` `paRowsOf`), which is
 * why 432 of that cycle's 489 programs expand into a copy of themselves.
 *
 * The stored shape is right and stays untouched; only the display collapses. The
 * alternative was moving money onto programs, which would break the rollup
 * invariant every total in the app depends on, for a presentation problem.
 *
 * **Conservative on purpose.** Matching the name *and* both money fields means a
 * program that merely shares a name with a genuinely distinct activity keeps its
 * child. The cost of a false positive is a hidden row of real budget; the cost of
 * a false negative is a duplicated row, so the test is deliberately strict.
 *
 * Top level only: the mirror is only ever created program → PA, so recursing
 * would assert a pattern that does not exist.
 */
export function collapseMirroredChildren(entries: AIPEntry[]): AIPEntry[] {
  return entries.map((entry) => (isMirrorOnly(entry) ? { ...entry, children: [] } : entry));
}

function isMirrorOnly(entry: AIPEntry): boolean {
  if (entry.children?.length !== 1) return false;

  const child = entry.children[0];
  // A child with its own subtree carries structure the parent does not, so it is
  // not a mirror however identical its own row looks.
  if (child.children && child.children.length > 0) return false;

  return (
    (entry.program_name ?? '').trim() === (child.program_name ?? '').trim() &&
    entry.total_amount === child.total_amount &&
    (entry.proposedBudget ?? null) === (child.proposedBudget ?? null)
  );
}
