/**
 * Which enacted-Ordinance PPA an Indicative PPMP line's AIP link becomes on
 * the Final PPMP (specs/012 D9). A PPA is found, in order:
 *
 *   1. directly: its source is that AIP program / PA (carry-forward or import);
 *   2. through the LEP: its source is an LEP PPA whose source is that row;
 *   3. by id: it reuses the AIP row's id (how FY2026 was re-imported).
 *
 * Exactly one match relinks the line. None, or several (the row was split), is
 * left unlinked and listed for the office to link by hand.
 */
export interface SourcedItem {
  id: string;
  sourceProgramId: string | null;
  sourceProjectActivityId: string | null;
  sourceItemId: string | null;
}

export type AipLink =
  | { programId: string; projectActivityId?: null }
  | { projectActivityId: string; programId?: null };

export type Relink =
  | { budgetItemId: string }
  | { budgetItemId: null; reason: 'none' | 'several' };

export function relinkTo(
  link: AipLink,
  ordinance: readonly SourcedItem[],
  lep: readonly SourcedItem[],
): Relink {
  const target = link.projectActivityId ?? link.programId;
  const fromRow = (i: SourcedItem) =>
    link.projectActivityId
      ? i.sourceProjectActivityId === target
      : i.sourceProgramId === target;

  const viaLep = new Set(lep.filter(fromRow).map((i) => i.id));
  for (const match of [
    (i: SourcedItem) => fromRow(i),
    (i: SourcedItem) => i.sourceItemId !== null && viaLep.has(i.sourceItemId),
    (i: SourcedItem) => i.id === target,
  ]) {
    const found = ordinance.filter(match);
    if (found.length === 1) return { budgetItemId: found[0].id };
    if (found.length > 1) return { budgetItemId: null, reason: 'several' };
  }
  return { budgetItemId: null, reason: 'none' };
}
