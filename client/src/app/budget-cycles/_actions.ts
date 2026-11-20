'use server';

import { revalidatePath } from 'next/cache';
import { getSession, hasPermission } from '@/lib/session';
import {
  apiAcknowledgeBudgetItem,
  apiCarryForwardLep,
  apiFinalizeBudgetDocument,
  apiSetLepAllocable,
} from '@/lib/api';

type ActionResult = { success: string } | { error: string };

/** The caller's token, or the reason they may not review. */
async function reviewerToken(): Promise<string | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  if (!hasPermission(session.user, 'budget:write')) {
    return { error: 'You do not have permission to review budget documents.' };
  }
  return session.accessToken;
}

/** Mark one imported PPA reviewed (DRAFT documents only; the API re-checks). */
export async function acknowledgeBudgetItem(
  documentId: string,
  itemId: string,
  path: string,
): Promise<ActionResult> {
  const token = await reviewerToken();
  if (typeof token !== 'string') return token;
  try {
    await apiAcknowledgeBudgetItem(token, documentId, itemId);
    revalidatePath(path);
    return { success: 'Marked reviewed.' };
  } catch (err) {
    return { error: (err as Error).message || 'Could not mark it reviewed.' };
  }
}

/** Submit an LEP or enact an Ordinance. Frozen afterwards; there is no undo. */
export async function finalizeBudgetDocument(
  documentId: string,
  path: string,
): Promise<ActionResult> {
  const token = await reviewerToken();
  if (typeof token !== 'string') return token;
  try {
    await apiFinalizeBudgetDocument(token, documentId);
    revalidatePath(path);
    revalidatePath('/budget-cycles');
    return { success: 'Finalized.' };
  } catch (err) {
    return { error: (err as Error).message || 'Could not finalize the document.' };
  }
}

/** Start the year's DRAFT LEP from its adopted AIP (specs/012 D10). */
export async function carryForwardLep(
  aipCycleId: string,
  allocableTotal: string,
): Promise<{ documentId: string; fiscalYear: number; listed: number } | { error: string }> {
  const token = await reviewerToken();
  if (typeof token !== 'string') return token;
  try {
    const { document, listed } = await apiCarryForwardLep(token, aipCycleId, allocableTotal);
    revalidatePath('/budget-cycles');
    return {
      documentId: document.id,
      fiscalYear: document.budgetCycle.fiscalYear,
      listed: listed.length,
    };
  } catch (err) {
    return { error: (err as Error).message || 'Could not start the LEP.' };
  }
}

/** Revise a draft LEP's total allocable budget. */
export async function setLepAllocable(
  documentId: string,
  allocableTotal: string,
  path: string,
): Promise<ActionResult> {
  const token = await reviewerToken();
  if (typeof token !== 'string') return token;
  try {
    await apiSetLepAllocable(token, documentId, allocableTotal);
    revalidatePath(path);
    return { success: 'Saved.' };
  } catch (err) {
    return { error: (err as Error).message || 'Could not save the allocable total.' };
  }
}
