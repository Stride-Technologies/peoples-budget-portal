'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import {
  apiInviteUser,
  apiResendInvite,
  apiRevokeInvite,
  apiUpdateUser,
  apiGetUserAuditLog,
  apiGetPermissionCatalog,
  apiGetUserGrants,
  apiUpdateUserGrants,
} from '@/lib/api';
import type {
  InviteUserPayload,
  PermissionCatalog,
  UpdateGrantsPayload,
  UpdateUserPayload,
  UserAuditLogRecord,
  UserGrants,
} from '@/lib/api';

export type InviteState =
  | { success: string }
  | { error: string }
  | undefined;

export async function inviteUser(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  const role = formData.get('role') as string;
  const identityType = formData.get('identityType') as string;
  const officeId = formData.get('officeId') as string | null;
  const civilSocietyOrganizationId = formData.get('civilSocietyOrganizationId') as string | null;

  // Sent as hidden JSON fields so the grant pickers travel with the rest of the
  // form rather than needing a second round trip.
  const parseIds = (field: string): string[] => {
    const raw = formData.get(field);
    if (typeof raw !== 'string' || !raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  };

  const payload: InviteUserPayload = {
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    email: formData.get('email') as string,
    role,
    ...(role !== 'SUPER_ADMIN' && identityType ? { identityType } : {}),
    ...(role !== 'SUPER_ADMIN' && officeId ? { officeId } : {}),
    ...(role !== 'SUPER_ADMIN' && civilSocietyOrganizationId ? { civilSocietyOrganizationId } : {}),
    // A Super Admin bypasses both dimensions, so sending grants for one would be
    // dead data on the invite.
    ...(role !== 'SUPER_ADMIN'
      ? {
          permissions: parseIds('permissions'),
          allOfficesScope: formData.get('allOfficesScope') === 'true',
          officeScopeIds: parseIds('officeScopeIds'),
        }
      : {}),
  };

  try {
    await apiInviteUser(session.accessToken, payload);
    revalidatePath('/control-panel/users');
    return { success: 'Invitation sent successfully.' };
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    return { error: e.message ?? 'Failed to send invitation.' };
  }
}

export async function resendInvite(inviteId: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    await apiResendInvite(session.accessToken, inviteId);
    revalidatePath('/control-panel/users');
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to resend invitation.' };
  }
}

export async function updateUser(
  userId: string,
  payload: UpdateUserPayload,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    await apiUpdateUser(session.accessToken, userId, payload);
    revalidatePath('/control-panel/users');
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to update user.' };
  }
}

export async function getUserAuditLog(
  userId: string,
): Promise<{ logs?: UserAuditLogRecord[]; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const logs = await apiGetUserAuditLog(session.accessToken, userId);
    return { logs };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load audit log.' };
  }
}

export async function revokeInvite(inviteId: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    await apiRevokeInvite(session.accessToken, inviteId);
    revalidatePath('/control-panel/users');
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to revoke invitation.' };
  }
}

// ─── Permissions & office scope (Phase 1 §5.5) ──────────────────────────────

export async function getPermissionCatalog(): Promise<{
  catalog?: PermissionCatalog;
  error?: string;
}> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const catalog = await apiGetPermissionCatalog(session.accessToken);
    return { catalog };
  } catch (err) {
    return {
      error: (err as Error).message ?? 'Failed to load the permission catalog.',
    };
  }
}

export async function getUserGrants(
  userId: string,
): Promise<{ grants?: UserGrants; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const grants = await apiGetUserGrants(session.accessToken, userId);
    return { grants };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load grants.' };
  }
}

/**
 * Replace-set: whatever is sent becomes the complete list. The dialog sends both
 * dimensions together, but the API accepts either alone.
 */
export async function updateUserGrants(
  userId: string,
  payload: UpdateGrantsPayload,
): Promise<{ grants?: UserGrants; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const grants = await apiUpdateUserGrants(
      session.accessToken,
      userId,
      payload,
    );
    revalidatePath('/control-panel/users');
    return { grants };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to save grants.' };
  }
}
