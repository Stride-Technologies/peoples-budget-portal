'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select';
import type { UacsObjectRecord } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PpmpUacsObjectSelectorProps {
  value: string;
  onChange: (id: string) => void;
  error?: boolean;
  uacsObjects: UacsObjectRecord[];
}

const EXPENSE_CLASS_ORDER = ['PS', 'MOOE', 'FE', 'CO'] as const;

/**
 * Browses the full active UACS catalog, grouped by expense class (PS / MOOE
 * / FE / CO) — not filtered to one, since the line item no longer carries its
 * own Expense Class to filter by. Mirrors project-activity/uacs-object-
 * selector.tsx's markup, retyped as a plain controlled component instead of
 * a react-hook-form-bound one (specs/001-ppmp-creation/research.md
 * Decision 4).
 */
export default function PpmpUacsObjectSelector({
  value,
  onChange,
  error,
  uacsObjects,
}: Readonly<PpmpUacsObjectSelectorProps>) {
  const active = uacsObjects.filter((o) => o.isActive);
  const selected = active.find((o) => o.id === value);
  const selectedLabel = selected ? `${selected.code} — ${selected.description}` : '';

  return (
    <div className="flex-1">
      <Select value={value || ''} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger
          aria-invalid={!!error}
          className={cn('text-sm h-11', error && 'border-red-300')}
        >
          <span
            className={cn('min-w-0 flex-1 truncate text-left', !value && 'text-neutral-500')}
            title={selectedLabel || undefined}
          >
            {selectedLabel || 'Select UACS object'}
          </span>
        </SelectTrigger>
        <SelectContent
          className="max-h-[40vh] w-[min(78vw,560px)]"
          align="start"
          alignItemWithTrigger={false}
        >
          {active.length > 0 ? (
            EXPENSE_CLASS_ORDER.map((expenseClass) => {
              const group = active.filter((o) => o.expenseClass === expenseClass);
              if (group.length === 0) return null;
              return (
                <SelectGroup key={expenseClass}>
                  <SelectLabel className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-700">
                    {expenseClass}
                  </SelectLabel>
                  {group.map((obj) => (
                    <SelectItem key={obj.id} value={obj.id}>
                      <div className="flex items-center gap-3 py-1.5 px-3">
                        <span className="w-32 shrink-0 font-mono text-sm text-slate-900">
                          {obj.code}
                        </span>
                        <span className="min-w-0 text-sm text-neutral-700">
                          {obj.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                </SelectGroup>
              );
            })
          ) : (
            <div className="px-2 py-1.5 text-xs text-neutral-500">
              Loading UACS objects…
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
