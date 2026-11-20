'use client';

import * as React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_LABELS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type MonthYearValue = { month: number; year: number };

export interface MonthYearPickerProps {
  value?: MonthYearValue;
  onChange: (value: MonthYearValue) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  minYear?: number;
  maxYear?: number;
  id?: string;
  className?: string;
  'aria-invalid'?: boolean;
}

export function MonthYearPicker({
  value,
  onChange,
  placeholder = 'Select month & year',
  error,
  disabled,
  minYear,
  maxYear,
  id,
  className,
  'aria-invalid': ariaInvalid,
}: Readonly<MonthYearPickerProps>) {
  const today = new Date();
  const defaultYear = today.getFullYear();
  const lowerYear = minYear ?? 2000;
  const upperYear = maxYear ?? 2100;

  const [open, setOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState<number>(value?.year ?? minYear ?? defaultYear);

  const handleOpenChange = (next: boolean) => {
    if (next) setViewYear(value?.year ?? minYear ?? defaultYear);
    setOpen(next);
  };

  const triggerLabel = value
    ? `${MONTH_LABELS_LONG[value.month - 1]} ${value.year}`
    : placeholder;

  const canStepBack = viewYear > lowerYear;
  const canStepForward = viewYear < upperYear;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={ariaInvalid ?? error ?? undefined}
            className={cn(
              'w-full justify-between font-normal',
              !value && 'text-neutral-500',
              error && 'border-red-300 focus-visible:ring-red-500',
              className,
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <CalendarDays className="h-4 w-4 text-neutral-500" />
          </Button>
        }
      />
      <PopoverContent className="w-64 p-3">
        <div className="mb-3 flex items-center justify-between">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!canStepBack}
            onClick={() => setViewYear((y) => Math.max(lowerYear, y - 1))}
            aria-label="Previous year"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold tabular-nums text-neutral-900">
            {viewYear}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!canStepForward}
            onClick={() => setViewYear((y) => Math.min(upperYear, y + 1))}
            aria-label="Next year"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {MONTH_LABELS.map((label, idx) => {
            const month = idx + 1;
            const isSelected =
              value?.month === month && value?.year === viewYear;
            return (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={isSelected ? 'default' : 'ghost'}
                className={cn(
                  'h-8 text-xs',
                  !isSelected && 'text-neutral-700 hover:bg-neutral-100',
                )}
                onClick={() => {
                  onChange({ month, year: viewYear });
                  setOpen(false);
                }}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function monthYearFromFields(
  month: number | null | undefined,
  year: number | null | undefined,
): MonthYearValue | undefined {
  if (month == null || year == null) return undefined;
  return { month, year };
}
