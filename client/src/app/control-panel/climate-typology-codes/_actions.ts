'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import {
  apiCreateClimateTypologyCode,
  apiUpdateClimateTypologyCode,
  apiDeactivateClimateTypologyCode,
} from '@/lib/api';

export type ActionState = { success: string } | { error: string } | undefined;

const PATH = '/control-panel/climate-typology-codes';

export async function createClimateTypologyCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiCreateClimateTypologyCode(session.accessToken, {
      code: formData.get('code') as string,
      pillar: formData.get('pillar') as 'ADAPTATION' | 'MITIGATION' | 'CROSSCUTTING',
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || undefined,
    });
    revalidatePath(PATH);
    return { success: 'Climate typology code added.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to add.' };
  }
}

export async function updateClimateTypologyCode(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateClimateTypologyCode(session.accessToken, id, {
      pillar: formData.get('pillar') as 'ADAPTATION' | 'MITIGATION' | 'CROSSCUTTING',
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || undefined,
    });
    revalidatePath(PATH);
    return { success: 'Climate typology code updated.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to update.' };
  }
}

export async function deactivateClimateTypologyCode(
  id: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiDeactivateClimateTypologyCode(session.accessToken, id);
    revalidatePath(PATH);
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to deactivate.' };
  }
}

export async function restoreClimateTypologyCode(
  id: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateClimateTypologyCode(session.accessToken, id, { isActive: true });
    revalidatePath(PATH);
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to restore.' };
  }
}
