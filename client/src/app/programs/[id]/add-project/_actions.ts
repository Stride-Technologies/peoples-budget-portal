'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import {
  apiGetProgram,
  apiGetFinishLineCeilings,
  apiCreateProjectActivity,
  apiUpdateProjectActivity,
  apiCreateLineItem,
  apiDeleteLineItem,
  apiUpsertClimateTag,
  apiGetUacsObjects,
  apiGetClimateTypologyCodes,
  apiDeleteProjectActivity,
  apiPreviewPaAipCode,
  type UacsObjectRecord,
  type ClimateCodeRecord,
} from '@/lib/api';
import { toFundAllocations } from '@/lib/schemas';
import type { AddProjectActivityFormData, ProgramWithBudget } from '@/lib/schemas';
import { isEditableProgramStatus } from '@/lib/program-status';

export async function loadProgramForPA(
  programId: string,
): Promise<{ data: ProgramWithBudget } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const program = await apiGetProgram(session.accessToken, programId);

    // Phase 1 D17: `grandTotal` rolls up line items, and line-item entry is
    // deferred — it is structurally 0 for anything encoded through the current
    // form. The proposed family is what actually carries the money.
    const programTotal = Number(program.proposedTotal ?? program.grandTotal);

    // Zero means "no ceiling configured", which the sidebar treats as neutral.
    // Defaulting to the program's own total instead would make every program
    // without a ceiling read as exactly 100% used, so adding anything would
    // falsely warn "Over Budget".
    let budgetCeiling = 0;
    try {
      const ceilings = await apiGetFinishLineCeilings(
        session.accessToken,
        program.aipCycle.id,
      );
      const match = ceilings.find((c) => c.finishLineId === program.finishLineId);
      if (match) {
        // Single finish-line ceiling (the CSO partition was retired).
        budgetCeiling = Number(match.totalCeiling);
      }
    } catch {
      // Non-fatal: form loads even without ceiling data
    }

    const remaining = budgetCeiling > 0 ? budgetCeiling - programTotal : 0;

    const data: ProgramWithBudget = {
      id: program.id,
      aipReferenceCode: program.tentativeAipReferenceCode,
      departmentId:
        program.officeId ?? program.civilSocietyOrganizationId ?? '',
      sectorId: program.papSectorId,
      programName: program.name,
      primaryClusterId: program.finishLineId,
      primaryFinishLineName: program.finishLine.name,
      expectedOutput: program.expectedOutput,
      // `toLowerCase()` emitted values outside this union ('published_revision'),
      // so the cast was a lie. Collapse to the coarse editable/not distinction
      // the union actually models.
      status: isEditableProgramStatus(program.status) ? 'draft' : 'submitted',
      createdAt: new Date(program.createdAt),
      updatedAt: new Date(program.updatedAt),
      implementationStartMonth: program.implementationStartMonth ?? undefined,
      implementationStartYear: program.implementationStartYear ?? undefined,
      implementationEndMonth: program.implementationEndMonth ?? undefined,
      implementationEndYear: program.implementationEndYear ?? undefined,
      budgetCeiling,
      children: program.projectActivities.map((pa) => ({
        id: pa.id,
        ppaType: pa.type === 'PROJECT' ? 'project' : 'activity',
        name: pa.name,
        totalCost: Number(pa.proposedBudget ?? pa.grandTotal),
        status: 'draft' as const,
      })),
      totalProjectActivityCost: programTotal,
      remainingBudget: remaining,
      utilizationPercent: budgetCeiling > 0 ? (programTotal / budgetCeiling) * 100 : 0,
    };

    return { data };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load program.' };
  }
}

/**
 * The code the next project/activity under this scope would get.
 *
 * Server-derived, like every other AIP code the UI shows: the ordinal is a rank
 * among live siblings, which the client cannot see. The form used to build this
 * itself by pasting `-000` onto the program's code, so it read `…-000` however
 * many project/activities the program already had.
 */
export async function previewPaAipCode(
  programId: string,
  parentProjectActivityId?: string,
): Promise<{ code: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const preview = await apiPreviewPaAipCode(session.accessToken, {
      programId,
      parentProjectActivityId,
    });
    return { code: preview.code };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to generate AIP code.' };
  }
}

export async function loadPAFormReference(): Promise<
  { uacsObjects: UacsObjectRecord[]; climateCodes: ClimateCodeRecord[] } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const [uacsObjects, climateCodes] = await Promise.all([
      apiGetUacsObjects(session.accessToken),
      apiGetClimateTypologyCodes(session.accessToken),
    ]);
    return { uacsObjects, climateCodes };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load reference data.' };
  }
}

export async function submitProjectActivity(
  programId: string,
  data: AddProjectActivityFormData,
  parentProjectActivityId?: string,
): Promise<{ id: string; tentativeAipReferenceCode: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const pa = await apiCreateProjectActivity(session.accessToken, programId, {
      type: data.entryType === 'project' ? 'PROJECT' : 'ACTIVITY',
      name: data.projectActivityName,
      description: data.additionalDescription,
      remarks: data.remarks,
      expectedOutput: data.expectedOutput,
      // Empty for an ACTIVITY_CHILDREN parent: the server unions its funds from
      // the child activities, so there is nothing to send until they exist.
      fundSources: data.fundSources,
      // Phase 1 D3: the server computes proposedBudget from these three, and
      // rejects the body carrying both. ACTIVITY_CHILDREN parents send none —
      // their estimates are summed from children.
      psEstimate: data.psEstimate,
      mooeEstimate: data.mooeEstimate,
      feEstimate: data.feEstimate,
      coEstimate: data.coEstimate,
      ...(data.costMode !== 'ACTIVITY_CHILDREN' && data.splitByFund
        ? { fundAllocations: toFundAllocations(data.fundAllocations) }
        : {}),
      parentProjectActivityId,
      costMode: data.costMode,
      implementationStartMonth: data.implementationStartMonth,
      implementationStartYear: data.implementationStartYear,
      implementationEndMonth: data.implementationEndMonth,
      implementationEndYear: data.implementationEndYear,
    });

    for (let i = 0; i < data.lineItems.length; i++) {
      const li = data.lineItems[i];
      await apiCreateLineItem(session.accessToken, pa.id, {
        expenseClass: li.expenseClass,
        uacsObjectId: li.uacsObjectId,
        quantity: li.quantity.toFixed(2),
        unit: li.unit,
        unitCost: li.unitCost.toFixed(2),
        remarks: li.remarks,
        orderIndex: i,
      });
    }

    if (data.hasClimateTag && data.ccetCodeIds.length > 0) {
      await apiUpsertClimateTag(session.accessToken, pa.id, {
        ccetCodeIds: data.ccetCodeIds,
        ccaAmount: data.ccaAmount?.toFixed(2),
        ccmAmount: data.ccmAmount?.toFixed(2),
        remarks: data.ccRemarks,
      });
    }

    return { id: pa.id, tentativeAipReferenceCode: pa.tentativeAipReferenceCode };
  } catch (err) {
    return {
      error: (err as Error).message ?? 'Failed to create project/activity.',
    };
  }
}

export async function updateProjectActivity(
  projectActivityId: string,
  data: AddProjectActivityFormData,
  existingLineItemIds: string[],
): Promise<{ id: string; tentativeAipReferenceCode: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const pa = await apiUpdateProjectActivity(session.accessToken, projectActivityId, {
      name: data.projectActivityName,
      description: data.additionalDescription,
      remarks: data.remarks,
      expectedOutput: data.expectedOutput,
      // Estimates *and* fund sources are omitted entirely when the totals are
      // derived from child activities: the API rejects the request outright if
      // they are present at all, and sending an explicit `null`/`[]` counts as
      // present — which would blank the union the rollup just wrote.
      ...(data.costMode === 'ACTIVITY_CHILDREN'
        ? {}
        : {
            fundSources: data.fundSources,
            psEstimate: data.psEstimate ?? null,
            mooeEstimate: data.mooeEstimate ?? null,
            feEstimate: data.feEstimate ?? null,
            coEstimate: data.coEstimate ?? null,
            // [] when not split: returns a previously split row to one total.
            fundAllocations: data.splitByFund
              ? toFundAllocations(data.fundAllocations)
              : [],
          }),
      implementationStartMonth: data.implementationStartMonth ?? null,
      implementationStartYear: data.implementationStartYear ?? null,
      implementationEndMonth: data.implementationEndMonth ?? null,
      implementationEndYear: data.implementationEndYear ?? null,
    });

    // Delete existing line items sequentially so each rollup sees the correct
    // remaining set before the next delete fires.
    for (const id of existingLineItemIds) {
      await apiDeleteLineItem(session.accessToken, id);
    }

    // Create new line items sequentially — parallel creates race to update the
    // denormalized psTotal rollup, causing the last writer to overwrite with an
    // incomplete sum. Sequential creates guarantee each rollup sees all prior
    // committed items.
    for (let i = 0; i < data.lineItems.length; i++) {
      const li = data.lineItems[i];
      await apiCreateLineItem(session.accessToken, projectActivityId, {
        expenseClass: li.expenseClass,
        uacsObjectId: li.uacsObjectId,
        quantity: li.quantity.toFixed(2),
        unit: li.unit,
        unitCost: li.unitCost.toFixed(2),
        remarks: li.remarks,
        orderIndex: i,
      });
    }

    if (data.hasClimateTag && data.ccetCodeIds.length > 0) {
      await apiUpsertClimateTag(session.accessToken, projectActivityId, {
        ccetCodeIds: data.ccetCodeIds,
        ccaAmount: data.ccaAmount?.toFixed(2),
        ccmAmount: data.ccmAmount?.toFixed(2),
        remarks: data.ccRemarks,
      });
    }

    revalidatePath('/aip-registry');
    return { id: pa.id, tentativeAipReferenceCode: pa.tentativeAipReferenceCode };
  } catch (err) {
    return {
      error: (err as Error).message ?? 'Failed to update project/activity.',
    };
  }
}

export async function deleteProjectActivityAction(
  projectActivityId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Your session has expired. Please sign in again.' };
  }

  try {
    await apiDeleteProjectActivity(session.accessToken, projectActivityId);
    return { success: true };
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    // 403 is the ownership check (`assertOwner`), not a status problem — the
    // status guard throws 400 and its message is surfaced verbatim below. The old
    // copy here claimed DRAFT was required, which was never the API's rule:
    // deleting a PPA is allowed in any editable status, revisions included.
    if (error.statusCode === 403) {
      return {
        success: false,
        error: 'Cannot delete: this project/activity belongs to another office.',
      };
    }
    if (error.statusCode === 409) {
      return {
        success: false,
        error: 'Cannot delete: this project has child activities that depend on it.',
      };
    }
    return {
      success: false,
      error: error.message ?? 'Failed to delete project/activity. Please try again.',
    };
  }
}
