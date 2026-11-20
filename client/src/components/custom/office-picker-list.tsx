'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn, matchesAllTerms } from '@/lib/utils';
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
import type { ReferenceOption } from '@/lib/schemas';

export interface PickedOffice {
  id: string;
  code: string;
  name: string;
  role: 'Primary' | 'Supporting';
  /** Can't be removed from the list (e.g. the caller's own office). */
  locked?: boolean;
}

interface OfficePickerListProps {
  /** In display order — the first row is always "Primary". */
  picked: PickedOffice[];
  /** Offices not yet picked, offered by the search box. */
  candidates: ReferenceOption[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  max: number;
  disabled?: boolean;
  error?: boolean;
  placeholder?: string;
}

/**
 * Notion-style picked-office list: role ("Primary" / "Supporting") is purely
 * positional — row 0 is primary — so promoting a different office is just
 * removing row 0. The search box adds more, up to `max`, and hides once full
 * (acceptance: "hide the input once 5 are picked").
 */
export function OfficePickerList({
  picked,
  candidates,
  onAdd,
  onRemove,
  max,
  disabled,
  error,
  placeholder = 'Search offices by name or code…',
}: Readonly<OfficePickerListProps>) {
  const [open, setOpen] = React.useState(false);
  const canAdd = picked.length < max && !disabled;

  return (
    <div className="flex flex-col gap-2">
      {picked.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {picked.map((o) => (
            <div
              key={o.id}
              className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 py-2 pl-3 pr-2"
            >
              <span className="w-16 shrink-0 text-xs font-semibold text-slate-900">
                {o.code}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                {o.name}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded px-2 py-0.5 text-[11px] font-medium',
                  o.role === 'Primary'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-slate-100 text-slate-600',
                )}
              >
                {o.role}
              </span>
              {!o.locked && (
                <button
                  type="button"
                  onClick={() => onRemove(o.id)}
                  aria-label={`Remove ${o.name}`}
                  disabled={disabled}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-600 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            disabled={disabled}
            aria-expanded={open}
            aria-haspopup="listbox"
            className={cn(
              'flex h-11 w-full items-center gap-2 rounded-lg border bg-white px-3 text-left text-sm',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error ? 'border-destructive ring-1 ring-destructive/20' : 'border-input',
              'cursor-pointer',
            )}
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-muted-foreground">{placeholder}</span>
          </PopoverTrigger>

          {/* w-[var(--anchor-width)] makes the dropdown exactly as wide as the trigger */}
          <PopoverContent
            className="w-[var(--anchor-width)] min-w-64 p-0"
            side="bottom"
            align="start"
            sideOffset={4}
          >
            <Command filter={(value, search) => (matchesAllTerms(value, search) ? 1 : 0)}>
              <CommandInput placeholder="Search by name or acronym…" />
              <CommandList className="max-h-56">
                <CommandEmpty>No offices found.</CommandEmpty>
                <CommandGroup>
                  {candidates.map((o) => (
                    <CommandItem
                      key={o.id}
                      value={`${o.code} ${o.name}`}
                      onSelect={() => {
                        onAdd(o.id);
                        setOpen(false);
                      }}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{o.code}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {o.name}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
