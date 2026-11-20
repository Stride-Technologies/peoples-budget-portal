import {
  apiPublicGetClusters,
  apiPublicGetFinishLines,
  apiPublicGetPpmp,
  apiPublicGetPpmpList,
  apiPublicGetRegistry,
  type PublicCycleRecord,
} from '@/lib/api';
import { buildBudgetOverview, type BudgetOverview } from '@/lib/budget-overview';
import { buildPpmpOverview, type PpmpOverview } from '@/lib/ppmp-overview';
import { cyclesIn } from '@/lib/public-sections';

/**
 * The whole cycle in one request, same ceiling as the registry page and the API.
 * Grouping and every share on the Overview are only correct over the complete
 * result set, so there is no page to fetch.
 */
const REGISTRY_FETCH_LIMIT = 1000;

export interface OverviewData extends BudgetOverview {
  /**
   * True when the cycle holds more programmes than one request returns. Every
   * figure on the page would then be a partial sum, so the page says so rather
   * than quietly under-reporting.
   */
  truncated: boolean;
  /** The API's own total, for cross-checking the client-side sum. */
  apiTotalProposed: string;
}

/**
 * A section's Overview data for one year. `section` picks the document — a year
 * in both sections has an AIP and an enacted budget (specs/012).
 */
export async function loadOverview(
  cycle: PublicCycleRecord,
  section: 'aip' | 'annual',
): Promise<OverviewData> {
  const [registry, finishLines, clusters] = await Promise.all([
    apiPublicGetRegistry({ cycleId: cycle.id, limit: REGISTRY_FETCH_LIMIT, section }),
    apiPublicGetFinishLines(cycle.id, section),
    apiPublicGetClusters(),
  ]);

  const overview = buildBudgetOverview({
    items: registry.items,
    finishLines,
    clusters,
    totalOfficeCount: registry.totalOfficeCount,
  });

  return {
    ...overview,
    truncated: registry.total > registry.items.length,
    apiTotalProposed: registry.totalBudget,
  };
}

/**
 * The most recent enacted year before this cycle — the only fair thing to
 * compare a proposal against.
 *
 * Returns null when there is none, so the comparison section stays off even if
 * someone flips the switch on the very first cycle.
 */
/**
 * The prior year's enacted total, and nothing else.
 *
 * The comparison section needs one number. Calling `loadOverview` for it fetched
 * the whole prior cycle — 430 programmes and 581 project-activities — to read a
 * single aggregate the API already computes and returns alongside `limit=1`.
 */
export async function loadCycleTotal(cycle: PublicCycleRecord): Promise<{
  total: string;
  programCount: number;
}> {
  // The prior year's *enacted* total: always the Annual Budget document.
  const registry = await apiPublicGetRegistry({ cycleId: cycle.id, limit: 1, section: 'annual' });
  return { total: registry.totalBudget, programCount: registry.total };
}

export function priorEnactedCycle(
  cycles: PublicCycleRecord[],
  cycle: PublicCycleRecord,
): PublicCycleRecord | null {
  return (
    cyclesIn(cycles, 'annual').find((c) => c.fiscalYear < cycle.fiscalYear) ?? null
  );
}

/**
 * One year's published procurement plans, with their line items, summarised.
 *
 * The list endpoint carries only each plan's total; type, mode and start month
 * live on the line items, so every plan is fetched.
 * ponytail: one request per published plan — fine for the tens a year one LGU
 * publishes; add a `/public/ppmp/overview` aggregate if it reaches the hundreds.
 */
export async function loadPpmpOverview(cycle: PublicCycleRecord): Promise<PpmpOverview> {
  const [summaries, registry] = await Promise.all([
    apiPublicGetPpmpList(cycle.id),
    apiPublicGetRegistry({ cycleId: cycle.id, limit: 1 }),
  ]);
  const plans = await Promise.all(summaries.map((p) => apiPublicGetPpmp(p.id)));
  return buildPpmpOverview({
    plans,
    fiscalYear: cycle.fiscalYear,
    totalOfficeCount: registry.totalOfficeCount,
  });
}
