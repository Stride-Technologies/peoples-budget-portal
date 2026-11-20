'use client';

import { useEffect, useState, useTransition } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SimpleSelect } from '@/components/custom/simple-select';
import { formatPeso } from '@/lib/currency-formatter';
import type { ClusterPublishResult, PublishReadiness } from '@/lib/api';
import {
  loadPublishableCounts,
  previewClusterPublish,
  acknowledgeClusterImports,
  publishCluster,
} from '@/app/aip-registry/_actions';

/**
 * Sentinel for the "every cluster" option. Not a real cluster id, and it cannot
 * collide with one: cluster ids are uuid(7).
 */
const ALL_CLUSTERS = '__all__';

const BLOCKER_TEXT: Record<string, string> = {
  NO_PPAS: 'no PPAs added',
  ZERO_PROPOSED_BUDGET: 'one or more PPAs have no proposed budget',
  ALREADY_PUBLISHED: 'already published',
  NOT_PUBLISHABLE_STATUS: 'not in a publishable state',
  INCOMPLETE_IMPORT: "the workbook import's calls are unconfirmed",
  INCOMPLETE_DATA: 'one or more PPAs are missing required details',
  EMPTY_PARENT_PPA: 'a cost-derived project has no child activities',
};

interface BatchPublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aipCycleId: string;
  clusters: { id: string; name: string }[];
  onPublished?: () => void;
}

/**
 * Batch publish — screen 11.
 *
 * Readiness is a dry run of the **same precondition code** the publish button
 * applies, so this list cannot promise something the button then refuses.
 *
 * Blocked entries are skipped, not failed: one office missing a budget figure
 * must not stop the other eleven from going public.
 */
export default function BatchPublishDialog({
  open,
  onOpenChange,
  aipCycleId,
  clusters,
  onPublished,
}: Readonly<BatchPublishDialogProps>) {
  const [pickedClusterId, setPickedClusterId] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [readiness, setReadiness] = useState<PublishReadiness[] | null>(null);
  const [result, setResult] = useState<ClusterPublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Clusters load asynchronously and this dialog mounts before they arrive, so
  // the default is *derived* rather than seeded into state: seeding it in
  // useState captured '' forever, which left the select showing the first
  // cluster while the fetch below bailed on the empty id — a permanent spinner.
  const clusterId = pickedClusterId || clusters[0]?.id || '';

  // A whole cycle at once. Every action below already takes a list of cluster
  // ids — only the picker was limited to one, which meant publishing a freshly
  // imported book (430 programs across all eight clusters) was eight passes
  // through this dialog, with eight chances to lose track of which was done.
  const isAll = clusterId === ALL_CLUSTERS;
  const selectedIds = isAll ? clusters.map((c) => c.id) : [clusterId];
  // The one dependency the readiness effect needs. `selectedIds` is rebuilt every
  // render, so depending on the array itself would refetch forever; the effect
  // splits this back apart instead. Empty exactly when `clusterId` is, so it
  // also serves as the effect's guard.
  const selectionKey = selectedIds.join(',');
  // The count hint for "All clusters" is the sum of the per-cluster counts, so
  // the menu answers "how many would this publish?" before anything is picked.
  const allCount = Object.values(counts).reduce((sum, n) => sum + n, 0);

  useEffect(() => {
    if (!open || !selectionKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await previewClusterPublish(
          aipCycleId,
          selectionKey.split(','),
        );
        if (cancelled) return;
        if ('error' in res) {
          setError(res.error);
        } else {
          setError(null);
          setReadiness(res.readiness);
        }
      } catch (err) {
        // Never leave the spinner as the only feedback.
        if (!cancelled) setError((err as Error).message ?? 'Failed to check readiness.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, aipCycleId, selectionKey]);

  // Cheap enough to refresh on every open, and it must not go stale after a
  // publish empties a cluster.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const res = await loadPublishableCounts(aipCycleId);
      // A missing count only costs the hint, so a failure here stays silent
      // rather than covering the dialog in an error the user cannot act on.
      if (!cancelled && !('error' in res)) setCounts(res.counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, aipCycleId, result]);

  const ready = readiness?.filter((r) => r.ready) ?? [];
  const blocked = readiness?.filter((r) => !r.ready) ?? [];

  // An imported book leaves rows whose import made a call nobody has confirmed:
  // 47 across the enacted 2026 budget — an uncoded row, a code another sheet
  // also prints, a description printed blank. Confirming one at a time is right
  // for a handful and hopeless for a bookful, so the blocked list offers to
  // confirm the whole selection at once.
  const unconfirmed = blocked.filter((r) =>
    r.blockers.includes('INCOMPLETE_IMPORT'),
  );

  function confirmImports() {
    setError(null);
    startTransition(async () => {
      const res = await acknowledgeClusterImports(aipCycleId, selectedIds);
      if ('error' in res) setError(res.error);
      // Drop the stale list so readiness is re-fetched with the flags cleared.
      else setReadiness(null);
    });
  }

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await publishCluster(aipCycleId, selectedIds);
      if ('error' in res) setError(res.error);
      else {
        setResult(res.result);
        onPublished?.();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setResult(null);
          setError(null);
          setReadiness(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Publish AIP entries</DialogTitle>
          <DialogDescription>
            Ready entries go public. Blocked ones are skipped.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
              Published {result.published.length} entr
              {result.published.length === 1 ? 'y' : 'ies'}.
            </p>
            {result.skipped.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                <p className="font-medium">
                  {result.skipped.length} skipped — still needs work
                </p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {result.skipped.map((s) => (
                    <li key={s.programId}>
                      • {BLOCKER_TEXT[s.reason] ?? s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.failed.length > 0 && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                <p className="font-medium">{result.failed.length} failed</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {result.failed.map((f) => (
                    <li key={f.programId}>• {f.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="batch-cluster"
                  className="text-xs font-medium text-slate-900"
                >
                  Cluster
                </label>
                {/* Names the bare numbers in the menu's right column. */}
                <span className="text-[11px] text-muted-foreground">
                  unpublished
                </span>
              </div>
              <SimpleSelect
                id="batch-cluster"
                options={[
                  // First, so the common case for a freshly imported cycle is
                  // the first thing in the menu.
                  ...(clusters.length > 1
                    ? [
                        {
                          value: ALL_CLUSTERS,
                          label: `All clusters (${clusters.length})`,
                          hint: allCount ? String(allCount) : '—',
                        },
                      ]
                    : []),
                  ...clusters.map((c) => ({
                    value: c.id,
                    label: c.name,
                    hint: counts[c.id] ? String(counts[c.id]) : '—',
                  })),
                ]}
                value={clusterId}
                onChange={(next) => {
                  setPickedClusterId(next);
                  // Drop the previous cluster's list so the count on the publish
                  // button can never belong to a cluster other than the one shown.
                  setReadiness(null);
                }}
                placeholder={clusters.length === 0 ? 'No clusters' : 'Select a cluster'}
                disabled={clusters.length === 0}
              />
            </div>

            {ready.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  <span className="font-medium">
                    This makes {ready.length} AIP entr
                    {ready.length === 1 ? 'y' : 'ies'} public.
                  </span>
                </p>
              </div>
            )}

            {unconfirmed.length > 0 && (
              <div className="flex items-start justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                <p>
                  <span className="font-medium">
                    {unconfirmed.length} entr
                    {unconfirmed.length === 1 ? 'y was' : 'ies were'} imported
                  </span>{' '}
                  and still need the import&rsquo;s calls confirmed before they
                  can be published.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={confirmImports}
                  disabled={isPending}
                  className="shrink-0"
                >
                  Confirm all
                </Button>
              </div>
            )}

            {!clusterId ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No clusters are available to publish.
              </p>
            ) : readiness === null ? (
              <div className="flex justify-center py-6 text-slate-400">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : (
              <div className="rounded-md border border-slate-200">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <h4 className="text-xs font-semibold text-slate-900">
                    Readiness
                  </h4>
                  <Badge variant="secondary" className="font-normal">
                    {ready.length} ready · {blocked.length} blocked
                  </Badge>
                </div>
                <ScrollArea className="max-h-64">
                  <ul className="divide-y">
                    {[...ready, ...blocked].map((r) => (
                      <li
                        key={r.programId}
                        className="flex items-start gap-2 px-3 py-2"
                      >
                        <span
                          aria-hidden
                          className={`mt-1.5 size-2 shrink-0 rounded-full ${r.ready ? 'bg-emerald-500' : 'bg-rose-500'}`}
                        />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-slate-900">
                            {r.name}
                          </p>
                          <p
                            className={`text-[11px] ${r.ready ? 'text-slate-500' : 'text-rose-700'}`}
                          >
                            {r.ready
                              ? `${r.paCount} PPA${r.paCount === 1 ? '' : 's'} · ${formatPeso(r.proposedTotal)}`
                              : r.blockers
                                  .map((b) => BLOCKER_TEXT[b] ?? b)
                                  .join(', ')}
                          </p>
                          {r.ready && r.unresolvedComments > 0 && (
                            <p className="text-[10px] text-slate-400">
                              {r.unresolvedComments} open comment
                              {r.unresolvedComments === 1 ? '' : 's'} —
                              won&rsquo;t block
                            </p>
                          )}
                          {r.warnings.map((w) => (
                            <p key={w} className="text-[10px] text-amber-700">
                              ⚠ {w}
                            </p>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              onClick={run}
              disabled={isPending || ready.length === 0}
              title={
                ready.length === 0 ? 'Nothing in this cluster is ready' : undefined
              }
            >
              {isPending
                ? 'Publishing…'
                : `Publish ${ready.length} entr${ready.length === 1 ? 'y' : 'ies'}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
