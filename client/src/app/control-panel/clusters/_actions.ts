'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { apiUpdateCluster } from '@/lib/api';

export type ActionState = { success: string } | { error: string } | undefined;

export async function updateCluster(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateCluster(session.accessToken, id, {
      name: formData.get('name') as string,
      fullName: formData.get('fullName') as string,
    });
    revalidatePath('/control-panel/clusters');
    return { success: 'Cluster updated.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Update failed.' };
  }
}

