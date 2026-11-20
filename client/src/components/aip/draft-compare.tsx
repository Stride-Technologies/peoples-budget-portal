'use client';

import { useEffect, useState } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatPeso } from '@/lib/currency-formatter';
import type { ProgramDraftDiff } from '@/lib/api';
import { loadDraftDiff } from '@/app/aip-registry/_actions';

const STATUS_LABEL = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
} as const;

const STATUS_STYLE = {
  added: 'bg-sky-100 text-sky-700',
  removed: 'bg-rose-100 text-rose-700',
  changed: 'bg-amber-100 text-amber-700',
} as const;

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

/**
 * Draft vs published — screen 5.
 *
 * Answers the reviewer's question *before* publishing rather than after. The diff
 * comes from the API's `draft-diff` endpoint, which walks the same field
 * allow-list the audit log uses, so this view and the History tab can never
 * disagree about what counts as a change.
 */
export default function DraftCompare({
  programId,
}: Readonly<{ programId: string }>) {
  const [diff, setDiff] = useState<ProgramDraftDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await loadDraftDiff(programId);
      if (cancelled) return;
      if ('error' in res) setError(res.error);
      else setDiff(res.diff);
    })();
    return () => {
      cancelled = true;
    };
  }, [programId]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;

  if (!diff) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-400">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (!diff.hasChanges) {
    return (
      <p className="rounded-md border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
        This draft matches the published version.
      </p>
    );
  }

  const changedRecords = diff.paChanges.length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        {Object.keys(diff.programChanges ?? {}).length + changedRecords} change
        {Object.keys(diff.programChanges ?? {}).length + changedRecords === 1
          ? ''
          : 's'}{' '}
        across {changedRecords} record{changedRecords === 1 ? '' : 's'}
      </p>

      {/* Totals side by side — the figure everyone checks first */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-emerald-900">Published</h4>
            <Badge className="bg-emerald-100 text-[10px] font-normal text-emerald-700">
              public sees this
            </Badge>
          </div>
          <p className="font-mono text-lg font-semibold text-emerald-900">
            {diff.publishedTotal ? formatPeso(diff.publishedTotal) : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-amber-900">
              Draft — unpublished
            </h4>
            <Badge className="bg-amber-100 text-[10px] font-normal text-amber-700">
              your working copy
            </Badge>
          </div>
          <p className="flex items-baseline gap-2 font-mono text-lg font-semibold text-amber-900">
            {formatPeso(diff.draftTotal)}
            {diff.publishedTotal &&
              diff.publishedTotal !== diff.draftTotal && (
                <span className="flex items-center text-xs font-medium">
                  <ArrowUp className="size-3" />
                  changed
                </span>
              )}
          </p>
        </div>
      </div>

      {/* Program-level fields */}
      {diff.programChanges && Object.keys(diff.programChanges).length > 0 && (
        <section>
          <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Program details
          </h4>
          <table className="w-full rounded-md border border-slate-200 text-xs">
            <tbody>
              {Object.entries(diff.programChanges).map(([field, delta]) => (
                <tr key={field} className="border-b last:border-0">
                  <td className="px-3 py-2 text-slate-600">{field}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400 line-through">
                    {formatValue(delta.from)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium text-amber-700">
                    {formatValue(delta.to)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* PPA-level changes */}
      {diff.paChanges.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Projects / Activities
          </h4>
          {diff.paChanges.map((pa) => (
            <div
              key={pa.paId}
              className="rounded-md border border-slate-200 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-900">
                  {pa.name}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[pa.status]}`}
                >
                  {STATUS_LABEL[pa.status]}
                </span>
              </div>
              {pa.fields && Object.keys(pa.fields).length > 0 && (
                <table className="mt-1.5 w-full text-[11px]">
                  <tbody>
                    {Object.entries(pa.fields).map(([field, delta]) => (
                      <tr key={field}>
                        <td className="py-0.5 text-slate-600">{field}</td>
                        <td className="py-0.5 text-right font-mono text-slate-400 line-through">
                          {formatValue(delta.from)}
                        </td>
                        <td className="py-0.5 text-right font-mono font-medium text-amber-700">
                          {formatValue(delta.to)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
