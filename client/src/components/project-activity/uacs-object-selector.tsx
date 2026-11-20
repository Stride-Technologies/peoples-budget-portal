'use client';

import { Controller, Control, FieldErrors, useWatch } from 'react-hook-form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select';
import { AddProjectActivityFormValues } from '@/lib/schemas';
import type { UacsObjectRecord } from '@/lib/api';
import { cn } from '@/lib/utils';

interface UACSObjectSelectorProps {
  control: Control<AddProjectActivityFormValues>;
  fieldIndex: number;
  errors: FieldErrors<AddProjectActivityFormValues>;
  uacsObjects: UacsObjectRecord[];
}

export default function UACSObjectSelector({
  control,
  fieldIndex,
  errors,
  uacsObjects,
}: Readonly<UACSObjectSelectorProps>) {
  const expenseClass = useWatch({ control, name: `lineItems.${fieldIndex}.expenseClass` });
  const selectedId = useWatch({ control, name: `lineItems.${fieldIndex}.uacsObjectId` });

  const lineItemError = errors.lineItems?.[fieldIndex]?.uacsObjectId;

  const filtered = uacsObjects.filter((o) => o.expenseClass === expenseClass && o.isActive);
  const selected = filtered.find((o) => o.id === selectedId);
  const selectedLabel = selected ? `${selected.code} — ${selected.description}` : '';

  return (
    <Controller<AddProjectActivityFormValues, `lineItems.${number}.uacsObjectId`>
      name={`lineItems.${fieldIndex}.uacsObjectId`}
      control={control}
      render={({ field }) => (
        <div className="flex-1">
          <Select value={(field.value as string | undefined) || ''} onValueChange={field.onChange}>
            <SelectTrigger
              aria-invalid={!!lineItemError}
              className={cn('text-sm h-12', lineItemError && 'border-red-300')}
            >
              <span className={selectedId ? '' : 'text-neutral-500'}>
                {selectedLabel || 'Select UACS'}
              </span>
            </SelectTrigger>
            <SelectContent
              className="max-h-[40vh] w-[min(78vw,560px)]"
              align="start"
              alignItemWithTrigger={false}
            >
              {filtered.length > 0 ? (
                <SelectGroup>
                  <SelectLabel className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-700">
                    {expenseClass}
                  </SelectLabel>
                  {filtered.map((obj) => (
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
              ) : (
                <div className="px-2 py-1.5 text-xs text-neutral-500">
                  {uacsObjects.length === 0
                    ? 'Loading UACS objects…'
                    : 'No objects for selected expense class'}
                </div>
              )}
            </SelectContent>
          </Select>
          {lineItemError && (
            <p className="text-xs text-red-600 mt-1">{lineItemError.message}</p>
          )}
        </div>
      )}
    />
  );
}
