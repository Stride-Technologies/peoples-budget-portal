'use server';

import { revalidatePath } from 'next/cache';
import { getSession, setSession } from '@/lib/session';
import { apiChangePassword, apiUpdateMe } from '@/lib/api';

export type AccountActionState =
  | { success: string }
  | { error: string }
  | undefined;

export async function updateProfileAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  const firstName = (formData.get('firstName') as string)?.trim();
  const lastName = (formData.get('lastName') as string)?.trim();

  if (!firstName || !lastName) {
    return { error: 'First and last name are required.' };
  }

  try {
    await apiUpdateMe(session.accessToken, { firstName, lastName });
  } catch (err) {
    const { message } = err as Error & { statusCode: number };
    return { error: message || 'Could not update your profile. Please try again.' };
  }

  revalidatePath('/account/profile');
  return { success: 'Profile updated.' };
}

export async function changePasswordAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  const currentPassword = formData.get('currentPassword') as string;
  const newPassword = formData.get('newPassword') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!currentPassword) return { error: 'Enter your current password.' };
  if (!newPassword || newPassword.length < 8) {
    return { error: 'New password must be at least 8 characters.' };
  }
  if (newPassword !== confirmPassword) {
    return { error: 'New password and confirmation do not match.' };
  }
  if (currentPassword === newPassword) {
    return { error: 'New password must be different from your current password.' };
  }

  try {
    // Returns a fresh token pair: this device stays signed in, others are revoked.
    const tokens = await apiChangePassword(session.accessToken, {
      currentPassword,
      newPassword,
      confirmPassword,
    });
    await setSession(tokens.accessToken, tokens.refreshToken);
  } catch (err) {
    const { statusCode, message } = err as Error & { statusCode: number };
    if (statusCode === 400) {
      return { error: message || 'Current password is incorrect.' };
    }
    return { error: 'Could not change your password. Please try again.' };
  }

  revalidatePath('/account/activity');
  return { success: 'Password changed. Other devices have been signed out.' };
}
