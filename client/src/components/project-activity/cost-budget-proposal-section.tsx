'use client';

import { useEffect } from 'react';
import {
  Control,
  Controller,
  FieldErrors,
  UseFormSetValue,
  useWatch,
} from 'react-hook-form';
import { AlertCircle, Lock } from 'lucide-react';
import { AddProjectActivityFormValues, FUND_SOURCES } from '@/lib/schemas';
import { addDecimalStrings, formatPeso } from '@/lib/currency-formatter';
import type { UacsObjectRecord } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CurrencyInput } from '@/components/custom/currency-input';
import { MultiSelectCombobox } from '@/components/custom/multi-select-combobox';
import {
  FundSplitEditor,
  emptyFundLine,
  sumFundLines,
} from '@/components/custom/fund-split-editor';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface CostBudgetProposalSectionProps {
  control: Control<AddProjectActivityFormValues>;
  errors: FieldErrors<AddProjectActivityFormValues>;
  /** Keeps PS/MOOE/FE/CO and the fund list equal to the per-fund lines while split. */
  setValue: UseFormSetValue<AddProjectActivityFormValues>;
  /** Retained for the Phase 2 line-item block; unused while it is deferred. */
  uacsObjects?: UacsObjectRecord[];
  /**
   * 'card' (default) renders the original stacked layout, used by the
   * full-page add form and the in-place edit drawer. 'drawer' renders the
   * segmented-control layout the New Project/Activity drawer uses — same
   * fields and wiring.
   */
  variant?: 'card' | 'drawer';
}

const CLASSES = [
  {
    field: 'psEstimate' as const,
    code: 'PS',
    label: 'Personnel Services',
  },
  {
    field: 'mooeEstimate' as const,
    code: 'MOOE',
    label: 'Maint. & Operating',
  },
  {
    field: 'feEstimate' as const,
    code: 'FE',
    label: 'Financial Expenses',
  },
  {
    field: 'coEstimate' as const,
    code: 'CO',
    label: 'Capital Outlay',
  },
];

const MIX_COLOR: Record<(typeof CLASSES)[number]['code'], string> = {
  PS: 'bg-indigo-700',
  MOOE: 'bg-blue-500',
  FE: 'bg-cyan-300',
  CO: 'bg-amber-500',
};

/**
 * Cost estimate — one amount per expense class (Phase 1 D3, screen 4).
 *
 * The proposed budget is **computed, never typed**: the server sums the four
 * and writes `proposedBudget`, so showing an editable field here would invite a
 * figure the API is about to overwrite.
 *
 * The line-item breakdown (quantity × unit cost against UACS objects) is a later
 * phase (D5). It is rendered as an explicit deferred placeholder rather than
 * removed, so the section reads as "not yet" instead of "missing" — the API
 * routes and existing line-item data are untouched.
 */
export default function CostBudgetProposalSection({
  control,
  errors,
  setValue,
  variant = 'card',
}: CostBudgetProposalSectionProps) {
  const entryType = useWatch({ control, name: 'entryType' });
  const costMode = useWatch({ control, name: 'costMode' });
  const ps = useWatch({ control, name: 'psEstimate' });
  const mooe = useWatch({ control, name: 'mooeEstimate' });
  const fe = useWatch({ control, name: 'feEstimate' });
  const co = useWatch({ control, name: 'coEstimate' });
  const funds = useWatch({ control, name: 'fundSources' });
  const split = useWatch({ control, name: 'splitByFund' });
  const lines = useWatch({ control, name: 'fundAllocations' });

  // While split, the row's own figures are the lines' sums — the climate check
  // and the submit read them as for any row.
  useEffect(() => {
    if (!split || !lines) return;
    setValue('psEstimate', sumFundLines(lines, 'ps'));
    setValue('mooeEstimate', sumFundLines(lines, 'mooe'));
    setValue('feEstimate', sumFundLines(lines, 'fe'));
    setValue('coEstimate', sumFundLines(lines, 'co'));
    setValue(
      'fundSources',
      lines.flatMap((l) => (l.fundSource ? [l.fundSource] : [])),
    );
  }, [split, lines, setValue]);

  // A parent in ACTIVITY_CHILDREN mode has its estimates summed from children,
  // so they are not entered here at all.
  const derivedFromChildren =
    entryType === 'project' && costMode === 'ACTIVITY_CHILDREN';

  {/* Source of Funds — which funds this PPA draws on. Deliberately not split
      per fund: the budget office lists the funds, the amounts stay in the three
      expense classes. Not shown for an ACTIVITY_CHILDREN parent: its funds are
      whatever its child activities draw on, so the server unions them the same
      way it sums the estimates. */}
  const fundSourcesField = (
    <div className="space-y-1.5">
      <label
        htmlFor="fundSources"
        className="text-xs font-medium text-neutral-900 md:text-sm"
      >
        Source of Funds
        <span className="text-destructive ml-0.5">*</span>
      </label>
      <Controller<AddProjectActivityFormValues, 'fundSources'>
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
        <div className="text-destructive flex items-center gap-1.5 text-xs">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{errors.fundSources.message}</span>
        </div>
      )}
    </div>
  );

  if (derivedFromChildren) {
    return (
      <div className="space-y-5">
        <Alert className="border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900">
            This project uses Activity-Derived Costs. Its PS / MOOE / FE / CO
            estimates are summed from its child activities, and its source of
            funds is whatever those activities draw on — enter both on the
            activities themselves.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // String arithmetic, never floats: money is Decimal(18,2) on the wire.
  const proposedTotal = addDecimalStrings([ps, mooe, fe, co]);

  if (variant === 'drawer') {
    return (
      <DrawerCostFields
        control={control}
        errors={errors}
        setValue={setValue}
        funds={funds ?? []}
        split={!!split}
        lines={lines ?? []}
        ps={ps}
        mooe={mooe}
        fe={fe}
        co={co}
        proposedTotal={proposedTotal}
      />
    );
  }

  const splitToggle = (
    <div className="flex items-start gap-3">
      <Controller<AddProjectActivityFormValues, 'splitByFund'>
        name="splitByFund"
        control={control}
        render={({ field }) => (
          <Checkbox
            id="splitByFund"
            checked={!!field.value}
            onCheckedChange={(on) => {
              // Start the split from what is already entered.
              if (on && !lines?.length)
                setValue('fundAllocations', [
                  {
                    fundSource: funds?.[0] ?? '',
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
          htmlFor="splitByFund"
          className="text-xs font-medium text-neutral-900 md:text-sm"
        >
          Split by fund source
        </label>
        <p className="text-xs text-neutral-500">
          When more than one fund pays for this and the amounts differ per
          fund, enter PS / MOOE / FE / CO for each. Otherwise list the funds and
          enter one total.
        </p>
      </div>
    </div>
  );

  if (split) {
    return (
      <div className="space-y-5">
        {splitToggle}
        <Controller<AddProjectActivityFormValues, 'fundAllocations'>
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
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {splitToggle}
      {fundSourcesField}

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
            <Controller<AddProjectActivityFormValues, typeof field>
              name={field}
              control={control}
              render={({ field: f }) => (
                <CurrencyInput
                  name={f.name}
                  ref={f.ref}
                  value={f.value ?? ''}
                  onChange={f.onChange}
                  // An untouched class is zero, not missing — show that rather
                  // than leaving the box blank against a computed total.
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

      {/* Computed proposed budget */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-blue-900 uppercase">
            Proposed Budget
          </p>
          <p className="mt-0.5 text-xs text-blue-900/70">
            Computed from the three estimates above
          </p>
        </div>
        <p className="font-mono text-lg font-semibold text-blue-900 md:text-xl">
          {formatPeso(proposedTotal)}
        </p>
      </div>

      <p className="text-xs text-neutral-500">
        Enter whole pesos or two decimals. At least one expense class must be
        non-zero.
      </p>

      {/* Phase 2 placeholder — deferred, not missing (D5) */}
      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-5 text-center opacity-75">
        <p className="flex items-center justify-center gap-1.5 text-xs font-medium tracking-wide text-neutral-600 uppercase">
          <Lock className="h-3.5 w-3.5" />
          Cost assumptions breakdown
        </p>
        <p className="mt-1.5 text-xs text-neutral-500">
          Line-item detail — quantity × unit cost against UACS objects — arrives
          in a later phase.
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          Existing line items are preserved and still totalled; they are just not
          edited here yet.
        </p>
      </div>
    </div>
  );
}

type Estimate = AddProjectActivityFormValues['psEstimate'];

function DrawerCostFields({
  control,
  errors,
  setValue,
  funds,
  split,
  lines,
  ps,
  mooe,
  fe,
  co,
  proposedTotal,
}: {
  control: Control<AddProjectActivityFormValues>;
  errors: FieldErrors<AddProjectActivityFormValues>;
  setValue: UseFormSetValue<AddProjectActivityFormValues>;
  funds: AddProjectActivityFormValues['fundSources'];
  split: boolean;
  lines: AddProjectActivityFormValues['fundAllocations'];
  ps: Estimate;
  mooe: Estimate;
  fe: Estimate;
  co: Estimate;
  proposedTotal: string;
}) {
  const classTotals = CLASSES.reduce<Record<string, number>>((acc, { field, code }) => {
    const v = field === 'psEstimate' ? ps : field === 'mooeEstimate' ? mooe : field === 'feEstimate' ? fe : co;
    acc[code] = Number(v || 0);
    return acc;
  }, {});
  const totalNum = Number(proposedTotal || 0);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13.5px] text-slate-500">
        Enter whole pesos or two decimals. At least one expense class must be above zero.
      </p>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-900">
          How is it funded?
          <span className="ml-0.5 text-orange-700">*</span>
        </label>
        <div className="inline-flex w-fit gap-1 rounded-lg bg-slate-100 p-1">
          {([
            { v: false, label: 'One set of amounts' },
            { v: true, label: 'Itemize per fund' },
          ] as const).map((m) => (
            <button
              key={String(m.v)}
              type="button"
              onClick={() => {
                if (m.v === split) return;
                if (m.v && !lines?.length) {
                  setValue('fundAllocations', [
                    {
                      fundSource: funds?.[0] ?? '',
                      ps: ps || '0.00',
                      mooe: mooe || '0.00',
                      fe: fe || '0.00',
                      co: co || '0.00',
                    },
                    emptyFundLine(),
                  ]);
                }
                setValue('splitByFund', m.v);
              }}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-[13.5px] font-medium transition-colors',
                split === m.v ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          {split
            ? 'Add a row for each fund and enter its own PS / MOOE / FE / CO.'
            : 'Pick the funds that pay for this and enter one set of amounts.'}
        </p>
      </div>

      {!split && (
        <div className="space-y-1.5">
          <label htmlFor="fundSources" className="text-sm font-medium text-slate-900">
            Source of funds
            <span className="ml-0.5 text-orange-700">*</span>
          </label>
          <Controller<AddProjectActivityFormValues, 'fundSources'>
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
            <div className="text-destructive flex items-center gap-1.5 text-xs">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{errors.fundSources.message}</span>
            </div>
          )}
        </div>
      )}

      {split ? (
        <Controller<AddProjectActivityFormValues, 'fundAllocations'>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CLASSES.map(({ field, code, label }) => (
            <div key={field} className="space-y-1.5">
              <label htmlFor={field} className="text-sm font-medium text-slate-900">
                {code}
                <span className="block font-normal text-slate-400">{label}</span>
              </label>
              <Controller<AddProjectActivityFormValues, typeof field>
                name={field}
                control={control}
                render={({ field: f }) => (
                  <CurrencyInput
                    name={f.name}
                    ref={f.ref}
                    value={f.value ?? ''}
                    onChange={f.onChange}
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
      )}

      <div className="flex items-center justify-between gap-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">
            Proposed budget
          </p>
          {totalNum > 0 && (
            <div className="flex max-w-[360px] flex-col gap-1.5">
              <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-blue-100">
                {CLASSES.filter(({ code }) => classTotals[code] > 0).map(({ code }) => (
                  <span
                    key={code}
                    className={MIX_COLOR[code]}
                    style={{ width: `${(classTotals[code] / totalNum) * 100}%` }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {CLASSES.filter(({ code }) => classTotals[code] > 0).map(({ code }) => (
                  <span key={code} className="inline-flex items-center gap-1.5 text-xs text-blue-800">
                    <span className={cn('h-1.5 w-1.5 rounded-sm', MIX_COLOR[code])} />
                    {code} {((classTotals[code] / totalNum) * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="shrink-0 font-mono text-xl font-semibold text-blue-900">
          {formatPeso(proposedTotal)}
        </p>
      </div>

      <p className="text-xs text-slate-400">
        Line-item detail (quantity × unit cost against UACS objects) arrives in a later phase.
        Existing line items are kept and still counted.
      </p>
    </div>
  );
}
