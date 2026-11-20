'use server';

import { getSession } from '@/lib/session';
import {
  apiListPpmp,
  apiGetOffices,
  apiGetAipCycles,
  apiPublishAllPpmp,
  apiGetPpmp,
  type PpmpSummaryRecord,
  type OfficeRecord,
  type AipCycleRecord,
  type PublishAllPpmpResult,
  type PpmpLineItemRecord,
} from '@/lib/api';

export interface PpmpRegistryRow extends PpmpSummaryRecord {
  officeName: string;
  officeAcronym: string;
}

export async function loadOffices(): Promise<OfficeRecord[] | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    return await apiGetOffices(session.accessToken);
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load offices.' };
  }
}

export async function loadAipCycles(): Promise<AipCycleRecord[] | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    return await apiGetAipCycles(session.accessToken);
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load AIP cycles.' };
  }
}

/**
 * Fetches every PPMP the caller can see for a cycle (office filter optional),
 * with office name/acronym joined in. Unlike the AIP registry, tabs and search
 * are filtered in memory client-side from this one set — PPMP's per-cycle row
 * count doesn't carry the traffic weight that justifies server-side paging.
 */
export async function loadPpmpRegistry(
  cycleId?: string,
): Promise<{ data: PpmpRegistryRow[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const [ppmps, offices] = await Promise.all([
      apiListPpmp(session.accessToken, { aipCycleId: cycleId }),
      apiGetOffices(session.accessToken),
    ]);
    const officesById = new Map(offices.map((o) => [o.id, o]));
    return {
      data: ppmps.map((p) => ({
        ...p,
        officeName: officesById.get(p.officeId)?.name ?? 'Unknown office',
        officeAcronym: officesById.get(p.officeId)?.acronym ?? '—',
      })),
    };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load PPMPs.' };
  }
}

/** Lazy detail fetch for a row's Full-mode line-item sub-table. */
export async function loadPpmpLineItems(
  id: string,
): Promise<{ data: PpmpLineItemRecord[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const ppmp = await apiGetPpmp(session.accessToken, id);
    return { data: ppmp.lineItems };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load line items.' };
  }
}

export async function publishAllPpmp(
  officeId?: string,
  cycleId?: string,
): Promise<{ data: PublishAllPpmpResult } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const data = await apiPublishAllPpmp(session.accessToken, {
      officeId,
      aipCycleId: cycleId,
    });
    return { data };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to publish PPMPs.' };
  }
}
