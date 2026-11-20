'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import {
  apiCreateAipCycle,
  apiUpdateAipCycleStatus,
  apiSetAipCyclePublicComparison,
  apiSetAipCyclePublicOverview,
  apiSetBudgetCycleStage,
  type PublicOverviewSection,
  apiSetAipCycleOpenData,
  apiSetSpecialFund,
  apiPreviewAipExtended,
  apiApplyAipExtended,
  type AipExtendedPreview,
  type AipExtendedApplyResult,
  apiCreateFinishLineCeiling,
  apiUpdateFinishLineCeiling,
  type AipCycleStatus,
} from '@/lib/api';

export type ActionResult = { success: string } | { error: string };

export async function createAipCycle(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  if (session.user.role !== 'SUPER_ADMIN') return { error: 'Only Super Admin can create AIP cycles.' };

  const fiscalYear = parseInt(formData.get('fiscalYear') as string, 10);
  if (isNaN(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    return { error: 'Please enter a valid fiscal year (2000–2100).' };
  }

  try {
    await apiCreateAipCycle(session.accessToken, { fiscalYear });
    revalidatePath('/control-panel/aip-cycles');
    revalidatePath('/dashboard');
    return { success: `AIP cycle FY ${fiscalYear} created.` };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to create AIP cycle.' };
  }
}

export async function setBudgetCycleStage(
  aipCycleId: string,
  budgetCycleId: string,
  currentStage: number,
  alongsideStages: number[],
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  if (session.user.role !== 'SUPER_ADMIN') return { error: 'Only Super Admin can set the budget stage.' };

  try {
    await apiSetBudgetCycleStage(session.accessToken, budgetCycleId, { currentStage, alongsideStages });
    revalidatePath(`/control-panel/aip-cycles/${aipCycleId}`);
    // The home page strip and /learn read the stage.
    revalidatePath('/');
    revalidatePath('/learn');
    return { success: 'Budget stage updated.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to set the budget stage.' };
  }
}

export async function transitionCycleStatus(
  cycleId: string,
  status: AipCycleStatus,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  if (session.user.role !== 'SUPER_ADMIN') return { error: 'Only Super Admin can change cycle status.' };

  try {
    await apiUpdateAipCycleStatus(session.accessToken, cycleId, status);
    revalidatePath('/control-panel/aip-cycles');
    revalidatePath(`/control-panel/aip-cycles/${cycleId}`);
    revalidatePath('/dashboard');
    return { success: `Cycle status updated to ${status}.` };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to update cycle status.' };
  }
}

export async function setCyclePublicComparison(
  cycleId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  if (session.user.role !== 'SUPER_ADMIN') {
    return { error: 'Only Super Admin can change the public comparison.' };
  }

  try {
    await apiSetAipCyclePublicComparison(session.accessToken, cycleId, enabled);
    revalidatePath(`/control-panel/aip-cycles/${cycleId}`);
    // The public Overview reads the flag to decide whether to render its
    // year-on-year section, so those pages have to be rebuilt too.
    revalidatePath('/aip', 'layout');
    revalidatePath('/annual', 'layout');
    return {
      success: enabled
        ? 'The public Overview now shows the comparison against last year.'
        : 'The public Overview no longer shows the comparison against last year.',
    };
  } catch (err) {
    return {
      error: (err as Error).message ?? 'Failed to update the public comparison.',
    };
  }
}

const OVERVIEW_LABEL: Record<PublicOverviewSection, string> = {
  AIP: 'AIP',
  ANNUAL: 'Annual Budget',
  PPMP: 'PPMP',
};

export async function setCyclePublicOverview(
  cycleId: string,
  section: PublicOverviewSection,
  enabled: boolean,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  if (session.user.role !== 'SUPER_ADMIN') {
    return { error: 'Only Super Admin can change what the public site shows.' };
  }

  try {
    await apiSetAipCyclePublicOverview(session.accessToken, cycleId, section, enabled);
    revalidatePath(`/control-panel/aip-cycles/${cycleId}`);
    // Every section's tabs and redirects read the switches.
    revalidatePath('/aip', 'layout');
    revalidatePath('/annual', 'layout');
    revalidatePath('/ppmp', 'layout');
    return {
      success: `The ${OVERVIEW_LABEL[section]} Overview is now ${enabled ? 'shown' : 'hidden'}.`,
    };
  } catch (err) {
    return {
      error: (err as Error).message ?? 'Failed to update the public Overview.',
    };
  }
}

export async function saveCeiling(
  cycleId: string,
  finishLineId: string,
  existingCeilingId: string | null,
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  if (session.user.role !== 'SUPER_ADMIN') return { error: 'Only Super Admin can set ceilings.' };

  const totalCeiling = formData.get('totalCeiling') as string;

  if (!totalCeiling || isNaN(parseFloat(totalCeiling))) {
    return { error: 'Invalid ceiling amount.' };
  }

  try {
    if (existingCeilingId) {
      await apiUpdateFinishLineCeiling(session.accessToken, existingCeilingId, {
        totalCeiling,
      });
    } else {
      await apiCreateFinishLineCeiling(session.accessToken, {
        aipCycleId: cycleId,
        finishLineId,
        totalCeiling,
      });
    }
    revalidatePath(`/control-panel/aip-cycles/${cycleId}`);
    revalidatePath('/dashboard');
    return { success: 'Budget ceiling saved.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to save ceiling.' };
  }
}

export async function setCycleOpenData(
  cycleId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  if (session.user.role !== 'SUPER_ADMIN') {
    return { error: 'Only Super Admin can change open data.' };
  }

  try {
    await apiSetAipCycleOpenData(session.accessToken, cycleId, enabled);
    revalidatePath(`/control-panel/aip-cycles/${cycleId}`);
    revalidatePath('/developers');
    return {
      success: enabled
        ? "This year's published budget is now open data."
        : "This year's open data is switched off.",
    };
  } catch (err) {
    return {
      error: (err as Error).message ?? 'Failed to update open data.',
    };
  }
}

/** A special fund's stated amount for one cycle (specs/008); blank clears it. */
export async function setSpecialFundAmount(
  cycleId: string,
  fund: string,
  statedAmount: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  if (session.user.role !== 'SUPER_ADMIN') {
    return { error: 'Only Super Admin can change special-fund amounts.' };
  }
  const value = statedAmount.replace(/,/g, '').trim();
  if (value && !/^\d+(\.\d{1,2})?$/.test(value)) {
    return { error: 'Enter an amount in pesos, e.g. 272000000.00' };
  }
  try {
    await apiSetSpecialFund(session.accessToken, cycleId, fund, {
      statedAmount: value || null,
    });
    revalidatePath(`/control-panel/aip-cycles/${cycleId}`);
    revalidatePath('/dashboard');
    return { success: value ? 'Stated amount saved.' : 'Stated amount cleared.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to save the amount.' };
  }
}

/** Read an office's AIP-Extended sheet; nothing is written (specs/008 US3). */
export async function previewAipExtended(
  cycleId: string,
  formData: FormData,
): Promise<{ preview: AipExtendedPreview } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  if (session.user.role !== 'SUPER_ADMIN') return { error: 'Only Super Admin can import AIP-Extended sheets.' };
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose the office workbook (.xlsx).' };
  try {
    return { preview: await apiPreviewAipExtended(session.accessToken, cycleId, file) };
  } catch (err) {
    return { error: (err as Error).message ?? 'Could not read the workbook.' };
  }
}

export async function applyAipExtended(
  cycleId: string,
  payload: Parameters<typeof apiApplyAipExtended>[2],
): Promise<{ result: AipExtendedApplyResult } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  if (session.user.role !== 'SUPER_ADMIN') return { error: 'Only Super Admin can import AIP-Extended sheets.' };
  try {
    const result = await apiApplyAipExtended(session.accessToken, cycleId, payload);
    revalidatePath('/aip-registry');
    return { result };
  } catch (err) {
    return { error: (err as Error).message ?? 'Could not fill the entries.' };
  }
}
