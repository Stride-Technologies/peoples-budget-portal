'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import {
  apiUpdateFinishLine,
  apiCreateSubFinishLine,
  apiUpdateSubFinishLine,
  apiDeactivateSubFinishLine,
} from '@/lib/api';
import { GOAL, goal } from '@/lib/goal-label';


export type ActionState = { success: string } | { error: string } | undefined;

export async function updateFinishLine(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  const visionRaw = formData.get('visionNumber') as string;
  const visionNumber = visionRaw ? parseInt(visionRaw, 10) : undefined;
  const shortName = (formData.get('shortName') as string)?.trim();
  const color = (formData.get('color') as string)?.trim();

  try {
    await apiUpdateFinishLine(session.accessToken, id, {
      name: formData.get('name') as string,
      fullName: formData.get('fullName') as string,
      ...(visionNumber !== undefined && !isNaN(visionNumber) && { visionNumber }),
      ...(shortName && { shortName }),
      ...(color && { color }),
    });
    revalidatePath('/control-panel/finish-lines');
    return { success: `${GOAL} updated.` };
  } catch (err) {
    return { error: (err as Error).message ?? 'Update failed.' };
  }
}

export async function createSubFinishLine(
  finishLineId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  const code = (formData.get('code') as string)?.trim();
  const name = (formData.get('name') as string)?.trim();
  if (!code || !name) return { error: 'Code and name are required.' };

  try {
    await apiCreateSubFinishLine(session.accessToken, { code, name, finishLineId });
    revalidatePath('/control-panel/finish-lines');
    return { success: `Sub-${goal} created.` };
  } catch (err) {
    return { error: (err as Error).message ?? 'Create failed.' };
  }
}

export async function updateSubFinishLine(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  const code = (formData.get('code') as string)?.trim();
  const name = (formData.get('name') as string)?.trim();
  if (!code || !name) return { error: 'Code and name are required.' };

  try {
    await apiUpdateSubFinishLine(session.accessToken, id, { code, name });
    revalidatePath('/control-panel/finish-lines');
    return { success: `Sub-${goal} updated.` };
  } catch (err) {
    return { error: (err as Error).message ?? 'Update failed.' };
  }
}

export async function deactivateSubFinishLine(id: string): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    await apiDeactivateSubFinishLine(session.accessToken, id);
    revalidatePath('/control-panel/finish-lines');
    return { success: `Sub-${goal} deactivated.` };
  } catch (err) {
    return { error: (err as Error).message ?? 'Deactivate failed.' };
  }
}
