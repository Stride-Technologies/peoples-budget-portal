'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import {
  apiCreateUacsObject,
  apiUpdateUacsObject,
  apiDeactivateUacsObject,
} from '@/lib/api';

export type ActionState = { success: string } | { error: string } | undefined;

const PATH = '/control-panel/uacs-objects';

export async function createUacsObject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiCreateUacsObject(session.accessToken, {
      code: formData.get('code') as string,
      description: formData.get('description') as string,
      expenseClass: formData.get('expenseClass') as 'PS' | 'MOOE' | 'FE' | 'CO',
    });
    revalidatePath(PATH);
    return { success: 'UACS object added.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to add.' };
  }
}

export async function updateUacsObject(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateUacsObject(session.accessToken, id, {
      description: formData.get('description') as string,
      expenseClass: formData.get('expenseClass') as 'PS' | 'MOOE' | 'FE' | 'CO',
    });
    revalidatePath(PATH);
    return { success: 'UACS object updated.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to update.' };
  }
}

export async function deactivateUacsObject(
  id: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiDeactivateUacsObject(session.accessToken, id);
    revalidatePath(PATH);
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to deactivate.' };
  }
}

export async function restoreUacsObject(
  id: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateUacsObject(session.accessToken, id, { isActive: true });
    revalidatePath(PATH);
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to restore.' };
  }
}
