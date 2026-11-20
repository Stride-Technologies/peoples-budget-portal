'use server';

import {
  apiGetAipCycles,
  apiGetAipRegistry,
  apiGetFinishLineCeilings,
  apiGetFinishLines,
  type AipCycleRecord,
} from '@/lib/api';
import type { FinishLine, FinishLineStatus } from '@/lib/finish-lines';
import { getSession } from '@/lib/session';
import { goals } from '@/lib/goal-label';


export interface FinishLinesPageData {
  finishLines: FinishLine[];
  years: string[];
  defaultYear: string;
}

interface Metrics {
  allocation: number;
  ppaCount: number;
  programCount: number;
  projectCount: number;
  activityCount: number;
  proponents: Set<string>;
}

function parsePeso(value?: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusForCycle(status: AipCycleRecord['status']): FinishLineStatus {
  if (status === 'PLANNING') return 'Planned';
  if (status === 'OPEN') return 'Active';
  return 'Ongoing';
}

function yearLabel(fiscalYear: number): string {
  return `FY ${fiscalYear}`;
}

function emptyMetrics(): Metrics {
  return {
    allocation: 0,
    ppaCount: 0,
    programCount: 0,
    projectCount: 0,
    activityCount: 0,
    proponents: new Set<string>(),
  };
}

export async function loadFinishLinesPageData(): Promise<
  FinishLinesPageData | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };

  try {
    const [finishLines, cycles] = await Promise.all([
      apiGetFinishLines(session.accessToken),
      apiGetAipCycles(session.accessToken),
    ]);

    const visibleCycles = cycles.length > 0 ? cycles : [];
    const cycleData = await Promise.all(
      visibleCycles.map(async (cycle) => {
        const [ceilings, registry] = await Promise.all([
          apiGetFinishLineCeilings(session.accessToken, cycle.id),
          apiGetAipRegistry(session.accessToken, {
            tab: 'ALL',
            cycleId: cycle.id,
            pageSize: 1000,
          }),
        ]);

        const metricsByFinishLine = new Map<string, Metrics>();
        for (const item of registry.items) {
          const metrics =
            metricsByFinishLine.get(item.finishLineId) ?? emptyMetrics();
          metrics.programCount += 1;
          metrics.ppaCount += 1;
          // A program's figure is `proposedTotal`. `grandTotal` is the line-item rollup, which is 0
          // while line items are not encoded, and read ₱0 for every goal here.
          metrics.allocation += parsePeso(item.proposedTotal);

          const proponent =
            item.office?.acronym ?? item.office?.name;
          if (proponent) metrics.proponents.add(proponent);

          for (const activity of item.projectActivities) {
            metrics.ppaCount += 1;
            if (activity.type === 'PROJECT') metrics.projectCount += 1;
            if (activity.type === 'ACTIVITY') metrics.activityCount += 1;
          }

          metricsByFinishLine.set(item.finishLineId, metrics);
        }

        return {
          cycle,
          ceilingsByFinishLine: new Map(
            ceilings.map((ceiling) => [ceiling.finishLineId, ceiling]),
          ),
          metricsByFinishLine,
        };
      }),
    );

    const dataCycles =
      cycleData.length > 0
        ? cycleData
        : [
            {
              cycle: null,
              ceilingsByFinishLine: new Map(),
              metricsByFinishLine: new Map<string, Metrics>(),
            },
          ];

    const rows = dataCycles.flatMap(({ cycle, ceilingsByFinishLine, metricsByFinishLine }) => {
      const fiscalYear = cycle ? yearLabel(cycle.fiscalYear) : 'Reference';
      const status = cycle ? statusForCycle(cycle.status) : 'Active';

      return finishLines.map((finishLine) => {
        const clusterNames = finishLine.finishLineClusters.map(
          ({ cluster }) => cluster.name,
        );
        const metrics = metricsByFinishLine.get(finishLine.id) ?? emptyMetrics();
        const ceiling = ceilingsByFinishLine.get(finishLine.id);
        const title = finishLine.fullName || finishLine.name;

        return {
          id: cycle ? `${finishLine.id}:${cycle.id}` : finishLine.id,
          name: title,
          shortName: finishLine.name,
          cluster: clusterNames.join(', ') || 'Unassigned',
          category: clusterNames.join(', ') || 'Unassigned',
          code:
            finishLine.visionNumber != null
              ? `#${finishLine.visionNumber}`
              : undefined,
          displayNumber: finishLine.visionNumber ?? undefined,
          status,
          allocation: metrics.allocation,
          // Undefined only when no ceiling row exists — a real ₱0 ceiling must
          // stay 0 so the tracker doesn't read it as "No ceiling set".
          ceiling: ceiling ? parsePeso(ceiling.totalCeiling) : undefined,
          ppaCount: metrics.ppaCount,
          programCount: metrics.programCount,
          projectCount: metrics.projectCount,
          activityCount: metrics.activityCount,
          departmentCount: metrics.proponents.size,
          responsibleOffice: clusterNames.join(', ') || 'Unassigned',
          fiscalYear,
          departments: Array.from(metrics.proponents).sort((left, right) =>
            left.localeCompare(right),
          ),
          description: title !== finishLine.name ? title : undefined,
        } satisfies FinishLine;
      });
    });

    const years =
      cycles.length > 0
        ? cycles
            .map((cycle) => yearLabel(cycle.fiscalYear))
            .sort((left, right) => right.localeCompare(left))
        : ['Reference'];
    const defaultCycle =
      cycles.find((cycle) => cycle.status === 'OPEN') ?? cycles[0];

    return {
      finishLines: rows,
      years,
      defaultYear: defaultCycle ? yearLabel(defaultCycle.fiscalYear) : years[0],
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : `Failed to load ${goals} from the database.`,
    };
  }
}
