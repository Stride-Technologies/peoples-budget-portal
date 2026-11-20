'use client';

import { ProgramWithBudget } from '@/lib/schemas';
import { formatPeso } from '@/lib/currency-formatter';
import { cn } from '@/lib/utils';
import { goal } from '@/lib/goal-label';


interface ProjectActivityContextRailProps {
  program: ProgramWithBudget;
  /** The estimates being entered right now, as decimal strings — same shape
   * `ProgramOverviewSidebar` takes. Empty while the Budget section is hidden
   * (an Activity-Derived project). */
  currentEstimates?: { ps?: string; mooe?: string; fe?: string; co?: string };
}

/**
 * The New Project/Activity drawer's sticky context rail — a flatter, denser
 * read of the same `ProgramWithBudget` data `ProgramOverviewSidebar` renders,
 * styled to sit beside the drawer's own sections rather than as a standalone
 * card column. Reuses the server-computed `utilizationPercent`/
 * `remainingBudget` rather than re-deriving them client-side.
 */
export default function ProjectActivityContextRail({
  program,
  currentEstimates,
}: Readonly<ProjectActivityContextRailProps>) {
  const currentTotal =
    Number(currentEstimates?.ps || 0) +
    Number(currentEstimates?.mooe || 0) +
    Number(currentEstimates?.fe || 0) +
    Number(currentEstimates?.co || 0);

  const existingTotal = program.totalProjectActivityCost;
  const hasCeiling = program.budgetCeiling > 0;
  const newTotal = existingTotal + currentTotal;
  const existingPct = hasCeiling ? Math.min((existingTotal / program.budgetCeiling) * 100, 100) : 0;
  const currentPct = hasCeiling
    ? Math.min((currentTotal / program.budgetCeiling) * 100, Math.max(0, 100 - existingPct))
    : 0;
  const existingBarPct = newTotal > 0 ? (existingTotal / newTotal) * 100 : 0;
  const currentBarPct = newTotal > 0 ? (currentTotal / newTotal) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Parent program
        </p>
        <p className="text-[14.5px] font-semibold leading-snug text-slate-950">
          {program.programName}
        </p>
        <p className="font-mono text-xs text-slate-500">{program.aipReferenceCode}</p>
        <p className="text-[13px] text-slate-700">{program.primaryFinishLineName}</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Already under this program
          </span>
          <span className="text-xs text-slate-500">
            {program.children.length} {program.children.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        {program.children.map((child) => (
          <div key={child.id} className="flex flex-col gap-1 border-t border-slate-100 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[13.5px] leading-snug text-slate-700">{child.name}</span>
              <span className="h-fit shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] capitalize text-slate-500">
                {child.ppaType}
              </span>
            </div>
            <span className="font-mono text-[13px] font-semibold text-slate-900">
              {formatPeso(String(child.totalCost))}
            </span>
          </div>
        ))}
        {program.children.length === 0 && (
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
            Nothing added yet.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 p-4 tabular-nums">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Program budget
        </p>
        <div className="flex justify-between text-[13.5px]">
          <span className="text-slate-500">Existing entries</span>
          <span className="font-mono">{formatPeso(String(existingTotal))}</span>
        </div>
        <div className="flex justify-between text-[13.5px]">
          <span className="text-slate-500">This entry</span>
          <span className="font-mono font-medium text-primary">
            + {formatPeso(String(currentTotal))}
          </span>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-2.5 text-[15px] font-semibold">
          <span>New program total</span>
          <span className="font-mono">{formatPeso(String(newTotal))}</span>
        </div>
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100">
            <span className="bg-slate-400" style={{ width: `${existingBarPct}%` }} />
            <span className="bg-primary" style={{ width: `${currentBarPct}%` }} />
          </div>
          <p className={cn('text-xs text-slate-500', !hasCeiling && 'text-slate-400')}>
            {hasCeiling
              ? `${(existingPct + currentPct).toFixed(1)}% of the ${formatPeso(String(program.budgetCeiling))} ceiling`
              : `No budget ceiling set for this ${goal}, so utilization is not tracked.`}
          </p>
        </div>
      </div>
    </div>
  );
}
