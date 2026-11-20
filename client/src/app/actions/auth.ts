'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  apiLogin,
  apiVerifyEmail,
  apiLogout,
  apiSetPassword,
  apiForgotPassword,
  apiResetPassword,
} from '@/lib/api';
import { setSession, getSession, deleteSession } from '@/lib/session';
import { visitorIp } from '@/lib/visitor-ip';

export type ActionState = { error: string } | undefined;

const TOO_MANY_ATTEMPTS =
  'Too many attempts. Please wait 15 minutes and try again.';

/**
 * The login's proof that the password was right. The API redeems an emailed
 * code only together with it, so it rides in an httpOnly cookie between the
 * login form and the code form, never in the URL.
 */
const CHALLENGE_COOKIE = 'login_challenge';

export type ForgotPasswordState =
  | { success: string }
  | { error: string }
  | undefined;

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) return { error: 'Email and password are required.' };

  try {
    const tokens = await apiLogin(email, password, await visitorIp());
    await setSession(tokens.accessToken, tokens.refreshToken);
  } catch (err) {
    const { statusCode, message, body } = err as Error & {
      statusCode: number;
      body?: { challenge?: unknown };
    };
    if (statusCode === 401 && message?.toLowerCase().includes('verification')) {
      if (typeof body?.challenge === 'string') {
        (await cookies()).set(CHALLENGE_COOKIE, body.challenge, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 15 * 60,
          path: '/',
        });
      }
      redirect(`/verify-email?email=${encodeURIComponent(email)}`);
    }
    if (statusCode === 429) return { error: TOO_MANY_ATTEMPTS };
    return { error: 'Invalid email or password.' };
  }

  redirect('/');
}

export async function verifyEmailAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = formData.get('email') as string;
  const code = formData.get('code') as string;

  if (!code) return { error: 'Verification code is required.' };

  const jar = await cookies();
  const challenge = jar.get(CHALLENGE_COOKIE)?.value;
  if (!challenge) return { error: 'Your sign-in expired. Sign in again.' };

  try {
    const tokens = await apiVerifyEmail(email, code, challenge, await visitorIp());
    await setSession(tokens.accessToken, tokens.refreshToken);
    jar.delete(CHALLENGE_COOKIE);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 429) {
      return { error: TOO_MANY_ATTEMPTS };
    }
    return { error: 'Invalid or expired code. Try again or request a new one.' };
  }

  redirect('/');
}

export async function setPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = formData.get('token') as string;
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!token) return { error: 'Invalid invite link. Please use the link from your email.' };
  if (!password) return { error: 'Password is required.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
  if (password !== confirmPassword) return { error: 'Passwords do not match.' };

  try {
    const tokens = await apiSetPassword({ token, password, confirmPassword }, await visitorIp());
    await setSession(tokens.accessToken, tokens.refreshToken);
  } catch (err) {
    const { statusCode } = err as Error & { statusCode: number };
    if (statusCode === 401) {
      return { error: 'This invite link is invalid or has expired.' };
    }
    return { error: 'Something went wrong. Please try again.' };
  }

  redirect('/');
}

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = formData.get('email') as string;
  if (!email) return { error: 'Email is required.' };

  // The API always responds identically whether or not the account exists,
  // so we surface the same neutral confirmation either way.
  try {
    await apiForgotPassword(email, await visitorIp());
  } catch {
    // Swallow — never reveal whether the email is registered.
  }

  return {
    success:
      'If an account exists for that email, a reset link is on its way. Check your inbox.',
  };
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = formData.get('token') as string;
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!token) return { error: 'Invalid reset link. Please request a new one.' };
  if (!password) return { error: 'Password is required.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
  if (password !== confirmPassword) return { error: 'Passwords do not match.' };

  try {
    const tokens = await apiResetPassword({ token, password, confirmPassword }, await visitorIp());
    await setSession(tokens.accessToken, tokens.refreshToken);
  } catch (err) {
    const { statusCode } = err as Error & { statusCode: number };
    if (statusCode === 401) {
      return { error: 'This reset link is invalid or has expired.' };
    }
    return { error: 'Something went wrong. Please try again.' };
  }

  redirect('/');
}

export async function logoutAction() {
  const session = await getSession();
  if (session) {
    try {
      await apiLogout(session.refreshToken);
    } catch {
      // best-effort; always clear local session
    }
  }
  await deleteSession();
  redirect('/login');
}
