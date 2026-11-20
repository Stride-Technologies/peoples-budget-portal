import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../generated/prisma/index.js';
import {
  ALL_OFFICES,
  type OfficeScopeService,
} from '../permissions/office-scope.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * A non-SUPER_ADMIN manager reaches only users in their own office or CSO, and
 * never a SUPER_ADMIN. One rule for the user editor and the grants editor.
 */
export function assertCanManageUser(
  user: {
    role?: Role;
    lguusers: { officeId: string }[];
    ncpcusers: { civilSocietyOrganizationId: string | null }[];
  },
  requester: JwtPayload,
): void {
  if (requester.role === Role.SUPER_ADMIN) return;
  if (user.role === Role.SUPER_ADMIN) throw new ForbiddenException();

  const userOfficeId = user.lguusers[0]?.officeId ?? null;
  const userCSOId = user.ncpcusers[0]?.civilSocietyOrganizationId ?? null;
  const sameOffice = requester.officeId && userOfficeId === requester.officeId;
  const sameOrg =
    requester.civilSocietyOrganizationId &&
    userCSOId === requester.civilSocietyOrganizationId;

  if (!sameOffice && !sameOrg) throw new ForbiddenException();
}

/**
 * Nobody but a SUPER_ADMIN hands out more than they hold: each added
 * permission key must be one the requester has, each added office must be in
 * the requester's own scope, and all-offices scope needs all-offices scope.
 * Read from the database, not the JWT, so a just-revoked key cannot be passed on.
 */
export async function assertGrantsWithinRequester(
  prisma: PrismaService,
  officeScope: OfficeScopeService,
  requester: JwtPayload,
  added: {
    permissions?: string[];
    officeIds?: string[];
    allOfficesScope?: boolean;
  },
): Promise<void> {
  if (requester.role === Role.SUPER_ADMIN) return;

  if (added.permissions?.length) {
    const held = new Set(
      (
        await prisma.userPermission.findMany({
          where: { userId: requester.sub },
          select: { key: true },
        })
      ).map((p) => p.key),
    );
    const beyond = added.permissions.filter((k) => !held.has(k));
    if (beyond.length > 0) {
      throw new ForbiddenException(
        `You cannot grant permissions you do not hold: ${beyond.join(', ')}`,
      );
    }
  }

  if (!added.allOfficesScope && !added.officeIds?.length) return;
  const scope = await officeScope.effectiveOfficeIds(requester);
  if (scope === ALL_OFFICES) return;
  if (added.allOfficesScope) {
    throw new ForbiddenException(
      'You cannot grant all-offices access without holding it',
    );
  }
  if (added.officeIds?.some((id) => !scope.includes(id))) {
    throw new ForbiddenException(
      'You cannot grant offices outside your own scope',
    );
  }
}
