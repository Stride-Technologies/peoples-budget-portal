import 'server-only';

import {
  apiGetOffices,
  apiGetCivilSocietyOrganizations,
  apiGetClusters,
} from './api';
import type { SessionUser } from './session';

export interface ProponentContext {
  /** LGU / LFC (city office), NCPC (CSO) or Developer (no org). Null for admins. */
  identityType: 'LGU' | 'NCPC' | 'LFC' | 'DEVELOPER' | null;
  /** Human label for the proponent type. */
  proponentLabel: string;
  /** Name of the city office or civil society organization the user belongs to. */
  organizationName: string | null;
  /**
   * Short form of `organizationName` for the navbar strip, where the full name
   * ("Office of the City Planning and Development Coordinator") crowds out the
   * user's own name. Null for CSOs, which have no acronym — callers fall back
   * to `organizationName`.
   */
  organizationAcronym: string | null;
  /** Strategic cluster the office/CSO is linked to. */
  clusterName: string | null;
}

/**
 * Resolves the signed-in user's proponent context (proponent type, city
 * office/CSO, cluster) for display in the navbar. The session JWT only carries
 * the office/CSO id, so the names are looked up from the reference endpoints.
 */
export async function resolveProponentContext(
  user: SessionUser,
  accessToken: string,
): Promise<ProponentContext> {
  const identityType =
    (user.identityType as ProponentContext['identityType']) ?? null;

  try {
    if (identityType === 'LGU' && user.officeId) {
      const offices = await apiGetOffices(accessToken);
      const office = offices.find((o) => o.id === user.officeId);
      return {
        identityType,
        proponentLabel: 'LGU — Office',
        organizationName: office?.name ?? null,
        organizationAcronym: office?.acronym ?? null,
        clusterName: office?.cluster.name ?? null,
      };
    }

    // A Developer has no office or CSO to name; what it can reach comes from
    // its permissions and office scope.
    if (identityType === 'DEVELOPER') {
      return {
        identityType,
        proponentLabel: 'Developer',
        organizationName: null,
        organizationAcronym: null,
        clusterName: null,
      };
    }

    // NCPC users review and comment on the AIP (#102): the umbrella head (no
    // CSO) for NCPC as a whole, a CSO representative for their CSO's cluster.
    if (identityType === 'NCPC') {
      if (!user.civilSocietyOrganizationId) {
        return {
          identityType,
          proponentLabel: 'NCPC — Reviewer (umbrella head)',
          organizationName: null,
          organizationAcronym: null,
          clusterName: null,
        };
      }
      const [csos, clusters] = await Promise.all([
        apiGetCivilSocietyOrganizations(accessToken),
        apiGetClusters(accessToken),
      ]);
      const cso = csos.find((c) => c.id === user.civilSocietyOrganizationId);
      const cluster = cso
        ? clusters.find((cl) => cl.id === cso.clusterId)
        : undefined;
      return {
        identityType,
        proponentLabel: 'NCPC — Reviewer (CSO representative)',
        organizationName: cso?.name ?? null,
        organizationAcronym: null,
        clusterName: cluster?.name ?? null,
      };
    }
  } catch {
    // Reference lookup failed — fall through to the admin/unknown shape so the
    // navbar still renders the user's name and role.
  }

  return {
    identityType,
    proponentLabel: identityType ? 'Proponent' : 'Administrator',
    organizationName: null,
    organizationAcronym: null,
    clusterName: null,
  };
}
