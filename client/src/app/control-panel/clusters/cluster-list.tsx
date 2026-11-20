'use client';

import { useActionState, useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronDown, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ClusterRecord } from '@/lib/api';
import { updateCluster, type ActionState } from './_actions';
import { GOAL } from '@/lib/goal-label';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type RenderGroup = {
  finishLines: { id: string; name: string; visionNumber: number | null }[];
  clusters: ClusterRecord[];
  minVision: number;
};

function buildRenderGroups(clusters: ClusterRecord[]): RenderGroup[] {
  // Build finish-line → clusters mapping
  const flMap = new Map<
    string,
    { finishLine: { id: string; name: string; visionNumber: number | null }; clusters: ClusterRecord[] }
  >();
  for (const cluster of clusters) {
    for (const { finishLine } of cluster.finishLineClusters) {
      if (!flMap.has(finishLine.id)) flMap.set(finishLine.id, { finishLine, clusters: [] });
      flMap.get(finishLine.id)!.clusters.push(cluster);
    }
  }

  // Merge finish lines that share the exact same set of clusters
  const renderGroups = new Map<string, RenderGroup>();
  for (const { finishLine, clusters: flClusters } of flMap.values()) {
    const key = flClusters.map((c) => c.id).sort((a, b) => a.localeCompare(b)).join(',');
    if (!renderGroups.has(key)) {
      renderGroups.set(key, { finishLines: [], clusters: flClusters, minVision: Infinity });
    }
    const group = renderGroups.get(key)!;
    group.finishLines.push(finishLine);
    const v = finishLine.visionNumber ?? 999;
    if (v < group.minVision) group.minVision = v;
  }

  return Array.from(renderGroups.values())
    .map((g) => ({
      ...g,
      finishLines: g.finishLines.toSorted((a, b) => (a.visionNumber ?? 999) - (b.visionNumber ?? 999)),
    }))
    .sort((a, b) => a.minVision - b.minVision);
}

// ─── Cluster card ─────────────────────────────────────────────────────────────

function ClusterCard({ cluster }: Readonly<{ cluster: ClusterRecord }>) {
  const [expanded, setExpanded] = useState(false);
  const [editClusterOpen, setEditClusterOpen] = useState(false);

  const [updateState, updateFormAction, isUpdating] = useActionState<ActionState, FormData>(
    async (prevState: ActionState, formData: FormData) => {
      const result = await updateCluster(cluster.id, prevState, formData);
      if (result && 'success' in result) setEditClusterOpen(false);
      return result;
    },
    undefined,
  );

  return (
    <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <span className="font-semibold text-neutral-900">{cluster.name}</span>
          {cluster.fullName && (
            <p className="text-sm text-neutral-500 mt-0.5">{cluster.fullName}</p>
          )}
          <p className="text-xs text-neutral-400 mt-1">
            {cluster.offices.length} office{cluster.offices.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditClusterOpen(true)}
            className="gap-1"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse offices' : 'Expand offices'}
          >
            <ChevronDown
              className={cn('w-4 h-4 transition-transform', expanded && 'rotate-180')}
            />
          </Button>
        </div>
      </div>

      {/* Offices section */}
      {expanded && (
        <div className="border-t border-neutral-200">
          <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Offices
            </p>
            <Link
              href="/control-panel/offices"
              className="text-xs text-blue-600 hover:underline"
            >
              Manage offices
            </Link>
          </div>

          {cluster.offices.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-neutral-400">No offices yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {cluster.offices.map((office) => (
                <li
                  key={office.id}
                  className={cn(
                    'flex items-center justify-between gap-3 px-4 py-2',
                    !office.isActive && 'opacity-50',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-neutral-900 shrink-0">
                      {office.acronym}
                    </span>
                    {office.name !== office.acronym && (
                      <span className="text-sm text-neutral-500 truncate">{office.name}</span>
                    )}
                    {office.officeCode && (
                      <Badge variant="outline" className="text-xs shrink-0 font-mono">
                        {office.officeCode}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Edit cluster dialog */}
      <Dialog open={editClusterOpen} onOpenChange={setEditClusterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Cluster</DialogTitle>
          </DialogHeader>
          <form action={updateFormAction} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700" htmlFor="cluster-name">
                Short name
              </label>
              <Input id="cluster-name" name="name" defaultValue={cluster.name} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700" htmlFor="cluster-fullname">
                Full name
              </label>
              <Input
                id="cluster-fullname"
                name="fullName"
                defaultValue={cluster.fullName ?? ''}
                required
              />
            </div>
            {updateState && 'error' in updateState && (
              <p className="text-sm text-red-600">{updateState.error}</p>
            )}
            <DialogFooter showCloseButton>
              <Button type="submit" disabled={isUpdating}>
                {isUpdating ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ─── Cluster list ─────────────────────────────────────────────────────────────

export default function ClusterList({ clusters }: Readonly<{ clusters: ClusterRecord[] }>) {
  const groups = useMemo(() => buildRenderGroups(clusters), [clusters]);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-neutral-400">No clusters found.</p>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.finishLines.map((fl) => fl.id).join('-')}>
          <div className="mb-3 space-y-1">
            {group.finishLines.map((fl) => (
              <div key={fl.id} className="flex items-baseline gap-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-blue-600 shrink-0">
                  {GOAL} {fl.visionNumber ?? '—'}
                </span>
                <h2 className="text-base font-semibold text-neutral-800">{fl.name}</h2>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {group.clusters.map((cluster) => (
              <ClusterCard key={cluster.id} cluster={cluster} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
