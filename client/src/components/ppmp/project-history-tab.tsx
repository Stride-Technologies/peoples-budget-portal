'use client';

import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PpmpHistoryEntry } from '@/lib/api';
import { loadPpmpHistory } from '@/app/ppmp-registry/[id]/_actions';

const KIND_STYLE: Record<string, string> = {
  created: 'bg-slate-100 text-slate-700',
  published: 'bg-emerald-100 text-emerald-700',
  unpublished: 'bg-amber-100 text-amber-700',
  reverted_to_revision: 'bg-violet-100 text-violet-700',
  line_item_added: 'bg-sky-100 text-sky-700',
  line_item_updated: 'bg-sky-100 text-sky-700',
};

function kindLabel(kind: string): string {
  return kind
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Synthesized activity feed — no stored audit log, built from the Project's
 * and its line items' own timestamps (specs/005-ppmp-to-project research.md
 * Decision 5). No per-field diffing.
 */
export default function ProjectHistoryTab({ ppmpId }: Readonly<{ ppmpId: string }>) {
  const [entries, setEntries] = useState<PpmpHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadPpmpHistory(ppmpId).then((result) => {
      if ('error' in result) setError(result.error);
      else setEntries(result.data);
      setLoading(false);
    });
  }, [ppmpId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-400">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-red-600">{error}</p>;
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 py-8 text-center">
        <History className="mx-auto size-5 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">No recorded activity yet</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 pl-5">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative">
          {index < entries.length - 1 && (
            <span
              aria-hidden
              className="absolute -left-3 top-2.5 h-[calc(100%+1rem)] w-px -translate-x-1/2 bg-slate-200"
            />
          )}
          <span
            aria-hidden
            className="absolute -left-3 top-1.5 size-2 -translate-x-1/2 rounded-full bg-slate-300 ring-2 ring-white"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                KIND_STYLE[entry.kind] ?? 'bg-slate-100 text-slate-700',
              )}
            >
              {kindLabel(entry.kind)}
            </span>
            <span className="font-mono text-[10px] text-slate-400">{formatWhen(entry.at)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-700">{entry.summary}</p>
        </li>
      ))}
    </ol>
  );
}
