import { AIPCycleStatus, BudgetDocumentKind } from '../generated/prisma/index';
import { isHistoricalCycle } from '../programs/import-data-warnings.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PUBLICLY_VISIBLE } from '../programs/program-filters.js';
import { PUBLIC_ANNUAL_DOCUMENT } from '../public/ordinance-registry.js';

/**
 * Which public sections a fiscal year belongs to: the proposal (`aip`), the
 * enacted budget (`annual`), or both. specs/012 D14, contracts/public-cycles.md.
 *
 * This is the one place the rule lives. The client reads the result
 * (`sections` on the public cycle record) and never re-derives it.
 *
 *   annual ⇐ an ENACTED Ordinance exists
 *          ∨ the year is historical and has a SUBMITTED LEP (specs/017 FR-002:
 *            FY2023–2025 are known only by the Mayor's proposal)
 *          ∨ (interim) the AIP stage is adopted, the year is historical and
 *            it has a public program (an empty AIP stage, as a year imported
 *            from scans gets, waits for its Ordinance)
 *   aip    ⇐ the year has an AIP stage
 *          ∧ (it has a public program ∨ it is still being prepared)
 *          ∧ (interim) the year is not historical
 *
 * Interim clauses: until the FY2026 Ordinance is enacted in an environment
 * (specs/012 P3), FY2026's enacted budget *is* its AIP-stage Program rows under
 * an adopted (LOCKED) cycle. The historical test keeps 2026 in `annual` only, and
 * keeps an adopted 2027 AIP out of `annual`. The P8 contract migration deletes
 * both interim clauses.
 */
export type SectionKind = 'aip' | 'annual';

export interface CycleSectionFacts {
  fiscalYear: number;
  /** The AIP stage's status, or null when the year has no AIP stage. */
  aipStatus: AIPCycleStatus | null;
  /** At least one non-deleted program with a published version. */
  hasPublicAip: boolean;
  /** An ENACTED Ordinance exists for the cycle (always false before P1/P3). */
  hasEnactedOrdinance: boolean;
  /**
   * A historical year's SUBMITTED LEP is its public Annual document (no
   * enacted Ordinance beside it). Not an enacted budget: the stage guard
   * (`hasEnactedBudget`) ignores it.
   */
  hasPublicLep?: boolean;
}

/** LOCKED is the pre-012 name for ADOPTED; both mean the AIP is final. */
export function isAdoptedStatus(status: AIPCycleStatus | null): boolean {
  return status === AIPCycleStatus.ADOPTED || status === AIPCycleStatus.LOCKED;
}

/**
 * The year has an enacted budget: the `annual` rule, shared with the stage
 * guard (BudgetCyclesService.setStage) so the two cannot drift.
 */
export function hasEnactedBudget(f: CycleSectionFacts): boolean {
  return (
    f.hasEnactedOrdinance ||
    (isAdoptedStatus(f.aipStatus) &&
      isHistoricalCycle(f.fiscalYear) &&
      f.hasPublicAip)
  );
}

export function computeSections(f: CycleSectionFacts): SectionKind[] {
  const historical = isHistoricalCycle(f.fiscalYear);
  const adopted = isAdoptedStatus(f.aipStatus);
  const sections: SectionKind[] = [];
  if (f.aipStatus !== null && (f.hasPublicAip || !adopted) && !historical) {
    sections.push('aip');
  }
  if (hasEnactedBudget(f) || (historical && f.hasPublicLep))
    sections.push('annual');
  return sections;
}

/**
 * Sections for every AIP cycle, keyed by AIP cycle id. Three queries regardless
 * of the number of cycles. A year with no AIP stage joins this with the first
 * AIP-less year (specs/012 P7); until then every Budget Cycle has one.
 */
export async function loadCycleSections(
  prisma: Pick<PrismaService, 'aIPCycle' | 'program' | 'budgetDocument'>,
): Promise<Map<string, SectionKind[]>> {
  const [cycles, published, enacted] = await Promise.all([
    prisma.aIPCycle.findMany({
      select: { id: true, fiscalYear: true, status: true, budgetCycleId: true },
    }),
    prisma.program.groupBy({
      by: ['aipCycleId'],
      where: PUBLICLY_VISIBLE,
    }),
    prisma.budgetDocument.findMany({
      where: PUBLIC_ANNUAL_DOCUMENT,
      select: { budgetCycleId: true, kind: true },
    }),
  ]);
  const withPublic = new Set(published.map((p) => p.aipCycleId));
  const withOrdinance = new Set(
    enacted
      .filter((d) => d.kind === BudgetDocumentKind.ORDINANCE)
      .map((d) => d.budgetCycleId),
  );
  const withLep = new Set(
    enacted
      .filter((d) => d.kind === BudgetDocumentKind.LEP)
      .map((d) => d.budgetCycleId),
  );
  return new Map(
    cycles.map((c) => [
      c.id,
      computeSections({
        fiscalYear: c.fiscalYear,
        aipStatus: c.status,
        hasPublicAip: withPublic.has(c.id),
        hasEnactedOrdinance: withOrdinance.has(c.budgetCycleId),
        hasPublicLep: withLep.has(c.budgetCycleId),
      }),
    ]),
  );
}
