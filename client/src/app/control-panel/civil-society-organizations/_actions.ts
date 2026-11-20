'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { apiCreateCso, apiUpdateCso, apiDeactivateCso } from '@/lib/api';

export type ActionState = { success: string } | { error: string } | undefined;

const PATH = '/control-panel/civil-society-organizations';

export async function createCso(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiCreateCso(session.accessToken, {
      name: formData.get('name') as string,
      code: (formData.get('code') as string) || undefined,
      clusterId: formData.get('clusterId') as string,
      canEndorse: formData.get('canEndorse') === 'on',
    });
    revalidatePath(PATH);
    return { success: 'Organization added.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to add.' };
  }
}

export async function updateCso(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateCso(session.accessToken, id, {
      name: formData.get('name') as string,
      code: (formData.get('code') as string) || undefined,
      clusterId: formData.get('clusterId') as string,
      canEndorse: formData.get('canEndorse') === 'on',
    });
    revalidatePath(PATH);
    return { success: 'Organization updated.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to update.' };
  }
}

export async function deactivateCso(id: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiDeactivateCso(session.accessToken, id);
    revalidatePath(PATH);
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to deactivate.' };
  }
}

export async function restoreCso(id: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateCso(session.accessToken, id, { isActive: true });
    revalidatePath(PATH);
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to restore.' };
  }
}
