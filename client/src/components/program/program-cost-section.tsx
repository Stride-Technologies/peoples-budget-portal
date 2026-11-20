'use client';

import { useEffect, useRef } from 'react';
import {
  Control,
  Controller,
  FieldErrors,
  UseFormSetValue,
  useWatch,
} from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import {
  NewProgramFormValues,
  FUND_SOURCES,
  type FundAllocationLine,
} from '@/lib/schemas';
import { addDecimalStrings, formatPeso } from '@/lib/currency-formatter';
import { Checkbox } from '@/components/ui/checkbox';
import { CurrencyInput } from '@/components/custom/currency-input';
import { MultiSelectCombobox } from '@/components/custom/multi-select-combobox';
import {
  FundSplitEditor,
  emptyFundLine,
  sumFundLines,
} from '@/components/custom/fund-split-editor';
import { cn } from '@/lib/utils';

interface ProgramCostSectionProps {
  control: Control<NewProgramFormValues>;
  errors: FieldErrors<NewProgramFormValues>;
  /** Locked once the program has project/activities — the two are exclusive. */
  disabled?: boolean;
  /** Keeps the four figures and the fund list equal to the per-fund lines while split. */
  setValue: UseFormSetValue<NewProgramFormValues>;
  /** 'card' (default): the original layout (full-page create form, edit
   * drawer) — per-row fund pickers, unconditional split checkbox. 'drawer':
   * the New Program drawer's chips-drive-rows cost table. */
  variant?: 'card' | 'drawer';
}

const CLASSES = [
  {
    field: 'psProposedTotal' as const,
    code: 'PS',
    label: 'Personnel Services',
  },
  {
    field: 'mooeProposedTotal' as const,
    code: 'MOOE',
    label: 'Maint. & Operating',
  },
  {
    field: 'feProposedTotal' as const,
    code: 'FE',
    label: 'Financial Expenses',
  },
  {
    field: 'coProposedTotal' as const,
    code: 'CO',
    label: 'Capital Outlay',
  },
];

const EXPENSE_KEYS = ['ps', 'mooe', 'fe', 'co'] as const;
const EXPENSE_LABEL: Record<(typeof EXPENSE_KEYS)[number], string> = {
  ps: 'PS',
  mooe: 'MOOE',
  fe: 'FE',
  co: 'CO',
};
const EXPENSE_FULL: Record<(typeof EXPENSE_KEYS)[number], string> = {
  ps: 'Personnel Services',
  mooe: 'Maintenance & Other Operating Expenses',
  fe: 'Financial Expenses',
  co: 'Capital Outlay',
};
const SCALAR_FIELD = {
  ps: 'psProposedTotal' as const,
  mooe: 'mooeProposedTotal' as const,
  fe: 'feProposedTotal' as const,
  co: 'coProposedTotal' as const,
};

/**
 * Optional program-level costs.
 *
 * Most programs derive their budget from the project/activities beneath them,
 * which is the default and needs nothing here. A program whose costs were never
 * broken into PPAs — the papClass *is* the programme, and the office states one
 * figure against it — ticks this box instead.
 *
 * The two are mutually exclusive, the same way a PA is either `DIRECT_COSTS` or
 * `ACTIVITY_CHILDREN`: a program that states its own costs cannot also hold
 * PPAs, or its total would stop equalling what is visible underneath it. The
 * server enforces that in both directions.
 */
export function ProgramCostSection({
  control,
  errors,
  disabled = false,
  setValue,
  variant = 'card',
}: ProgramCostSectionProps) {
  const hasOwnCosts = useWatch({ control, name: 'hasOwnCosts' });
  const ps = useWatch({ control, name: 'psProposedTotal' });
  const mooe = useWatch({ control, name: 'mooeProposedTotal' });
  const fe = useWatch({ control, name: 'feProposedTotal' });
  const co = useWatch({ control, name: 'coProposedTotal' });
  const funds = useWatch({ control, name: 'fundSources' });
  const split = useWatch({ control, name: 'splitByFund' });
  const lines = useWatch({ control, name: 'fundAllocations' });

  // Card variant (unchanged): the per-row fund pickers in FundSplitEditor are
  // the source of truth, so the scalar totals and the fund list are derived
  // from them.
  useEffect(() => {
    if (variant === 'drawer') return;
    if (!split || !lines) return;
    setValue('psProposedTotal', sumFundLines(lines, 'ps'));
    setValue('mooeProposedTotal', sumFundLines(lines, 'mooe'));
    setValue('feProposedTotal', sumFundLines(lines, 'fe'));
    setValue('coProposedTotal', sumFundLines(lines, 'co'));
    setValue(
      'fundSources',
      lines.flatMap((l) => (l.fundSource ? [l.fundSource] : [])),
    );
  }, [variant, split, lines, setValue]);

  // Drawer variant: the "Source of funds" chips are the source of truth — a
  // row exists for exactly the funds currently selected, in that order, with
  // no separate per-row fund picker. `linesRef` lets the reconciliation
  // effect read the latest lines without depending on them (depending on
  // `lines` here would re-run on every keystroke in an amount cell and fight
  // the row set it's supposed to only resync on fund-selection changes).
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  // "Enter amounts per fund" only makes sense with 2+ funds selected — if the
  // selection drops below that while split is on, fall back to the merged row.
  useEffect(() => {
    if (variant !== 'drawer') return;
    if (split && (funds?.length ?? 0) < 2) setValue('splitByFund', false);
  }, [variant, split, funds, setValue]);

  useEffect(() => {
    if (variant !== 'drawer' || !split) return;
    const selected = funds ?? [];
    const current = linesRef.current ?? [];
    const bySource = new Map<string, FundAllocationLine>(current.map((l) => [l.fundSource, l]));
    const reconciled = selected.map(
      (f) => bySource.get(f) ?? { ...emptyFundLine(), fundSource: f as FundAllocationLine['fundSource'] },
    );
    const changed =
      reconciled.length !== current.length ||
      reconciled.some((l, i) => l.fundSource !== current[i]?.fundSource);
    if (changed) setValue('fundAllocations', reconciled);
  }, [variant, split, funds, setValue]);

  // Mirror the per-fund lines into the scalar totals while split, for the
  // live "Proposed budget" preview — the server recomputes these from
  // `fundAllocations` on save regardless (ARCHITECTURE-ESSENTIALS.md).
  useEffect(() => {
    if (variant !== 'drawer' || !split || !lines) return;
    setValue('psProposedTotal', sumFundLines(lines, 'ps'));
    setValue('mooeProposedTotal', sumFundLines(lines, 'mooe'));
    setValue('feProposedTotal', sumFundLines(lines, 'fe'));
    setValue('coProposedTotal', sumFundLines(lines, 'co'));
  }, [variant, split, lines, setValue]);

  // String arithmetic, never floats: money is Decimal(18,2) on the wire.
  const proposedTotal = addDecimalStrings([ps, mooe, fe, co]);

  if (variant === 'drawer') {
    return (
      <DrawerCostSection
        control={control}
        errors={errors}
        disabled={disabled}
        setValue={setValue}
        hasOwnCosts={hasOwnCosts}
        ps={ps}
        mooe={mooe}
        fe={fe}
        co={co}
        funds={funds ?? []}
        split={!!split}
        lines={lines ?? []}
        proposedTotal={proposedTotal}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Controller<NewProgramFormValues, 'hasOwnCosts'>
          name="hasOwnCosts"
          control={control}
          render={({ field }) => (
            <Checkbox
              id="hasOwnCosts"
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={disabled}
              className="mt-0.5"
            />
          )}
        />
        <div className="space-y-0.5">
          <label
            htmlFor="hasOwnCosts"
            className={cn(
              'text-xs font-medium md:text-sm',
              disabled ? 'text-neutral-400' : 'text-neutral-900',
            )}
          >
            This program states its own costs
          </label>
          <p className="text-xs text-neutral-500">
            {disabled
              ? 'Not available — this program already has project/activities carrying its budget.'
              : 'Tick this only when the budget is not broken down into projects or activities. The program then carries the amount itself, and cannot also hold PPAs.'}
          </p>
        </div>
      </div>

      {hasOwnCosts && (
        <div className="space-y-5 border-l-2 border-neutral-200 pl-4">
          <div className="flex items-start gap-3">
            <Controller<NewProgramFormValues, 'splitByFund'>
              name="splitByFund"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="programSplitByFund"
                  checked={!!field.value}
                  onCheckedChange={(on) => {
                    // Start the split from what is already entered.
                    if (on && !lines?.length)
                      setValue('fundAllocations', [
                        {
                          fundSource: (funds?.[0] ?? '') as FundAllocationLine['fundSource'],
                          ps: ps || '0.00',
                          mooe: mooe || '0.00',
                          fe: fe || '0.00',
                          co: co || '0.00',
                        },
                        emptyFundLine(),
                      ]);
                    field.onChange(on);
                  }}
                  className="mt-0.5"
                />
              )}
            />
            <div className="space-y-0.5">
              <label
                htmlFor="programSplitByFund"
                className="text-xs font-medium text-neutral-900 md:text-sm"
              >
                Split by fund source
              </label>
              <p className="text-xs text-neutral-500">
                When more than one fund pays and the amounts differ per fund,
                enter PS / MOOE / FE / CO for each. Otherwise list the funds and
                enter one total.
              </p>
            </div>
          </div>

          {split ? (
            <Controller<NewProgramFormValues, 'fundAllocations'>
              name="fundAllocations"
              control={control}
              render={({ field }) => (
                <FundSplitEditor
                  value={field.value ?? []}
                  onChange={field.onChange}
                  error={errors.fundAllocations?.message}
                />
              )}
            />
          ) : (
          <>
          <div className="space-y-1.5">
            <label
              htmlFor="programFundSources"
              className="text-xs font-medium text-neutral-900 md:text-sm"
            >
              Source of Funds
              <span className="text-destructive ml-0.5">*</span>
            </label>
            <Controller<NewProgramFormValues, 'fundSources'>
              name="fundSources"
              control={control}
              render={({ field }) => (
                <MultiSelectCombobox
                  options={FUND_SOURCES.map(
                    ({ value, label, description }) => ({
                      value,
                      label,
                      description,
                    }),
                  )}
                  value={field.value ?? []}
                  onChange={field.onChange}
                  placeholder="Select one or more funds…"
                  searchPlaceholder="Search funds…"
                  error={!!errors.fundSources}
                />
              )}
            />
            {errors.fundSources && (
              <div className="text-destructive flex items-center gap-1.5 text-xs">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{errors.fundSources.message}</span>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CLASSES.map(({ field, code, label }) => (
              <div key={field} className="space-y-1.5">
                <label
                  htmlFor={field}
                  className="text-xs font-medium text-neutral-900 md:text-sm"
                >
                  {code}
                  <span className="block font-normal text-neutral-400">
                    {label}
                  </span>
                </label>
                <Controller<NewProgramFormValues, typeof field>
                  name={field}
                  control={control}
                  render={({ field: f }) => (
                    <CurrencyInput
                      name={f.name}
                      ref={f.ref}
                      value={f.value ?? ''}
                      onChange={f.onChange}
                      // An untouched class is zero, not missing — show that
                      // rather than leaving the box blank against a total.
                      onBlur={() => {
                        if (!f.value?.trim()) f.onChange('0.00');
                        f.onBlur();
                      }}
                      id={field}
                      placeholder="0.00"
                      aria-invalid={!!errors[field]}
                      className={cn(
                        'text-right font-mono',
                        errors[field] && 'border-red-300 focus:ring-red-500',
                      )}
                    />
                  )}
                />
                {errors[field] && (
                  <div className="text-destructive flex items-center gap-1.5 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{errors[field]?.message}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-blue-900 uppercase">
                Proposed Budget
              </p>
              <p className="mt-0.5 text-xs text-blue-900/70">
                Computed from the three amounts above
              </p>
            </div>
            <p className="font-mono text-lg font-semibold text-blue-900 md:text-xl">
              {formatPeso(proposedTotal)}
            </p>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}

/** Drawer variant: chips select the funds, a table edits PS/MOOE/FE/CO —
 * one merged row when not split, one row per selected fund when split. */
function DrawerCostSection({
  control,
  errors,
  disabled,
  setValue,
  hasOwnCosts,
  ps,
  mooe,
  fe,
  co,
  funds,
  split,
  lines,
  proposedTotal,
}: {
  control: Control<NewProgramFormValues>;
  errors: FieldErrors<NewProgramFormValues>;
  disabled?: boolean;
  setValue: UseFormSetValue<NewProgramFormValues>;
  hasOwnCosts: boolean;
  ps?: string;
  mooe?: string;
  fe?: string;
  co?: string;
  funds: string[];
  split: boolean;
  lines: FundAllocationLine[];
  proposedTotal: string;
}) {
  const setLineField = (
    fundSource: string,
    key: (typeof EXPENSE_KEYS)[number],
    value: string,
  ) => {
    setValue(
      'fundAllocations',
      lines.map((l) => (l.fundSource === fundSource ? { ...l, [key]: value } : l)),
    );
  };

  const rows: { key: string; label: string; muted: boolean; cells: FundAllocationLine }[] = split
    ? funds.map((f) => ({
        key: f,
        label: f,
        muted: false,
        cells: lines.find((l) => l.fundSource === f) ?? { ...emptyFundLine(), fundSource: f as FundAllocationLine['fundSource'] },
      }))
    : [
        {
          key: 'all',
          label: funds.length ? funds.join(' + ') : 'Select a fund above',
          muted: funds.length === 0,
          cells: { fundSource: '', ps: ps ?? '', mooe: mooe ?? '', fe: fe ?? '', co: co ?? '' },
        },
      ];

  return (
    <div className="rounded-lg border border-slate-200 p-3.5">
      <div className="flex items-start gap-3">
        <Controller<NewProgramFormValues, 'hasOwnCosts'>
          name="hasOwnCosts"
          control={control}
          render={({ field }) => (
            <Checkbox
              id="hasOwnCostsDrawer"
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={disabled}
              className="mt-0.5 h-4 w-4"
            />
          )}
        />
        <label htmlFor="hasOwnCostsDrawer" className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-slate-900">
            Enter costs on the program itself
          </span>
          <span className="text-xs text-slate-500">
            {disabled
              ? 'Not available — this program already has project/activities carrying its budget.'
              : 'Use only when the budget is not broken down into projects or activities. The program then cannot hold projects or activities.'}
          </span>
        </label>
      </div>

      {hasOwnCosts && (
        <div className="mt-4 flex flex-col gap-4 border-t border-slate-200 pt-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-900">
              Source of funds
              <span className="ml-0.5 text-orange-700">*</span>{' '}
              <span className="font-normal text-slate-400">select one or more</span>
            </label>
            <Controller<NewProgramFormValues, 'fundSources'>
              name="fundSources"
              control={control}
              render={({ field }) => (
                <MultiSelectCombobox
                  options={FUND_SOURCES.map(({ value, label, description }) => ({
                    value,
                    label,
                    description,
                  }))}
                  value={field.value ?? []}
                  onChange={field.onChange}
                  placeholder="Select one or more funds…"
                  searchPlaceholder="Search funds…"
                  error={!!errors.fundSources}
                />
              )}
            />
            {errors.fundSources && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{errors.fundSources.message}</span>
              </div>
            )}
          </div>

          {funds.length > 1 && (
            <Controller<NewProgramFormValues, 'splitByFund'>
              name="splitByFund"
              control={control}
              render={({ field }) => (
                <label className="flex items-start gap-2.5">
                  <Checkbox
                    id="splitByFundDrawer"
                    checked={!!field.value}
                    onCheckedChange={(on) => {
                      if (on) {
                        setValue(
                          'fundAllocations',
                          funds.map((f, i) =>
                            i === 0
                              ? {
                                  fundSource: f as FundAllocationLine['fundSource'],
                                  ps: ps || '0.00',
                                  mooe: mooe || '0.00',
                                  fe: fe || '0.00',
                                  co: co || '0.00',
                                }
                              : { ...emptyFundLine(), fundSource: f as FundAllocationLine['fundSource'] },
                          ),
                        );
                      } else {
                        if (lines.length) {
                          setValue('psProposedTotal', sumFundLines(lines, 'ps'));
                          setValue('mooeProposedTotal', sumFundLines(lines, 'mooe'));
                          setValue('feProposedTotal', sumFundLines(lines, 'fe'));
                          setValue('coProposedTotal', sumFundLines(lines, 'co'));
                        }
                        setValue('fundAllocations', []);
                      }
                      field.onChange(on);
                    }}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium text-slate-900">
                      Enter amounts per fund
                    </span>
                    <span className="text-xs text-slate-500">
                      Turn on when each fund pays a different PS / MOOE / FE / CO amount.
                      Otherwise enter one set of amounts for all selected funds.
                    </span>
                  </span>
                </label>
              )}
            />
          )}

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">
                      Fund
                    </th>
                    {EXPENSE_KEYS.map((k) => (
                      <th
                        key={k}
                        title={EXPENSE_FULL[k]}
                        className="px-2 py-2 text-right text-xs font-semibold text-slate-900"
                      >
                        {EXPENSE_LABEL[k]}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td
                        className={cn(
                          'px-3 py-1.5 text-[13px]',
                          row.muted ? 'text-slate-400' : 'text-slate-900',
                        )}
                      >
                        {row.label}
                      </td>
                      {EXPENSE_KEYS.map((k) => (
                        <td key={k} className="px-1 py-1.5">
                          {split ? (
                            <CurrencyInput
                              aria-label={`${EXPENSE_LABEL[k]} for ${row.label}`}
                              value={row.cells[k]}
                              onChange={(v) => setLineField(row.key, k, v)}
                              onBlur={() => {
                                if (!row.cells[k]?.trim()) setLineField(row.key, k, '0.00');
                              }}
                              placeholder="0.00"
                              className="text-right font-mono"
                            />
                          ) : (
                            <Controller<NewProgramFormValues, typeof SCALAR_FIELD[typeof k]>
                              name={SCALAR_FIELD[k]}
                              control={control}
                              render={({ field: f }) => (
                                <CurrencyInput
                                  name={f.name}
                                  ref={f.ref}
                                  aria-label={EXPENSE_LABEL[k]}
                                  value={f.value ?? ''}
                                  onChange={f.onChange}
                                  onBlur={() => {
                                    if (!f.value?.trim()) f.onChange('0.00');
                                    f.onBlur();
                                  }}
                                  placeholder="0.00"
                                  className="text-right font-mono"
                                />
                              )}
                            />
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right font-mono text-[13px] text-slate-700">
                        {formatPeso(addDecimalStrings([row.cells.ps, row.cells.mooe, row.cells.fe, row.cells.co]))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg bg-blue-50 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">
                Proposed budget
              </p>
              <p className="mt-0.5 text-xs text-blue-900/70">
                Sum of PS, MOOE, FE and CO{split ? ' across all funds' : ''}
              </p>
            </div>
            <p className="font-mono text-lg font-semibold text-slate-900 md:text-xl">
              {formatPeso(proposedTotal)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
