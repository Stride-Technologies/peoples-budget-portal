'use client';

import { Search } from 'lucide-react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GOAL, goals } from '@/lib/goal-label';


interface AIPControlsProps {
  programCount?: number;
  searchValue: string;
  finishLineValue: string;
  finishLineOptions: Array<{ value: string; label: string }>;
  isFinishLineLoading?: boolean;
  onSearchValueChange: (value: string) => void;
  onFinishLineValueChange: (value: string) => void;
  onClearFilters: () => void;
  searchPlaceholder?: string;
  showBreakdown?: boolean;
  onShowBreakdownChange?: (v: boolean) => void;
}

function FilterChip({
  label,
  onRemove,
  className,
}: {
  label: string;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-neutral-700',
        className,
      )}
    >
      <span className="whitespace-nowrap">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full transition hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function AIPControls({
  programCount = 0,
  searchValue,
  finishLineValue,
  finishLineOptions,
  isFinishLineLoading = false,
  onSearchValueChange,
  onFinishLineValueChange,
  onClearFilters,
  searchPlaceholder = 'Search programs, codes...',
  showBreakdown = true,
  onShowBreakdownChange,
}: AIPControlsProps) {
  const hasActiveFilters = finishLineValue !== 'all';
  const selectedFinishLineLabel =
    finishLineOptions.find((option) => option.value === finishLineValue)?.label ??
    finishLineValue;

  const finishLineTriggerLabel = isFinishLineLoading
    ? `${GOAL}: Loading...`
    : finishLineValue === 'all'
      ? `${GOAL}: All`
      : `${GOAL}: ${selectedFinishLineLabel}`;

  return (
    <div className="space-y-4 border-b border-slate-200 px-5 py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="flex flex-col gap-1">
          <div>
            <h2 className="font-heading text-lg font-semibold text-slate-950">
              AIP Master List
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {programCount} program{programCount === 1 ? '' : 's'} in the
              current view.
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger>
                <Badge
                  variant="secondary"
                  className="rounded-md border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                >
                  Program
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Contains sub-items</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger>
                <Badge
                  variant="outline"
                  className="rounded-md border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                >
                  Project
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Individual entry</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger>
                <Badge
                  variant="outline"
                  className="rounded-md border-amber-200 bg-amber-50 text-amber-800"
                >
                  ⚠ Multi-finish
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Multiple {goals} detected</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:max-w-[760px] lg:items-end">
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <div className="relative w-full md:w-[320px] lg:w-[300px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchValue}
                placeholder={searchPlaceholder}
                onChange={(event) => onSearchValueChange(event.target.value)}
                className="h-10 rounded-md border-slate-300 bg-white pl-9"
              />
            </div>

            <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center md:justify-end md:gap-2">
              <Select
                value={finishLineValue}
                onValueChange={(value) => onFinishLineValueChange(value as string)}
                disabled={isFinishLineLoading}
              >
                <SelectTrigger className="h-10 w-full rounded-md border-slate-300 md:w-[220px]">
                  <span className="min-w-0 flex-1 truncate text-left">
                    {finishLineTriggerLabel}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    All {goals}
                  </SelectItem>
                  {isFinishLineLoading ? (
                    <SelectItem value="loading" disabled>
                      Loading...
                    </SelectItem>
                  ) : finishLineOptions.length > 0 ? (
                    finishLineOptions.map((finishLine) => (
                      <SelectItem
                        key={finishLine.value}
                        value={finishLine.value}
                      >
                        {finishLine.label}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No {goals} available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>

              {/* Breakdown toggle (desktop) */}
              <div className="hidden md:block">
                <Button
                  variant={showBreakdown ? 'outline' : 'ghost'}
                  size="sm"
                  onClick={() => onShowBreakdownChange?.(!showBreakdown)}
                  className="h-10 px-3 text-xs"
                >
                  {showBreakdown ? 'Hide breakdown' : 'Show breakdown'}
                </Button>
              </div>
            </div>
          </div>

          {hasActiveFilters ? (
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                label={`${GOAL}: ${selectedFinishLineLabel}`}
                onRemove={() => onFinishLineValueChange('all')}
                className="border-neutral-300 bg-neutral-50 text-neutral-700"
              />
              <button
                type="button"
                onClick={onClearFilters}
                className="text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
