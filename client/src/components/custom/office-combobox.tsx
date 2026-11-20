'use client';

import * as React from 'react';
import { ChevronsUpDown } from 'lucide-react';
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
import type { DepartmentOption } from '@/lib/schemas';

interface OfficeComboboxProps {
  id?: string;
  /** Offices to choose from — already filtered to what the caller may pick. */
  options: DepartmentOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
}

/**
 * Searchable single-select office picker, grouped by strategic cluster. Offices
 * without a cluster fall into a trailing "Other" group so nothing is hidden.
 */
export function OfficeCombobox({
  id,
  options,
  value,
  onChange,
  placeholder = 'Select implementing office',
  disabled = false,
  error = false,
}: OfficeComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const groups = React.useMemo(() => {
    const byCluster = new Map<string, DepartmentOption[]>();
    for (const office of options) {
      const key = office.clusterName ?? 'Other';
      const bucket = byCluster.get(key);
      if (bucket) bucket.push(office);
      else byCluster.set(key, [office]);
    }
    return [...byCluster.entries()].sort(([a], [b]) =>
      a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b),
    );
  }, [options]);

  const selected = options.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'flex h-11 w-full items-center gap-1.5 rounded-lg border bg-white px-3 text-sm',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-destructive ring-1 ring-destructive/20' : 'border-input',
          !disabled && 'cursor-pointer',
        )}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? `${selected.code} — ${selected.name}` : placeholder}
        </span>
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
          <CommandInput placeholder="Search acronym or office name…" />
          <CommandList>
            <CommandEmpty>No offices found.</CommandEmpty>
            {groups.map(([cluster, offices]) => (
              <CommandGroup key={cluster} heading={cluster}>
                {offices.map((office) => (
                  <CommandItem
                    key={office.id}
                    value={`${office.code} ${office.name}`}
                    onSelect={() => {
                      onChange(office.id);
                      setOpen(false);
                    }}
                    data-checked={office.id === value}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{office.code}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {office.name}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
