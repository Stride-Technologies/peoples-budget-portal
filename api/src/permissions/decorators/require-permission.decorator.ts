import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Declares the permission key a route requires. Read by `PermissionGuard` at
 * request time and by `PermissionRegistry` at boot for the catalog drift check.
 *
 * May be applied to a controller class (applies to every handler) or to a single
 * handler, which wins over the class-level value.
 *
 * The key must exist in `PERMISSION_CATALOG` — the boot-time drift check warns
 * loudly if it does not, because a key nobody can be granted gates everyone out.
 */
export const RequirePermission = (key: string) =>
  SetMetadata(PERMISSION_KEY, key);
