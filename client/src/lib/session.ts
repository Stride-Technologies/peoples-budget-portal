import 'server-only';
import { cookies } from 'next/headers';

export interface SessionUser {
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  identityType: string | null;
  officeId: string | null;
  civilSocietyOrganizationId: string | null;
  /**
   * Granted permission keys (Phase 1 D11). Optional because tokens issued before
   * this shipped stay valid until they expire.
   *
   * Use `hasPermission()` rather than reading this directly — it handles the
   * SUPER_ADMIN bypass and the absent-claim case. This only ever drives what the
   * UI *offers*; the API re-checks every request.
   */
  permissions?: string[];
  allOfficesScope?: boolean;
}

/**
 * Mirrors the API's PermissionGuard: SUPER_ADMIN bypasses, otherwise the key must
 * be granted. An absent claim means an old token, which reads as "not granted"
 * here — the UI hides an affordance the API would have allowed, which is the
 * safe direction to be wrong in.
 */
export function hasPermission(
  user: Pick<SessionUser, 'role' | 'permissions'> | null | undefined,
  key: string,
): boolean {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  return user.permissions?.includes(key) ?? false;
}

function decodePayload(token: string): SessionUser | null {
  try {
    const raw = Buffer.from(token.split('.')[1], 'base64url').toString('utf-8');
    const payload = JSON.parse(raw) as SessionUser & { exp?: number };
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

const isProd = process.env.NODE_ENV === 'production';

export async function setSession(accessToken: string, refreshToken: string) {
  const jar = await cookies();
  jar.set('access_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 15 * 60,
    path: '/',
  });
  jar.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
}

export async function getSession() {
  const jar = await cookies();
  const accessToken = jar.get('access_token')?.value;
  const refreshToken = jar.get('refresh_token')?.value;
  if (!accessToken || !refreshToken) return null;
  const user = decodePayload(accessToken);
  if (!user) return null;
  return { user, accessToken, refreshToken };
}

export async function deleteSession() {
  const jar = await cookies();
  jar.delete('access_token');
  jar.delete('refresh_token');
}
