'use client';

import { useMemo, useState, useTransition, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import PpmpHeader from '@/components/ppmp/ppmp-header';
import PpmpRegistryControls from '@/components/ppmp/ppmp-registry-controls';
import PpmpMasterList from '@/components/ppmp/ppmp-master-list';
import type { PpmpListRow } from '@/components/ppmp/ppmp-master-list';
import { ProjectOverviewDrawer } from '@/components/ppmp/project-overview-drawer';
import NewProjectDrawer from '@/components/ppmp/new-project-drawer';
import EditProjectDrawer, { type EditableProject } from '@/components/ppmp/edit-project-drawer';
import { groupPpmpsByOffice } from '@/lib/ppmp-grouping';
import {
  writePpmpRegistryFilters,
  type PpmpRegistryFilters,
  type PpmpRegistryTab,
} from '@/lib/ppmp-filter-cookie';
import type { AipCycleRecord, OfficeRecord, PpmpLineItemRecord } from '@/lib/api';
import {
  loadPpmpRegistry,
  loadPpmpLineItems,
  publishAllPpmp,
  type PpmpRegistryRow,
} from './_actions';
import { publishPpmp, unpublishPpmp } from './[id]/_actions';

interface PpmpRegistryClientProps {
  initialFilters: PpmpRegistryFilters;
  initialOffices: OfficeRecord[];
  initialCycles: AipCycleRecord[];
  initialCycleId: string | undefined;
}

export default function PpmpRegistryClient({
  initialFilters,
  initialOffices,
  initialCycles,
  initialCycleId,
}: Readonly<PpmpRegistryClientProps>) {
  const [cycleId, setCycleId] = useState(initialCycleId);
  const [tab, setTab] = useState<PpmpRegistryTab>(initialFilters.tab);
  const [officeId, setOfficeId] = useState(initialFilters.officeId);
  const [search, setSearch] = useState(initialFilters.search);
  const [showBreakdown, setShowBreakdown] = useState(initialFilters.showBreakdown);

  const [rows, setRows] = useState<PpmpRegistryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [publishAllOpen, setPublishAllOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [lineItemsById, setLineItemsById] = useState<
    Record<string, PpmpLineItemRecord[] | undefined>
  >({});
  const [loadingLineItemIds, setLoadingLineItemIds] = useState<Set<string>>(new Set());
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [focusAddLineItem, setFocusAddLineItem] = useState(false);
  const [focusEditLineItemId, setFocusEditLineItemId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<EditableProject | null>(null);

  const refresh = useCallback(async () => {
    if (!cycleId) return;
    setLoading(true);
    const result = await loadPpmpRegistry(cycleId);
    if ('error' in result) {
      setError(result.error);
    } else {
      setError(undefined);
      setRows(result.data);
    }
    setLoading(false);
  }, [cycleId]);

  // Reload whenever the selected cycle changes — mirrors aip-registry's
  // _registry-client.tsx pattern (inline async IIFE + cancellation flag,
  // not a bare call to a setState-calling function, which the set-state-
  // in-effect lint rule flags as a cascading-render risk).
  useEffect(() => {
    if (!cycleId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const result = await loadPpmpRegistry(cycleId);
      if (cancelled) return;
      if ('error' in result) {
        setError(result.error);
      } else {
        setError(undefined);
        setRows(result.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [cycleId]);

  useEffect(() => {
    writePpmpRegistryFilters({ tab, cycleId: cycleId ?? '', officeId, search, showBreakdown });
  }, [tab, cycleId, officeId, search, showBreakdown]);

  const tabCounts = useMemo(
    () => ({
      ALL: rows.length,
      UNPUBLISHED: rows.filter((r) => !r.isPublished).length,
      PUBLISHED: rows.filter((r) => r.isPublished).length,
    }),
    [rows],
  );

  const filteredRows = useMemo(() => {
    let result = rows;
    if (tab === 'UNPUBLISHED') result = result.filter((r) => !r.isPublished);
    if (tab === 'PUBLISHED') result = result.filter((r) => r.isPublished);
    if (officeId !== 'all') result = result.filter((r) => r.officeId === officeId);
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(needle));
    }
    return result;
  }, [rows, tab, officeId, search]);

  const groups = useMemo(
    () =>
      groupPpmpsByOffice<PpmpListRow>(
        filteredRows.map((r) => ({
          id: r.id,
          officeId: r.officeId,
          officeName: r.officeName,
          officeAcronym: r.officeAcronym,
          grandTotal: r.grandTotal,
          classification: r.classification,
          name: r.name,
          fundingProgram: r.fundingProgram,
          status: r.status,
          isPublished: r.isPublished,
          publishedAt: r.publishedAt,
          lineItemCount: r.lineItemCount,
        })),
      ),
    [filteredRows],
  );

  const officeOptions = useMemo(
    () => initialOffices.map((o) => ({ id: o.id, name: o.name, acronym: o.acronym })),
    [initialOffices],
  );

  const handleExpandRow = (id: string) => {
    if (lineItemsById[id] !== undefined || loadingLineItemIds.has(id)) return;
    setLoadingLineItemIds((prev) => new Set(prev).add(id));
    loadPpmpLineItems(id).then((result) => {
      setLoadingLineItemIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (!('error' in result)) {
        setLineItemsById((prev) => ({ ...prev, [id]: result.data }));
      }
    });
  };

  const handlePublish = (id: string) => {
    setBusyId(id);
    startTransition(async () => {
      const result = await publishPpmp(id);
      setBusyId(null);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('PPMP published.');
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...result.ppmp } : r)));
    });
  };

  const handleUnpublish = (id: string) => {
    setBusyId(id);
    startTransition(async () => {
      const result = await unpublishPpmp(id);
      setBusyId(null);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('PPMP unpublished.');
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...result.ppmp } : r)));
    });
  };

  const handleView = (id: string) => {
    setFocusAddLineItem(false);
    setViewingId(id);
  };

  const handleAddLineItem = (id: string) => {
    setFocusAddLineItem(true);
    setViewingId(id);
  };

  const handleEditLineItem = (ppmpId: string, lineItemId: string) => {
    setFocusAddLineItem(false);
    setFocusEditLineItemId(lineItemId);
    setViewingId(ppmpId);
  };

  const handlePublishAll = () => {
    setPublishAllOpen(false);
    startTransition(async () => {
      const result = await publishAllPpmp(
        officeId === 'all' ? undefined : officeId,
        cycleId,
      );
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      const { published, skipped } = result.data;
      toast.success(
        `Published ${published} PPMP${published === 1 ? '' : 's'}` +
          (skipped > 0 ? `; skipped ${skipped} empty` : ''),
      );
      refresh();
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (cycleId) params.set('aipCycleId', cycleId);
      if (officeId !== 'all') params.set('officeId', officeId);
      const res = await fetch(`/api/ppmp/exports/all?${params.toString()}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: 'Export failed.' }));
        throw new Error(payload.error ?? 'Export failed.');
      }
      const filename =
        /filename="([^"]+)"/i.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
        'ppmp-export.xlsx';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error).message ?? 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50/60">
      <PpmpHeader
        cycles={initialCycles}
        selectedCycleId={cycleId}
        onCycleChange={setCycleId}
        onExport={handleExport}
        isExporting={isExporting}
        onPublishAll={() => setPublishAllOpen(true)}
        onNewPpmp={() => setNewProjectOpen(true)}
      />

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <PpmpRegistryControls
            tab={tab}
            tabCounts={tabCounts}
            onTabChange={setTab}
            searchValue={search}
            onSearchValueChange={setSearch}
            officeValue={officeId}
            officeOptions={officeOptions}
            onOfficeValueChange={setOfficeId}
            showBreakdown={showBreakdown}
            onShowBreakdownChange={setShowBreakdown}
          />

          {error && (
            <p className="px-4 py-3 text-sm text-red-600">{error}</p>
          )}

          {loading ? (
            <div className="flex min-h-[30vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <PpmpMasterList
              groups={groups}
              showBreakdown={showBreakdown}
              onPublish={handlePublish}
              onUnpublish={handleUnpublish}
              onView={handleView}
              onAddLineItem={handleAddLineItem}
              onEditLineItem={handleEditLineItem}
              onEditProject={setEditingProject}
              busyId={isPending ? busyId : null}
              lineItemsById={lineItemsById}
              loadingLineItemIds={loadingLineItemIds}
              onExpandRow={handleExpandRow}
            />
          )}
        </div>
      </div>

      <ProjectOverviewDrawer
        ppmpId={viewingId}
        focusAddLineItem={focusAddLineItem}
        focusEditLineItemId={focusEditLineItemId}
        onClose={() => {
          setViewingId(null);
          setFocusAddLineItem(false);
          setFocusEditLineItemId(null);
          void refresh();
        }}
        onDeleted={() => {
          setViewingId(null);
          setFocusAddLineItem(false);
          setFocusEditLineItemId(null);
          setRows((prev) => prev.filter((r) => r.id !== viewingId));
        }}
      />

      <NewProjectDrawer
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreated={(id) => {
          setNewProjectOpen(false);
          toast.success('Project saved.', {
            description: 'Use the + icon to add line items.',
          });
          void refresh();
          setFocusAddLineItem(true);
          setViewingId(id);
        }}
      />

      <EditProjectDrawer
        project={editingProject}
        onClose={() => setEditingProject(null)}
        onSaved={() => {
          setEditingProject(null);
          toast.success('Project updated.');
          // A full reload, not a partial merge — an office change means the
          // row's officeName/officeAcronym (joined in loadPpmpRegistry, not
          // part of the PATCH response) need to change too.
          void refresh();
        }}
      />

      <AlertDialog open={publishAllOpen} onOpenChange={setPublishAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish all ready PPMPs?</AlertDialogTitle>
            <AlertDialogDescription>
              Publishes every unpublished PPMP with at least one line item, within
              the current office filter. Empty PPMPs are skipped, not failed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublishAll}>Publish all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
