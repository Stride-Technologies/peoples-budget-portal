'use client';

import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SimpleSelect } from '@/components/custom/simple-select';
import { formatCurrency } from '@/lib/currency-formatter';
import { cn } from '@/lib/utils';
import type { ProgramDetailRecord, ProgramVersionMeta } from '@/lib/api';
import { GOAL } from '@/lib/goal-label';


interface ComparisonResult {
  programId: string;
  from: { version: number; snapshot: Record<string, unknown> };
  to: { version: number | 'current'; snapshot?: Record<string, unknown>; live?: Record<string, unknown> };
}

interface Props {
  program: ProgramDetailRecord;
  versions: ProgramVersionMeta[];
  comparison: ComparisonResult | null;
  fromVersion: number;
  toVersion: number | 'current';
}

function safeStr(v: unknown): string {
  if (v == null) return '—';
  return String(v);
}

function safeCurrency(v: unknown): string {
  const n = Number(v);
  if (isNaN(n)) return '—';
  return formatCurrency(n);
}

/**
 * Line-item entry is deferred (D17), so `grandTotal` on a program and
 * `grandTotal` on a PA are structurally zero — which is why every figure on this
 * page read ₱0.00. The proposed family is the real money: `proposedTotal` on the
 * program, `proposedBudget` on each PA. Same fallback the registry uses.
 */
function proposedAmount(proposed: unknown, rollup: unknown): unknown {
  return proposed ?? rollup;
}

interface SummaryActivity {
  id: string | null;
  name: string;
  /** Formatted for display. */
  amount: string;
  /** Raw wire value, compared instead of the formatted string. */
  rawAmount: string;
  type: string;
}

interface SnapshotSummary {
  name: string;
  status: string;
  expectedOutput: string;
  grandTotal: string;
  finishLine: string;
  papSector: string;
  projectActivities: SummaryActivity[];
}

function extractSummary(data: Record<string, unknown>): SnapshotSummary {
  const fl = data.finishLine as Record<string, unknown> | undefined;
  const ps = data.papSector as Record<string, unknown> | undefined;
  const pas = (data.projectActivities as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    name: safeStr(data.name),
    status: safeStr(data.status),
    expectedOutput: safeStr(data.expectedOutput),
    grandTotal: safeCurrency(proposedAmount(data.proposedTotal, data.grandTotal)),
    finishLine: fl ? `${safeStr(fl.name)}` : safeStr(data.finishLineId),
    papSector: ps ? `${safeStr(ps.code)} — ${safeStr(ps.name)}` : safeStr(data.papSectorId),
    projectActivities: pas.map((pa) => {
      const raw = proposedAmount(pa.proposedBudget, pa.grandTotal);
      return {
        id: typeof pa.id === 'string' ? pa.id : null,
        name: safeStr(pa.name),
        amount: safeCurrency(raw),
        rawAmount: String(raw ?? ''),
        type: safeStr(pa.type),
      };
    }),
  };
}

/**
 * Pair by id, not array position. Index pairing reported every row after an
 * insertion or reorder as changed, and compared a PA against an unrelated one.
 */
function counterpartOf(
  pa: SummaryActivity,
  others: SummaryActivity[],
): SummaryActivity | undefined {
  return pa.id ? others.find((other) => other.id === pa.id) : undefined;
}

function DiffValue({ left, right }: { left: string; right: string }) {
  const changed = left !== right;
  return (
    <div className="grid grid-cols-2 divide-x divide-slate-100">
      <span className={cn('px-3 py-1.5 text-sm', changed && 'bg-red-50 text-red-800 line-through')}>{left}</span>
      <span className={cn('px-3 py-1.5 text-sm', changed && 'bg-green-50 text-green-800 font-medium')}>{right}</span>
    </div>
  );
}

function FieldRow({ label, left, right }: { label: string; left: string; right: string }) {
  const changed = left !== right;
  return (
    <div className={cn('border-b border-slate-100 last:border-0', changed && 'rounded')}>
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-50">{label}</div>
      <DiffValue left={left} right={right} />
    </div>
  );
}

export function ProgramCompareClient({ program, versions, comparison, fromVersion, toVersion }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const fromData = comparison?.from.snapshot ?? {};
  const toData = comparison?.to.snapshot ?? comparison?.to.live ?? {};

  const fromSummary = extractSummary(fromData);
  const toSummary = extractSummary(toData);

  const toLabel = toVersion === 'current' ? 'Current (live)' : `Version ${toVersion}`;
  const fromLabel = `Version ${fromVersion}`;

  const handleVersionChange = (side: 'from' | 'to', version: string) => {
    const params = new URLSearchParams();
    if (side === 'from') {
      params.set('from', version);
      params.set('to', String(toVersion));
    } else {
      params.set('from', String(fromVersion));
      params.set('to', version);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-800">Version Comparison</span>
        </div>
        <span className="text-sm text-slate-500 truncate max-w-xs">— {program.name}</span>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        {/* Version selectors */}
        <div className="grid grid-cols-2 gap-3">
          {(['from', 'to'] as const).map((side) => (
            <div key={side} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                {side === 'from' ? 'Comparing from' : 'Comparing to'}
              </p>
              <SimpleSelect
                aria-label={side === 'from' ? 'Comparing from' : 'Comparing to'}
                size="sm"
                options={[
                  ...versions.map((v) => ({
                    value: String(v.version),
                    label: `Version ${v.version} — submitted ${new Date(v.submittedAt).toLocaleDateString()}`,
                  })),
                  ...(side === 'to'
                    ? [{ value: 'current', label: 'Current (live draft)' }]
                    : []),
                ]}
                value={side === 'from' ? String(fromVersion) : String(toVersion)}
                onChange={(next) => handleVersionChange(side, next)}
              />
            </div>
          ))}
        </div>

        {!comparison ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
            No comparison available. Submit the program at least once to create a version snapshot.
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-2 divide-x divide-slate-200 overflow-hidden rounded-t-lg border border-slate-200 bg-slate-50">
              <div className="px-3 py-2 text-center text-xs font-semibold text-slate-500">{fromLabel}</div>
              <div className="px-3 py-2 text-center text-xs font-semibold text-slate-500">{toLabel}</div>
            </div>

            {/* Program fields */}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <FieldRow label="Program Name" left={fromSummary.name} right={toSummary.name} />
              <FieldRow label="Status" left={fromSummary.status} right={toSummary.status} />
              <FieldRow label={GOAL} left={fromSummary.finishLine} right={toSummary.finishLine} />
              <FieldRow label="PAP Sector" left={fromSummary.papSector} right={toSummary.papSector} />
              <FieldRow label="Grand Total" left={fromSummary.grandTotal} right={toSummary.grandTotal} />
              <FieldRow label="Expected Output" left={fromSummary.expectedOutput} right={toSummary.expectedOutput} />
            </div>

            {/* Project Activities */}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-50 border-b border-slate-100">
                Project / Activities
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-100">
                {/* From side */}
                <div className="p-3 space-y-1.5">
                  {fromSummary.projectActivities.length === 0 ? (
                    <p className="text-xs text-slate-400">No activities.</p>
                  ) : fromSummary.projectActivities.map((pa, i) => (
                    <ActivityCard key={pa.id ?? i} pa={pa} side="from" counterpart={counterpartOf(pa, toSummary.projectActivities)} />
                  ))}
                </div>
                {/* To side */}
                <div className="p-3 space-y-1.5">
                  {toSummary.projectActivities.length === 0 ? (
                    <p className="text-xs text-slate-400">No activities.</p>
                  ) : toSummary.projectActivities.map((pa, i) => (
                    <ActivityCard key={pa.id ?? i} pa={pa} side="to" counterpart={counterpartOf(pa, fromSummary.projectActivities)} />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ActivityCard({
  pa,
  counterpart,
}: {
  pa: SummaryActivity;
  side: 'from' | 'to';
  counterpart?: SummaryActivity;
}) {
  const nameChanged = counterpart && pa.name !== counterpart.name;
  // Compare the wire values, not the formatted strings.
  const totalChanged = counterpart && pa.rawAmount !== counterpart.rawAmount;
  return (
    <div className="rounded border border-slate-100 p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <span className={cn('font-medium text-slate-700', nameChanged && 'text-amber-700')}>{pa.name}</span>
        <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">{pa.type}</Badge>
      </div>
      <p className={cn('mt-0.5 text-slate-500', totalChanged && 'text-amber-700 font-medium')}>{pa.amount}</p>
    </div>
  );
}
