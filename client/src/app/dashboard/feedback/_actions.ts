'use server';

import { getSession } from '@/lib/session';
import { apiReviewLguFeedback, apiUnreviewLguFeedback, apiSetLguFeedbackReply, apiDeleteLguFeedbackReply, apiReviewRegistryFeedback, apiUnreviewRegistryFeedback, apiDeleteComment, apiDeleteRegistryFeedback, apiRestoreComment, apiRestoreRegistryFeedback } from '@/lib/api';

export async function reviewFeedback(id: string, note?: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthenticated');
  return apiReviewLguFeedback(session.accessToken, id, note);
}

export async function unreviewFeedback(id: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthenticated');
  return apiUnreviewLguFeedback(session.accessToken, id);
}

export async function setFeedbackReply(id: string, content: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthenticated');
  return apiSetLguFeedbackReply(session.accessToken, id, content);
}

export async function deleteFeedbackReply(id: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthenticated');
  return apiDeleteLguFeedbackReply(session.accessToken, id);
}

export async function reviewGeneralFeedback(id: string, internalNote?: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthenticated');
  return apiReviewRegistryFeedback(session.accessToken, id, { internalNote });
}

export async function unreviewGeneralFeedback(id: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthenticated');
  return apiUnreviewRegistryFeedback(session.accessToken, id);
}

/**
 * Soft-delete a public program/PA feedback comment (restorable).
 * SUPER_ADMIN only — enforced by the backend (DELETE /comments/:id).
 */
export async function deleteProgramFeedback(id: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthenticated');
  return apiDeleteComment(session.accessToken, id);
}

/**
 * Restore a soft-deleted program/PA feedback comment (and its reply subtree).
 * SUPER_ADMIN only — enforced by the backend (PATCH /comments/:id/restore).
 */
export async function restoreProgramFeedback(id: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthenticated');
  return apiRestoreComment(session.accessToken, id);
}

/**
 * Soft-delete a public general/registry feedback submission (restorable).
 * SUPER_ADMIN only — enforced by the backend (DELETE /admin/registry-feedback/:id).
 */
export async function deleteGeneralFeedback(id: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthenticated');
  return apiDeleteRegistryFeedback(session.accessToken, id);
}

/**
 * Restore a soft-deleted general/registry feedback submission.
 * SUPER_ADMIN only — enforced by the backend (PATCH /admin/registry-feedback/:id/restore).
 */
export async function restoreGeneralFeedback(id: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthenticated');
  return apiRestoreRegistryFeedback(session.accessToken, id);
}
