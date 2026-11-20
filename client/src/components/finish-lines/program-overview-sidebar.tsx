'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ProgramWithBudget } from '@/lib/schemas';
import { formatCurrency } from '@/lib/currency-formatter';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { GOAL, goal } from '@/lib/goal-label';


interface ProgramOverviewSidebarProps {
  program: ProgramWithBudget;
  currentEntryType: 'project' | 'activity';
  compact?: boolean;
  /**
   * The estimates being entered right now, as decimal strings. Phase 1 D17:
   * this used to derive from the form's line items, which are deferred and so
   * always empty — "This submission" was permanently ₱0.00.
   */
  currentEstimates?: { ps?: string; mooe?: string; fe?: string; co?: string };
}

/**
 * Program Overview Sidebar
 * Sticky right-side contextual sidebar for budget tracking
 */
export default function ProgramOverviewSidebar({
  program,
  currentEntryType,
  compact = false,
  currentEstimates,
}: ProgramOverviewSidebarProps) {
  const utilizationPercent = program.utilizationPercent || 0;
  const itemsLabel = currentEntryType === 'project' ? 'Existing Items' : 'Projects / Activities';

  // Display-only arithmetic (percentages against a number-typed ceiling), so
  // this stays in Number like the rest of the panel. The exact decimal sum the
  // user is shown comes from addDecimalStrings in the cost section.
  const psTotal   = Number(currentEstimates?.ps || 0);
  const mooeTotal = Number(currentEstimates?.mooe || 0);
  const feTotal   = Number(currentEstimates?.fe || 0);
  const coTotal   = Number(currentEstimates?.co || 0);
  const currentTotal = psTotal + mooeTotal + feTotal + coTotal;

  const existingPct    = utilizationPercent;
  const currentPct     = program.budgetCeiling > 0 ? (currentTotal / program.budgetCeiling) * 100 : 0;
  const combinedPct    = existingPct + currentPct;
  const cappedExisting = Math.min(existingPct, 100);
  const cappedCurrent  = Math.min(currentPct, Math.max(0, 100 - cappedExisting));

  const isOverBudget  = combinedPct > 100;
  const isApproaching = !isOverBudget && combinedPct >= 80;

  const remainingAfter = program.remainingBudget - currentTotal;

  // Without a configured ceiling there is nothing to be "remaining" against —
  // subtracting from zero would report a negative balance the user cannot act on.
  const hasCeiling = program.budgetCeiling > 0;
  const statusLabel = !hasCeiling
    ? 'No Ceiling Set'
    : isOverBudget
      ? 'Over Budget'
      : isApproaching
        ? 'Approaching Ceiling'
        : 'Within Budget';
  const statusDetail = !hasCeiling ? (
    <>No budget ceiling set for this {goal} yet.</>
  ) : isOverBudget ? (
    <>Exceeds ceiling by: <span className="font-semibold">{formatCurrency(Math.abs(remainingAfter))}</span></>
  ) : (
    <>Remaining: <span className="font-semibold">{formatCurrency(remainingAfter)}</span></>
  );

  if (compact) {
    return (
      <div className="space-y-4 p-0">
        <Card className="overflow-hidden border-0 shadow-md shadow-blue-900/10">
          <CardContent className="bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-600 p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
                  Program Overview
                </p>
                <p className="text-sm font-semibold leading-tight text-white">
                  {program.programName}
                </p>
              </div>
              <Badge
                variant="secondary"
                className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur"
              >
                {program.children.length} {program.children.length === 1 ? 'entry' : 'entries'}
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/70">AIP Code</p>
                <p className="mt-1 break-all font-mono text-xs font-medium text-white">
                  {program.aipReferenceCode}
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/70">{GOAL}</p>
                <p className="mt-1 text-xs font-medium leading-snug text-white">
                  {program.primaryFinishLineName}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {program.children.length > 0 && (
          <Card className="border-neutral-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-700">
                  {itemsLabel}
                </p>
                <Badge variant="secondary" className="rounded-full text-[11px]">
                  {program.children.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {program.children.map((child) => (
                  <div
                    key={child.id}
                    className="rounded-2xl border border-neutral-200 bg-gradient-to-b from-white to-neutral-50/80 p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 text-xs font-medium leading-snug text-neutral-900">
                        {child.name}
                      </p>
                      <Badge
                        variant="outline"
                        className={
                          child.ppaType === 'project'
                            ? 'shrink-0 border-blue-200 bg-blue-50 text-[10px] capitalize text-blue-700'
                            : 'shrink-0 border-teal-200 bg-teal-50 text-[10px] capitalize text-teal-700'
                        }
                      >
                        {child.ppaType}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-neutral-900">
                      {formatCurrency(child.totalCost)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-700">
              Budget Summary
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
                Budget Ceiling
              </p>
              <p className="text-lg font-semibold text-neutral-900">
                {formatCurrency(program.budgetCeiling)}
              </p>
            </div>

            <div className="space-y-2 text-[11px]">
              {currentTotal === 0 ? (
                <p className="py-2 text-center text-[11px] text-neutral-400">Add line items to see the breakdown</p>
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-2xl bg-blue-50 px-3 py-2.5">
                    <div>
                      <p className="font-mono font-semibold text-blue-700">PS</p>
                      <p className="text-[10px] text-blue-900/70">Personnel Services</p>
                    </div>
                    <p className="font-medium text-blue-900 tabular-nums">{formatCurrency(psTotal)}</p>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-teal-50 px-3 py-2.5">
                    <div>
                      <p className="font-mono font-semibold text-teal-700">MOOE</p>
                      <p className="text-[10px] text-teal-900/70">Maintenance &amp; Operating</p>
                    </div>
                    <p className="font-medium text-teal-900 tabular-nums">{formatCurrency(mooeTotal)}</p>
                  </div>
                  {feTotal > 0 && (
                    <div className="flex items-center justify-between rounded-2xl bg-violet-50 px-3 py-2.5">
                      <div>
                        <p className="font-mono font-semibold text-violet-700">FE</p>
                        <p className="text-[10px] text-violet-900/70">Financial Expenses</p>
                      </div>
                      <p className="font-medium text-violet-900 tabular-nums">{formatCurrency(feTotal)}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-2xl bg-orange-50 px-3 py-2.5">
                    <div>
                      <p className="font-mono font-semibold text-orange-700">CO</p>
                      <p className="text-[10px] text-orange-900/70">Capital Outlay</p>
                    </div>
                    <p className="font-medium text-orange-900 tabular-nums">{formatCurrency(coTotal)}</p>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-neutral-600">Utilization</p>
                <p className="text-xs font-semibold text-neutral-900">{combinedPct.toFixed(1)}%</p>
              </div>
              <Progress value={Math.min(combinedPct, 100)} className="h-2" />
            </div>

            <div
              className={
                isOverBudget
                  ? 'rounded-2xl border border-red-200 bg-red-50 p-3'
                  : isApproaching
                    ? 'rounded-2xl border border-amber-200 bg-amber-50 p-3'
                    : 'rounded-2xl border border-green-200 bg-green-50 p-3'
              }
            >
              <div className="flex items-start gap-2">
                {isOverBudget ? (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                ) : isApproaching ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                ) : (
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={isOverBudget ? 'text-xs font-semibold text-red-900' : isApproaching ? 'text-xs font-semibold text-amber-900' : 'text-xs font-semibold text-green-900'}>
                    {statusLabel}
                  </p>
                  <p className={isOverBudget ? 'mt-0.5 text-xs text-red-800' : isApproaching ? 'mt-0.5 text-xs text-amber-800' : 'mt-0.5 text-xs text-green-800'}>
                    {statusDetail}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-2xl border border-neutral-200 bg-white p-3 text-xs text-neutral-600 space-y-2 shadow-sm">
          <p className="font-medium text-neutral-900">
            <strong>Current Entry:</strong> {currentEntryType === 'project' ? 'Project' : 'Activity'}
          </p>
          <p>
            Amounts above reflect existing entries plus your current changes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 space-y-4 md:space-y-6">
      {/* Program Header */}
      <Card className="overflow-hidden border-0 shadow-md shadow-blue-900/10">
        <CardContent className="bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-600 text-white p-4 md:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90 mb-1">Program</p>
          <p className="text-sm md:text-base font-semibold leading-tight mb-3">
            {program.programName}
          </p>
          <div className="space-y-2.5">
            <div>
              <p className="text-[11px] uppercase tracking-wide opacity-70">AIP Code</p>
              <p className="text-xs font-mono font-medium break-all">{program.aipReferenceCode}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide opacity-70">{GOAL}</p>
              <p className="text-xs font-medium leading-snug">{program.primaryFinishLineName}</p>
            </div>
          </div>
          <div className="mt-4 inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
            {program.children.length} existing {program.children.length === 1 ? 'entry' : 'entries'}
          </div>
        </CardContent>
      </Card>

      {/* Existing Projects/Activities */}
      {program.children.length > 0 && (
        <Card className="border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                {itemsLabel}
              </p>
              <Badge variant="secondary" className="text-[11px]">
                {program.children.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {program.children.map((child) => (
                <div
                  key={child.id}
                  className="rounded-lg border border-neutral-200/90 bg-gradient-to-b from-white to-neutral-50/80 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-xs font-medium text-neutral-900 flex-1 leading-snug">
                      {child.name}
                    </p>
                    <Badge
                      variant="outline"
                      className={
                        child.ppaType === 'project'
                          ? 'text-[11px] capitalize flex-shrink-0 border-blue-200 bg-blue-50 text-blue-700'
                          : 'text-[11px] capitalize flex-shrink-0 border-teal-200 bg-teal-50 text-teal-700'
                      }
                    >
                      {child.ppaType}
                    </Badge>
                  </div>
                  <p className="text-xs font-semibold text-neutral-900">
                    {formatCurrency(child.totalCost)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Summary */}
        <Card className="border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-700">
              Budget Summary
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
                Budget Ceiling
              </p>
              <p className="text-lg font-semibold text-neutral-900">
                {formatCurrency(program.budgetCeiling)}
              </p>
            </div>

            {currentTotal > 0 && (
              <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-3 py-2.5 text-[11px]">
                <div>
                  <p className="font-semibold text-emerald-700">This Submission</p>
                  <p className="text-[10px] text-emerald-900/70">{currentPct.toFixed(1)}% of ceiling</p>
                </div>
                <p className="font-medium text-emerald-900 tabular-nums">{formatCurrency(currentTotal)}</p>
              </div>
            )}

            <div className="space-y-2 text-[11px]">
              {currentTotal === 0 ? (
                <p className="py-2 text-center text-[11px] text-neutral-400">Add line items to see the breakdown</p>
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-2xl bg-blue-50 px-3 py-2.5">
                    <div>
                      <p className="font-mono font-semibold text-blue-700">PS</p>
                      <p className="text-[10px] text-blue-900/70">Personnel Services</p>
                    </div>
                    <p className="font-medium text-blue-900 tabular-nums">{formatCurrency(psTotal)}</p>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-teal-50 px-3 py-2.5">
                    <div>
                      <p className="font-mono font-semibold text-teal-700">MOOE</p>
                      <p className="text-[10px] text-teal-900/70">Maintenance &amp; Operating</p>
                    </div>
                    <p className="font-medium text-teal-900 tabular-nums">{formatCurrency(mooeTotal)}</p>
                  </div>
                  {feTotal > 0 && (
                    <div className="flex items-center justify-between rounded-2xl bg-violet-50 px-3 py-2.5">
                      <div>
                        <p className="font-mono font-semibold text-violet-700">FE</p>
                        <p className="text-[10px] text-violet-900/70">Financial Expenses</p>
                      </div>
                      <p className="font-medium text-violet-900 tabular-nums">{formatCurrency(feTotal)}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-2xl bg-orange-50 px-3 py-2.5">
                    <div>
                      <p className="font-mono font-semibold text-orange-700">CO</p>
                      <p className="text-[10px] text-orange-900/70">Capital Outlay</p>
                    </div>
                    <p className="font-medium text-orange-900 tabular-nums">{formatCurrency(coTotal)}</p>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-neutral-600">Utilization</p>
                <p className={`text-xs font-semibold ${isOverBudget ? 'text-red-700' : 'text-neutral-900'}`}>
                  {combinedPct.toFixed(1)}%
                </p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div className="flex h-full">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${cappedExisting}%` }}
                  />
                  <div
                    className={`h-full transition-all ${isOverBudget ? 'bg-red-500' : 'bg-amber-400'}`}
                    style={{ width: `${cappedCurrent}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-neutral-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                  Existing ({existingPct.toFixed(1)}%)
                </span>
                <span className="flex items-center gap-1">
                  <span className={`inline-block h-2 w-2 rounded-full ${isOverBudget ? 'bg-red-500' : 'bg-amber-400'}`} />
                  This submission ({currentPct.toFixed(1)}%)
                </span>
              </div>
            </div>

            <div
              className={
                isOverBudget
                  ? 'rounded-2xl border border-red-200 bg-red-50 p-3'
                  : isApproaching
                    ? 'rounded-2xl border border-amber-200 bg-amber-50 p-3'
                    : 'rounded-2xl border border-green-200 bg-green-50 p-3'
              }
            >
              <div className="flex items-start gap-2">
                {isOverBudget ? (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                ) : isApproaching ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                ) : (
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={isOverBudget ? 'text-xs font-semibold text-red-900' : isApproaching ? 'text-xs font-semibold text-amber-900' : 'text-xs font-semibold text-green-900'}>
                    {statusLabel}
                  </p>
                  <p className={isOverBudget ? 'mt-0.5 text-xs text-red-800' : isApproaching ? 'mt-0.5 text-xs text-amber-800' : 'mt-0.5 text-xs text-green-800'}>
                    {statusDetail}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      {/* Info Footer */}
      <div className="rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-600 space-y-2">
        <p>
          <strong>Current Entry:</strong> {currentEntryType === 'project' ? 'Project' : 'Activity'}
        </p>
        <p>
          Amounts above reflect existing entries plus your current changes.
        </p>
      </div>
    </div>
  );
}
