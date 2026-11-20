import type { PapClass } from './schemas.ts';

/** One program in an office's reorder scope, as `GET /programs` returns it. */
export interface ReorderScopeProgram {
  id: string;
  name: string;
  code: string;
  papClass: PapClass | null;
  papSectorId: string;
  papSectorLabel: string;
  orderIndex: number;
}

export interface SectorGroup {
  papSectorId: string;
  label: string;
  programs: ReorderScopeProgram[];
}

/**
 * The programs one master-list section (office + papClass) shows, split by PAP
 * sector — each sector is its own AIP-code scope, so a program can only move
 * among the programs of its own sector. A null papClass prints under Operations.
 */
export function sectionSectors(
  scope: ReorderScopeProgram[],
  papClass: PapClass,
): SectorGroup[] {
  const groups = new Map<string, SectorGroup>();
  const inSection = scope
    .filter((p) => (p.papClass ?? 'OPERATIONS') === papClass)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  for (const p of inSection) {
    const group = groups.get(p.papSectorId);
    if (group) group.programs.push(p);
    else
      groups.set(p.papSectorId, {
        papSectorId: p.papSectorId,
        label: p.papSectorLabel,
        programs: [p],
      });
  }
  return [...groups.values()];
}

/**
 * `PATCH /programs/reorder` wants every program in the sector scope exactly
 * once — that includes the sector's programs in the *other* sections. The
 * server ranks papClass before orderIndex, so their position relative to the
 * reordered section cannot change anything; only their order among themselves
 * matters, and it is kept.
 */
export function reorderPayload(
  scope: ReorderScopeProgram[],
  papSectorId: string,
  sectionOrder: string[],
): string[] {
  const moved = new Set(sectionOrder);
  const rest = scope
    .filter((p) => p.papSectorId === papSectorId && !moved.has(p.id))
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((p) => p.id);
  return [...sectionOrder, ...rest];
}
