'use server';

import { getSession } from '@/lib/session';
import {
  apiGetPpmp,
  apiGetUacsObjectsAll,
  apiUpdatePpmp,
  apiDeletePpmp,
  apiApprovePpmp,
  apiPublishPpmp,
  apiUnpublishPpmp,
  apiAddPpmpLineItem,
  apiUpdatePpmpLineItem,
  apiDeletePpmpLineItem,
  apiReorderPpmpLineItems,
  apiUploadPpmpLineItemDocument,
  apiListPpmpComments,
  apiAddPpmpComment,
  apiListPpmpFeedback,
  apiReplyToPpmpFeedback,
  apiGetPpmpHistory,
  apiSetPpmpLineLink,
  apiGetPpmpLinkOptions,
  apiCreateFinalPpmp,
  apiGetPpmpBudgetWarnings,
  type PpmpBudgetWarning,
  type PpmpLineItemRecord,
  type PpmpLinkOption,
  type PpmpRecord,
  type UacsObjectRecord,
  type CreatePpmpLineItemPayload,
  type UpdatePpmpLineItemPayload,
  type PpmpCommentRecord,
  type PpmpFeedbackRecord,
  type PpmpHistoryEntry,
  type PpmpClassification,
} from '@/lib/api';

export async function loadPpmpDetail(
  id: string,
): Promise<
  | { data: { ppmp: PpmpRecord; uacsObjects: UacsObjectRecord[] } }
  | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const [ppmp, uacsObjects] = await Promise.all([
      apiGetPpmp(session.accessToken, id),
      apiGetUacsObjectsAll(session.accessToken),
    ]);
    return { data: { ppmp, uacsObjects } };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load Project.' };
  }
}

export async function uploadPpmpLineItemDocument(
  ppmpId: string,
  lineItemId: string,
  file: File,
): Promise<{ supportingDocumentUrl: string; supportingDocumentName: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    return await apiUploadPpmpLineItemDocument(session.accessToken, ppmpId, lineItemId, file);
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to upload the document.' };
  }
}

export async function renamePpmp(
  id: string,
  name: string,
): Promise<{ ppmp: PpmpRecord } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const ppmp = await apiUpdatePpmp(session.accessToken, id, { name });
    return { ppmp };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to rename Project.' };
  }
}

/** Full project-identity edit — Office, Classification, Project Name, Funding AIP Program. */
export async function updatePpmpProject(
  id: string,
  data: {
    officeId: string;
    classification: PpmpClassification;
    name: string;
    fundingProgram: string;
  },
): Promise<{ ppmp: PpmpRecord } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const ppmp = await apiUpdatePpmp(session.accessToken, id, data);
    return { ppmp };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to update Project.' };
  }
}

export async function deletePpmp(id: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    await apiDeletePpmp(session.accessToken, id);
    return { ok: true };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to delete Project.' };
  }
}

/** Soft warnings: linked budget rows the year's lines add up to more than. Empty on any error. */
export async function loadPpmpBudgetWarnings(id: string): Promise<PpmpBudgetWarning[]> {
  const session = await getSession();
  if (!session) return [];
  return apiGetPpmpBudgetWarnings(session.accessToken, id).catch(() => []);
}

/** The rows a line may link to (specs/012 P5). */
export async function loadPpmpLinkOptions(
  id: string,
): Promise<{ options: PpmpLinkOption[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    return { options: await apiGetPpmpLinkOptions(session.accessToken, id) };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load budget rows.' };
  }
}

/** Link a line to one budget row, or clear it with `null`. */
export async function setPpmpLineLink(
  id: string,
  lineItemId: string,
  link: PpmpLinkOption | null,
): Promise<{ lineItem: PpmpLineItemRecord } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const lineItem = await apiSetPpmpLineLink(
      session.accessToken,
      id,
      lineItemId,
      link ? { [link.field]: link.id } : {},
    );
    return { lineItem };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to link the line.' };
  }
}

export async function createFinalPpmp(
  id: string,
): Promise<{ ppmpId: string; unmatched: number } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const { ppmp, unmatched } = await apiCreateFinalPpmp(session.accessToken, id);
    return { ppmpId: ppmp.id, unmatched: unmatched.length };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to create the Final PPMP.' };
  }
}

export async function approvePpmp(
  id: string,
): Promise<{ ppmp: PpmpRecord } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const ppmp = await apiApprovePpmp(session.accessToken, id);
    return { ppmp };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to approve Project.' };
  }
}

export async function publishPpmp(
  id: string,
): Promise<{ ppmp: PpmpRecord } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const ppmp = await apiPublishPpmp(session.accessToken, id);
    return { ppmp };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to publish Project.' };
  }
}

export async function unpublishPpmp(
  id: string,
): Promise<{ ppmp: PpmpRecord } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const ppmp = await apiUnpublishPpmp(session.accessToken, id);
    return { ppmp };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to unpublish Project.' };
  }
}

export async function addPpmpLineItem(
  ppmpId: string,
  payload: CreatePpmpLineItemPayload,
): Promise<{ ppmp: PpmpRecord } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const ppmp = await apiAddPpmpLineItem(session.accessToken, ppmpId, payload);
    return { ppmp };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to add line item.' };
  }
}

export async function updatePpmpLineItem(
  ppmpId: string,
  lineItemId: string,
  payload: UpdatePpmpLineItemPayload,
): Promise<{ ppmp: PpmpRecord } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const ppmp = await apiUpdatePpmpLineItem(session.accessToken, ppmpId, lineItemId, payload);
    return { ppmp };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to update line item.' };
  }
}

export async function deletePpmpLineItem(
  ppmpId: string,
  lineItemId: string,
): Promise<{ grandTotal: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const result = await apiDeletePpmpLineItem(session.accessToken, ppmpId, lineItemId);
    return result;
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to delete line item.' };
  }
}

/** `lineItemIds` must be every line item on this Project, in the new order. */
export async function reorderPpmpLineItems(
  ppmpId: string,
  lineItemIds: string[],
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    await apiReorderPpmpLineItems(session.accessToken, ppmpId, lineItemIds);
    return { ok: true };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to reorder line items.' };
  }
}

export async function loadPpmpComments(
  ppmpId: string,
): Promise<{ data: PpmpCommentRecord[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const data = await apiListPpmpComments(session.accessToken, ppmpId);
    return { data };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load comments.' };
  }
}

export async function addPpmpComment(
  ppmpId: string,
  content: string,
  parentCommentId?: string,
): Promise<{ comment: PpmpCommentRecord } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const comment = await apiAddPpmpComment(session.accessToken, ppmpId, { content, parentCommentId });
    return { comment };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to post comment.' };
  }
}

export async function loadPpmpFeedback(
  ppmpId: string,
): Promise<{ data: PpmpFeedbackRecord[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const data = await apiListPpmpFeedback(session.accessToken, ppmpId);
    return { data };
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 403) {
      return { error: 'Viewing public feedback needs the public comments permission.' };
    }
    return { error: (err as Error).message ?? 'Failed to load feedback.' };
  }
}

export async function replyToPpmpFeedback(
  ppmpId: string,
  feedbackId: string,
  reply: string,
): Promise<{ feedback: PpmpFeedbackRecord } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const feedback = await apiReplyToPpmpFeedback(session.accessToken, ppmpId, feedbackId, reply);
    return { feedback };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to post the reply.' };
  }
}

export async function loadPpmpHistory(
  ppmpId: string,
): Promise<{ data: PpmpHistoryEntry[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    const data = await apiGetPpmpHistory(session.accessToken, ppmpId);
    return { data };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load history.' };
  }
}
