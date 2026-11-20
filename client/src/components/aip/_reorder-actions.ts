'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import {
  apiGetPrograms,
  apiReorderProjectActivities,
  apiReorderPrograms,
  type ReorderedRow,
} from '@/lib/api';
import type { ReorderScopeProgram } from '@/lib/program-reorder';

export type ReorderResult = { rows: ReorderedRow[] } | { error: string };

/**
 * Reorder a sibling group of Projects/Activities.
 *
 * `ids` must be the complete sibling list under `parentProjectActivityId`
 * (null = the program's root level). The AIP codes are renumbered server-side,
 * so the returned rows carry the new codes.
 */
export async function reorderProjectActivities(
  programId: string,
  ids: string[],
  parentProjectActivityId: string | null,
): Promise<ReorderResult> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const rows = await apiReorderProjectActivities(
      session.accessToken,
      programId,
      ids,
      parentProjectActivityId,
    );
    revalidatePath('/aip-registry');
    return { rows };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to reorder.' };
  }
}

/** Reorder programs within one AIP code scope (cycle + office + PAP sector). */
export async function reorderPrograms(ids: string[]): Promise<ReorderResult> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const rows = await apiReorderPrograms(session.accessToken, ids);
    revalidatePath('/aip-registry');
    return { rows };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to reorder.' };
  }
}

/**
 * Every program an office owns in a cycle — the superset of its reorder scopes
 * (one per PAP sector). Read fresh rather than from the registry list, which
 * may be filtered or searched down to a few rows.
 */
export async function loadProgramReorderScope(
  cycleId: string,
  officeId: string,
): Promise<{ programs: ReorderScopeProgram[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const programs: ReorderScopeProgram[] = [];
    for (let page = 1; ; page++) {
      const res = await apiGetPrograms(session.accessToken, {
        cycleId,
        officeId,
        page,
        pageSize: 100,
      });
      for (const p of res.items) {
        programs.push({
          id: p.id,
          name: p.name,
          code: p.aipReferenceCode ?? p.tentativeAipReferenceCode,
          papClass: p.papClass,
          papSectorId: p.papSectorId,
          papSectorLabel: p.papSector
            ? `${p.papSector.code} ${p.papSector.name}`
            : 'No PAP sector',
          orderIndex: p.orderIndex,
        });
      }
      if (page * res.pageSize >= res.total) break;
    }
    return { programs };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load programs.' };
  }
}
