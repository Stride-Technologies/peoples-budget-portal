'use client';

import * as React from 'react';
import { X, ChevronsUpDown, Check, Plus, Loader2 } from 'lucide-react';
import { cn, matchesAllTerms } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface MultiSelectComboboxProps {
  options: ComboboxOption[];
  value: string[];
  onChange: (values: string[]) => void;
  /** Values that appear as chips in the trigger but cannot be removed and are excluded from the dropdown. */
  lockedValues?: string[];
  /** Display labels for locked values, keyed by value. */
  lockedLabels?: Record<string, string>;
  min?: number;
  max?: number;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  error?: boolean;
  /**
   * 'scroll' (default): all chips shown with a horizontal scrollbar.
   * 'compact': shows the first chip + "+N more" badge.
   */
  variant?: 'scroll' | 'compact';
  /**
   * When set, a search with no exact (case-insensitive) match among `options`
   * shows a "Create …" row; selecting it calls this, then selects whatever
   * option it returns. The caller owns the catalog — it's expected to add the
   * new option to `options` itself so the new chip resolves a label. Omit to
   * keep this a plain multi-select (e.g. offices, fund sources).
   */
  onCreate?: (query: string) => Promise<{ value: string; label: string } | { error: string }>;
}

export function MultiSelectCombobox({
  options,
  value,
  onChange,
  lockedValues = [],
  lockedLabels = {},
  min: _min,
  max,
  placeholder = 'Select options…',
  searchPlaceholder = 'Search…',
  disabled = false,
  className,
  error = false,
  variant = 'scroll',
  onCreate,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const isSelected = (v: string) => value.includes(v);

  const toggle = (v: string) => {
    if (isSelected(v)) {
      onChange(value.filter((id) => id !== v));
    } else {
      if (max !== undefined && value.length >= max) return;
      onChange([...value, v]);
    }
  };

  const remove = (v: string) => {
    onChange(value.filter((id) => id !== v));
  };

  const selectableOptions = options.filter((o) => !lockedValues.includes(o.value));
  const atMax = max !== undefined && value.length >= max;

  const query = search.trim();
  const exactExists = options.some((o) => o.label.trim().toLowerCase() === query.toLowerCase());

  async function handleCreate() {
    if (!onCreate) return;
    setCreating(true);
    setCreateError(null);
    const result = await onCreate(query);
    setCreating(false);
    if ('error' in result) {
      setCreateError(result.error);
      return;
    }
    if (max === undefined || value.length < max) {
      onChange([...value, result.value]);
    }
    setSearch('');
  }

  const allChips: Array<{ id: string; label: string; locked: boolean }> = [
    ...lockedValues.map((v) => ({
      id: v,
      label: lockedLabels[v] ?? v,
      locked: true,
    })),
    ...value.map((v) => {
      const opt = options.find((o) => o.value === v);
      return { id: v, label: opt?.label ?? v, locked: false };
    }),
  ];

  // Compact variant only
  const visibleChip = allChips[0] ?? null;
  const hiddenCount = allChips.length - 1;

  const removeButton = (chip: { id: string; label: string }) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        remove(chip.id);
      }}
      className="ml-0.5 shrink-0 rounded-sm opacity-60 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      aria-label={`Remove ${chip.label}`}
    >
      <X className="size-3" />
    </button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setSearch('');
          setCreateError(null);
        }
      }}
    >
      {/* Render as div to allow <button> remove chips inside without nesting <button> in <button> */}
      <PopoverTrigger
        render={<div />}
        nativeButton={false}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'flex h-11 w-full items-center gap-1.5 rounded-lg border bg-white px-3 text-sm',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-destructive ring-1 ring-destructive/20' : 'border-input',
          !disabled && 'cursor-pointer',
          className,
        )}
      >
        {variant === 'scroll' ? (
          <div
            className={cn(
              'flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto',
              '[&::-webkit-scrollbar]:h-1',
              '[&::-webkit-scrollbar-track]:bg-transparent',
              '[&::-webkit-scrollbar-thumb]:rounded-full',
              '[&::-webkit-scrollbar-thumb]:bg-border',
            )}
            // scrollbarWidth: thin for Firefox
            style={{ scrollbarWidth: 'thin' }}
          >
            {allChips.length > 0 ? (
              allChips.map((chip) =>
                chip.locked ? (
                  <Badge
                    key={chip.id}
                    variant="secondary"
                    className="shrink-0 whitespace-nowrap text-xs font-medium"
                  >
                    {chip.label}
                  </Badge>
                ) : (
                  <Badge
                    key={chip.id}
                    variant="secondary"
                    className="shrink-0 gap-1 whitespace-nowrap pr-0.5 text-xs font-medium"
                  >
                    <span>{chip.label}</span>
                    {removeButton(chip)}
                  </Badge>
                )
              )
            ) : (
              <span className="whitespace-nowrap text-muted-foreground">{placeholder}</span>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {visibleChip ? (
              <>
                {visibleChip.locked ? (
                  <Badge
                    variant="secondary"
                    className="shrink-0 max-w-[55%] truncate text-xs font-medium"
                  >
                    {visibleChip.label}
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="shrink-0 max-w-[55%] gap-1 truncate pr-0.5 text-xs font-medium"
                  >
                    <span className="truncate">{visibleChip.label}</span>
                    {removeButton(visibleChip)}
                  </Badge>
                )}
                {hiddenCount > 0 && (
                  <Badge
                    variant="outline"
                    className="shrink-0 whitespace-nowrap text-xs text-muted-foreground"
                  >
                    +{hiddenCount} more
                  </Badge>
                )}
              </>
            ) : (
              <span className="truncate text-muted-foreground">{placeholder}</span>
            )}
          </div>
        )}
        <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
      </PopoverTrigger>

      {/* w-[var(--anchor-width)] makes the dropdown exactly as wide as the trigger */}
      <PopoverContent
        className="w-[var(--anchor-width)] min-w-56 p-0"
        side="bottom"
        align="start"
        sideOffset={4}
      >
        <Command filter={(value, search) => (matchesAllTerms(value, search) ? 1 : 0)}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={(v) => {
              setSearch(v);
              setCreateError(null);
            }}
          />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {selectableOptions.map((option) => {
                const selected = isSelected(option.value);
                const disabled = atMax && !selected;
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.sublabel ?? ''}`}
                    onSelect={() => !disabled && toggle(option.value)}
                    data-checked={selected}
                    data-disabled={disabled || undefined}
                    // This list is multi-select, so the base checkmark-on-the-right
                    // (built for single-select combos) reads as "nothing picked yet"
                    // rather than "pick any number" — a checkbox up front says that
                    // at a glance. The trailing checkmark is hidden here only.
                    className={cn('[&>svg:last-child]:hidden', disabled && 'opacity-40 pointer-events-none')}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-white',
                      )}
                    >
                      {selected && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="flex flex-col">
                      <span>{option.label}</span>
                      {option.sublabel && (
                        <span className="text-xs text-muted-foreground">{option.sublabel}</span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {onCreate && query && !exactExists && (
              <CommandGroup>
                <CommandItem
                  value={`__create__ ${query}`}
                  disabled={creating}
                  onSelect={() => handleCreate()}
                >
                  {creating ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 size-3.5" />
                  )}
                  Create &quot;{query}&quot;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
          {createError && (
            <p className="border-t border-border px-3 py-2 text-xs text-destructive">
              {createError}
            </p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
