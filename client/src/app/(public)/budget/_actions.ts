'use server';

import { toListItems, type PublicListItem } from '@/lib/public-registry-list';
import {
  apiPublicGetCycles,
  apiPublicGetClusters,
  apiPublicGetFinishLines,
  apiPublicGetPAPSectors,
  apiGetPublicThematicTags,
  apiPublicGetRegistry,
  apiPublicGetProgram,
  apiPublicGetVersions,
  apiPublicGetVersion,
  apiPublicGetFeedback,
  apiPublicSubmitFeedback,
  apiPublicGetProjectActivity,
  apiPublicGetPAFeedback,
  apiPublicSubmitPAFeedback,
  apiPublicSubmitRegistryFeedback,
} from '@/lib/api';
import type { RegistryFeedbackCategory } from '@/lib/api';
import { visitorIp } from '@/lib/visitor-ip';
import type {
  PublicCycleRecord,
  PublicClusterRecord,
  PublicFinishLineRecord,
  PublicPAPSectorRecord,
  PublicProgramItem,
  PublicProgramDetail,
  PublicVersionListItem,
  PublicVersionDetail,
  PublicFeedbackItem,
  PublicProjectActivityDetail,
  ThematicTagRef,
} from '@/lib/api';
import { goals } from '@/lib/goal-label';


export async function loadPublicCycles(): Promise<PublicCycleRecord[] | { error: string }> {
  try {
    return await apiPublicGetCycles();
  } catch {
    return { error: 'Failed to load AIP cycles' };
  }
}

export async function loadPublicClusters(): Promise<PublicClusterRecord[] | { error: string }> {
  try {
    return await apiPublicGetClusters();
  } catch {
    return { error: 'Failed to load clusters' };
  }
}

export async function loadPublicFinishLines(cycleId?: string, section?: 'aip' | 'annual'): Promise<PublicFinishLineRecord[] | { error: string }> {
  try {
    return await apiPublicGetFinishLines(cycleId, section);
  } catch {
    return { error: `Failed to load ${goals}` };
  }
}

export async function loadPublicPAPSectors(cycleId?: string): Promise<PublicPAPSectorRecord[] | { error: string }> {
  try {
    return await apiPublicGetPAPSectors(cycleId);
  } catch {
    return { error: 'Failed to load PAP sectors' };
  }
}

/** Active tags only — populates the public registry's tag filter. */
export async function loadPublicThematicTags(): Promise<ThematicTagRef[] | { error: string }> {
  try {
    return await apiGetPublicThematicTags();
  } catch {
    return { error: 'Failed to load thematic tags' };
  }
}

export async function loadPublicRegistry(params: {
  cycleId: string;
  clusterId?: string;
  officeId?: string;
  finishLineIds?: string[];
  papSectorId?: string;
  thematicTagIds?: string[];
  papClasses?: string[];
  fundSources?: string[];
  search?: string;
  section?: 'aip' | 'annual';
  page?: number;
  limit?: number;
}): Promise<
  | { total: number; page: number; limit: number; totalBudget: string; totalProposedBudget: string; submittedOfficeCount: number; totalOfficeCount: number; items: PublicProgramItem[] }
  | { error: string }
> {
  try {
    return await apiPublicGetRegistry(params);
  } catch {
    return { error: 'Failed to load registry' };
  }
}

/**
 * The registry cut down to what the browse table renders (`toListItems`) — the
 * table's own fetch. `loadPublicRegistry` stays whole for callers that read
 * more than the table does.
 */
export async function loadPublicRegistryList(
  params: Parameters<typeof loadPublicRegistry>[0],
  withActivities = true,
): Promise<
  | { total: number; totalBudget: string; totalProposedBudget: string; submittedOfficeCount: number; items: PublicListItem[] }
  | { error: string }
> {
  try {
    const r = await apiPublicGetRegistry(params);
    return {
      total: r.total,
      totalBudget: r.totalBudget,
      totalProposedBudget: r.totalProposedBudget,
      submittedOfficeCount: r.submittedOfficeCount,
      items: toListItems(r.items, withActivities),
    };
  } catch {
    return { error: 'Failed to load registry' };
  }
}

export async function loadPublicProgram(
  programId: string,
): Promise<PublicProgramDetail | { error: string }> {
  try {
    return await apiPublicGetProgram(programId);
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode === 404 || err.statusCode === 403) {
      return { error: 'This program is no longer publicly available.' };
    }
    return { error: 'Failed to load program details' };
  }
}

export async function loadPublicVersions(
  programId: string,
): Promise<PublicVersionListItem[] | { error: string }> {
  try {
    return await apiPublicGetVersions(programId);
  } catch {
    return { error: 'Failed to load version history' };
  }
}

export async function loadPublicVersion(
  programId: string,
  versionId: string,
): Promise<PublicVersionDetail | { error: string }> {
  try {
    return await apiPublicGetVersion(programId, versionId);
  } catch {
    return { error: 'Failed to load version snapshot' };
  }
}

export async function loadPublicFeedback(
  programId: string,
): Promise<PublicFeedbackItem[] | { error: string }> {
  try {
    return await apiPublicGetFeedback(programId);
  } catch {
    return { error: 'Failed to load feedback' };
  }
}

export async function loadPublicProjectActivity(
  programId: string,
  paId: string,
): Promise<PublicProjectActivityDetail | { error: string }> {
  try {
    return await apiPublicGetProjectActivity(programId, paId);
  } catch {
    return { error: 'Failed to load project/activity details' };
  }
}

/**
 * Shared error mapping for the three feedback submit paths.
 *
 * Every 400 used to become "Could not verify submission. Please try again." —
 * so a message over the length limit, a malformed email, or a bad category all
 * looked like a reCAPTCHA failure, and the citizen retried the same invalid
 * input forever. The API sends a usable message on both paths (the reCAPTCHA
 * guard's own wording, or the joined class-validator messages), so surface it
 * and keep the generic string only as a fallback.
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

export async function submitPublicFeedback(
  programId: string,
  dto: Parameters<typeof apiPublicSubmitFeedback>[1],
): Promise<{ success: boolean } | { error: string }> {
  try {
    return await apiPublicSubmitFeedback(programId, dto, await visitorIp());
  } catch (e) {
    return feedbackSubmitError(e);
  }
}

export async function loadPAPublicFeedback(
  programId: string,
  paId: string,
): Promise<PublicFeedbackItem[] | { error: string }> {
  try {
    return await apiPublicGetPAFeedback(programId, paId);
  } catch {
    return { error: 'Failed to load feedback' };
  }
}

export async function submitPAPublicFeedback(
  programId: string,
  paId: string,
  dto: Parameters<typeof apiPublicSubmitPAFeedback>[2],
): Promise<{ success: boolean } | { error: string }> {
  try {
    return await apiPublicSubmitPAFeedback(programId, paId, dto, await visitorIp());
  } catch (e) {
    return feedbackSubmitError(e);
  }
}

export async function submitRegistryFeedback(
  dto: Parameters<typeof apiPublicSubmitRegistryFeedback>[0],
): Promise<{ success: boolean } | { error: string }> {
  try {
    return await apiPublicSubmitRegistryFeedback(dto, await visitorIp());
  } catch (e) {
    return feedbackSubmitError(e);
  }
}
