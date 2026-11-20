'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import {
  apiCreateSdgGoal,
  apiUpdateSdgGoal,
  apiDeactivateSdgGoal,
} from '@/lib/api';

export type ActionState = { success: string } | { error: string } | undefined;

const PATH = '/control-panel/sdg-goals';

export async function createSdgGoal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiCreateSdgGoal(session.accessToken, {
      code: formData.get('code') as string,
      name: formData.get('name') as string,
    });
    revalidatePath(PATH);
    return { success: 'SDG goal added.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to add.' };
  }
}

export async function updateSdgGoal(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateSdgGoal(session.accessToken, id, {
      name: formData.get('name') as string,
    });
    revalidatePath(PATH);
    return { success: 'SDG goal updated.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to update.' };
  }
}

export async function deactivateSdgGoal(
  id: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiDeactivateSdgGoal(session.accessToken, id);
    revalidatePath(PATH);
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to deactivate.' };
  }
}

export async function restoreSdgGoal(id: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateSdgGoal(session.accessToken, id, { isActive: true });
    revalidatePath(PATH);
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to restore.' };
  }
}
