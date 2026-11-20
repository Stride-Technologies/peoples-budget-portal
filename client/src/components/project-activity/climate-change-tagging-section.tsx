"use client";

import { Controller, Control, FieldErrors, useWatch } from "react-hook-form";
import { CurrencyInput } from "@/components/custom/currency-input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ClimateCodePicker } from "@/components/climate/climate-code-picker";
import { AddProjectActivityFormValues } from "@/lib/schemas";
import { addDecimalStrings, formatPeso } from "@/lib/currency-formatter";
import { cn } from "@/lib/utils";
import type { ClimateCodeRecord } from "@/lib/api";

interface ClimateChangeTaggingSectionProps {
  control: Control<AddProjectActivityFormValues>;
  climateCodes: ClimateCodeRecord[];
  errors?: FieldErrors<AddProjectActivityFormValues>;
  /**
   * 'card' (default) renders the original header-card layout, used by the
   * full-page add form and the in-place edit drawer. 'drawer' renders the
   * flat, indented-panel layout the New Project/Activity drawer uses — same
   * fields and wiring, plus a live tagged-vs-budget bar.
   */
  variant?: 'card' | 'drawer';
}

export default function ClimateChangeTaggingSection({
  control,
  climateCodes,
  errors,
  variant = 'card',
}: Readonly<ClimateChangeTaggingSectionProps>) {
  const hasClimateTag = useWatch({ control, name: "hasClimateTag" });
  const ps = useWatch({ control, name: 'psEstimate' });
  const mooe = useWatch({ control, name: 'mooeEstimate' });
  const fe = useWatch({ control, name: 'feEstimate' });
  const co = useWatch({ control, name: 'coEstimate' });
  const cca = useWatch({ control, name: 'ccaAmount' });
  const ccm = useWatch({ control, name: 'ccmAmount' });

  if (variant === 'drawer') {
    const proposedTotal = Number(addDecimalStrings([ps, mooe, fe, co]) || 0);
    const ccaN = Number(cca || 0);
    const ccmN = Number(ccm || 0);
    const tagged = ccaN + ccmN;
    const over = proposedTotal > 0 && tagged > proposedTotal;
    const base = Math.max(proposedTotal, tagged) || 1;
    const message = over
      ? `Tagged amount is more than the proposed budget by ${formatPeso(String(tagged - proposedTotal))}.`
      : proposedTotal > 0
        ? `${formatPeso(String(tagged))} tagged · ${((tagged / proposedTotal) * 100).toFixed(0)}% of the proposed budget`
        : 'Enter the budget above first.';

    return (
      <div className="flex flex-col gap-4">
        <label className="flex items-start gap-3">
          <Controller<AddProjectActivityFormValues, "hasClimateTag">
            name="hasClimateTag"
            control={control}
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
                className="mt-0.5 h-[18px] w-[18px]"
              />
            )}
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-slate-900">
              Tag as climate change expenditure
            </span>
            <span className="text-xs text-slate-500">
              Optional. Use when this spending supports climate change adaptation or mitigation.
            </span>
          </span>
        </label>

        {hasClimateTag && (
          <div className="ml-7 flex flex-col gap-4 rounded-lg border border-slate-200 p-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-900">
                CCET typology codes
                <span className="ml-0.5 text-orange-700">*</span>
                <span className="ml-1 font-normal text-slate-400">one or more</span>
              </label>
              <Controller<AddProjectActivityFormValues, "ccetCodeIds">
                name="ccetCodeIds"
                control={control}
                render={({ field }) => (
                  <ClimateCodePicker
                    value={field.value ?? []}
                    onChange={field.onChange}
                    climateCodes={climateCodes}
                    invalid={!!errors?.ccetCodeIds}
                    showPillarTag
                  />
                )}
              />
              {errors?.ccetCodeIds && (
                <p className="text-xs text-red-600">{errors.ccetCodeIds.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <label className="text-sm font-medium text-slate-900">Climate-tagged amount</label>
                <span className="text-xs text-slate-500">
                  of {formatPeso(String(proposedTotal))} proposed
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ClimateAmountField
                  control={control}
                  name="ccaAmount"
                  label="CCA"
                  full="Climate change adaptation"
                  colorClass="bg-cyan-500"
                  over={over}
                  remaining={Math.max(0, proposedTotal - ccmN)}
                />
                <ClimateAmountField
                  control={control}
                  name="ccmAmount"
                  label="CCM"
                  full="Climate change mitigation"
                  colorClass="bg-emerald-500"
                  over={over}
                  remaining={Math.max(0, proposedTotal - ccaN)}
                />
              </div>
              <div className="flex flex-col gap-1.5 pt-1">
                <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <span className="bg-cyan-500" style={{ width: `${(ccaN / base) * 100}%` }} />
                  <span className="bg-emerald-500" style={{ width: `${(ccmN / base) * 100}%` }} />
                </div>
                <p className={cn('text-xs', over ? 'text-orange-700' : 'text-slate-500')}>
                  {message}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-900">
                Climate change linkage
                <span className="ml-1 font-normal text-slate-400">optional</span>
              </label>
              <Controller<AddProjectActivityFormValues, "ccRemarks">
                name="ccRemarks"
                control={control}
                render={({ field }) => (
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    rows={2}
                    placeholder="How this spending helps the LGU adapt to or reduce climate change"
                    className="resize-none"
                  />
                )}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-100 px-5 py-3">
        <div className="flex items-center gap-3">
          <Controller<AddProjectActivityFormValues, "hasClimateTag">
            name="hasClimateTag"
            control={control}
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
                className="h-4 w-4"
              />
            )}
          />
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-950">
              Climate Change Expenditure Tagging
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Optional: Tag expenditures related to climate change adaptation or
              mitigation.
            </p>
          </div>
        </div>
      </div>

      {hasClimateTag && (
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-xs md:text-sm font-medium text-neutral-900">
              CCET Typology Codes
            </label>
            <Controller<AddProjectActivityFormValues, "ccetCodeIds">
              name="ccetCodeIds"
              control={control}
              render={({ field }) => (
                <ClimateCodePicker
                  value={field.value ?? []}
                  onChange={field.onChange}
                  climateCodes={climateCodes}
                  invalid={!!errors?.ccetCodeIds}
                />
              )}
            />
            {errors?.ccetCodeIds && (
              <p className="text-xs text-red-600">{errors.ccetCodeIds.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs md:text-sm font-medium text-neutral-900">
                CCA Amount (₱)
              </label>
              <Controller<AddProjectActivityFormValues, "ccaAmount">
                name="ccaAmount"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    // ccaAmount is number-typed in the schema; CurrencyInput
                    // speaks decimal strings, so the coercion lives here.
                    // toFixed(2) so the blur padding survives the round-trip —
                    // toString() would drop it back to "450000".
                    value={field.value == null ? '' : field.value.toFixed(2)}
                    onChange={(v) => field.onChange(v === '' ? undefined : Number(v))}
                    placeholder="0.00"
                    className="text-xs font-mono"
                  />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs md:text-sm font-medium text-neutral-900">
                CCM Amount (₱)
              </label>
              <Controller<AddProjectActivityFormValues, "ccmAmount">
                name="ccmAmount"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    // See ccaAmount above — same number/string bridge.
                    value={field.value == null ? '' : field.value.toFixed(2)}
                    onChange={(v) => field.onChange(v === '' ? undefined : Number(v))}
                    placeholder="0.00"
                    className="text-xs font-mono"
                  />
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs md:text-sm font-medium text-neutral-900">
              Remarks / Justification
            </label>
            <Controller<AddProjectActivityFormValues, "ccRemarks">
              name="ccRemarks"
              control={control}
              render={({ field }) => (
                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  placeholder="Explain the climate change linkage"
                  className="min-h-20 resize-none text-xs"
                />
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ClimateAmountField({
  control,
  name,
  label,
  full,
  colorClass,
  over,
  remaining,
}: {
  control: Control<AddProjectActivityFormValues>;
  name: 'ccaAmount' | 'ccmAmount';
  label: string;
  full: string;
  colorClass: string;
  over: boolean;
  remaining: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs text-slate-700" title={full}>
        <span className={cn('h-2 w-2 rounded-sm', colorClass)} />
        <span className="font-semibold">{label}</span>
        {full}
      </span>
      <Controller<AddProjectActivityFormValues, typeof name>
        name={name}
        control={control}
        render={({ field }) => (
          <>
            <div
              className={cn(
                'flex h-10 items-center rounded-lg border bg-white pl-3',
                over ? 'border-orange-300' : 'border-slate-200',
              )}
            >
              <span className="text-sm text-slate-400">₱</span>
              <CurrencyInput
                value={field.value == null ? '' : field.value.toFixed(2)}
                onChange={(v) => field.onChange(v === '' ? undefined : Number(v))}
                placeholder="0.00"
                className="h-full flex-1 border-0 text-right font-mono text-sm shadow-none focus-visible:ring-0"
              />
            </div>
            <button
              type="button"
              onClick={() => field.onChange(remaining)}
              className="self-start text-xs text-primary"
            >
              Use remaining {formatPeso(String(remaining))}
            </button>
          </>
        )}
      />
    </div>
  );
}
