'use client';

import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { matchesAllTerms } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
import { closeMatchFrom, type ThematicTagRef } from '@/lib/api';

interface ThematicTagPickerProps {
  /** The full active catalog (small — loaded whole, same as climate codes). */
  catalog: ThematicTagRef[];
  /** Tag ids already showing on this item (own + inherited) — hidden from results. */
  excludeIds: string[];
  disabled?: boolean;
  onSelectExisting: (tag: ThematicTagRef) => void | Promise<void>;
  /**
   * Finds-or-creates by name. Resolves to the matched/created tag on an
   * unambiguous create or an exact catalog match; rejects with the raw error
   * on a 409 close-match (read via `closeMatchFrom`) or any other failure.
   */
  onCreate: (name: string, confirmNew?: boolean) => Promise<ThematicTagRef>;
}

/**
 * Notion-style multi-select field: fuzzy-search the catalog, select an
 * existing tag, or create one inline when nothing matches (FR-005, FR-006).
 * One tag per interaction — applying immediately closes the popover, which is
 * what SC-001 means by "two interactions: open the picker, select a result."
 */
export function ThematicTagPicker({
  catalog,
  excludeIds,
  disabled,
  onSelectExisting,
  onCreate,
}: Readonly<ThematicTagPickerProps>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; closeMatch: ThematicTagRef } | null>(
    null,
  );

  const available = catalog.filter((t) => !excludeIds.includes(t.id));
  const query = search.trim();
  const exactExists = catalog.some(
    (t) => t.name.trim().toLowerCase() === query.toLowerCase(),
  );

  function reset() {
    setSearch('');
    setConfirm(null);
    setError(null);
  }

  async function select(tag: ThematicTagRef) {
    await onSelectExisting(tag);
    setOpen(false);
    reset();
  }

  async function create(confirmNew: boolean) {
    const name = confirm?.text ?? query;
    setPending(true);
    setError(null);
    try {
      const tag = await onCreate(name, confirmNew);
      await onSelectExisting(tag);
      setOpen(false);
      reset();
    } catch (err) {
      const closeMatch = closeMatchFrom(err);
      if (closeMatch) {
        setConfirm({ text: name, closeMatch });
      } else {
        setError((err as Error).message ?? 'Failed to create tag.');
      }
    } finally {
      setPending(false);
    }
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
          <Button type="button" variant="outline" size="sm" disabled={disabled}>
            <Plus className="mr-1 size-3.5" />
            Add tag
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="start">
        <Command filter={(value, search) => (matchesAllTerms(value, search) ? 1 : 0)}>
          <CommandInput
            placeholder="Search or create a tag…"
            value={search}
            onValueChange={(v) => {
              setSearch(v);
              setConfirm(null);
              setError(null);
            }}
          />
          <CommandList>
            {confirm ? (
              <div className="space-y-2 p-3 text-xs">
                <p className="text-muted-foreground">
                  Did you mean <span className="font-semibold text-foreground">{confirm.closeMatch.name}</span>?
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => select(confirm.closeMatch)}>
                    Use &quot;{confirm.closeMatch.name}&quot;
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => create(true)}
                  >
                    {pending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    Create &quot;{confirm.text}&quot; anyway
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <CommandEmpty>No matching tags.</CommandEmpty>
                <CommandGroup>
                  {available.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      onSelect={() => select(tag)}
                    >
                      {tag.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {query && !exactExists && (
                  <CommandGroup>
                    <CommandItem
                      value={`__create__ ${query}`}
                      disabled={pending}
                      onSelect={() => create(false)}
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
              </>
            )}
          </CommandList>
          {error && (
            <p className="border-t border-border px-3 py-2 text-xs text-destructive">{error}</p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
