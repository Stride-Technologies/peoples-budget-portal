'use server';

import { getSession } from '@/lib/session';
import {
  apiGetOffices,
  apiGetAipCycles,
  apiGetMyOfficeScope,
  apiCreatePpmp,
} from '@/lib/api';
import type { DepartmentOption, PpmpFormValues } from '@/lib/schemas';

export async function loadPpmpReference(): Promise<
  { data: { departments: DepartmentOption[]; ownOrgId: string | null } } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const [activeOffices, officeScope] = await Promise.all([
      apiGetOffices(session.accessToken),
      apiGetMyOfficeScope(session.accessToken),
    ]);

    const offices: DepartmentOption[] = activeOffices
      .map((office) => ({
        id: office.id,
        name: office.name,
        code: office.acronym,
        defaultSectorCode: office.papSector?.code,
        clusterName: office.cluster.name,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const departments = officeScope.allOffices
      ? offices
      : offices.filter((o) => officeScope.officeIds.includes(o.id));

    return { data: { departments, ownOrgId: session.user.officeId ?? null } };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load form data.' };
  }
}

export async function submitNewPpmp(
  data: PpmpFormValues,
): Promise<{ id: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const cycles = await apiGetAipCycles(session.accessToken);
    const openCycle = cycles.find((c) => c.status === 'OPEN');
    if (!openCycle) return { error: 'No open AIP cycle is available.' };

    const ppmp = await apiCreatePpmp(session.accessToken, {
      officeId: data.officeId,
      aipCycleId: openCycle.id,
      name: data.name,
      fundingProgram: data.fundingProgram,
      classification: data.classification,
    });
    return { id: ppmp.id };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to create Project.' };
  }
}
