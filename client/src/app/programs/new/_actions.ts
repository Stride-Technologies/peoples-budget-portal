'use server';

import { getSession } from '@/lib/session';
import {
  apiGetOffices,
  apiGetPapSectors,
  apiGetFinishLines,
  apiGetSglgIndicators,
  apiGetSdgGoals,
  apiGetAipCycles,
  apiPreviewAipCode,
  apiCreateProgram,
  apiGetMyOfficeScope,
  type CreateProgramPayload,
} from '@/lib/api';
import type {
  NewProgramFormData,
  DepartmentOption,
  NewProgramReference,
  PapClass,
} from '@/lib/schemas'
import { toFundAllocations } from '@/lib/schemas';

// Programs are LGU-only: the NCPC proponent track was retired (endorser pivot
// Phase 3). Proponents are always a city office.

/**
 * Loads every dropdown the new-program form needs in one round trip. The org
 * dropdown is always city offices.
 */
export async function loadNewProgramReference(): Promise<
  { data: NewProgramReference } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const [sectors, finishLines, sglg, sdg, cycles, officeScope] =
      await Promise.all([
        apiGetPapSectors(session.accessToken),
        apiGetFinishLines(session.accessToken),
        apiGetSglgIndicators(session.accessToken),
        apiGetSdgGoals(session.accessToken),
        apiGetAipCycles(session.accessToken),
        apiGetMyOfficeScope(session.accessToken),
      ]);

    // City offices are always needed for the supporting-office picker. The
    // sector default is the office's own `papSector`, not a guess from its
    // cluster — several offices in a cluster sit on different sectors.
    const activeOffices = await apiGetOffices(session.accessToken);
    const offices: DepartmentOption[] = activeOffices
      .map((office) => ({
        id: office.id,
        name: office.name,
        code: office.acronym,
        defaultSectorCode: office.papSector?.code,
        clusterName: office.cluster.name,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    // The implementing office may be any office in the caller's *scope* — which
    // is their home office plus any granted offices, or every office. Supporting
    // offices stay unrestricted, so `offices` is left whole.
    const departments: DepartmentOption[] = officeScope.allOffices
      ? offices
      : offices.filter((o) => officeScope.officeIds.includes(o.id));
    const ownOrgId = session.user.officeId ?? null;

    const openCycle = cycles.find((c) => c.status === 'OPEN') ?? null;

    return {
      data: {
        departments,
        offices,
        ownOrgId,
        sectors: sectors.map((s) => ({ id: s.id, name: s.name, code: s.code })),
        finishLines: finishLines.map((f) => ({
          id: f.id,
          name: f.name,
          fullName: f.fullName,
          visionNumber: f.visionNumber,
          subFinishLines: f.subFinishLines
            .filter((s) => s.isActive)
            .map((s) => ({ id: s.id, code: s.code, name: s.name })),
        })),
        sglgIndicators: sglg.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          pillar: s.pillar,
        })),
        sdgGoals: sdg.map((g) => ({ id: g.id, code: g.code, name: g.name })),
        cycle: openCycle ? { id: openCycle.id, fiscalYear: openCycle.fiscalYear } : null,
      },
    };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load form data.' };
  }
}

export async function previewProgramAipCode(
  orgId: string,
  sectorId: string,
  papClass?: PapClass,
): Promise<{ code: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const cycles = await apiGetAipCycles(session.accessToken);
    const openCycle = cycles.find((c) => c.status === 'OPEN');
    if (!openCycle) return { error: 'No open AIP cycle is available.' };

    const preview = await apiPreviewAipCode(session.accessToken, {
      aipCycleId: openCycle.id,
      papSectorId: sectorId,
      officeId: orgId,
      papClass: papClass || undefined,
    });
    return { code: preview.code };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to generate AIP code.' };
  }
}

export async function submitNewProgram(
  data: NewProgramFormData,
): Promise<{ id: string; aipReferenceCode: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  try {
    const cycles = await apiGetAipCycles(session.accessToken);
    const openCycle = cycles.find((c) => c.status === 'OPEN');
    if (!openCycle) return { error: 'No open AIP cycle is available.' };

    // The implementing office is never also a supporting office (the API rejects
    // it). It can end up in the list when the office is switched after supporting
    // offices were picked, so drop it here rather than 400 on the user.
    const supportingOfficeIds = (data.supportingOfficeIds ?? []).filter(
      (id) => id !== data.departmentId,
    );

    if (supportingOfficeIds.length > 4) {
      return { error: 'A program may have at most 4 supporting offices.' };
    }

    const payload: CreateProgramPayload = {
      aipCycleId: openCycle.id,
      officeId: data.departmentId,
      // Only sent when the box is ticked: unchecking leaves the picked office in
      // form state, and it must not survive as a silent host.
      hostOfficeId: data.isComponentProgram ? data.hostOfficeId : undefined,
      // Same rule as the host office: sent only when the box is ticked, so an
      // abandoned amount cannot survive as a silent budget.
      ...(data.hasOwnCosts
        ? {
            costMode: 'DIRECT_COSTS' as const,
            fundSources: data.fundSources,
            psProposedTotal: data.psProposedTotal ?? '0.00',
            mooeProposedTotal: data.mooeProposedTotal ?? '0.00',
            feProposedTotal: data.feProposedTotal ?? '0.00',
            coProposedTotal: data.coProposedTotal ?? '0.00',
            ...(data.splitByFund
              ? { fundAllocations: toFundAllocations(data.fundAllocations) }
              : {}),
          }
        : {}),
      papSectorId: data.sectorId,
      papClass: data.papClass,
      finishLineId: data.primaryClusterId,
      subFinishLineId: data.subFinishLineId || undefined,
      sglgIndicatorId: data.sglgIndicatorId || undefined,
      name: data.programName,
      description: data.additionalDescription,
      remarks: data.remarks,
      expectedOutput: data.expectedOutput,
      targetForBudgetYear: data.targetForBudgetYear,
      implementationStartMonth: data.implementationStartMonth,
      implementationStartYear: data.implementationStartYear,
      implementationEndMonth: data.implementationEndMonth,
      implementationEndYear: data.implementationEndYear,
      supportingOfficeIds: supportingOfficeIds.length
        ? supportingOfficeIds
        : undefined,
      sdgGoalIds: data.sdgGoalIds?.length ? data.sdgGoalIds : undefined,
    };

    const program = await apiCreateProgram(session.accessToken, payload);
    return { id: program.id, aipReferenceCode: program.tentativeAipReferenceCode };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to create program.' };
  }
}
