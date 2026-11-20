'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Filter, MessageSquarePlus, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { PublicProgramList } from '@/components/public/public-program-list';
import { PublicProgramDrawer } from '@/components/public/public-program-drawer';
import { PublicRegistryFeedbackDialog } from '@/components/public/public-registry-feedback-dialog';
import { loadPublicRegistryList, loadPublicFinishLines, submitRegistryFeedback } from '@/app/(public)/budget/_actions';
import type { PublicListItem } from '@/lib/public-registry-list';
import { VISIONS } from '@/lib/finish-lines';
import type {
  PublicCycleRecord,
  PublicClusterRecord,
  PublicFinishLineRecord,
  ThematicTagRef,
} from '@/lib/api';
import { BrandText } from '@/components/brand/brand-text';
import { AMOUNT_LABEL, LEP_AMOUNT_LABEL, amountLabelOf, primarySection } from '@/lib/public-sections';
import { FUND_SOURCES, PAP_CLASSES } from '@/lib/schemas';
import { GOAL, goals } from '@/lib/goal-label';
import { LguWord } from '@/components/brand/brand-text';


/**
 * PAP class and fund source filters (#107). Both are multi-select and OR within
 * the row (GAS or STO), unlike thematic tags, which AND. "Operations" also
 * matches a program with no class, which the AIP form prints under Operations;
 * a fund matches when the program or any of its PPAs lists it, and "Not
 * recorded" matches a program with no fund at either level.
 */
const PAP_CLASS_OPTIONS = PAP_CLASSES.map((c) => ({ value: c.value, label: c.label, title: c.label }));
const FUND_SOURCE_OPTIONS = [
  ...FUND_SOURCES.map((f) => ({ value: f.value, label: f.label, title: f.description })),
  { value: 'NONE', label: 'Not recorded', title: 'No fund source on the program or any of its projects and activities' },
];

/** One labelled row of toggle chips; `compact` is the mobile filter sheet's style. */
function ChipFilterRow({
  label,
  options,
  selected,
  onChange,
  compact = false,
}: {
  label: string;
  options: { value: string; label: string; title: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? undefined : 'hidden border-b border-tbl-rule-soft px-4 py-3 sm:block'}>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-tbl-faint">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {!compact && selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-full border border-tbl-rule bg-tbl-surface px-3 py-1 text-xs font-medium text-tbl-muted hover:border-tbl-rule-strong hover:bg-tbl-fill"
          >
            Clear
          </button>
        )}
        {options.map((o) => {
          const isActive = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              title={o.title}
              aria-pressed={isActive}
              onClick={() =>
                onChange(isActive ? selected.filter((v) => v !== o.value) : [...selected, o.value])
              }
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                isActive
                  ? 'border-primary bg-primary/5 font-semibold text-primary'
                  : compact
                    ? 'border-tbl-rule text-tbl-muted'
                    : 'border-tbl-rule bg-tbl-surface text-tbl-muted hover:border-tbl-rule-strong hover:bg-tbl-fill',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One request per cycle rather than a page at a time.
 *
 * The table groups by office, and `client/src/lib/aip-grouping.ts` can only do
 * that correctly over the complete result set — paging would scatter one office
 * across four pages, each with its own partial subtotal. Matches the staff
 * registry's `REGISTRY_FETCH_LIMIT` and the API's own ceiling; if a cycle ever
 * outgrows it, `AIPMasterList` says so in a banner rather than quietly dropping
 * rows.
 */
const REGISTRY_FETCH_LIMIT = 1000;

/**
 * What a cycle is called in the `/budget` year picker: the enacted budget once
 * there is one, else the AIP — the API's `sections`, via `primarySection`, so
 * 2027 relabels itself when it is enacted instead of needing an edit here.
 */
function cycleLabel(cycle: PublicCycleRecord): string {
  return primarySection(cycle) === 'annual'
    ? `Annual Budget ${cycle.fiscalYear}`
    : `AIP ${cycle.fiscalYear}`;
}

interface Props {
  cycles: PublicCycleRecord[];
  clusters: PublicClusterRecord[];
  finishLines: PublicFinishLineRecord[];
  /** Active catalog entries — populates the thematic-tag filter chips. */
  thematicTags: ThematicTagRef[];
  initialCycleId: string | undefined;
  /** Programs only — the PA trees load on the first office expand (#91). */
  initialItems: PublicListItem[];
  initialTotal: number;
  initialTotalBudget: string;
  initialTotalProposedBudget: string;
  initialSubmittedOfficeCount: number;
  initialTotalOfficeCount: number;
  /**
   * Rendered inside a budget section's Browse tab rather than standing alone at
   * `/budget`.
   *
   * The section already states which document and which year you are reading, so
   * the page header and the cycle switcher would both be duplicates — and the
   * switcher would additionally let you change year without changing URL, which
   * is exactly the ambiguity the two sections exist to remove. The table itself
   * is untouched.
   */
  embedded?: boolean;
  /**
   * Which document of the year the table reads — the AIP or the enacted budget
   * (specs/012). Unset on `/budget`, where the API follows the year's sections.
   */
  section?: 'aip' | 'annual';
}

export function PublicRegistryClient({
  cycles,
  clusters,
  finishLines,
  thematicTags,
  initialCycleId,
  initialItems,
  initialTotal,
  initialTotalBudget,
  initialTotalProposedBudget,
  initialSubmittedOfficeCount,
  initialTotalOfficeCount,
  embedded = false,
  section,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [selectedCycleId, setSelectedCycleId] = useState(initialCycleId);
  const selectedCycle = cycles.find((c) => c.id === selectedCycleId);
  const amountLabel = selectedCycle ? amountLabelOf(selectedCycle, section) : AMOUNT_LABEL[section ?? 'aip'];
  const [flList, setFlList] = useState(finishLines);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [clusterFilter, setClusterFilter] = useState('all');
  const [officeFilter, setOfficeFilter] = useState('all');
  // Honor `?vision=N` from the 2028 Finish Lines page by pre-selecting the
  // matching finish line (vision number → finishLine id).
  const initialFinishLineIds = (() => {
    const v = searchParams.get('vision');
    if (!v) return [];
    const fl = flList.find((f) => String(f.visionNumber) === v);
    return fl ? [fl.id] : [];
  })();
  const [finishLineFilter, setFinishLineFilter] = useState<string[]>(initialFinishLineIds);
  const [thematicTagFilter, setThematicTagFilter] = useState<string[]>([]);
  const [papClassFilter, setPapClassFilter] = useState<string[]>([]);
  const [fundSourceFilter, setFundSourceFilter] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [officeDropOpen, setOfficeDropOpen] = useState(false);
  const [budgetExpanded, setBudgetExpanded] = useState(false);
  const flScrollRef = useRef<HTMLDivElement>(null);
  const [flScroll, setFlScroll] = useState({ left: false, right: false });
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
    () => searchParams.get('program'),
  );
  const [selectedPaId, setSelectedPaId] = useState<string | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedProgramId) {
      params.set('program', selectedProgramId);
    } else {
      params.delete('program');
    }
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProgramId]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [items, setItems] = useState<PublicListItem[]>(initialItems);
  // The server render ships programs without their PA trees; every fetch after
  // it carries them. Offices start collapsed, so nothing needs a tree until one
  // is opened.
  const activitiesState = useRef<'none' | 'loading' | 'loaded'>('none');
  const [total, setTotal] = useState(initialTotal);

  const paToProgram = items.reduce<Map<string, string>>((map, item) => {
    for (const pa of item.projectActivities ?? []) {
      map.set(pa.id, item.id);
    }
    return map;
  }, new Map());

  const handleViewPa = (paId: string) => {
    const programId = paToProgram.get(paId);
    if (!programId) return;
    setSelectedProgramId(programId);
    setSelectedPaId(paId);
  };
  const [totalBudget, setTotalBudget] = useState(initialTotalBudget);
  const [totalProposedBudget, setTotalProposedBudget] = useState(initialTotalProposedBudget);
  const [submittedOfficeCount, setSubmittedOfficeCount] = useState(initialSubmittedOfficeCount);
  const [totalOfficeCount] = useState(initialTotalOfficeCount);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const officeOptions =
    clusterFilter === 'all'
      ? []
      : (clusters.find((c) => c.id === clusterFilter)?.offices ?? []);

  const clusterFinishLineIds = useMemo(() => {
    if (clusterFilter === 'all') return new Set<string>();
    const cluster = clusters.find((c) => c.id === clusterFilter);
    return new Set(
      cluster?.finishLineClusters.map((fc) => fc.finishLine.id) ?? [],
    );
  }, [clusterFilter, clusters]);

  const visibleFinishLines =
    clusterFilter === 'all'
      ? flList
      : flList.filter((fl) => clusterFinishLineIds.has(fl.id));

  const finishLineClusterIds = useMemo(() => {
    if (finishLineFilter.length === 0) return new Set<string>();
    return new Set(
      clusters
        .filter((c) =>
          c.finishLineClusters.some((fc) => finishLineFilter.includes(fc.finishLine.id)),
        )
        .map((c) => c.id),
    );
  }, [finishLineFilter, clusters]);

  const visibleClusters =
    finishLineFilter.length === 0
      ? clusters
      : clusters.filter((c) => finishLineClusterIds.has(c.id));

  const hasActiveFilter =
    clusterFilter !== 'all' || officeFilter !== 'all' || finishLineFilter.length > 0 ||
    thematicTagFilter.length > 0 || papClassFilter.length > 0 || fundSourceFilter.length > 0 ||
    !!searchInput;

  function buildParams(overrides?: Partial<{
    cycleId: string;
    clusterId?: string;
    officeId?: string;
    finishLineIds?: string[];
    thematicTagIds?: string[];
    papClasses?: string[];
    fundSources?: string[];
    search?: string;
  }>) {
    const papClasses = overrides?.papClasses ?? papClassFilter;
    const fundSources = overrides?.fundSources ?? fundSourceFilter;
    return {
      cycleId: overrides?.cycleId ?? selectedCycleId ?? '',
      clusterId: (overrides?.clusterId !== undefined ? overrides.clusterId : clusterFilter) === 'all'
        ? undefined
        : (overrides?.clusterId ?? clusterFilter),
      officeId: (overrides?.officeId !== undefined ? overrides.officeId : officeFilter) === 'all'
        ? undefined
        : (overrides?.officeId ?? officeFilter),
      finishLineIds: (overrides?.finishLineIds ?? finishLineFilter).length
        ? (overrides?.finishLineIds ?? finishLineFilter)
        : undefined,
      thematicTagIds: (overrides?.thematicTagIds ?? thematicTagFilter).length
        ? (overrides?.thematicTagIds ?? thematicTagFilter)
        : undefined,
      papClasses: papClasses.length ? papClasses : undefined,
      fundSources: fundSources.length ? fundSources : undefined,
      search: (overrides?.search !== undefined ? overrides.search : searchInput) || undefined,
      section,
      // The whole cycle, every time. The table groups by office, and grouping is
      // only correct over the complete result set — a page of 10 would put the
      // same office on four pages with a different subtotal on each.
      limit: REGISTRY_FETCH_LIMIT,
    };
  }

  async function fetchRegistry(params: ReturnType<typeof buildParams>) {
    setIsLoading(true);
    const result = await loadPublicRegistryList(params);
    setIsLoading(false);

    if ('items' in result) {
      activitiesState.current = 'loaded';
      setItems(result.items);
      setTotal(result.total);
      setTotalBudget(result.totalBudget);
      setTotalProposedBudget(result.totalProposedBudget);
      setSubmittedOfficeCount(result.submittedOfficeCount);
      setLoadError(null);
    } else {
      setLoadError(result.error);
      setItems([]);
    }
  }

  // One-time: if arriving with `?vision=N`, the SSR list is unfiltered, so
  // refetch with the pre-selected finish line.
  const didInitVisionFilter = useRef(false);
  useEffect(() => {
    if (didInitVisionFilter.current) return;
    didInitVisionFilter.current = true;
    if (initialFinishLineIds.length && selectedCycleId) {
      const t = setTimeout(() => {
        void fetchRegistry(buildParams({ finishLineIds: initialFinishLineIds }));
      }, 0);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = flScrollRef.current;
    if (!el) return;
    const update = () => setFlScroll({
      left: el.scrollLeft > 0,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [flList]);

  // Fetches only when the term actually changed. Firing on mount re-downloaded
  // the list the server had just rendered, 300 ms after every page load. A ref
  // rather than a first-run flag, because dev StrictMode runs the effect twice.
  const fetchedSearch = useRef(searchInput);
  useEffect(() => {
    if (searchInput === fetchedSearch.current) return;
    fetchedSearch.current = searchInput;
    if (!selectedCycleId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchRegistry(buildParams({ search: searchInput }));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  /** The first office opened loads every PA tree for the current filters. */
  async function loadActivities() {
    if (activitiesState.current !== 'none' || !selectedCycleId) return;
    activitiesState.current = 'loading';
    const result = await loadPublicRegistryList(buildParams());
    if ('items' in result) {
      activitiesState.current = 'loaded';
      setItems(result.items);
    } else {
      activitiesState.current = 'none';
    }
  }

  function refetch(overrides: Parameters<typeof buildParams>[0]) {
    if (!selectedCycleId && !overrides?.cycleId) return;
    void fetchRegistry(buildParams(overrides));
  }

  const handleCycleChange = (val: string) => {
    if (val === selectedCycleId) return;
    setSelectedCycleId(val);
    refetch({ cycleId: val });
    void loadPublicFinishLines(val, section).then((res) => {
      if (Array.isArray(res)) {
        setFlList(res);
        if (flScrollRef.current) flScrollRef.current.scrollLeft = 0;
      }
    });
  };

  const handleClusterChange = (val: string) => {
    setClusterFilter(val);
    setOfficeFilter('all');

    const nextClusterFinishLineIds =
      val === 'all'
        ? new Set<string>()
        : new Set(
            clusters.find((c) => c.id === val)?.finishLineClusters.map((fc) => fc.finishLine.id) ?? [],
          );
    const nextFinishLineIds =
      val === 'all'
        ? finishLineFilter
        : finishLineFilter.filter((id) => nextClusterFinishLineIds.has(id));
    setFinishLineFilter(nextFinishLineIds);

    refetch({
      clusterId: val,
      officeId: 'all',
      finishLineIds: nextFinishLineIds,
    });
  };

  const handleOfficeChange = (val: string) => {
    setOfficeFilter(val);
    setOfficeDropOpen(false);
    refetch({ officeId: val });
  };

  const handleFinishLineChange = (vals: string[]) => {
    setFinishLineFilter(vals);

    const nextFinishLineClusterIds =
      vals.length === 0
        ? new Set<string>()
        : new Set(
            clusters
              .filter((c) => c.finishLineClusters.some((fc) => vals.includes(fc.finishLine.id)))
              .map((c) => c.id),
          );
    const nextClusterId =
      vals.length === 0 || clusterFilter === 'all'
        ? clusterFilter
        : nextFinishLineClusterIds.has(clusterFilter)
          ? clusterFilter
          : 'all';
    if (nextClusterId !== clusterFilter) {
      setClusterFilter(nextClusterId);
      setOfficeFilter('all');
    }

    refetch({
      finishLineIds: vals,
      clusterId: nextClusterId,
      officeId: nextClusterId !== clusterFilter ? 'all' : undefined,
    });
  };

  const handleThematicTagChange = (vals: string[]) => {
    setThematicTagFilter(vals);
    refetch({ thematicTagIds: vals });
  };

  const handlePapClassChange = (vals: string[]) => {
    setPapClassFilter(vals);
    refetch({ papClasses: vals });
  };

  const handleFundSourceChange = (vals: string[]) => {
    setFundSourceFilter(vals);
    refetch({ fundSources: vals });
  };

  const handleClearAll = () => {
    setClusterFilter('all');
    setOfficeFilter('all');
    setFinishLineFilter([]);
    setThematicTagFilter([]);
    setPapClassFilter([]);
    setFundSourceFilter([]);
    setSearchInput('');
    refetch({
      clusterId: 'all',
      officeId: 'all',
      finishLineIds: [],
      thematicTagIds: [],
      papClasses: [],
      fundSources: [],
      search: '',
    });
  };

  const latestOpenId = cycles.find((c) => c.status === 'OPEN')?.id;
  const activeOffice = officeOptions.find((o) => o.id === officeFilter);

  const totalBudgetNum = parseFloat(totalBudget);
  void totalBudgetNum;
  const totalProposedNum = parseFloat(totalProposedBudget);

  function formatBudgetCompact(amount: number): string {
    if (isNaN(amount) || amount === 0) return '₱0.00M';
    if (Math.abs(amount) >= 1_000_000_000) return `₱${(amount / 1_000_000_000).toFixed(2)}B`;
    return `₱${(amount / 1_000_000).toFixed(2)}M`;
  }

  const totalProposedFormatted = formatBudgetCompact(totalProposedNum);
  const avgProposedFormatted = total > 0 && !isNaN(totalProposedNum)
    ? formatBudgetCompact(totalProposedNum / total)
    : formatBudgetCompact(0);

  const flMaskImage = (() => {
    if (!flScroll.left && !flScroll.right) return undefined;
    const l = flScroll.left ? 'transparent' : 'black';
    const r = flScroll.right ? 'transparent' : 'black';
    return `linear-gradient(to right, ${l}, black 32px, black calc(100% - 32px), ${r})`;
  })();

  return (
    <div
      // Gives the table surface tokens (bg-tbl-*, text-tbl-*) their editorial
      // values — see "Editorial table surface" in globals.css.
      data-editorial-table
      className={cn(
        'flex w-full flex-1 flex-col',
        embedded
          ? 'pb-6 pt-8'
          : 'mx-auto max-w-7xl px-4 pt-4 pb-6 sm:px-6 lg:px-8',
      )}
    >

      {/* Page header — the section chrome already carries this when embedded. */}
      <div className={cn('mb-3 lg:max-w-3xl', embedded && 'hidden')}>
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink-faint">
          <BrandText field="government" />
        </p>
        <h1 className="mt-1 font-display text-[clamp(1.5rem,1.2rem+1vw,2rem)] font-medium tracking-[-0.02em] text-ink">
          Annual Budget Registry
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">
          This registry lists the <LguWord k="lgu" />&apos;s programs, projects, and activities — what each
          one is for, which office runs it, and how much it costs. Choose a year to see either
          the enacted Annual Budget or the Annual Investment Program still being prepared.
        </p>
      </div>

      {/* Single card: toolbar + content */}
      <div className="overflow-hidden rounded-xl border border-rule bg-paper-raised shadow-sm">

        {/* ── Row 1: Search + Cycle + Sort + Clear All ── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3">
          <div className="relative flex-1 sm:max-w-[280px]">
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search programs, codes, or tags…"
              className="h-9 border-tbl-rule-strong bg-tbl-surface pl-3 pr-8 text-sm"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tbl-faint hover:text-tbl-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {!embedded && cycles.length > 0 && (
            <Popover open={cycleOpen} onOpenChange={setCycleOpen}>
              <PopoverTrigger
                className={cn(
                  // Wide enough for "Annual Budget 2026" — the longest label
                  // `cycleLabel` produces — so the trigger never truncates it.
                  'inline-flex h-9 min-w-[168px] items-center justify-between gap-1 rounded-lg border px-3 text-sm transition-colors',
                  'border-tbl-rule-strong bg-tbl-surface text-tbl-ink-3 hover:border-tbl-rule-hover',
                )}
              >
                <span className="whitespace-nowrap">
                  {(() => {
                    const selected = cycles.find((c) => c.id === selectedCycleId);
                    return selected ? cycleLabel(selected) : 'Cycle';
                  })()}
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[248px] p-0" side="bottom" align="start" sideOffset={4}>
                <Command>
                  <CommandList>
                    <CommandGroup>
                      {cycles.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => { handleCycleChange(c.id); setCycleOpen(false); }}
                          data-checked={selectedCycleId === c.id}
                        >
                          <span className="whitespace-nowrap">{cycleLabel(c)}</span>
                          {c.id === latestOpenId && (
                            <span className="ml-2 text-xs text-emerald-600">(Current)</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}

          {/* Mobile filter button */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-sm sm:hidden"
            onClick={() => setFilterSheetOpen(true)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
          </Button>

          <div className="ml-auto flex items-center gap-2">
            {/* Placement B: reachable from the first viewport without owning a
                block of it. The persuasion lives in the after-list block below;
                this is for people who already know they want to say something. */}
            <button
              type="button"
              onClick={() => setFeedbackDialogOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-tbl-accent-rule bg-tbl-surface px-3 text-sm text-tbl-accent-ink transition-colors hover:border-tbl-accent-rule-strong hover:bg-tbl-accent-fill"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Share feedback</span>
            </button>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs text-tbl-muted-2 hover:text-tbl-ink-2 underline underline-offset-2"
              >
                Clear all
              </button>
            )}
            {/* No sort control: the list is ordered office → section → the
                office's own ranking, which is what makes the office bands
                contiguous. A user-chosen ordering would dissolve them. */}
          </div>
        </div>

        {/* ── Row 2: Finish Line Tabs (desktop) ── */}
        <div className="hidden border-b border-tbl-rule-soft px-4 py-3 sm:block">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-tbl-faint">
            Browse PPAs per {GOAL}
          </p>
          <div className="flex items-center gap-2">
            {/* All pill — pinned, never scrolls */}
            <button
              type="button"
              onClick={() => {
                handleFinishLineChange([]);
                if (flScrollRef.current) flScrollRef.current.scrollLeft = 0;
              }}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                finishLineFilter.length === 0
                  ? 'border-primary bg-primary text-white'
                  : 'border-tbl-rule bg-tbl-surface text-tbl-muted hover:border-tbl-rule-strong hover:bg-tbl-fill',
              )}
            >
              All
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                finishLineFilter.length === 0 ? 'bg-tbl-surface/20 text-white' : 'bg-tbl-fill-strong text-tbl-muted-2',
              )}>
                {total}
              </span>
            </button>
            <div className="h-4 w-px shrink-0 bg-tbl-fill-deep" aria-hidden="true" />
            <button
              type="button"
              aria-label={`Scroll ${goals} left`}
              aria-hidden={!flScroll.left || undefined}
              tabIndex={flScroll.left ? undefined : -1}
              onClick={() => flScrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
              className={cn(
                'flex shrink-0 h-6 w-6 items-center justify-center rounded-full border border-rule bg-paper-raised shadow-sm hover:bg-tbl-fill',
                !flScroll.left && 'hidden',
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5 text-tbl-muted-2" />
            </button>
            {/* FL pills — scrollable, gradient-masked edges */}
            <div
              ref={flScrollRef}
              className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                maskImage: flMaskImage,
                WebkitMaskImage: flMaskImage,
              } as React.CSSProperties}
            >
              {visibleFinishLines.map((fl) => {
                const vision = fl.visionNumber != null
                  ? VISIONS.find((v) => v.id === fl.visionNumber)
                  : undefined;
                const color = fl.color ?? vision?.color ?? '#64748b'; // the goal's own colour first
                const shortName = fl.shortName ?? fl.name;
                const isActive = finishLineFilter.includes(fl.id);

                return (
                  <button
                    key={fl.id}
                    type="button"
                    onClick={(e) => {
                      handleFinishLineChange(isActive ? [] : [fl.id]);
                      e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    style={
                      isActive
                        ? {
                            backgroundColor: color + '18',
                            borderColor: color,
                            color,
                          }
                        : undefined
                    }
                  >
                    {fl.visionNumber != null && (
                      <span
                        className="font-bold tabular-nums"
                        style={{ color: isActive ? color : '#94a3b8', fontSize: '10px' }}
                      >
                        {`#${fl.visionNumber}`}
                      </span>
                    )}
                    <span className={cn(!isActive && 'text-tbl-muted')}>{shortName}</span>
                    {isActive && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                        style={{ backgroundColor: color + '30', color }}
                      >
                        {fl.programCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              aria-label={`Scroll ${goals} right`}
              aria-hidden={!flScroll.right || undefined}
              tabIndex={flScroll.right ? undefined : -1}
              onClick={() => flScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
              className={cn(
                'flex shrink-0 h-6 w-6 items-center justify-center rounded-full border border-rule bg-paper-raised shadow-sm hover:bg-tbl-fill',
                !flScroll.right && 'invisible pointer-events-none',
              )}
            >
              <ChevronRight className="h-3.5 w-3.5 text-tbl-muted-2" />
            </button>
          </div>
        </div>

        {/* ── Row: Thematic Tags (desktop) ──
            Multi-select, unlike the finish-line row above: a program can
            carry several beneficiary tags at once, and selecting more than
            one narrows further (every selected tag must match), so toggling
            a second chip adds to the selection instead of replacing it. */}
        {thematicTags.length > 0 && (
          <div className="hidden border-b border-tbl-rule-soft px-4 py-3 sm:block">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-tbl-faint">
              Thematic Tags
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {thematicTagFilter.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleThematicTagChange([])}
                  className="rounded-full border border-tbl-rule bg-tbl-surface px-3 py-1 text-xs font-medium text-tbl-muted hover:border-tbl-rule-strong hover:bg-tbl-fill"
                >
                  Clear
                </button>
              )}
              {thematicTags.map((tag) => {
                const isActive = thematicTagFilter.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      handleThematicTagChange(
                        isActive
                          ? thematicTagFilter.filter((id) => id !== tag.id)
                          : [...thematicTagFilter, tag.id],
                      )
                    }
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      isActive
                        ? 'border-primary bg-primary/5 text-primary font-semibold'
                        : 'border-tbl-rule bg-tbl-surface text-tbl-muted hover:border-tbl-rule-strong hover:bg-tbl-fill',
                    )}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Rows: PAP class and fund source (desktop, #107) ── */}
        <ChipFilterRow
          label="PAP Class"
          options={PAP_CLASS_OPTIONS}
          selected={papClassFilter}
          onChange={handlePapClassChange}
        />
        <ChipFilterRow
          label="Fund Source"
          options={FUND_SOURCE_OPTIONS}
          selected={fundSourceFilter}
          onChange={handleFundSourceChange}
        />

        {/* ── Row 3: Clusters + Office (desktop) ── */}
        {(visibleClusters.length > 0) && (
          <div className="hidden border-b border-tbl-rule-soft px-4 py-3 sm:flex sm:flex-wrap sm:items-start sm:gap-x-12 sm:gap-y-3">
            {/* Clusters */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-tbl-faint">
                Clusters
              </p>
              <div className="flex flex-wrap gap-1.5">
                {visibleClusters.map((c) => {
                  const active = clusterFilter === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleClusterChange(active ? 'all' : c.id)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary/5 font-semibold text-primary'
                          : 'border-tbl-rule bg-tbl-surface text-tbl-muted hover:border-tbl-rule-strong hover:bg-tbl-fill',
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Office — only shown when a cluster is selected */}
            {clusterFilter !== 'all' && officeOptions.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-tbl-faint">
                  Office
                </p>
                <Popover open={officeDropOpen} onOpenChange={setOfficeDropOpen}>
                  <PopoverTrigger
                    className={cn(
                      'inline-flex h-8 min-w-[180px] items-center justify-between gap-1 rounded-lg border px-3 text-xs transition-colors',
                      officeFilter !== 'all'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-tbl-rule-strong bg-tbl-surface text-tbl-ink-3 hover:border-tbl-rule-hover',
                    )}
                  >
                    <span className="truncate">
                      {officeFilter !== 'all'
                        ? (activeOffice?.acronym ?? activeOffice?.name ?? 'Office')
                        : 'All Offices'}
                    </span>
                    <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0" side="bottom" align="start" sideOffset={4}>
                    <Command>
                      <CommandInput placeholder="Search offices…" className="h-8 text-xs" />
                      <CommandList>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => handleOfficeChange('all')}
                            data-checked={officeFilter === 'all'}
                          >
                            All Offices
                          </CommandItem>
                          {officeOptions.map((o) => (
                            <CommandItem
                              key={o.id}
                              value={o.id}
                              onSelect={() => handleOfficeChange(o.id)}
                              data-checked={officeFilter === o.id}
                            >
                              <span className="truncate">
                                {o.acronym ? `${o.acronym} — ${o.name}` : o.name}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        )}

        {/* ── Row 4: Budget Summary strip ── */}
        <div className="border-b border-tbl-rule">
          <button
            type="button"
            onClick={() => setBudgetExpanded((o) => !o)}
            className="flex w-full items-center gap-2 bg-tbl-fill px-4 py-2.5 text-left text-xs text-tbl-muted hover:bg-tbl-fill-strong transition-colors"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 shrink-0 transition-transform', budgetExpanded && 'rotate-180')}
            />
            <span className="font-semibold text-tbl-ink-3">Summary</span>
            <span className="text-tbl-faint">·</span>
            <span className="tabular-nums">{total} PPAs</span>
            <span className="text-tbl-faint">·</span>
            <span className="tabular-nums">{totalProposedFormatted} {amountLabel === AMOUNT_LABEL.annual ? 'appropriated' : amountLabel === LEP_AMOUNT_LABEL ? 'proposed' : 'estimated'}</span>
            <span className="text-tbl-faint">·</span>
            <span className="tabular-nums">{submittedOfficeCount}/{totalOfficeCount} offices</span>
            <span className="ml-auto text-tbl-faint">{budgetExpanded ? 'Collapse' : 'Expand'}</span>
          </button>

          <div
            className={cn(
              'overflow-hidden transition-all duration-200',
              budgetExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0',
            )}
          >
            <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
              {[
                { label: `Total ${amountLabel}`, value: totalProposedFormatted },
                { label: 'Active PPAs', value: String(total) },
                { label: 'Avg. PPA Size', value: avgProposedFormatted },
                { label: 'Offices Submitted', value: `${submittedOfficeCount} / ${totalOfficeCount}` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-tbl-rule bg-tbl-surface px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-tbl-muted-2">
                    {label}
                  </p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-tbl-ink">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {loadError && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">
            Failed to load programs. Please try refreshing the page.
          </div>
        )}

        {/* Content */}
        {!selectedCycleId ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-base font-medium text-tbl-muted">No AIP cycles available.</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">There are no published AIP cycles at this time.</p>
          </div>
        ) : items.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-base font-medium text-tbl-muted">No programs found.</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <PublicProgramList
            amountLabel={amountLabel}
            items={items}
            total={total}
            totalBudget={totalProposedBudget}
            // Not for filtering — the server already did that. It tells the table
            // which office bands hold hits so it can open them.
            searchTerm={searchInput}
            totalFinishLineCount={finishLines.length}
            isLoading={isLoading}
            onViewProgram={(id) => { setSelectedProgramId(id); setSelectedPaId(null); }}
            onViewProject={handleViewPa}
            onViewActivity={handleViewPa}
            onExpandOffice={() => void loadActivities()}
          />
        )}

      </div>{/* end card */}

      {/* Placement A: the invitation lands after the list, where the visitor has
          just read the thing we are asking them to react to. Feedback is a
          response — asking before there is anything to respond to is why the
          old header card felt like an interruption. */}
      <div className="mt-4 flex flex-col items-start gap-4 rounded-xl border border-tbl-accent-rule-soft bg-tbl-accent-fill px-5 py-5 sm:flex-row sm:items-center sm:px-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tbl-accent-fill-strong">
          <MessageSquarePlus className="h-5 w-5 text-tbl-accent" />
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-semibold text-tbl-ink-2">
            Seen something worth saying?
          </p>
          <p className="mt-0.5 max-w-[62ch] text-[13px] text-tbl-muted-2">
            Your feedback shapes <BrandText field="shortName" possessive /> budget priorities — a funding level that looks
            off, a programme your barangay needs, or anything else on this list.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => setFeedbackDialogOpen(true)}>
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Share feedback
        </Button>
      </div>

      {/* Mobile filter bottom sheet */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-0">
          <SheetHeader className="border-b border-tbl-rule px-5 pb-3 pt-5">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base font-semibold">Filters</SheetTitle>
              {hasActiveFilter && (
                <button
                  type="button"
                  className="text-xs text-tbl-accent hover:underline"
                  onClick={() => {
                    handleClearAll();
                    setFilterSheetOpen(false);
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-5 py-4">
            {/* FL tabs in sheet */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-tbl-faint">
                {GOAL}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleFinishLineChange([])}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium',
                    finishLineFilter.length === 0
                      ? 'border-primary bg-primary text-white'
                      : 'border-tbl-rule text-tbl-muted',
                  )}
                >
                  All
                </button>
                {visibleFinishLines.map((fl) => {
                  const vision = fl.visionNumber != null
                    ? VISIONS.find((v) => v.id === fl.visionNumber)
                    : undefined;
                  const color = fl.color ?? vision?.color ?? '#64748b'; // the goal's own colour first
                  const isActive = finishLineFilter.includes(fl.id);
                  return (
                    <button
                      key={fl.id}
                      type="button"
                      onClick={() => handleFinishLineChange(isActive ? [] : [fl.id])}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                      style={isActive ? { backgroundColor: color + '18', borderColor: color, color } : undefined}
                    >
                      {fl.visionNumber != null && (
                        <span
                          className="font-bold tabular-nums"
                          style={{ color: isActive ? color : '#94a3b8', fontSize: '10px' }}
                        >
                          {`#${fl.visionNumber}`}
                        </span>
                      )}
                      {fl.shortName ?? fl.name}
                      {isActive && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                          style={{ backgroundColor: color + '30', color }}
                        >
                          {fl.programCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Thematic tags in sheet — multi-select, same as the desktop row */}
            {thematicTags.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-tbl-faint">
                  Thematic Tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {thematicTags.map((tag) => {
                    const isActive = thematicTagFilter.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          handleThematicTagChange(
                            isActive
                              ? thematicTagFilter.filter((id) => id !== tag.id)
                              : [...thematicTagFilter, tag.id],
                          )
                        }
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium',
                          isActive
                            ? 'border-primary bg-primary/5 font-semibold text-primary'
                            : 'border-tbl-rule text-tbl-muted',
                        )}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PAP class and fund source in sheet (#107) */}
            <ChipFilterRow
              compact
              label="PAP Class"
              options={PAP_CLASS_OPTIONS}
              selected={papClassFilter}
              onChange={handlePapClassChange}
            />
            <ChipFilterRow
              compact
              label="Fund Source"
              options={FUND_SOURCE_OPTIONS}
              selected={fundSourceFilter}
              onChange={handleFundSourceChange}
            />

            {/* Clusters in sheet */}
            {visibleClusters.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-tbl-faint">
                  Cluster
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {visibleClusters.map((c) => {
                    const active = clusterFilter === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleClusterChange(active ? 'all' : c.id)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium',
                          active
                            ? 'border-primary bg-primary/5 font-semibold text-primary'
                            : 'border-tbl-rule text-tbl-muted',
                        )}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Office in sheet */}
            {clusterFilter !== 'all' && officeOptions.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-tbl-faint">
                  Office
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[{ id: 'all', name: 'All Offices', acronym: null }, ...officeOptions].map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => handleOfficeChange(o.id)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium',
                        officeFilter === o.id
                          ? 'border-primary bg-primary/5 font-semibold text-primary'
                          : 'border-tbl-rule text-tbl-muted',
                      )}
                    >
                      {o.acronym ?? o.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-tbl-rule px-5 py-4">
            <Button className="w-full" onClick={() => setFilterSheetOpen(false)}>
              Show {total} programs
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <PublicProgramDrawer
        programId={selectedProgramId}
        amountLabel={amountLabel}
        initialPaId={selectedPaId}
        onClose={() => { setSelectedProgramId(null); setSelectedPaId(null); }}
        onFeedbackSubmitted={(programId) => {
          setItems((prev) =>
            prev.map((item) =>
              item.id === programId
                ? { ...item, feedbackCount: item.feedbackCount + 1 }
                : item,
            ),
          );
        }}
      />


      <PublicRegistryFeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        onSubmit={submitRegistryFeedback}
      />
    </div>
  );
}
