import type { PublicClusterRecord, PublicPpmpSummaryRecord } from './api.ts';

/**
 * The public PPMP list's finish-line, cluster, office and search filters.
 *
 * A plan carries no finish line of its own — only its office. So a plan belongs
 * to a finish line **through its office's clusters**: the office sits in one or
 * more clusters, each cluster serves one or more finish lines. That is the same
 * office ↔ cluster ↔ finish line map the AIP filters narrow with, applied to the
 * one link a plan has. It answers "plans from offices working on this finish
 * line", not "plans tagged to it" — the Methodology tab says so.
 */
export interface PpmpFilters {
  finishLineIds: string[];
  /** `'all'` for no filter, as in the AIP registry. */
  clusterId: string;
  officeId: string;
  search: string;
}

/** Office id → the finish lines its clusters serve. */
export function officeFinishLines(clusters: PublicClusterRecord[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const c of clusters) {
    for (const o of c.offices) {
      const set = map.get(o.id) ?? new Set<string>();
      for (const fc of c.finishLineClusters) set.add(fc.finishLine.id);
      map.set(o.id, set);
    }
  }
  return map;
}

export function filterPpmps(
  plans: PublicPpmpSummaryRecord[],
  f: PpmpFilters,
  clusters: PublicClusterRecord[],
): PublicPpmpSummaryRecord[] {
  const byOffice = officeFinishLines(clusters);
  const clusterOffices =
    f.clusterId === 'all'
      ? null
      : new Set(clusters.find((c) => c.id === f.clusterId)?.offices.map((o) => o.id) ?? []);
  const needle = f.search.trim().toLowerCase();

  return plans.filter((p) => {
    if (f.officeId !== 'all' && p.officeId !== f.officeId) return false;
    if (clusterOffices && !clusterOffices.has(p.officeId)) return false;
    if (f.finishLineIds.length > 0) {
      const lines = byOffice.get(p.officeId);
      if (!lines || !f.finishLineIds.some((id) => lines.has(id))) return false;
    }
    if (needle) {
      const hay = `${p.name} ${p.fundingProgram} ${p.office.acronym} ${p.office.name}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/** Plans per finish line, for the chips' counts. */
export function countByFinishLine(
  plans: PublicPpmpSummaryRecord[],
  clusters: PublicClusterRecord[],
): Map<string, number> {
  const byOffice = officeFinishLines(clusters);
  const counts = new Map<string, number>();
  for (const p of plans) {
    for (const id of byOffice.get(p.officeId) ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
