'use client';

import * as React from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export interface SimpleSelectOption {
  value: string;
  label: string;
  /** Second line under the label, e.g. what choosing this option means. */
  description?: string;
  /** Muted text at the right of the row, e.g. a count. Menu only. */
  hint?: string;
}

interface SimpleSelectProps {
  options: SimpleSelectOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  /** Leading icon in the trigger, e.g. a filter or sort glyph. */
  icon?: React.ReactNode;
  /** 'sm' (h-9, toolbars and table footers) or 'default' (h-11, form fields). */
  size?: 'sm' | 'default';
  disabled?: boolean;
  error?: boolean;
  className?: string;
  /** Popup width; defaults to matching the trigger. */
  contentClassName?: string;
  'aria-label'?: string;
}

/**
 * The project's one dropdown for a flat list of choices.
 *
 * Native `<select>` renders an OS menu that matches nothing else in the app, and
 * hand-rolled poppers drifted apart, so every plain choice list goes through this
 * one: Popover + Command, `data-checked` for the trailing check. Reach for
 * `OfficeCombobox` when the list needs searching or cluster grouping, and
 * `MultiSelectCombobox` when more than one value can be picked.
 */
export function SimpleSelect({
  options,
  value,
  onChange,
  id,
  placeholder = 'Select…',
  icon,
  size = 'default',
  disabled = false,
  error = false,
  className,
  contentClassName,
  'aria-label': ariaLabel,
}: SimpleSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        className={cn(
          'inline-flex w-full items-center gap-1.5 rounded-lg border bg-tbl-surface px-3 text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'h-9' : 'h-11',
          error
            ? 'border-destructive ring-1 ring-destructive/20'
            : 'border-tbl-rule-strong hover:border-tbl-rule-hover',
          className,
        )}
      >
        {icon}
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronsUpDown className="ml-auto size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>

      {/* w-[var(--anchor-width)] keeps the popup the width of the trigger */}
      <PopoverContent
        className={cn('w-[var(--anchor-width)] min-w-40 p-0', contentClassName)}
        side="bottom"
        align="start"
        sideOffset={4}
      >
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  data-checked={option.value === value}
                >
                  {/* flex-1 (not ml-auto on the hint) does the aligning: the
                      check CommandItem appends also uses ml-auto, and two auto
                      margins split the free space between them, which left the
                      hint floating mid-row. */}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {option.hint && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {option.hint}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
