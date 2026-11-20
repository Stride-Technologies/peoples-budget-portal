'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, Info, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/custom/simple-select';
import { cn } from '@/lib/utils';
import type { EditHistoryEntry } from '@/lib/api';
import {
  loadAllEditHistory,
  loadProgramEditHistory,
  loadProjectActivityEditHistory,
} from '@/app/aip-registry/_actions';

const ACTION_FILTER_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'ESTIMATE_UPDATED', label: 'Estimates changed' },
  { value: 'PA_ADDED', label: 'PPAs added' },
  { value: 'PA_UPDATED', label: 'PPAs updated' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'REPUBLISHED', label: 'Republished' },
  { value: 'REVISION_OPENED', label: 'Revisions opened' },
  { value: 'COMMENT_RESOLVED', label: 'Comments resolved' },
  { value: 'IMPORT_REVIEWED', label: 'Import reviewed' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'UNARCHIVED', label: 'Unarchived' },
];

/** Colour by kind of event, so a scan of the column reads at a glance. */
const ACTION_STYLE: Record<string, string> = {
  PROGRAM_CREATED: 'bg-slate-100 text-slate-700',
  PROGRAM_UPDATED: 'bg-slate-100 text-slate-700',
  PA_ADDED: 'bg-sky-100 text-sky-700',
  PA_UPDATED: 'bg-sky-100 text-sky-700',
  PA_REMOVED: 'bg-rose-100 text-rose-700',
  ESTIMATE_UPDATED: 'bg-amber-100 text-amber-700',
  REVISION_OPENED: 'bg-amber-100 text-amber-700',
  DRAFT_DISCARDED: 'bg-rose-100 text-rose-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  REPUBLISHED: 'bg-emerald-100 text-emerald-700',
  COMMENT_POSTED: 'bg-indigo-100 text-indigo-700',
  COMMENT_REPLIED: 'bg-indigo-100 text-indigo-700',
  COMMENT_RESOLVED: 'bg-emerald-100 text-emerald-700',
  COMMENT_UNRESOLVED: 'bg-amber-100 text-amber-700',
  // Orange, matching the publish panel's import-decisions block — this is the
  // record of someone clearing exactly that block.
  IMPORT_REVIEWED: 'bg-orange-100 text-orange-700',
  // Zinc, matching the Archived status badge (lib/program-status.ts).
  ARCHIVED: 'bg-zinc-200 text-zinc-600',
  UNARCHIVED: 'bg-slate-100 text-slate-700',
};

function actionLabel(action: string): string {
  return action
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
 * Decimal strings arrive as-is; a null reads as "empty", not "0".
 *
 * Arrays get their own branch because `String(['a','b'])` jams the elements
 * together on a comma and `String([])` renders blank rather than "empty" —
 * which is exactly the shape `IMPORT_REVIEWED` logs, its `from` holding the
 * cleared warning sentences and its `to` an empty array.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length ? value.join(' · ') : '—';
  return String(value);
}

interface EditHistoryTabProps {
  /**
   * Exactly one of these decides the scope of the stream. `all` is the
   * cross-program feed: every program the caller can audit, optionally one
   * office's (`officeId`), each row labelled with its program.
   */
  programId?: string;
  projectActivityId?: string;
  all?: boolean;
  officeId?: string;
  /** Bump to refetch after a mutation elsewhere in the drawer. */
  refreshKey?: number;
}

/**
 * The **edit history** — screens 6 and 7.
 *
 * Sibling to Versions, never merged with it: Versions answers "what did this look
 * like at v3", this answers "who changed what, when, and for which office". The
 * per-PPA variant is the same stream filtered by `targetId`.
 *
 * There is no delete affordance for anyone, including SUPER_ADMIN — the stream is
 * append-only, and the API exposes no route that could undo it.
 */
export default function EditHistoryTab({
  programId,
  projectActivityId,
  all = false,
  officeId,
  refreshKey = 0,
}: Readonly<EditHistoryTabProps>) {
  const [items, setItems] = useState<EditHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');

  const fetchPage = useCallback(
    async (after?: string) => {
      if (projectActivityId) {
        return loadProjectActivityEditHistory(projectActivityId, {
          cursor: after,
        });
      }
      if (programId) {
        return loadProgramEditHistory(programId, {
          cursor: after,
          action: actionFilter || undefined,
        });
      }
      if (all) {
        return loadAllEditHistory({
          cursor: after,
          action: actionFilter || undefined,
          officeId,
        });
      }
      return { error: 'Nothing to load.' };
    },
    [programId, projectActivityId, all, officeId, actionFilter],
  );

  useEffect(() => {
    let cancelled = false;
    // The reset lives inside the async boundary rather than in the effect body:
    // React 19 flags a synchronous setState in an effect as a cascading render.
    void (async () => {
      const res = await fetchPage();
      if (cancelled) return;
      if ('error' in res) {
        setError(res.error);
      } else {
        setError(null);
        setItems(res.page.items);
        setCursor(res.page.nextCursor);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage, refreshKey]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const res = await fetchPage(cursor);
    if ('error' in res) setError(res.error);
    else {
      setItems((prev) => [...prev, ...res.page.items]);
      setCursor(res.page.nextCursor);
    }
    setLoadingMore(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-400">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive px-1 py-4 text-sm">{error}</p>;
  }

  return (
    <div className="space-y-3">
      {/* Versions vs History — the distinction people get wrong */}
      {!all && (
      <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <p>
          <span className="font-medium">Versions</span> shows what this AIP looked
          like at each publish. <span className="font-medium">History</span> shows
          every action in between — who changed which figure, when, and for which
          office.
        </p>
      </div>
      )}

      {(programId || all) && (
        <div className="flex items-center justify-between gap-2">
          <SimpleSelect
            aria-label="Filter by action"
            size="sm"
            className="h-8 w-auto min-w-40 text-xs"
            options={ACTION_FILTER_OPTIONS}
            value={actionFilter}
            onChange={setActionFilter}
          />
          <Badge variant="secondary" className="font-normal">
            append-only · {items.length}
            {cursor ? '+' : ''} event{items.length === 1 ? '' : 's'}
          </Badge>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-200 py-8 text-center">
          <History className="mx-auto size-5 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No recorded activity yet</p>
        </div>
      ) : (
        // The rail used to be one <span> positioned against the <ol>'s padding
        // box (left-1 → centre 4.5px) while each dot was positioned against its
        // <li>, whose left edge sits at pl-5 = 20px (centre 9px) — so the dots
        // sat beside the line instead of on it. Both now share `-left-3` plus
        // `-translate-x-1/2`, i.e. one centre line at x = 8px.
        //
        // The connector is per-item rather than one full-height rail so it runs
        // from each dot's centre to the next dot's centre exactly: 10px down to
        // the dot, then the row height + the 16px `space-y-4` gap + the next
        // dot's own 10px offset.
        <ol className="relative space-y-4 pl-5">
          {items.map((entry, index) => (
            <li key={entry.id} className="relative">
              {index < items.length - 1 && (
                <span
                  aria-hidden
                  className="absolute -left-3 top-2.5 h-[calc(100%+1.625rem)] w-px -translate-x-1/2 bg-slate-200"
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
                    ACTION_STYLE[entry.action] ?? 'bg-slate-100 text-slate-700',
                  )}
                >
                  {actionLabel(entry.action)}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  {formatWhen(entry.createdAt)}
                </span>
                {entry.version !== null && (
                  <span className="font-mono text-[10px] text-slate-400">
                    v{entry.version}
                  </span>
                )}
              </div>

              {all && entry.program && (
                <p className="mt-1 text-xs font-medium text-slate-900">
                  {entry.program.office && (
                    <span className="mr-1.5 font-mono text-[10px] text-slate-500">
                      {entry.program.office.acronym}
                    </span>
                  )}
                  {entry.program.name}
                  <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-400">
                    {entry.program.code}
                  </span>
                </p>
              )}
              <p className="mt-1 text-xs text-slate-700">{entry.summary}</p>

              <p className="mt-0.5 text-[10px] text-slate-500">
                {entry.actor.name}
                {' · '}
                {entry.actor.role.replace(/_/g, ' ').toLowerCase()}
                {entry.onBehalfOf && (
                  <>
                    {' · for '}
                    <span className="font-mono">
                      {entry.onBehalfOf.acronym}
                    </span>
                  </>
                )}
              </p>

              {entry.changes && Object.keys(entry.changes).length > 0 && (
                <table className="mt-1.5 w-full rounded bg-slate-50 text-[11px]">
                  <tbody>
                    {Object.entries(entry.changes).map(([field, delta]) => (
                      <tr key={field}>
                        <td className="px-2 py-1 text-slate-600">{field}</td>
                        <td className="px-2 py-1 text-right font-mono text-slate-400 line-through">
                          {formatValue(delta.from)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono font-medium text-amber-700">
                          {formatValue(delta.to)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ol>
      )}

      {cursor && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void loadMore()}
          disabled={loadingMore}
        >
          {loadingMore ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            'Load older events'
          )}
        </Button>
      )}
    </div>
  );
}
