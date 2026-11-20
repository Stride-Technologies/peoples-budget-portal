import { IdentityType, Role } from '../generated/prisma/index.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';

/**
 * Who the caller is, as an endorser, in the NCPC endorser-pivot model (§3.3).
 * Exactly one of the three shapes a `ProgramEndorsement` row can take:
 *   - LGU  → a `canEndorse` city office's HEAD (`endorserOfficeId` set).
 *   - NCPC umbrella head → `NCPCUser` with `civilSocietyOrganizationId = null`
 *     (`endorserCsoId` null).
 *   - NCPC CSO representative → HEAD of a `canEndorse` CSO (`endorserCsoId` set).
 */
export type EndorserIdentity =
  | { type: 'LGU'; officeId: string; csoId: null }
  | { type: 'NCPC'; officeId: null; csoId: string | null };

/** Minimal Prisma surface the resolver needs (so it stays unit-testable). */
interface EndorserLookupClient {
  office: {
    findUnique(args: {
      where: { id: string };
      select: { canEndorse: true };
    }): Promise<{ canEndorse: boolean } | null>;
  };
  civilSocietyOrganization: {
    findUnique(args: {
      where: { id: string };
      select: { canEndorse: true };
    }): Promise<{ canEndorse: boolean } | null>;
  };
}

/**
 * Resolve the caller's endorser identity, or `null` if they may not endorse.
 *
 * Only a HEAD may endorse (STAFF read/comment only — mirrors the original
 * HEAD-only endorse rule). The branch is chosen by which org the caller belongs
 * to, not by `identityType` alone, so an LFC-identity HEAD whose office is
 * `canEndorse` still endorses as that LGU office (preserves Phase 1 behaviour):
 *   1. has a city office  → LGU endorser (requires `office.canEndorse`)
 *   2. has a CSO          → NCPC CSO representative (requires `cso.canEndorse`)
 *   3. NCPC identity, no org → NCPC umbrella head (always allowed; provisioned
 *      by SUPER_ADMIN through the invite flow — OD-5)
 */
export async function resolveEndorserIdentity(
  prisma: EndorserLookupClient,
  user: JwtPayload,
): Promise<EndorserIdentity | null> {
  if (user.role !== Role.HEAD) return null;

  if (user.officeId) {
    const office = await prisma.office.findUnique({
      where: { id: user.officeId },
      select: { canEndorse: true },
    });
    return office?.canEndorse
      ? { type: 'LGU', officeId: user.officeId, csoId: null }
      : null;
  }

  if (user.civilSocietyOrganizationId) {
    const cso = await prisma.civilSocietyOrganization.findUnique({
      where: { id: user.civilSocietyOrganizationId },
      select: { canEndorse: true },
    });
    return cso?.canEndorse
      ? {
          type: 'NCPC',
          officeId: null,
          csoId: user.civilSocietyOrganizationId,
        }
      : null;
  }

  if (user.identityType === IdentityType.NCPC) {
    return { type: 'NCPC', officeId: null, csoId: null };
  }

  return null;
}

/**
 * A Prisma `where` fragment selecting the caller's own endorsement row(s) for a
 * given identity — used to surface "has this endorser already concurred?" and
 * for idempotent re-endorsement. NCPC umbrella head matches `endorserCsoId null`
 * (there is only one umbrella head).
 */
export function endorserOwnRowWhere(identity: EndorserIdentity): {
  endorserType: 'LGU' | 'NCPC';
  endorserOfficeId?: string;
  endorserCsoId?: string | null;
} {
  if (identity.type === 'LGU') {
    return {
      endorserType: 'LGU',
      endorserOfficeId: identity.officeId,
    };
  }
  return { endorserType: 'NCPC', endorserCsoId: identity.csoId };
}

export function isCitywideEndorser(identity: EndorserIdentity): boolean {
  return identity.type === 'LGU' || identity.csoId === null;
}
