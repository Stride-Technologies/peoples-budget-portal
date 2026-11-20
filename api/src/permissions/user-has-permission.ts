import { Role } from '../generated/prisma/index';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Does this user hold the permission key? SUPER_ADMIN holds every key; anyone
 * else needs it in the token or as a `user_permissions` row (a grant made after
 * the token was issued). `PermissionGuard` uses this for `@RequirePermission`;
 * services use it when the answer is a value, not a 403.
 */
export async function userHasPermission(
  prisma: PrismaService,
  user: JwtPayload,
  key: string,
): Promise<boolean> {
  if (user.role === Role.SUPER_ADMIN) return true;
  if (user.permissions?.includes(key)) return true;
  // Fall back to the DB so a just-granted permission works without forcing a
  // re-login — the JWT is only refreshed every JWT_ACCESS_EXPIRES_IN.
  const grant = await prisma.userPermission.findUnique({
    where: { userId_key: { userId: user.sub, key } },
    select: { key: true },
  });
  return !!grant;
}
