'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import {
  apiCreateSglgIndicator,
  apiUpdateSglgIndicator,
  apiDeactivateSglgIndicator,
} from '@/lib/api';

export type ActionState = { success: string } | { error: string } | undefined;

const PATH = '/control-panel/sglg-indicators';

export async function createSglgIndicator(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiCreateSglgIndicator(session.accessToken, {
      pillar: formData.get('pillar') as string,
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      dilgYear: parseInt(formData.get('dilgYear') as string, 10),
    });
    revalidatePath(PATH);
    return { success: 'SGLG indicator added.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to add.' };
  }
}

export async function updateSglgIndicator(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateSglgIndicator(session.accessToken, id, {
      pillar: formData.get('pillar') as string,
      name: formData.get('name') as string,
      dilgYear: parseInt(formData.get('dilgYear') as string, 10),
    });
    revalidatePath(PATH);
    return { success: 'SGLG indicator updated.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to update.' };
  }
}

export async function deactivateSglgIndicator(
  id: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiDeactivateSglgIndicator(session.accessToken, id);
    revalidatePath(PATH);
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to deactivate.' };
  }
}

export async function restoreSglgIndicator(
  id: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateSglgIndicator(session.accessToken, id, { isActive: true });
    revalidatePath(PATH);
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to restore.' };
  }
}
