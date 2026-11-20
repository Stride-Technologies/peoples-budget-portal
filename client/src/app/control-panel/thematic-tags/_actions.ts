'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import {
  apiCreateThematicTag,
  apiUpdateThematicTag,
  closeMatchFrom,
  type ThematicTagRef,
} from '@/lib/api';

export type ActionState = { success: string } | { error: string } | undefined;

const PATH = '/control-panel/thematic-tags';

/**
 * Create-by-name for the autocomplete's "Create …" row. The combobox already
 * shows every existing name (active and inactive) as the admin types, so the
 * close-match prompt the inline picker needs (FR-007a) is redundant here —
 * `confirmNew` goes straight through; a genuine exact-name collision still
 * 409s and is surfaced as a plain error.
 */
export async function createThematicTagByName(
  name: string,
): Promise<{ tag?: ThematicTagRef; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Name is required.' };
  try {
    const tag = await apiCreateThematicTag(session.accessToken, {
      name: trimmed,
      confirmNew: true,
    });
    revalidatePath(PATH);
    return { tag };
  } catch (err) {
    const closeMatch = closeMatchFrom(err);
    if (closeMatch) return { error: `Already exists as "${closeMatch.name}".` };
    return { error: (err as Error).message ?? 'Failed to add.' };
  }
}

export async function renameThematicTag(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Name is required.' };
  try {
    await apiUpdateThematicTag(session.accessToken, id, { name });
    revalidatePath(PATH);
    return { success: 'Thematic tag renamed.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to rename.' };
  }
}

export async function setThematicTagActive(
  id: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateThematicTag(session.accessToken, id, { isActive });
    revalidatePath(PATH);
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to update.' };
  }
}
