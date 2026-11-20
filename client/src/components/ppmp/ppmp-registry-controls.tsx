'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FilterCombobox } from '@/components/aip/aip-registry-tabs';
import type { PpmpRegistryTab } from '@/lib/ppmp-filter-cookie';

const TAB_ORDER: PpmpRegistryTab[] = ['ALL', 'UNPUBLISHED', 'PUBLISHED'];
const TAB_LABELS: Record<PpmpRegistryTab, string> = {
  ALL: 'All',
  UNPUBLISHED: 'Unpublished',
  PUBLISHED: 'Published',
};

interface PpmpRegistryControlsProps {
  tab: PpmpRegistryTab;
  tabCounts: Record<PpmpRegistryTab, number>;
  onTabChange: (tab: PpmpRegistryTab) => void;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  officeValue: string;
  officeOptions: { id: string; name: string; acronym: string }[];
  onOfficeValueChange: (value: string) => void;
  showBreakdown: boolean;
  onShowBreakdownChange: (v: boolean) => void;
}

export default function PpmpRegistryControls({
  tab,
  tabCounts,
  onTabChange,
  searchValue,
  onSearchValueChange,
  officeValue,
  officeOptions,
  onOfficeValueChange,
  showBreakdown,
  onShowBreakdownChange,
}: Readonly<PpmpRegistryControlsProps>) {
  const selectedOffice = officeOptions.find((o) => o.id === officeValue);

  return (
    <div className="space-y-2 border-b border-slate-200 px-5 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="PPMP publish filter" className="flex flex-wrap gap-1">
          {TAB_ORDER.map((value) => {
            const active = value === tab;
            const count = tabCounts[value] ?? 0;
            return (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => onTabChange(value)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                )}
              >
                {TAB_LABELS[value]}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                    active ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterCombobox
            value={officeValue}
            label="Office"
            activeLabel={selectedOffice ? `${selectedOffice.acronym}` : 'Office'}
            onValueChange={onOfficeValueChange}
            options={officeOptions.map((o) => ({
              value: o.id,
              label: o.acronym,
              sublabel: o.name,
            }))}
            searchPlaceholder="Search offices…"
          />

          <div className="relative w-full sm:w-[200px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={searchValue}
              placeholder="Search PPMPs"
              onChange={(e) => onSearchValueChange(e.target.value)}
              className="h-8 rounded-md border-slate-300 bg-white pl-8 text-xs"
            />
          </div>

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
                showBreakdown ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
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
                !showBreakdown ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              Compact
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
