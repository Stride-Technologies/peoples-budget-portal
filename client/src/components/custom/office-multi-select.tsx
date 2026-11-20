'use client';

import { MultiSelectCombobox } from './multi-select-combobox';
import type { ReferenceOption } from '@/lib/schemas';

interface OfficeMultiSelectProps {
  options: ReferenceOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** The implementing office ID (LGU only) — shown as a locked, non-removable chip. */
  lockedId?: string;
  /** The implementing office label for the locked chip. */
  lockedOption?: ReferenceOption;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
}

export function OfficeMultiSelect({
  options,
  value,
  onChange,
  lockedId,
  lockedOption,
  min,
  max,
  placeholder,
  disabled,
  error,
}: OfficeMultiSelectProps) {
  const comboboxOptions = options.map((o) => ({
    value: o.id,
    label: o.code,
    sublabel: o.name,
  }));

  const lockedValues = lockedId ? [lockedId] : [];
  const lockedLabels: Record<string, string> = lockedId && lockedOption
    ? { [lockedId]: `${lockedOption.code} — ${lockedOption.name}` }
    : {};

  return (
    <MultiSelectCombobox
      options={comboboxOptions}
      value={value}
      onChange={onChange}
      lockedValues={lockedValues}
      lockedLabels={lockedLabels}
      min={min}
      max={max}
      placeholder={placeholder}
      searchPlaceholder="Search offices…"
      disabled={disabled}
      error={error}
    />
  );
}
