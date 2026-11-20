'use server';

import { getSession } from '@/lib/session';
import {
  apiGetProjectActivity,
  apiListThematicTags,
  apiApplyPAThematicTag,
  apiRemovePAThematicTag,
  type ThematicTagRecord,
  type ThematicTagRef,
} from '@/lib/api';
import type { AddProjectActivityFormValues } from '@/lib/schemas';

export async function loadProjectActivityContext(
  projectActivityId: string,
): Promise<
  | {
      programId: string;
      projectName: string;
      entryType: 'project' | 'activity';
      aipReferenceCode: string;
      description?: string;
      remarks?: string;
      expectedOutput?: string;
      proposedBudget?: string;
      fundSources: AddProjectActivityFormValues['fundSources'];
      fundAllocations: AddProjectActivityFormValues['fundAllocations'];
      psEstimate: string;
      mooeEstimate: string;
      feEstimate: string;
      coEstimate: string;
      implementationStartMonth: number | null;
      implementationStartYear: number | null;
      implementationEndMonth: number | null;
      implementationEndYear: number | null;
      costMode: 'DIRECT_COSTS' | 'INDIRECT_COSTS';
      lineItems: AddProjectActivityFormValues['lineItems'];
      hasClimateTag: boolean;
      ccetCodeIds: string[];
      ccaAmount?: string;
      ccmAmount?: string;
      ccRemarks?: string;
    }
  | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const projectActivity = await apiGetProjectActivity(session.accessToken, projectActivityId);
    
    // Transform backend response to form values
    const hasClimateTag = projectActivity.climateChangeTag != null;
    
    return {
      programId: projectActivity.programId,
      projectName: projectActivity.name,
      entryType: projectActivity.type === 'PROJECT' ? 'project' : 'activity',
      aipReferenceCode: projectActivity.aipReferenceCode ?? projectActivity.tentativeAipReferenceCode,
      description: projectActivity.description,
      remarks: projectActivity.remarks ?? undefined,
      expectedOutput: projectActivity.expectedOutput ?? undefined,
      proposedBudget: projectActivity.proposedBudget ?? undefined,
      // Required by the form (min 1) but not rendered with an aria-invalid
      // target, so omitting it made Save do nothing at all: validation failed on
      // a field the user could see was blank but got no error for.
      fundSources: projectActivity.fundSources ?? [],
      fundAllocations: projectActivity.fundAllocations ?? [],
      // The three cost fields the form actually binds to (D3) — proposedBudget
      // is server-computed from them and is not an input. Omitting them here is
      // what left the cost inputs blank when reopening a PPA for editing.
      // Empty string, not undefined: these feed controlled inputs.
      psEstimate: projectActivity.psEstimate ?? '',
      mooeEstimate: projectActivity.mooeEstimate ?? '',
      feEstimate: projectActivity.feEstimate ?? '',
      coEstimate: projectActivity.coEstimate ?? '',
      implementationStartMonth: projectActivity.implementationStartMonth,
      implementationStartYear: projectActivity.implementationStartYear,
      implementationEndMonth: projectActivity.implementationEndMonth,
      implementationEndYear: projectActivity.implementationEndYear,
      costMode: projectActivity.costMode,
      lineItems: (projectActivity.lineItems || []).map((item) => ({
        id: item.id,
        expenseClass: item.expenseClass,
        uacsObjectId: item.uacsObjectId,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitCost: Number(item.unitCost),
        remarks: item.remarks,
        lineTotal: Number(item.lineTotal),
      })),
      hasClimateTag,
      ccetCodeIds: (projectActivity.climateChangeTag?.codes ?? []).map((c) => c.ccetCodeId),
      ccaAmount: projectActivity.climateChangeTag?.ccaAmount ?? undefined,
      ccmAmount: projectActivity.climateChangeTag?.ccmAmount ?? undefined,
      ccRemarks: projectActivity.climateChangeTag?.remarks ?? undefined,
    };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load project activity.' };
  }
}

// ─── Thematic tags ───────────────────────────────────────────────────────────

export async function loadPAThematicTagsAction(projectActivityId: string): Promise<
  | {
      catalog: ThematicTagRecord[];
      tags: ThematicTagRef[];
      inheritedTags: ThematicTagRef[];
    }
  | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const [pa, catalog] = await Promise.all([
      apiGetProjectActivity(session.accessToken, projectActivityId),
      apiListThematicTags(session.accessToken),
    ]);
    return {
      catalog,
      tags: pa.thematicTags ?? [],
      inheritedTags: pa.inheritedThematicTags ?? [],
    };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load thematic tags.' };
  }
}

export async function applyPAThematicTagAction(
  projectActivityId: string,
  tagId: string,
): Promise<{ tags: ThematicTagRef[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const tags = await apiApplyPAThematicTag(session.accessToken, projectActivityId, tagId);
    return { tags };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to apply the tag.' };
  }
}

export async function removePAThematicTagAction(
  projectActivityId: string,
  tagId: string,
): Promise<{ tags: ThematicTagRef[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const tags = await apiRemovePAThematicTag(session.accessToken, projectActivityId, tagId);
    return { tags };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to remove the tag.' };
  }
}