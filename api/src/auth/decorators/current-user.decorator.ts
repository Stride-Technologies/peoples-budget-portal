import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { IdentityType, Role } from '../../generated/prisma/index';

export interface JwtPayload {
  sub: string;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
  identityType: IdentityType | null;
  officeId: string | null;
  civilSocietyOrganizationId: string | null;
  /**
   * Granted permission keys (Phase 1 D11). Bounded (~20 keys), so it rides in the
   * JWT; `PermissionGuard` falls back to the DB when a key is missing, so a
   * just-granted permission works without a re-login.
   *
   * Optional because tokens issued before this shipped are still valid until they
   * expire. Absent reads as "no keys in the token", which sends the guard to the
   * DB — fail-safe, not fail-open.
   */
  permissions?: string[];
  /**
   * Fast path for office scope. The office id *list* is deliberately not in the
   * JWT — it is up to ~50 UUIDs and goes stale on regrant. Resolve it through
   * `OfficeScopeService`, which is Redis-cached.
   *
   * Optional for the same reason as `permissions`; absent reads as false, which
   * falls through to the explicit grant list.
   */
  allOfficesScope?: boolean;
  /** Standard claims, set on every verified token (seconds since the epoch). */
  iat?: number;
  exp?: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    return request.user;
  },
);
