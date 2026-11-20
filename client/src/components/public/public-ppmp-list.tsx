'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight, ChevronsUpDown, Eye, MessageSquarePlus, Send, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { SimpleSelect } from '@/components/custom/simple-select';
import { ClusterChips, FinishLineChips } from '@/components/aip/registry-filter-chips';
import { formatCurrency, formatMillions } from '@/lib/currency-formatter';
import { countByFinishLine, filterPpmps } from '@/lib/ppmp-filter';
import { centavos, pesos } from '@/lib/budget-overview';
import {
  groupPpmpsByOffice,
  groupByClassification,
  sortGroupedPpmps,
  UNASSIGNED_OFFICE_KEY,
  type PpmpSortBy,
} from '@/lib/ppmp-grouping';
import { useAIPExpand } from '@/hooks/useAIPExpand';
import type {
  PublicClusterRecord,
  PublicFinishLineRecord,
  PublicPpmpSummaryRecord,
  PublicPpmpRecord,
} from '@/lib/api';
import { loadPublicPpmp, submitPpmpFeedback } from '@/app/(public)/ppmp/_actions';
import { PublicRegistryFeedbackDialog } from '@/components/public/public-registry-feedback-dialog';
import { PublicPpmpDrawer } from '@/components/public/public-ppmp-drawer';
import PublicPpmpLineItemsTable from '@/components/public/public-ppmp-line-items-table';
import { BrandText } from '@/components/brand/brand-text';
import { goal } from '@/lib/goal-label';


interface PublicPpmpListProps {
  /** One year's published plans — the year is the route's, in the masthead. */
  initialPpmps: PublicPpmpSummaryRecord[];
  /** The same filter vocabulary as the AIP registry. See lib/ppmp-filter.ts. */
  clusters: PublicClusterRecord[];
  finishLines: PublicFinishLineRecord[];
  /** Every city office, for the "offices published" figure. */
  totalOfficeCount: number;
}

const SORT_OPTIONS: { value: PpmpSortBy; label: string; shortLabel: string }[] = [
  { value: 'recently_updated', label: 'Recently Updated', shortLabel: 'Recent' },
  { value: 'newest', label: 'Newest', shortLabel: 'Newest' },
  { value: 'highest_budget', label: 'Highest Budget', shortLabel: 'Highest' },
  { value: 'lowest_budget', label: 'Lowest Budget', shortLabel: 'Lowest' },
  { value: 'most_feedback', label: 'Most Feedback', shortLabel: 'Feedback' },
];

export default function PublicPpmpList({
  initialPpmps,
  clusters,
  finishLines,
  totalOfficeCount,
}: Readonly<PublicPpmpListProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [ppmps, setPpmps] = useState(initialPpmps);
  const { isExpanded, setManyExpanded } = useAIPExpand();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<PpmpSortBy>('recently_updated');
  const [sortOpen, setSortOpen] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [finishLineFilter, setFinishLineFilter] = useState<string[]>([]);
  const [clusterFilter, setClusterFilter] = useState('all');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [officeDropOpen, setOfficeDropOpen] = useState(false);
  const [budgetExpanded, setBudgetExpanded] = useState(false);

  // Opens the Project Overview drawer in place, mirroring the public AIP
  // registry's Program Overview drawer — clicking a Project must not
  // navigate away from the list. Deep-linkable via `?ppmp=<id>`, same
  // pattern as public-registry-client.tsx's `?program=<id>`.
  const [selectedPpmpId, setSelectedPpmpId] = useState<string | null>(
    () => searchParams.get('ppmp'),
  );

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedPpmpId) {
      params.set('ppmp', selectedPpmpId);
    } else {
      params.delete('ppmp');
    }
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPpmpId]);

  // Per-Project line-item dropdown — separate from both the office-group
  // expand state above and the Eye-icon-opened overview drawer. Row click
  // only toggles this; the drawer opens exclusively via the Eye icon, same
  // split ppmp-master-list.tsx (authenticated) uses between its row body
  // and its own Eye action. Lazily loaded: the list payload only carries a
  // lineItemCount, not the items themselves.
  const [expandedPpmpIds, setExpandedPpmpIds] = useState<Set<string>>(new Set());
  const [lineItemsById, setLineItemsById] = useState<
    Record<string, PublicPpmpRecord['lineItems'] | undefined>
  >({});
  const [loadingPpmpIds, setLoadingPpmpIds] = useState<Set<string>>(new Set());

  const handleTogglePpmp = (id: string) => {
    setExpandedPpmpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (lineItemsById[id] !== undefined || loadingPpmpIds.has(id)) return;
    setLoadingPpmpIds((prev) => new Set(prev).add(id));
    loadPublicPpmp(id).then((result) => {
      setLoadingPpmpIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (!('error' in result)) {
        setLineItemsById((prev) => ({ ...prev, [id]: result.lineItems }));
      }
    });
  };

  const isSearching = searchTerm.trim().length > 0;

  const filteredPpmps = useMemo(
    () =>
      filterPpmps(
        ppmps,
        { finishLineIds: finishLineFilter, clusterId: clusterFilter, officeId: officeFilter, search: searchTerm },
        clusters,
      ),
    [ppmps, finishLineFilter, clusterFilter, officeFilter, searchTerm, clusters],
  );

  // The chips narrow each other the way the AIP registry's do: a cluster shows
  // only its finish lines, a finish line only the clusters that serve it.
  const selectedCluster = clusters.find((c) => c.id === clusterFilter);
  const clusterLines = new Set(selectedCluster?.finishLineClusters.map((fc) => fc.finishLine.id) ?? []);
  const planCounts = useMemo(() => countByFinishLine(ppmps, clusters), [ppmps, clusters]);
  const visibleFinishLines = (selectedCluster ? finishLines.filter((f) => clusterLines.has(f.id)) : finishLines)
    .map((f) => ({ ...f, programCount: planCounts.get(f.id) ?? 0 }));
  const visibleClusters =
    finishLineFilter.length === 0
      ? clusters
      : clusters.filter((c) => c.finishLineClusters.some((fc) => finishLineFilter.includes(fc.finishLine.id)));
  const officeOptions = selectedCluster?.offices ?? [];
  const activeOffice = officeOptions.find((o) => o.id === officeFilter);

  const handleClusterChange = (id: string) => {
    setClusterFilter(id);
    setOfficeFilter('all');
    const lines = new Set(clusters.find((c) => c.id === id)?.finishLineClusters.map((fc) => fc.finishLine.id) ?? []);
    if (id !== 'all') setFinishLineFilter((prev) => prev.filter((f) => lines.has(f)));
  };
  const handleFinishLineChange = (ids: string[]) => {
    setFinishLineFilter(ids);
    if (ids.length > 0 && selectedCluster && !selectedCluster.finishLineClusters.some((fc) => ids.includes(fc.finishLine.id))) {
      setClusterFilter('all');
      setOfficeFilter('all');
    }
  };

  // Totals over what the filters let through, as on the AIP's summary strip.
  // Summed in whole centavos (budget-overview.ts), never as floats.
  const filteredTotal = useMemo(
    () => pesos(filteredPpmps.reduce((sum, p) => sum + centavos(p.grandTotal), 0)),
    [filteredPpmps],
  );
  const filteredOfficeCount = new Set(filteredPpmps.map((p) => p.officeId)).size;
  const money = (amount: string) => formatMillions(Number(amount), { includeCurrency: true, autoScale: true });

  const groups = useMemo(() => {
    const grouped = groupPpmpsByOffice(
      filteredPpmps.map((p) => ({
        id: p.id,
        officeId: p.officeId,
        officeName: p.office.name,
        officeAcronym: p.office.acronym,
        grandTotal: p.grandTotal,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        feedbackCount: p.feedbackCount,
        name: p.name,
        lineItemCount: p.lineItemCount,
        classification: p.classification,
      })),
    );
    return sortGroupedPpmps(grouped, sortBy);
  }, [filteredPpmps, sortBy]);

  const activeSort = SORT_OPTIONS.find((o) => o.value === sortBy);

  return (
    <div
      // Same surface as the AIP / Annual Budget browse table: see "Editorial
      // table surface" in globals.css, which also shades the rows by level.
      data-editorial-table
      className="pb-6 pt-8"
    >
      <div className="overflow-hidden rounded-xl border border-rule bg-paper-raised shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3">
        <div className="relative flex-1 sm:max-w-[280px]">
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search plans or offices…"
            className="h-9 border-tbl-rule-strong bg-tbl-surface pl-3 pr-8 text-sm"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tbl-faint hover:text-tbl-muted"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFeedbackDialogOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-tbl-accent-rule bg-tbl-surface px-3 text-sm text-tbl-accent-ink transition-colors hover:border-tbl-accent-rule-strong hover:bg-tbl-accent-fill"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share feedback</span>
          </button>

          <Popover open={sortOpen} onOpenChange={setSortOpen}>
            <PopoverTrigger
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors',
                'border-tbl-rule-strong bg-tbl-surface text-tbl-muted hover:border-tbl-rule-hover hover:text-tbl-ink-2',
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{activeSort?.label ?? 'Sort'}</span>
              <span className="sm:hidden">{activeSort?.shortLabel ?? 'Sort'}</span>
              <ChevronsUpDown className="h-3 w-3 opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" side="bottom" align="end" sideOffset={4}>
              <Command>
                <CommandList>
                  <CommandGroup>
                    {SORT_OPTIONS.map((opt) => (
                      <CommandItem
                        key={opt.value}
                        value={opt.value}
                        onSelect={() => {
                          setSortBy(opt.value);
                          setSortOpen(false);
                        }}
                        data-checked={sortBy === opt.value}
                      >
                        {opt.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* ── Finish lines, clusters, office — the AIP registry's filters ── */}
      <FinishLineChips
        className="border-b border-tbl-rule px-4 py-3"
        label={`Browse plans per ${goal}`}
        solidAll
        finishLines={visibleFinishLines}
        selected={finishLineFilter}
        onChange={handleFinishLineChange}
        allCount={ppmps.length}
      />
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-tbl-rule px-4 py-3">
        <ClusterChips clusters={visibleClusters} selected={clusterFilter} onChange={handleClusterChange} />
        {clusterFilter !== 'all' && officeOptions.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-tbl-faint">Office</p>
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
                  {officeFilter !== 'all' ? (activeOffice?.acronym ?? activeOffice?.name ?? 'Office') : 'All Offices'}
                </span>
                <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-0" side="bottom" align="start" sideOffset={4}>
                <Command>
                  <CommandInput placeholder="Search offices…" className="h-8 text-xs" />
                  <CommandList>
                    <CommandGroup>
                      <CommandItem value="all" onSelect={() => { setOfficeFilter('all'); setOfficeDropOpen(false); }} data-checked={officeFilter === 'all'}>
                        All Offices
                      </CommandItem>
                      {officeOptions.map((o) => (
                        <CommandItem
                          key={o.id}
                          value={o.id}
                          onSelect={() => { setOfficeFilter(o.id); setOfficeDropOpen(false); }}
                          data-checked={officeFilter === o.id}
                        >
                          <span className="truncate">{o.acronym ? `${o.acronym} — ${o.name}` : o.name}</span>
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

      {/* ── Summary strip: what the filters let through ── */}
      <div className="border-b border-tbl-rule">
        <button
          type="button"
          onClick={() => setBudgetExpanded((o) => !o)}
          aria-expanded={budgetExpanded}
          className="flex w-full flex-wrap items-center gap-2 bg-tbl-fill px-4 py-2.5 text-left text-xs text-tbl-muted transition-colors hover:bg-tbl-fill-strong"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', budgetExpanded && 'rotate-180')} />
          <span className="font-semibold text-tbl-ink-3">Budget Summary</span>
          <span className="text-tbl-faint">·</span>
          <span className="tabular-nums">{filteredPpmps.length} plan{filteredPpmps.length === 1 ? '' : 's'}</span>
          <span className="text-tbl-faint">·</span>
          <span className="tabular-nums">{money(filteredTotal)} planned</span>
          <span className="text-tbl-faint">·</span>
          <span className="tabular-nums">{filteredOfficeCount}/{totalOfficeCount} offices</span>
          <span className="ml-auto text-tbl-faint">{budgetExpanded ? 'Collapse' : 'Expand'}</span>
        </button>
        <div className={cn('overflow-hidden transition-all duration-200', budgetExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0')}>
          <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
            {[
              { label: 'Total Planned', value: money(filteredTotal) },
              { label: 'Plans', value: String(filteredPpmps.length) },
              {
                label: 'Avg. Plan Size',
                value: filteredPpmps.length ? money(pesos(Math.round(centavos(filteredTotal) / filteredPpmps.length))) : money('0'),
              },
              { label: 'Offices Published', value: `${filteredOfficeCount} / ${totalOfficeCount}` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-tbl-rule bg-tbl-surface px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-tbl-muted-2">{label}</p>
                <p className="mt-0.5 text-base font-bold tabular-nums text-tbl-ink">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Jump to office + count, as above the AIP table ── */}
      {groups.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tbl-rule bg-tbl-surface px-3 py-2">
          {groups.length > 1 ? (
            <div className="flex items-center gap-2">
              <label htmlFor="jump-to-ppmp-office" className="text-[11px] font-medium text-muted-foreground">
                Jump to office
              </label>
              <SimpleSelect
                id="jump-to-ppmp-office"
                size="sm"
                value=""
                placeholder={`${groups.length} offices`}
                contentClassName="min-w-[24rem]"
                options={groups.map((g) => ({
                  value: g.officeId ?? UNASSIGNED_OFFICE_KEY,
                  label: g.officeAcronym,
                  description: g.officeName === g.officeAcronym ? undefined : g.officeName,
                  hint: String(g.ppmpCount),
                }))}
                onChange={(key) => {
                  setManyExpanded([key], true);
                  requestAnimationFrame(() => {
                    document.getElementById(`ppmp-office-${key}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                  });
                }}
              />
            </div>
          ) : (
            <span />
          )}
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {filteredPpmps.length} {filteredPpmps.length === 1 ? 'plan' : 'plans'} across {groups.length}{' '}
            {groups.length === 1 ? 'office' : 'offices'}
          </span>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="px-4 py-14 text-center text-sm text-tbl-muted-2">
          {ppmps.length > 0
            ? 'No plans match your filters.'
            : 'No published PPMPs for this fiscal year yet.'}
        </p>
      ) : (
        <div className="divide-y divide-slate-200">
          {groups.map((group) => {
            const key = group.officeId ?? UNASSIGNED_OFFICE_KEY;
            // While searching, every visible group already matched (it
            // wouldn't be in `groups` otherwise) — show it expanded without
            // ever writing to `useAIPExpand`'s state, so clearing the
            // search trivially restores whatever the user had before.
            const expanded = isSearching ? true : isExpanded(key);
            return (
              <div key={key}>
                <button
                  type="button"
                  id={`ppmp-office-${key}`}
                  className="flex w-full items-center gap-2 bg-tbl-band-office px-4 py-3 text-left hover:bg-tbl-band-office-hover"
                  onClick={() => setManyExpanded([key], !expanded)}
                  disabled={isSearching}
                >
                  <ChevronRight
                    className={cn(
                      'size-4 shrink-0 text-tbl-faint transition-transform',
                      expanded && 'rotate-90',
                    )}
                  />
                  <span className="font-semibold text-tbl-ink">{group.officeAcronym}</span>
                  <span className="truncate text-sm text-tbl-muted-2">{group.officeName}</span>
                  <span className="ml-auto shrink-0 text-xs text-tbl-muted-2">
                    {group.ppmpCount} plan{group.ppmpCount === 1 ? '' : 's'}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-slate-950">
                    {formatCurrency(group.total)}
                  </span>
                </button>
                {expanded &&
                  groupByClassification(group.ppmps).map((section) => (
                    <div key={section.classification}>
                      <div className="border-y border-tbl-rule bg-tbl-band-section px-4 py-2 pl-10 text-xs font-semibold uppercase tracking-[0.12em] text-tbl-muted">
                        {section.label}
                      </div>
                      {section.ppmps.map((p) => {
                        const ppmpExpanded = expandedPpmpIds.has(p.id);
                        return (
                          <div key={p.id} className="border-t border-tbl-rule-soft">
                            <div
                              className="flex cursor-pointer items-center gap-3 bg-tbl-row-program px-4 py-3 pl-10 hover:bg-tbl-row-program-hover"
                              onClick={() => handleTogglePpmp(p.id)}
                            >
                              <ChevronRight
                                className={cn(
                                  'size-4 shrink-0 text-tbl-faint transition-transform',
                                  ppmpExpanded && 'rotate-90',
                                )}
                              />
                              <span className="min-w-0 flex-1 truncate font-medium text-tbl-ink">
                                {p.name}
                              </span>
                              <span className="shrink-0 text-xs text-tbl-muted-2">
                                {p.lineItemCount} line item{p.lineItemCount === 1 ? '' : 's'}
                              </span>
                              <span className="shrink-0 text-sm font-semibold text-slate-950">
                                {formatCurrency(p.grandTotal)}
                              </span>
                              <button
                                type="button"
                                aria-label={`View ${p.name} overview`}
                                title="View Project Overview"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPpmpId(p.id);
                                }}
                                className="flex shrink-0 items-center justify-center rounded-md border border-tbl-accent-rule p-1.5 text-tbl-accent hover:bg-tbl-accent-fill hover:text-tbl-accent-ink"
                              >
                                <Eye className="size-4" />
                              </button>
                            </div>
                            {ppmpExpanded && (
                              <div className="bg-tbl-row-activity px-4 py-3 pl-10">
                                <PublicPpmpLineItemsTable
                                  lineItems={lineItemsById[p.id]}
                                  loading={loadingPpmpIds.has(p.id)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-tbl-rule bg-tbl-fill px-4 py-3">
          <span className="text-xs text-muted-foreground">Grand Total</span>
          <span className="text-[10px] text-muted-foreground">(All matching plans)</span>
          <span className="ml-auto text-sm font-medium tabular-nums text-primary">{money(filteredTotal)}</span>
        </div>
      )}

      </div>

      {/* Feedback is a response — asking before there is anything to respond
          to reads oddly, so this sits after the list, not before it. Mirrors
          public-registry-client.tsx's (AIP) banner exactly. */}
      <div className="mt-4 flex flex-col items-start gap-4 rounded-xl border border-tbl-accent-rule-soft bg-tbl-accent-fill px-5 py-5 sm:flex-row sm:items-center sm:px-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tbl-accent-fill-strong">
          <MessageSquarePlus className="h-5 w-5 text-tbl-accent" />
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-semibold text-tbl-ink-2">Seen something worth saying?</p>
          <p className="mt-0.5 max-w-[62ch] text-[13px] text-tbl-muted-2">
            Your feedback shapes <BrandText field="shortName" possessive /> budget priorities — a funding level that looks
            off, a project your barangay needs, or anything else on this list.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => setFeedbackDialogOpen(true)}>
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Share feedback
        </Button>
      </div>

      <PublicRegistryFeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        onSubmit={submitPpmpFeedback}
        subtitle="Project Procurement Management Plans · Public Feedback"
        messagePlaceholder="Share your thoughts about the PPMPs…"
      />

      <PublicPpmpDrawer
        ppmpId={selectedPpmpId}
        onClose={() => setSelectedPpmpId(null)}
        onFeedbackSubmitted={(id) =>
          setPpmps((prev) =>
            prev.map((p) => (p.id === id ? { ...p, feedbackCount: p.feedbackCount + 1 } : p)),
          )
        }
      />
    </div>
  );
}
