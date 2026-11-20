'use server';

import {
  apiPublicGetCycles,
  apiPublicGetPpmpList,
  apiPublicGetPpmp,
  apiPublicGetPpmpHistory,
  apiPublicGetPpmpFeedback,
  apiPublicSubmitRegistryFeedback,
  apiPublicSubmitPpmpFeedback,
} from '@/lib/api';
import { visitorIp } from '@/lib/visitor-ip';
import type {
  PublicCycleRecord,
  PublicPpmpSummaryRecord,
  PublicPpmpRecord,
  PpmpHistoryEntry,
  PublicPpmpFeedbackItem,
} from '@/lib/api';

export async function loadPublicCycles(): Promise<PublicCycleRecord[] | { error: string }> {
  try {
    return await apiPublicGetCycles();
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load cycles.' };
  }
}

export async function loadPublicPpmpList(
  cycleId: string,
  officeId?: string,
): Promise<PublicPpmpSummaryRecord[] | { error: string }> {
  try {
    return await apiPublicGetPpmpList(cycleId, officeId);
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load PPMPs.' };
  }
}

export async function loadPublicPpmp(
  id: string,
): Promise<PublicPpmpRecord | { error: string }> {
  try {
    return await apiPublicGetPpmp(id);
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load PPMP.' };
  }
}

export async function loadPublicPpmpHistory(
  id: string,
): Promise<PpmpHistoryEntry[] | { error: string }> {
  try {
    return await apiPublicGetPpmpHistory(id);
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load Project history.' };
  }
}

export async function loadPublicPpmpFeedback(
  id: string,
): Promise<PublicPpmpFeedbackItem[] | { error: string }> {
  try {
    return await apiPublicGetPpmpFeedback(id);
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load feedback.' };
  }
}

/**
 * Shared error mapping for feedback submission — mirrors the AIP page's own
 * `feedbackSubmitError` in `app/(public)/aip/_actions.ts` (duplicated, not
 * imported, per this repo's "no shared workspace" convention for small
 * route-local helpers).
 */
function feedbackSubmitError(e: unknown): { error: string } {
  const err = e as Error & { statusCode?: number };
  if (err.statusCode === 429) {
    return { error: 'You have submitted too many feedback requests. Please try again in 10 minutes.' };
  }
  if (err.statusCode === 400) {
    return { error: err.message || 'Could not verify submission. Please try again.' };
  }
  return { error: 'Failed to submit feedback. Please try again later.' };
}

export async function submitPpmpFeedback(
  dto: Parameters<typeof apiPublicSubmitRegistryFeedback>[0],
): Promise<{ success: boolean } | { error: string }> {
  try {
    return await apiPublicSubmitRegistryFeedback(dto, await visitorIp());
  } catch (e) {
    return feedbackSubmitError(e);
  }
}

/** Feedback scoped to one specific published Project, distinct from the general inbox above. */
export async function submitProjectFeedback(
  id: string,
  dto: Parameters<typeof apiPublicSubmitPpmpFeedback>[1],
): Promise<{ success: boolean } | { error: string }> {
  try {
    return await apiPublicSubmitPpmpFeedback(id, dto, await visitorIp());
  } catch (e) {
    return feedbackSubmitError(e);
  }
}
