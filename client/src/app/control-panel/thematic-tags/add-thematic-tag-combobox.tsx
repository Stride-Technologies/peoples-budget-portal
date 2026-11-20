'use client';

import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { matchesAllTerms } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
import type { ThematicTagWithUsage } from '@/lib/api';
import { createThematicTagByName } from './_actions';

/**
 * Search-to-create, same interaction as the inline `ThematicTagPicker` a
 * program/PA uses to tag itself (FR-005/FR-006) — typing shows every
 * existing name live, active or not, so a near-duplicate is visible before
 * it's created rather than caught after via a 409. There is nothing to
 * "apply" an existing match to here (this is the catalog itself, not a
 * program), so an existing row is shown but not selectable — only "Create …"
 * does anything.
 */
export function AddThematicTagCombobox({
  tags,
}: {
  tags: ThematicTagWithUsage[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = search.trim();
  const matches = query
    ? tags.filter((t) => matchesAllTerms(t.name, query))
    : tags;
  const exactExists = tags.some(
    (t) => t.name.trim().toLowerCase() === query.toLowerCase(),
  );

  function reset() {
    setSearch('');
    setError(null);
  }

  async function create() {
    setPending(true);
    setError(null);
    const result = await createThematicTagByName(query);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger
        render={
          <Button size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />
            Add tag
          </Button>
        }
      />
      <PopoverContent className="w-80 p-0" align="end">
        <Command filter={(value, search) => (matchesAllTerms(value, search) ? 1 : 0)}>
          <CommandInput
            placeholder="Search or create a tag…"
            value={search}
            onValueChange={(v) => {
              setSearch(v);
              setError(null);
            }}
          />
          <CommandList>
            <CommandEmpty>No matching tags.</CommandEmpty>
            <CommandGroup>
              {matches.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={tag.name}
                  disabled
                  className="justify-between data-[disabled=true]:opacity-100"
                >
                  <span className={!tag.isActive ? 'text-muted-foreground' : undefined}>
                    {tag.name}
                  </span>
                  {!tag.isActive && (
                    <Badge variant="secondary" className="text-[10px]">
                      Inactive
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {query && !exactExists && (
              <CommandGroup>
                <CommandItem
                  value={`__create__ ${query}`}
                  disabled={pending}
                  onSelect={() => create()}
                >
                  {pending ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 size-3.5" />
                  )}
                  Create &quot;{query}&quot;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
          {error && (
            <p className="border-t border-border px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
