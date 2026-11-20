'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Search, X, ChevronsUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { RegistryTab } from '@/lib/api';
import {
  ClusterChips,
  FinishLineChips,
} from '@/components/aip/registry-filter-chips';
import { MultiSelectCombobox } from '@/components/custom/multi-select-combobox';
import { goals } from '@/lib/goal-label';


const TAB_ORDER: RegistryTab[] = [
  'ALL',
  'DRAFTS',
  'REVISIONS',
  'PUBLISHED',
  'ARCHIVED',
];

const TAB_LABELS: Record<RegistryTab, string> = {
  ALL: 'All',
  DRAFTS: 'Drafts',
  REVISIONS: 'Revisions',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

/**
 * REVISIONS reads as "Needs publishing" to anyone who can actually publish — the
 * same rows either way, since an encoder needs to see their own open revisions
 * just as much as a publisher does (D16).
 */
function tabLabel(tab: RegistryTab, canPublish: boolean): string {
  if (tab === 'REVISIONS' && canPublish) return 'Needs publishing';
  return TAB_LABELS[tab];
}

interface AIPRegistryTabsProps {
  tab: RegistryTab;
  /** Holds `aip:publish` — only changes the REVISIONS tab label. */
  canPublish?: boolean;
  tabCounts: Record<RegistryTab, number>;
  onTabChange: (tab: RegistryTab) => void;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  clusterValue: string;
  clusterOptions: { id: string; name: string }[];
  onClusterValueChange: (value: string) => void;
  officeValue: string;
  officeOptions: { id: string; name: string; acronym: string }[];
  onOfficeValueChange: (value: string) => void;
  finishLineValues: string[];
  finishLineOptions: { id: string; name: string; visionNumber: number | null }[];
  onFinishLineValuesChange: (values: string[]) => void;
  thematicTagValues: string[];
  thematicTagOptions: { id: string; name: string }[];
  onThematicTagValuesChange: (values: string[]) => void;
  /** Omit to leave the filter a plain multi-select (no permission, or the catalog hasn't loaded yet). */
  onThematicTagCreate?: (query: string) => Promise<{ value: string; label: string } | { error: string }>;
  showBreakdown: boolean;
  onShowBreakdownChange: (v: boolean) => void;
  searchPlaceholder?: string;
  /** "N programs across M offices" — rendered beside Office/Thematic Tags
   *  instead of its own row above the table, to save vertical space. */
  summary?: { totalItems: number; officeCount: number } | null;
}


export function FilterCombobox({
  value,
  label,
  activeLabel,
  onValueChange,
  options,
  searchable = true,
  searchPlaceholder = 'Search…',
}: {
  value: string;
  label: string;
  activeLabel: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string; sublabel?: string }[];
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const isActive = value !== 'all';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'inline-flex h-8 w-[150px] shrink-0 items-center justify-between gap-1 rounded-lg border px-2.5 text-xs transition-colors',
          isActive
            ? 'border-blue-300 bg-blue-50 text-blue-700'
            : 'border-slate-300 bg-white text-slate-500',
        )}
      >
        <span className="truncate flex-1 text-left">{isActive ? activeLabel : label}</span>
        {isActive ? (
          <span
            role="button"
            aria-label={`Clear ${label} filter`}
            className="shrink-0 rounded-sm p-0.5 text-blue-400 hover:bg-blue-100 hover:text-blue-700"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); onValueChange('all'); setOpen(false); }}
          >
            <X className="size-3" />
          </span>
        ) : (
          <ChevronsUpDown className="shrink-0 size-3 opacity-50" />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" side="bottom" align="start" sideOffset={4}>
        <Command>
          {searchable && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.sublabel ?? ''}`}
                  onSelect={() => { onValueChange(option.value); setOpen(false); }}
                  data-checked={value === option.value}
                >
                  <span className="flex flex-col">
                    <span>{option.label}</span>
                    {option.sublabel && (
                      <span className="text-xs text-muted-foreground">{option.sublabel}</span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
export default function AIPRegistryTabs({
  tab,
  canPublish = false,
  tabCounts,
  onTabChange,
  searchValue,
  onSearchValueChange,
  clusterValue,
  clusterOptions,
  onClusterValueChange,
  officeValue,
  officeOptions,
  onOfficeValueChange,
  finishLineValues,
  finishLineOptions,
  onFinishLineValuesChange,
  thematicTagValues,
  thematicTagOptions,
  onThematicTagValuesChange,
  onThematicTagCreate,
  showBreakdown,
  onShowBreakdownChange,
  searchPlaceholder = `Search PPAs, codes, ${goals}, or tags`,
  summary,
}: AIPRegistryTabsProps) {
  return (
    <div className="space-y-2 border-b border-slate-200 px-5 py-3">
      {/* Row 1: workflow tabs (left) + search / breakdown (right) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Workflow tabs */}
        <div
          role="tablist"
          aria-label="Registry workflow filter"
          className="flex flex-wrap gap-1"
        >
          {TAB_ORDER.map((value) => {
            const active = value === tab;
            const count = tabCounts[value] ?? 0;
            // Archived is rare (specs/013): offered only once something is in it.
            if (value === 'ARCHIVED' && count === 0 && !active) return null;
            return (
              <button
                key={value}
                id={`tab-${value}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls="aip-tabpanel"
                onClick={() => onTabChange(value)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                )}
              >
                {tabLabel(value, canPublish)}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                    active
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right controls: search · breakdown toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search input */}
          <div className="relative w-full sm:w-[200px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={searchValue}
              placeholder={searchPlaceholder}
              onChange={(e) => onSearchValueChange(e.target.value)}
              className="h-8 rounded-md border-slate-300 bg-white pl-8 text-xs"
            />
          </div>

          {/* Breakdown toggle — pill pair on desktop, icon-only on mobile */}
          <div
            role="group"
            aria-label="Column breakdown visibility"
            className="inline-flex shrink-0 rounded-md border border-slate-300 bg-slate-50 p-0.5"
          >
            <button
              type="button"
              aria-pressed={showBreakdown}
              onClick={() => onShowBreakdownChange(true)}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium transition-colors',
                showBreakdown
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              Full
            </button>
            <button
              type="button"
              aria-pressed={!showBreakdown}
              onClick={() => onShowBreakdownChange(false)}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium transition-colors',
                !showBreakdown
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              Compact
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: finish-line chips — same interaction as the public registry, so
          the two teach one mental model of the same data. */}
      {finishLineOptions.length > 0 && (
        <FinishLineChips
          finishLines={finishLineOptions}
          selected={finishLineValues}
          onChange={onFinishLineValuesChange}
          allCount={tabCounts.ALL}
        />
      )}

      {/* Row 3: cluster chips. Office stays a combobox — 57 of them do not fit
          as chips, and the public registry keeps it a dropdown for the same
          reason. */}
      {clusterOptions.length > 0 && (
        <ClusterChips
          clusters={clusterOptions}
          selected={clusterValue}
          onChange={onClusterValueChange}
        />
      )}

      {/* Row 4: office picker beside the thematic-tags multiselect, always in
          one row — both read as one "narrow by" bar regardless of whether a
          cluster has been picked. Thematic tags load async (a separate
          fetch), so it renders unconditionally too — gating on
          `thematicTagOptions.length` made it flash in a beat after Office on
          every load, reading as "missing". An empty catalog just shows no
          options in the dropdown until the fetch lands. The table's own
          "N programs across M offices" line rides along on the right of this
          same row instead of getting a strip of its own above the table. */}
      {officeOptions.length > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="flex flex-nowrap items-end gap-x-4 gap-y-3">
            <div className="shrink-0">
              <p className="mb-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                Office
              </p>
              <FilterCombobox
                value={officeValue}
                label="Office"
                activeLabel={officeOptions.find((o) => o.id === officeValue)?.acronym ?? ''}
                onValueChange={onOfficeValueChange}
                options={officeOptions.map((o) => ({ value: o.id, label: o.acronym, sublabel: o.name }))}
                searchPlaceholder="Search offices…"
              />
            </div>

            <div className="shrink-0">
              <p className="mb-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                Thematic Tags
              </p>
              <MultiSelectCombobox
                options={thematicTagOptions.map((t) => ({ value: t.id, label: t.name }))}
                value={thematicTagValues}
                onChange={onThematicTagValuesChange}
                placeholder="Thematic tags"
                searchPlaceholder="Search tags…"
                variant="compact"
                className="h-8 w-[180px] rounded-lg text-xs"
                onCreate={onThematicTagCreate}
              />
            </div>
          </div>

          {summary && (
            <span className="shrink-0 pb-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {summary.totalItems} {summary.totalItems === 1 ? 'program' : 'programs'} across{' '}
              {summary.officeCount} {summary.officeCount === 1 ? 'office' : 'offices'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
