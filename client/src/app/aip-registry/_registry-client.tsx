"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { downloadWithProgress } from '@/lib/download-with-progress';
import AIPHeader from '@/components/aip/aip-header';
import AIPRegistryTabs from '@/components/aip/aip-registry-tabs';
import BatchPublishDialog from '@/components/aip/batch-publish-dialog';
import dynamic from 'next/dynamic';
import { AIPMasterList, type AIPEntry } from '@/components/aip/aip-master-list';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { loadAipRegistry, loadExportMenuState, loadSpecialFunds, loadLbpDocuments, getCurrentUserRole, loadActivityStream, postComment, loadCommentPermission, deleteComment, markProgramSeen, resolveCommentThread, loadProgramPublicFeedback, loadProjectActivityPublicFeedback, loadThematicTagCatalog, createThematicTagForFilter, type ExportMenuState } from './_actions';
import type { LbpExportOptions } from '@/components/aip/lbp-export-dialog';
import { SpecialFundsNotice } from '@/components/aip/special-funds-notice';
import type { SpecialFundRecord } from '@/lib/api';
import type { AipCycleRecord, RegistryTab } from '@/lib/api';
import { useProgramEvents } from '@/lib/sse-client';
import { ProgramReorderDialog, type ReorderTarget } from '@/components/aip/program-reorder-dialog';
import { isEditableProgramStatus } from '@/lib/program-status';
import {
  deepLinkRegistryFilters,
  writeRegistryFilters,
  type RegistryFilters,
} from '@/lib/filter-cookie';
import { parseRegistryPath, registryPath, type RegistryTarget } from '@/lib/registry-paths';
import { goals } from '@/lib/goal-label';


// Drawers are heavy (the program drawer alone is ~1.8k lines) and only render
// once a registry row is opened. Loading them lazily keeps their code out of
// the page's initial bundle and Turbopack's eager compile graph — part of the
// dev-memory fix.
const ProgramOverviewDrawer = dynamic(
  () =>
    import('@/components/aip/program-overview-drawer').then(
      (m) => m.ProgramOverviewDrawer,
    ),
  { ssr: false },
);
const ProjectActivityOverviewDrawer = dynamic(
  () =>
    import('@/components/aip/project-activity-overview-drawer').then(
      (m) => m.ProjectActivityOverviewDrawer,
    ),
  { ssr: false },
);
const NewProgramDrawer = dynamic(
  () => import('@/components/aip/new-program-drawer'),
  { ssr: false },
);
const NewProjectActivityDrawer = dynamic(
  () => import('@/components/aip/new-project-activity-drawer'),
  { ssr: false },
);

/**
 * UI-only state for the in-place create drawers (FR-012/FR-013) — replaces
 * `router.push('/programs/new')` / `.../add-project` / `.../add-activity`.
 * data-model.md's `CreateDrawerState`.
 */
type CreateDrawerState =
  | { kind: 'program' }
  | { kind: 'project' | 'activity'; parentProgramId: string; parentProjectId?: string }
  | null;


/**
 * The registry fetches a whole cycle in one request and groups it by office
 * client-side, rather than paginating rows.
 *
 * Grouping is only correct over the complete set: a page boundary would split an
 * office and repeat its header, and the previous 10-row pages cut straight
 * through a program's project/activity subtree. Matches MAX_PAGE_SIZE in
 * `api/src/aip-registry/aip-registry.service.ts`; if a cycle ever exceeds it the
 * server clamps and the banner below says so rather than silently truncating.
 */
const REGISTRY_FETCH_LIMIT = 1000;

const EMPTY_TAB_COUNTS: Record<RegistryTab, number> = {
  DRAFTS: 0,
  REVISIONS: 0,
  PUBLISHED: 0,
  ARCHIVED: 0,
  ALL: 0,
};


type ClusterOption = {
  id: string;
  name: string;
  offices: { id: string; name: string; acronym: string }[];
};
type FinishLineOption = {
  id: string;
  name: string;
  visionNumber: number | null;
};

export default function AipRegistryClient({
  /** Read from the remembered-filters cookie by the server shell (`[year]/layout.tsx`). */
  savedFilters,
  /**
   * Filter datasets and the resolved default cycle, all fetched by the server
   * shell. `initialCycleId` is the important one: the list effect below is gated
   * on it, so fetching the cycle list on mount instead meant a full round-trip of
   * empty skeleton before the list query could start.
   */
  initialCycles,
  initialClusters,
  initialFinishLines,
  initialCycleId,
}: Readonly<{
  savedFilters: RegistryFilters;
  initialCycles: AipCycleRecord[];
  initialClusters: ClusterOption[];
  initialFinishLines: FinishLineOption[];
  initialCycleId: string | undefined;
}>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadedPath = usePathname();
  // A link to one PPA opens its drawer from the loaded list, so remembered
  // narrowing filters (a search, a tag) must not hide it.
  const [initialFilters] = useState(() =>
    parseRegistryPath(loadedPath)?.target ? deepLinkRegistryFilters(savedFilters) : savedFilters,
  );
  const view = (searchParams.get('view') ?? 'proponent') as 'proponent' | 'approver';
  const selectedOfficeId = searchParams.get('officeId');

  // Server-provided and immutable for the life of the page — plain values, not
  // state, since nothing client-side ever refetches them.
  const cycles = initialCycles;
  const [selectedCycleId, setSelectedCycleId] = useState<string | undefined>(initialCycleId);
  const [searchQuery, setSearchQuery] = useState(initialFilters.search);
  const [tab, setTab] = useState<RegistryTab>(initialFilters.tab);
  const [tabCounts, setTabCounts] = useState<Record<RegistryTab, number>>(EMPTY_TAB_COUNTS);
  const [clusterFilter, setClusterFilter] = useState(initialFilters.clusterId);
  const clusterOptions = initialClusters;
  const [officeFilter, setOfficeFilter] = useState(initialFilters.officeId);
  // With no cluster picked, the office filter still needs a full catalog — the
  // union of every cluster's offices, deduped by id — so it sits beside the
  // thematic-tags filter in one row from the start rather than appearing only
  // once a cluster narrows the list.
  const officeOptions = useMemo(() => {
    if (clusterFilter !== 'all') {
      return clusterOptions.find((c) => c.id === clusterFilter)?.offices ?? [];
    }
    const seen = new Map<string, { id: string; name: string; acronym: string }>();
    for (const cluster of clusterOptions) {
      for (const office of cluster.offices) {
        if (!seen.has(office.id)) seen.set(office.id, office);
      }
    }
    return Array.from(seen.values());
  }, [clusterOptions, clusterFilter]);
  const [finishLineFilter, setFinishLineFilter] = useState<string[]>(initialFilters.finishLineIds);
  const finishLineOptions = initialFinishLines;
  const [thematicTagFilter, setThematicTagFilter] = useState<string[]>(initialFilters.thematicTagIds);
  const [thematicTagOptions, setThematicTagOptions] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let live = true;
    loadThematicTagCatalog().then((res) => {
      if (live && 'catalog' in res) setThematicTagOptions(res.catalog);
    });
    return () => {
      live = false;
    };
  }, []);
  // The combobox calls this when no catalog entry matches what was typed;
  // it owns selecting the result, this just has to create it and make it
  // show up in the catalog so the new chip can resolve a label.
  const handleCreateThematicTag = useCallback(async (name: string) => {
    const result = await createThematicTagForFilter(name);
    if ('error' in result) return { error: result.error };
    setThematicTagOptions((prev) => [...prev, result.tag]);
    return { value: result.tag.id, label: result.tag.name };
  }, []);
  const [selectedProgram, setSelectedProgram] = useState<AIPEntry | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedSubItem, setSelectedSubItem] = useState<AIPEntry | null>(null);
  const [isSubDrawerOpen, setIsSubDrawerOpen] = useState(false);
  const [createDrawer, setCreateDrawer] = useState<CreateDrawerState>(null);

  // Retired full-page routes (FR-012) redirect here with `kind`/`mode`/`open`
  // query params instead (contracts/drawer-ui-contract.md). Consumed once on
  // mount, then stripped via `router.replace` so a reload doesn't re-open the
  // drawer from stale state. A create under a parent only needs that parent's
  // id (AddProjectForm resolves it itself), so it needs no wait on `data`; a
  // `mode=view|edit` deep link to an *existing* record does need the row from
  // `data` to seed the overview drawer, and is handled once `data` loads — see
  // the effect further below.
  useEffect(() => {
    const mode = searchParams.get('mode');
    const kind = searchParams.get('kind');
    const open = searchParams.get('open');
    if (mode !== 'create') return;

    let next: CreateDrawerState = null;
    if (!open && (kind === 'program' || !kind)) {
      next = { kind: 'program' };
    } else if (open && kind === 'project') {
      next = { kind: 'project', parentProgramId: open };
    } else if (open && kind === 'activity') {
      // parentProgramId is unknown from this URL alone and unused for an
      // activity (NewProjectActivityDrawer resolves the program from
      // parentProjectId) — the empty string is a don't-care placeholder.
      next = { kind: 'activity', parentProgramId: '', parentProjectId: open };
    }
    if (!next) return;

    // Deferred a tick, same as the drawer's own detail-clear effect below —
    // avoids react-hooks/set-state-in-effect's synchronous-setState warning.
    queueMicrotask(() => setCreateDrawer(next));
    const params = new URLSearchParams(searchParams.toString());
    params.delete('mode');
    params.delete('kind');
    params.delete('open');
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    // Only ever consumed once, from the URL this page was loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showBreakdown, setShowBreakdown] = useState(initialFilters.showBreakdown);
  const [data, setData] = useState<AIPEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget | null>(null);
  const [canAudit, setCanAudit] = useState(false);
  const [batchPublishOpen, setBatchPublishOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  const [currentUserOfficeId, setCurrentUserOfficeId] = useState<string | null>(null);

  // Phase 1: there is no approver view — the LFC gate is dormant (§3.5), so the
  // proponent/approver toggle has nothing to switch between.
  const showViewToggle = false;

  const handleViewChange = (newView: 'proponent' | 'approver') => {
    if (newView === view) return;
    setIsDrawerOpen(false);
    setIsSubDrawerOpen(false);
    setSelectedSubItem(null);
    const base = window.location.pathname.split('/program/')[0];
    router.replace(newView === 'proponent' ? base : `${base}?view=approver`);
  };

  const handleNewProgram = () => {
    setCreateDrawer({ kind: 'program' });
  };
  const [rawStatus, setRawStatus] = useState<Record<string, string>>({});
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [recentlyChanged, setRecentlyChanged] = useState<Set<string>>(new Set());
  const [drawerRefreshKey, setDrawerRefreshKey] = useState(0);
  const [exportMenuState, setExportMenuState] = useState<ExportMenuState | null>(null);
  const [specialFunds, setSpecialFunds] = useState<SpecialFundRecord[]>([]);
  useEffect(() => {
    if (!selectedCycleId) return;
    let live = true;
    loadSpecialFunds(selectedCycleId).then((rows) => live && setSpecialFunds(rows));
    return () => {
      live = false;
    };
  }, [selectedCycleId]);
  const [lbpDocuments, setLbpDocuments] = useState<Array<{ id: string; label: string }>>([]);
  const lbpYear = cycles.find((c) => c.id === selectedCycleId)?.fiscalYear;
  useEffect(() => {
    if (!lbpYear) return;
    let live = true;
    loadLbpDocuments(lbpYear).then((rows) => live && setLbpDocuments(rows));
    return () => {
      live = false;
    };
  }, [lbpYear]);
  const [isExporting, setIsExporting] = useState(false);
  const [, startSubmit] = useTransition();
  const [totalItems, setTotalItems] = useState(0);
  const [aggregateTotals, setAggregateTotals] = useState<{ ps: string; mooe: string; fe?: string; co: string; total: string } | undefined>(undefined);
  const [listSummary, setListSummary] = useState<{ totalItems: number; officeCount: number } | null>(null);

  // ─── Remembered filters ───────────────────────────────────────────────────
  // State above is seeded straight from `initialFilters`, which the server shell
  // parsed out of the cookie — so the first paint is already filtered and there
  // is no restore effect to repaint it.
  //
  // Stale ids are *derived*, not written back: a finish line or cluster can be
  // deleted while a cookie still names it, and filtering by an id with no visible
  // chip would show an empty list for no apparent reason. Options arriving empty
  // means "not loaded yet", so nothing is dropped until they are known.
  const liveFinishLineFilter = useMemo(
    () =>
      finishLineOptions.length === 0
        ? finishLineFilter
        : finishLineFilter.filter((id) => finishLineOptions.some((fl) => fl.id === id)),
    [finishLineFilter, finishLineOptions],
  );
  const liveThematicTagFilter = useMemo(
    () =>
      thematicTagOptions.length === 0
        ? thematicTagFilter
        : thematicTagFilter.filter((id) => thematicTagOptions.some((t) => t.id === id)),
    [thematicTagFilter, thematicTagOptions],
  );
  const liveClusterFilter =
    clusterOptions.length === 0 || clusterFilter === 'all' ||
    clusterOptions.some((c) => c.id === clusterFilter)
      ? clusterFilter
      : 'all';
  const liveOfficeFilter =
    clusterOptions.length === 0 || officeFilter === 'all' ||
    (liveClusterFilter === clusterFilter && officeOptions.some((o) => o.id === officeFilter))
      ? officeFilter
      : 'all';

  useEffect(() => {
    writeRegistryFilters({
      tab,
      // Empty until the cycle list lands; the shell treats that as "no
      // preference" and the open cycle wins.
      cycleId: selectedCycleId ?? '',
      clusterId: liveClusterFilter,
      officeId: liveOfficeFilter,
      finishLineIds: liveFinishLineFilter,
      thematicTagIds: liveThematicTagFilter,
      search: searchQuery,
      showBreakdown,
      // Still written so the cookie round-trips, but the registry no longer
      // paginates — the grouped view discloses by office instead.
      pageSize: initialFilters.pageSize,
    });
  }, [tab, selectedCycleId, liveClusterFilter, liveOfficeFilter, liveFinishLineFilter, liveThematicTagFilter, searchQuery, showBreakdown, initialFilters.pageSize]);

  const refreshData = async (submittedId?: string) => {
    const result = await loadAipRegistry({
      tab: view === 'approver' ? 'ALL' : tab,
      cycleId: selectedCycleId,
      clusterId: view === 'approver' ? undefined : (liveClusterFilter === 'all' ? undefined : liveClusterFilter),
      finishLineIds: liveFinishLineFilter.length > 0 ? liveFinishLineFilter : undefined,
      thematicTagIds: liveThematicTagFilter.length > 0 ? liveThematicTagFilter : undefined,
      officeId: view === 'approver' ? (selectedOfficeId ?? undefined) : (liveOfficeFilter === 'all' ? undefined : liveOfficeFilter),
      search: searchQuery || undefined,
      pageSize: REGISTRY_FETCH_LIMIT,
    });
    if ('entries' in result) {
      setData(result.entries);
      setRawStatus(result.rawStatus);
      setTabCounts(result.tabCounts);
      setUnreadIds(new Set(result.unreadIds));
      setTotalItems(result.total);
      setAggregateTotals(result.aggregateTotals);
      if (submittedId && selectedProgram?.id === submittedId) {
        const updated = result.entries.find(e => e.id === submittedId);
        if (updated) setSelectedProgram(updated);
      }
    }
  };

  // Reload whenever the active tab, selected cycle, filters, or page changes.
  useEffect(() => {
    // Skip until the cycle list has loaded and a default has been selected.
    if (!selectedCycleId) return;
    let cancelled = false;
    void (async () => {
      // In approver view, skip the data load when no office is selected.
      if (view === 'approver' && !selectedOfficeId) {
        setData([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const result = await loadAipRegistry({
        tab: view === 'approver' ? 'ALL' : tab,
        cycleId: selectedCycleId,
        clusterId: view === 'approver' ? undefined : (liveClusterFilter === 'all' ? undefined : liveClusterFilter),
        finishLineIds: liveFinishLineFilter.length > 0 ? liveFinishLineFilter : undefined,
        thematicTagIds: liveThematicTagFilter.length > 0 ? liveThematicTagFilter : undefined,
        officeId: view === 'approver' ? selectedOfficeId! : (liveOfficeFilter === 'all' ? undefined : liveOfficeFilter),
        search: searchQuery || undefined,
        pageSize: REGISTRY_FETCH_LIMIT,
      });
      if (cancelled) return;
      if ('entries' in result) {
        setData(result.entries);
        setRawStatus(result.rawStatus);
        setTabCounts(result.tabCounts);
        setUnreadIds(new Set(result.unreadIds));
        setTotalItems(result.total);
        setAggregateTotals(result.aggregateTotals);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, selectedCycleId, liveClusterFilter, liveOfficeFilter, liveFinishLineFilter, liveThematicTagFilter, searchQuery, view, selectedOfficeId]);

  useEffect(() => {
    getCurrentUserRole().then((roleResult) => {
      if ('role' in roleResult) {
        setUserRole(roleResult.role);
        setCurrentUserId(roleResult.userId);
        setCurrentUserOfficeId(roleResult.officeId);
        setCanPublish(roleResult.canPublish);
        setCanWrite(roleResult.canWrite);
        setCanAudit(roleResult.canAudit);
      }
    });
    // Cycles, clusters and finish lines are seeded from the server shell — the
    // list fetch is gated on `selectedCycleId`, so fetching them here made the
    // page wait a whole round-trip before it could even ask for the list.
    loadExportMenuState().then((result) => {
      if (!('error' in result)) setExportMenuState(result);
    });
    // Mount-only: the export menu depends on role, which cannot change in place.
  }, []);

  // Live updates: refetch on any program nudge, flag the row as changed, and
  // refresh the open drawer's activity stream when the nudge targets it.
  const refreshDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useProgramEvents((event) => {
    setRecentlyChanged((prev) => new Set(prev).add(event.programId));
    setTimeout(() => {
      setRecentlyChanged((prev) => {
        const next = new Set(prev);
        next.delete(event.programId);
        return next;
      });
    }, 4000);
    if (event.programId === selectedProgram?.id) {
      setDrawerRefreshKey((k) => k + 1);
    }
    // Debounce the refetch so a burst of nudges collapses into one load. Longer
    // than it was: a refetch is now the whole cycle rather than one page of ten,
    // so a busy afternoon of edits should not re-pull ~1,900 rows per keystroke.
    if (refreshDebounce.current) clearTimeout(refreshDebounce.current);
    refreshDebounce.current = setTimeout(() => {
      void refreshData();
    }, 2000);
  });

  // Cancel a pending debounced refetch on unmount.
  useEffect(
    () => () => {
      if (refreshDebounce.current) clearTimeout(refreshDebounce.current);
    },
    [],
  );
  /**
   * One toast for both exports, moving through the phases the download actually
   * has. A byte percentage alone would be misleading here: almost all of the
   * wait is the server building the file, during which no bytes exist to count,
   * so a bar would sit at 0% and then snap to 100%. Naming the phase is what
   * makes the wait legible; the percentage is a bonus once bytes are flowing.
   */
  const runDownload = (
    url: string,
    labels: { preparing: string; fallbackFilename: string; fallbackError: string },
  ) => {
    if (!selectedCycleId) {
      toast.error('Select an AIP cycle before exporting.');
      return;
    }
    setIsExporting(true);
    const toastId = toast.loading(labels.preparing);
    startSubmit(async () => {
      try {
        const filename = await downloadWithProgress(url, {
          fallbackFilename: labels.fallbackFilename,
          fallbackError: labels.fallbackError,
          onProgress: ({ phase, percent, receivedBytes }) => {
            if (phase === 'preparing') {
              toast.loading(labels.preparing, { id: toastId });
              return;
            }
            toast.loading(
              percent === null
                ? `Downloading… ${(receivedBytes / 1024).toFixed(0)} KB`
                : `Downloading… ${percent}%`,
              { id: toastId },
            );
          },
        });
        toast.success(`Downloaded ${filename}`, { id: toastId });
      } catch (error) {
        toast.error((error as Error).message ?? labels.fallbackError, {
          id: toastId,
        });
      } finally {
        setIsExporting(false);
      }
    });
  };

  /**
   * The city's Annual Budget sheet, as Word. Whole book unless an office is
   * named.
   */
  const handleAnnualBudgetExport = (officeId?: string) => {
    const params = new URLSearchParams({ cycleId: selectedCycleId ?? '' });
    if (officeId) params.set('officeId', officeId);
    runDownload(`/api/aip-registry/exports/annual-budget?${params.toString()}`, {
      preparing: officeId
        ? 'Preparing the Annual Budget sheet…'
        : 'Preparing the Annual Budget book…',
      fallbackFilename: 'annual-budget.docx',
      fallbackError: 'Failed to export the Annual Budget.',
    });
  };

  const handleClusterExport = (clusterId?: string) => {
    // A cluster workbook takes a few seconds to build server-side (the City
    // Engineer's sheet alone is ~180 rows), which is exactly the wait the
    // preparing phase exists to name.
    const label =
      clusterOptions.find((cluster) => cluster.id === clusterId)?.name ??
      'cluster';
    const params = new URLSearchParams({ cycleId: selectedCycleId ?? '' });
    if (clusterId) params.set('clusterId', clusterId);
    runDownload(`/api/aip-registry/exports/cluster?${params.toString()}`, {
      preparing: `Preparing the ${label} workbook…`,
      fallbackFilename: 'aip-cluster-export.xlsx',
      fallbackError: 'Failed to export workbook.',
    });
  };

  /**
   * The whole city AIP: a sheet per sector group, then a funding-source
   * breakdown. Every office at once, so the build is the longest of the three —
   * which is the wait the preparing phase names.
   */
  const handleCompleteExport = () => {
    const params = new URLSearchParams({ cycleId: selectedCycleId ?? '' });
    runDownload(`/api/aip-registry/exports/complete?${params.toString()}`, {
      preparing: 'Preparing the complete AIP workbook…',
      fallbackFilename: 'aip-complete-export.xlsx',
      fallbackError: 'Failed to export the complete AIP.',
    });
  };

  /**
   * LBP Forms 4 and 7 (specs/008): read-only workbooks for one fund, working
   * or published figures. Office scope is enforced by the API.
   */
  const handleLbpExport = ({ form, officeId, fund, figures, documentId }: LbpExportOptions) => {
    const params = new URLSearchParams({ cycleId: selectedCycleId ?? '', fund, figures });
    if (documentId) params.set('documentId', documentId);
    if (officeId) params.set('officeId', officeId);
    runDownload(`/api/aip-registry/exports/lbp/lbp-form-${form}?${params.toString()}`, {
      preparing: `Preparing LBP Form ${form}…`,
      fallbackFilename: `lbp-form-${form}.xlsx`,
      fallbackError: `Failed to export LBP Form ${form}.`,
    });
  };
  const lbpOffices = clusterOptions
    .flatMap((cluster) => cluster.offices)
    .map((office) => ({ id: office.id, label: `${office.acronym} — ${office.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // HEAD and SUPER_ADMIN see implementing-office-only when an office filter is
  // active (the backend returned implementing+supporting via OR; we strip supporting here).
  // In approver view, always filter to the selected implementing office only.
  // The public PA-feedback endpoint is nested under the program, but the PA
  // drawer only knows its own id — so bind the parent here. Undefined parent
  // means no tab rather than a request that could never resolve.
  const makePaFeedbackLoader = useCallback(
    (programId: string | undefined) =>
      programId
        ? (paId: string) => loadProjectActivityPublicFeedback(programId, paId)
        : undefined,
    [],
  );

  const editableProgramIds = useMemo(
    () => new Set(Object.entries(rawStatus).filter(([, s]) => isEditableProgramStatus(s)).map(([id]) => id)),
    [rawStatus],
  );

  // The office filter is applied server-side and matches the owning office only,
  // so there is nothing left to strip here. The previous post-filter ran for HEAD
  // and SUPER_ADMIN but not STAFF, which made the same query return different rows
  // per role and could shrink a page below the range its own footer claimed.

  const handleViewProgram = (id: string) => {
    // Find the program in the data
    const findProgram = (entries: AIPEntry[]): AIPEntry | null => {
      for (const entry of entries) {
        if (entry.id === id && entry.ppa_type === 'Program') {
          return entry;
        }
        if (entry.children) {
          const found = findProgram(entry.children);
          if (found) return found;
        }
      }
      return null;
    };

    const program = findProgram(data);
    if (program) {
      setSelectedProgram(program);
      setIsDrawerOpen(true);
      // Opening the drawer clears the unread dot for this program.
      setUnreadIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      void markProgramSeen(id);
    }
  };

  const handleViewProject = (id: string) => {
    // Find the project in the data
    const findProject = (entries: AIPEntry[]): AIPEntry | null => {
      for (const entry of entries) {
        if (entry.id === id && entry.ppa_type === 'Project') {
          return entry;
        }
        if (entry.children) {
          const found = findProject(entry.children);
          if (found) return found;
        }
      }
      return null;
    };

    const project = findProject(data);
    if (project) {
      setSelectedProgram(project);
      setIsDrawerOpen(true);
    }
  };

  const handleViewActivity = (id: string) => {
    // Find the activity in the data
    const findActivity = (entries: AIPEntry[]): AIPEntry | null => {
      for (const entry of entries) {
        if (entry.id === id && entry.ppa_type === 'Activity') {
          return entry;
        }
        if (entry.children) {
          const found = findActivity(entry.children);
          if (found) return found;
        }
      }
      return null;
    };

    const activity = findActivity(data);
    if (activity) {
      setSelectedProgram(activity);
      setIsDrawerOpen(true);
    }
  };

  // Helper to find parent program for a project or activity
  const findParentProgramId = (itemId: string): string | undefined => {
    const search = (entries: AIPEntry[]): string | undefined => {
      for (const entry of entries) {
        if (entry.ppa_type === 'Program' && entry.children) {
          for (const child of entry.children) {
            if (child.id === itemId) {
              return entry.id;
            }
            // For activities, check projects
            if (child.children) {
              for (const grandchild of child.children) {
                if (grandchild.id === itemId) {
                  return entry.id;
                }
              }
            }
          }
        }
      }
      return undefined;
    };
    return search(data);
  };

  // Helper to find the full parent program object
  const findParentProgram = (itemId: string): AIPEntry | undefined => {
    const search = (entries: AIPEntry[]): AIPEntry | undefined => {
      for (const entry of entries) {
        if (entry.ppa_type === 'Program' && entry.children) {
          for (const child of entry.children) {
            if (child.id === itemId) {
              return entry;
            }
            // For activities, check projects
            if (child.children) {
              for (const grandchild of child.children) {
                if (grandchild.id === itemId) {
                  return entry;
                }
              }
            }
          }
        }
      }
      return undefined;
    };
    return search(data);
  };

  // Helper to find the intermediate parent project for an activity nested under a project
  const findParentProject = (activityId: string): AIPEntry | undefined => {
    const search = (entries: AIPEntry[]): AIPEntry | undefined => {
      for (const entry of entries) {
        if (entry.ppa_type === 'Project' && entry.children) {
          for (const child of entry.children) {
            if (child.id === activityId) return entry;
          }
        }
        if (entry.children) {
          const found = search(entry.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    return search(data);
  };

  // Helper to find any entry by ID anywhere in the tree
  const findEntryById = (id: string, entries: AIPEntry[] = data): AIPEntry | undefined => {
    for (const entry of entries) {
      if (entry.id === id) return entry;
      if (entry.children) {
        const found = findEntryById(id, entry.children);
        if (found) return found;
      }
    }
    return undefined;
  };

  // ── The path is the source of truth for which drawer is open ──────────────
  // `/aip-registry/<year>[/program/<id>[/<paId>]][/edit]` (lib/registry-paths.ts).
  // Opening, closing and editing push a history entry; Back/Forward re-derive the
  // drawers from the path. Both directions go through `history` (no server
  // round-trip). The path is tracked here from `popstate` and our own writes:
  // usePathname missed some Back steps once a server action had revalidated.
  const [pathname, setPathname] = useState(loadedPath);
  useEffect(() => {
    const sync = () => {
      setPathname(window.location.pathname);
      // The create drawer (New Program / Add Project / Add Activity) has no
      // path of its own, so Back/Forward can't know to close it — left open,
      // it stays stacked underneath whatever Overview drawer the path-sync
      // effect below opens for the history entry just landed on. Each
      // create form autosaves to its own localStorage draft, so closing it
      // here loses nothing.
      setCreateDrawer(null);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const go = (url: string, replace = false) => {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    setPathname(window.location.pathname);
  };
  // Which row is in edit mode — set by the drawers' Edit/Cancel/Save and by a `/edit` path.
  const [editId, setEditId] = useState<string | null>(null);
  const reportMode = (id: string) => (mode: 'view' | 'edit') =>
    setEditId((prev) => (mode === 'edit' ? id : prev === id ? null : prev));
  const closeDrawers = () => {
    setIsDrawerOpen(false);
    setIsSubDrawerOpen(false);
    setSelectedSubItem(null);
    setEditId(null);
  };
  // The program a link named, highlighted for the whole visit.
  const [linkedProgramId] = useState(() => parseRegistryPath(pathname)?.target?.programId ?? null);

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId);
  const cycleYear = selectedCycle?.fiscalYear;
  const programIdOf = (entry: AIPEntry) =>
    entry.ppa_type === 'Program' ? entry.id : (entry.programId ?? findParentProgramId(entry.id));
  // Whichever row is actually on screen in a drawer right now — the PA
  // stacked on top of its program when both are open, else the program alone.
  // Drives the registry table's row highlight as well as the URL sync below.
  const openEntry = isSubDrawerOpen && selectedSubItem ? selectedSubItem : isDrawerOpen ? selectedProgram : null;
  const openTarget = ((): RegistryTarget | null => {
    const top = openEntry;
    if (!top) return null;
    const programId = top === selectedSubItem && selectedProgram?.ppa_type === 'Program'
      ? selectedProgram.id
      : programIdOf(top);
    if (!programId) return null;
    return {
      programId,
      ...(top.ppa_type === 'Program' ? {} : { paId: top.id }),
      ...(editId === top.id ? { edit: true } : {}),
    };
  })();
  const openPath = cycleYear ? registryPath(cycleYear, openTarget) : null;

  // Flattened, depth-first row order — program, then each of its
  // projects/activities in place — matching exactly how AIPMasterList renders
  // them. Lets the drawer's peek-navigation arrows step through the table
  // without needing their own notion of grouping or sort order.
  const flatEntries = useMemo(() => {
    const out: AIPEntry[] = [];
    const visit = (entry: AIPEntry) => {
      out.push(entry);
      entry.children?.forEach(visit);
    };
    data.forEach(visit);
    return out;
  }, [data]);
  const openIndex = openEntry ? flatEntries.findIndex((e) => e.id === openEntry.id) : -1;
  const canNavigatePrev = openIndex > 0;
  const canNavigateNext = openIndex >= 0 && openIndex < flatEntries.length - 1;
  const navigateDrawer = (direction: 1 | -1) => {
    if (openIndex < 0) return;
    const next = flatEntries[openIndex + direction];
    if (!next) return;
    const wasEditing = !!openEntry && editId === openEntry.id;
    if (isSubDrawerOpen) {
      if (next.ppa_type === 'Program') {
        // Walked up onto the program row itself — it has no stacked drawer
        // of its own, so it becomes the primary one.
        setIsSubDrawerOpen(false);
        setSelectedSubItem(null);
        setSelectedProgram(next);
      } else {
        setSelectedSubItem(next);
        const parentId = next.programId ?? findParentProgramId(next.id);
        const parent = parentId ? findEntryById(parentId) : undefined;
        if (parent) setSelectedProgram(parent);
      }
    } else {
      setSelectedProgram(next);
    }
    setEditId(wasEditing ? next.id : null);
  };

  // Until the path this page was loaded with (or navigated back to) has been
  // applied, the drawers say nothing yet — writing them out would erase it.
  const urlPending = useRef(true);

  useEffect(() => {
    if (!openPath || urlPending.current || openPath === window.location.pathname) return;
    go(openPath + window.location.search);
  }, [openPath]);

  useEffect(() => {
    if (isLoading || !openPath) return;
    if (pathname === openPath) {
      urlPending.current = false;
      return;
    }
    const parsed = parseRegistryPath(pathname);
    if (!parsed) return;
    urlPending.current = true;
    const target = parsed.target;
    queueMicrotask(() => {
      // Back/Forward across years: load that year first; this runs again once it is in.
      const cycle = parsed.year !== cycleYear ? cycles.find((c) => c.fiscalYear === parsed.year) : undefined;
      if (cycle) {
        setIsLoading(true);
        setSelectedCycleId(cycle.id);
        closeDrawers();
        return;
      }
      urlPending.current = false;
      if (!target) {
        closeDrawers();
        return;
      }
      const entry = findEntryById(target.paId ?? target.programId);
      if (!entry) {
        // Deleted, filtered out, or not ours to see: stay on the year page.
        go(registryPath(parsed.year) + window.location.search, true);
        closeDrawers();
        return;
      }
      setEditId(target.edit ? entry.id : null);
      if (!target.paId) {
        handleViewProgram(entry.id);
        setIsSubDrawerOpen(false);
        setSelectedSubItem(null);
      } else if (isDrawerOpen && selectedProgram?.id === target.programId) {
        // Back/Forward within an open program: the PPA stacks on it, as when clicked there.
        setSelectedSubItem(entry);
        setIsSubDrawerOpen(true);
      } else {
        setSelectedProgram(entry);
        setIsDrawerOpen(true);
        setIsSubDrawerOpen(false);
        setSelectedSubItem(null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers are recreated every render; runs when the path or the list changes
  }, [pathname, isLoading, data]);

  const handleAddProject = (programId: string) => {
    setCreateDrawer({ kind: 'project', parentProgramId: programId });
  };

  const handleAddActivity = (parentProjectId: string, parentProgramId?: string) => {
    const resolvedProgramId = parentProgramId ?? findParentProgramId(parentProjectId);
    if (!resolvedProgramId) return;
    setCreateDrawer({ kind: 'activity', parentProgramId: resolvedProgramId, parentProjectId });
  };

  const handleCreateDrawerSaved = (_id: string) => {
    setCreateDrawer(null);
    setDrawerRefreshKey((k) => k + 1);
    void refreshData();
  };
  // The drawer closes itself (`NewProjectActivityDrawer`'s `onCreateSuccess`
  // calls `onClose`) and shows its own success toast; this just refreshes.
  const handlePaCreated = () => {
    setDrawerRefreshKey((k) => k + 1);
    void refreshData();
  };

  const subItemParentProject = selectedSubItem ? findParentProject(selectedSubItem.id) : undefined;

  return (
    <div className="flex min-h-full flex-col bg-slate-50/60">
      <AIPHeader
        onNewProgram={view === 'proponent' && canWrite ? handleNewProgram : undefined}
        onBatchPublish={canPublish ? () => setBatchPublishOpen(true) : undefined}
        exportMenu={
          exportMenuState
            ? {
                ...exportMenuState,
                onExportCluster: handleClusterExport,
                onExportAnnualBudget: handleAnnualBudgetExport,
                onExportComplete: handleCompleteExport,
                onExportLbp: handleLbpExport,
                lbpOffices,
                lbpDocuments,
                isExporting,
              }
            : undefined
        }
        cycles={cycles}
        selectedCycleId={selectedCycleId}
        onCycleChange={(id) => {
          if (id === selectedCycleId) return;
          const year = cycles.find((c) => c.id === id)?.fiscalYear;
          setIsLoading(true);
          setSelectedCycleId(id);
          closeDrawers();
          // The year is in the path: changing it is a new history entry, with no server round-trip.
          if (year) {
            const search = view === 'approver' && selectedOfficeId ? '?view=approver' : window.location.search;
            go(registryPath(year) + search);
          }
        }}
      />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-5 empty:hidden">
          <SpecialFundsNotice funds={specialFunds} />
          {selectedCycle?._count.programs === 0 &&
            (selectedCycle.status === 'ADOPTED' || selectedCycle.status === 'LOCKED') && (
              <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                FY{selectedCycle.fiscalYear} has no AIP programs here. Its enacted budget is kept as a
                budget document:{' '}
                <Link href="/budget-cycles" className="font-medium text-blue-700 hover:underline">
                  Budget documents
                </Link>
                .
              </p>
            )}
        </div>
        {showViewToggle && (
          <div className="mb-5 flex w-full items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 sm:w-auto">
            <button
              onClick={() => handleViewChange('proponent')}
              className={cn(
                'flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:flex-none',
                view === 'proponent'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              Proponent
            </button>
            <button
              onClick={() => handleViewChange('approver')}
              className={cn(
                'flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:flex-none',
                view === 'approver'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              Approver
            </button>
          </div>
        )}
        {(
          <Card className="overflow-hidden rounded-lg border-slate-200 bg-white shadow-sm">
            {(
              <AIPRegistryTabs
                tab={tab}
                canPublish={canPublish}
                tabCounts={tabCounts}
                onTabChange={(next) => {
                  if (next === tab) return;
                  setIsLoading(true);
                  setTab(next);
                  setIsDrawerOpen(false);
                  setIsSubDrawerOpen(false);
                  setSelectedSubItem(null);
                }}
                searchValue={searchQuery}
                onSearchValueChange={setSearchQuery}
                clusterValue={liveClusterFilter}
                clusterOptions={clusterOptions}
                onClusterValueChange={(next) => {
                  setIsLoading(true);
                  setClusterFilter(next);
                  setOfficeFilter('all');
                }}
                officeValue={liveOfficeFilter}
                officeOptions={officeOptions}
                onOfficeValueChange={(next) => {
                  setIsLoading(true);
                  setOfficeFilter(next);
                }}
                finishLineValues={liveFinishLineFilter}
                finishLineOptions={finishLineOptions}
                onFinishLineValuesChange={(next) => {
                  setIsLoading(true);
                  setFinishLineFilter(next);
                }}
                thematicTagValues={liveThematicTagFilter}
                thematicTagOptions={thematicTagOptions}
                onThematicTagValuesChange={(next) => {
                  setIsLoading(true);
                  setThematicTagFilter(next);
                }}
                onThematicTagCreate={handleCreateThematicTag}
                showBreakdown={showBreakdown}
                onShowBreakdownChange={setShowBreakdown}
                searchPlaceholder={`Search PPAs, codes, ${goals}, or tags`}
                summary={listSummary}
              />
            )}
            <div
              id="aip-tabpanel"
              role="tabpanel"
              aria-labelledby={`tab-${tab}`}
            >
              {isLoading ? (
                <SkeletonTable />
              ) : (
                <AIPMasterList
                  data={data}
                  searchTerm={searchQuery}
                  emptyStateMessage={view === 'approver' && selectedOfficeId ? 'No programs found for this office.' : undefined}
                  hasActiveFilters={
                    view === 'approver'
                      ? liveFinishLineFilter.length > 0 ||
                        liveThematicTagFilter.length > 0 ||
                        searchQuery.trim() !== ''
                      : liveClusterFilter !== 'all' ||
                        liveOfficeFilter !== 'all' ||
                        liveFinishLineFilter.length > 0 ||
                        liveThematicTagFilter.length > 0 ||
                        searchQuery.trim() !== ''
                  }
                  onViewProgram={handleViewProgram}
                  onViewProject={handleViewProject}
                  onViewActivity={handleViewActivity}
                  onAddProject={view === 'proponent' && canWrite ? handleAddProject : undefined}
                  onAddActivity={view === 'proponent' && canWrite ? handleAddActivity : undefined}
                  editableProgramIds={view === 'proponent' ? editableProgramIds : undefined}
                  showBreakdown={showBreakdown}
                  showProposed={false}
                  // The registry query orders by office → papClass → orderIndex,
                  // which is what lets the table group by run-length and read the
                  // way the printed AIP does.
                  groupByOffice
                  disableAutoExpand
                  unreadIds={unreadIds}
                  recentlyChangedIds={recentlyChanged}
                  highlightedId={openEntry?.id ?? linkedProgramId}
                  ensureVisibleId={openEntry?.id ?? linkedProgramId}
                  totalItems={totalItems}
                  aggregateTotals={aggregateTotals}
                  onSummaryChange={setListSummary}
                  onReorderSection={
                    view === 'proponent' && canWrite && selectedCycleId
                      ? (section) =>
                          setReorderTarget({
                            cycleId: selectedCycleId,
                            officeId: section.officeId,
                            officeLabel: section.officeLabel,
                            papClass: section.papClass,
                            sectionLabel: section.label,
                          })
                      : undefined
                  }
                />
              )}
            </div>
          </Card>
        )}
      </main>

      <ProgramReorderDialog
        target={reorderTarget}
        onClose={() => setReorderTarget(null)}
        onSaved={() => void refreshData()}
      />

      {/* Program drawer — always rendered once a program row is selected */}
      {selectedProgram && selectedProgram.ppa_type === 'Program' && (
        <ProgramOverviewDrawer
          isOpen={isDrawerOpen}
          program={selectedProgram}
          initialMode={editId === selectedProgram.id ? 'edit' : 'view'}
          onModeChange={reportMode(selectedProgram.id)}
          onClose={closeDrawers}
          onAddProject={view === 'proponent' && canWrite ? handleAddProject : undefined}
          onAddActivityForProject={view === 'proponent' && canWrite ? handleAddActivity : undefined}
          rawProgramStatus={rawStatus[selectedProgram.id] ?? ''}
          canPublish={canPublish}
          canWrite={canWrite}
          canAudit={canAudit}
          isSuperAdmin={userRole === 'SUPER_ADMIN'}
          onPublishChanged={() => { void refreshData(); }}
          currentUserId={currentUserId}
          currentUserOfficeId={currentUserOfficeId}
          loadActivityStream={loadActivityStream}
          postComment={postComment}
          loadCommentPermission={loadCommentPermission}
          deleteComment={deleteComment}
          resolveComment={resolveCommentThread}
          activityRefreshKey={drawerRefreshKey}
          onDeleteSuccess={() => { setIsDrawerOpen(false); void refreshData(); }}
          onOpenSubItem={(item) => { setSelectedSubItem(item); setIsSubDrawerOpen(true); }}
          loadPublicFeedback={loadProgramPublicFeedback}
          onNavigate={navigateDrawer}
          canNavigatePrev={canNavigatePrev}
          canNavigateNext={canNavigateNext}
        />
      )}

      {/* canWrite here too: the retired create routes redirect into these
          drawers for anyone, while the buttons that open them are writer-only. */}
      <NewProgramDrawer
        open={createDrawer?.kind === 'program' && canWrite}
        onClose={() => setCreateDrawer(null)}
        onCreated={handleCreateDrawerSaved}
        onAddProject={handleAddProject}
      />

      {createDrawer?.kind === 'project' && canWrite && (
        <NewProjectActivityDrawer
          open
          kind="project"
          parentProgramId={createDrawer.parentProgramId}
          onClose={() => setCreateDrawer(null)}
          onCreated={handlePaCreated}
          onAddAnother={() => setCreateDrawer({ kind: 'project', parentProgramId: createDrawer.parentProgramId })}
        />
      )}

      {createDrawer?.kind === 'activity' && canWrite && (
        <NewProjectActivityDrawer
          open
          kind="activity"
          parentProgramId={createDrawer.parentProgramId}
          parentProjectId={createDrawer.parentProjectId}
          onClose={() => setCreateDrawer(null)}
          onCreated={handlePaCreated}
          onAddAnother={() => setCreateDrawer({
            kind: 'activity',
            parentProgramId: createDrawer.parentProgramId,
            parentProjectId: createDrawer.parentProjectId,
          })}
        />
      )}

      {selectedCycleId && (
        <BatchPublishDialog
          open={batchPublishOpen}
          onOpenChange={setBatchPublishOpen}
          aipCycleId={selectedCycleId}
          clusters={clusterOptions.map((c) => ({ id: c.id, name: c.name }))}
          onPublished={() => { void refreshData(); }}
        />
      )}

      {/* Sub-item drawer — stacked on top of program drawer */}
      {selectedSubItem && (
        <ProjectActivityOverviewDrawer
          isOpen={isSubDrawerOpen}
          item={selectedSubItem}
          initialMode={editId === selectedSubItem.id ? 'edit' : 'view'}
          onModeChange={reportMode(selectedSubItem.id)}
          onClose={() => { setIsSubDrawerOpen(false); setSelectedSubItem(null); setEditId(null); }}
          parentProgramId={selectedProgram?.id ?? findParentProgramId(selectedSubItem.id)}
          parentProgramName={selectedProgram?.program_name ?? findParentProgram(selectedSubItem.id)?.program_name}
          parentProgramStatus={selectedProgram?.status_label ?? findParentProgram(selectedSubItem.id)?.status_label}
          parentProjectId={subItemParentProject?.id}
          parentProjectName={subItemParentProject?.program_name || subItemParentProject?.ppa_description}
          onViewProgram={() => { setIsSubDrawerOpen(false); setSelectedSubItem(null); }}
          onViewProject={(projectId) => {
            const project = findEntryById(projectId);
            if (project) setSelectedSubItem(project);
          }}
          onOpenSubItem={(subItem) => { setSelectedSubItem(subItem); }}
          onDeleteSuccess={() => { setIsSubDrawerOpen(false); setSelectedSubItem(null); void refreshData(); }}
          onEdited={() => void refreshData()}
          canAudit={canAudit}
          canWrite={canWrite}
          loadPublicFeedback={makePaFeedbackLoader(
            selectedProgram?.id ?? findParentProgramId(selectedSubItem.id),
          )}
          onNavigate={navigateDrawer}
          canNavigatePrev={canNavigatePrev}
          canNavigateNext={canNavigateNext}
        />
      )}

      {/* Standalone project/activity drawer (opened directly from the list, not from program drawer) */}
      {selectedProgram && selectedProgram.ppa_type !== 'Program' && (
        <ProjectActivityOverviewDrawer
          isOpen={isDrawerOpen}
          item={selectedProgram}
          initialMode={editId === selectedProgram.id ? 'edit' : 'view'}
          onModeChange={reportMode(selectedProgram.id)}
          onClose={closeDrawers}
          parentProgramId={findParentProgramId(selectedProgram.id)}
          parentProgramName={findParentProgram(selectedProgram.id)?.program_name}
          parentProgramStatus={findParentProgram(selectedProgram.id)?.status_label}
          parentProjectId={findParentProject(selectedProgram.id)?.id}
          parentProjectName={(() => { const p = findParentProject(selectedProgram.id); return p?.program_name || p?.ppa_description; })()}
          onViewProgram={handleViewProgram}
          onViewProject={(projectId) => {
            const project = findEntryById(projectId);
            if (project) setSelectedProgram(project);
          }}
          onOpenSubItem={(subItem) => { setSelectedProgram(subItem); }}
          onDeleteSuccess={() => { setIsDrawerOpen(false); void refreshData(); }}
          onEdited={() => void refreshData()}
          canAudit={canAudit}
          canWrite={canWrite}
          loadPublicFeedback={makePaFeedbackLoader(
            findParentProgramId(selectedProgram.id),
          )}
          onNavigate={navigateDrawer}
          canNavigatePrev={canNavigatePrev}
          canNavigateNext={canNavigateNext}
        />
      )}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="w-full animate-pulse divide-y divide-slate-200">
      {[
        { indent: 0, w: 'w-2/5', program: true },
        { indent: 8, w: 'w-1/3', program: false },
        { indent: 16, w: 'w-1/4', program: false },
        { indent: 16, w: 'w-1/4', program: false },
        { indent: 8, w: 'w-1/3', program: false },
      ].map((row, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center gap-6 px-4 py-3',
            row.program && 'bg-blue-50/45',
          )}
        >
          <div className={cn('h-3.5 rounded bg-slate-200', row.w)} style={{ marginLeft: `${row.indent * 2}px` }} />
          <div className="h-3 w-20 rounded bg-slate-200" />
          <div className="h-5 w-14 rounded-full bg-slate-200" />
          <div className="ml-auto h-3.5 w-20 rounded bg-slate-200" />
          <div className="h-7 w-10 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}
