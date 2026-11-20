'use client';

import { Controller, Control, FieldErrors, UseFormSetValue, useWatch } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { SimpleSelect } from '@/components/custom/simple-select';
import { MultiSelectCombobox } from '@/components/custom/multi-select-combobox';
import { Textarea } from '@/components/ui/textarea';
import {
  FinishLineOption,
  SdgGoalOption,
  SglgIndicatorOption,
  NewProgramFormValues,
} from '@/lib/schemas';
import { VISIONS } from '@/lib/finish-lines';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';
import { GOAL, GOALS, goal, goals } from '@/lib/goal-label';


const finishLineLabel = (fl: FinishLineOption) =>
  fl.visionNumber != null ? `${fl.visionNumber}. ${fl.name}` : fl.name;

/** Above this many finish lines, the tile grid gives way to a searchable
 * select — a grid stops being scannable long before this (acceptance: "Above
 * about 10 entries, fall back to a searchable select"). */
const FINISH_LINE_TILE_LIMIT = 10;

/**
 * The 8 finish lines carry a fixed, DB-seeded colour (`VISIONS`, mirrored from
 * `FinishLine.color`). A finish line outside that static list — the admin
 * panel can add more — gets a colour derived from its position, spread evenly
 * across the hue wheel, so the tile grid never hard-codes a count.
 */
function finishLineColor(fl: FinishLineOption, index: number, total: number): string {
  const vision = fl.visionNumber != null ? VISIONS.find((v) => v.id === fl.visionNumber) : undefined;
  if (vision) return vision.color;
  const hue = (150 + (index * 360) / Math.max(total, 1)) % 360;
  return `oklch(0.64 0.12 ${hue})`;
}

interface StrategicAlignmentSectionProps {
  control: Control<NewProgramFormValues>;
  setValue: UseFormSetValue<NewProgramFormValues>;
  clusters: FinishLineOption[];
  sdgGoals: SdgGoalOption[];
  sglgIndicators: SglgIndicatorOption[];
  clustersLoading: boolean;
  errors: FieldErrors<NewProgramFormValues>;
  locked?: boolean;
  /** 'card' (default): the original bordered-card layout (full-page create
   * form, edit drawer). 'drawer': the New Program drawer's flat layout. */
  variant?: 'card' | 'drawer';
  /** Only read when `variant="drawer"`: 'alignment' renders the finish-line
   * tiles + SDG/SGLG; 'outputs' renders the MFO/target/remarks textareas. The
   * drawer places these in two different numbered sections. */
  part?: 'alignment' | 'outputs';
}

/**
 * Section 2: Strategic Alignment
 * Collects finish lines, expected output, and remarks
 */
export default function StrategicAlignmentSection({
  control,
  setValue,
  clusters,
  sdgGoals,
  sglgIndicators,
  clustersLoading,
  errors,
  locked,
  variant = 'card',
  part = 'alignment',
}: Readonly<StrategicAlignmentSectionProps>) {
  const primaryClusterId = useWatch({ control, name: 'primaryClusterId' });

  const primaryCluster = clusters.find((c) => c.id === primaryClusterId);
  const subFinishLines = primaryCluster?.subFinishLines ?? [];

  if (variant === 'drawer') {
    return part === 'outputs' ? (
      <DrawerOutputsFields control={control} errors={errors} />
    ) : (
      <DrawerAlignmentFields
        control={control}
        setValue={setValue}
        clusters={clusters}
        sdgGoals={sdgGoals}
        sglgIndicators={sglgIndicators}
        clustersLoading={clustersLoading}
        errors={errors}
        locked={locked}
        primaryClusterId={primaryClusterId}
        subFinishLines={subFinishLines}
      />
    );
  }

  return (
    <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 pb-3 md:pb-4">
        <h2 className="font-heading text-lg font-semibold tracking-tight text-slate-950">
          Strategic Alignment
          <span className="ml-2 font-medium text-slate-500">
            - {GOALS}
          </span>
        </h2>
        <CardDescription className="mt-1.5 text-sm text-slate-600">
          Link program to government priorities and expected outcomes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 md:space-y-5">
        {/* Primary Finish Line */}
        <div className="space-y-1.5 md:space-y-2">
          <label htmlFor="primaryClusterId" className="text-xs md:text-sm font-medium text-neutral-900">
            Primary {GOAL}
            <span className="text-destructive ml-0.5">*</span>
          </label>
          <Controller<NewProgramFormValues, 'primaryClusterId'>
            name="primaryClusterId"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                id="primaryClusterId"
                options={clusters.map((fl) => ({ value: fl.id, label: finishLineLabel(fl) }))}
                value={(field.value as string) || ''}
                onChange={(value) => {
                  field.onChange(value);
                  setValue('subFinishLineId', '');
                }}
                placeholder={
                  clustersLoading
                    ? `Loading ${goals}...`
                    : clusters.length === 0
                      ? `No ${goals} available`
                      : `Select primary ${goal}`
                }
                disabled={clustersLoading || locked || clusters.length === 0}
                error={!!errors.primaryClusterId}
              />
            )}
          />
          {errors.primaryClusterId && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{errors.primaryClusterId.message}</span>
            </div>
          )}
          {locked && (
            <p className="text-xs text-muted-foreground/90 mt-1">
              {GOAL} is locked — cannot be changed after the program has been submitted.
            </p>
          )}
        </div>

        {/* Sub-Finish Line */}
        {primaryClusterId && subFinishLines.length > 0 && (
          <div className="space-y-1.5 md:space-y-2">
            <label htmlFor="subFinishLineId" className="text-xs md:text-sm font-medium text-neutral-900">
              Sub-{GOAL}
              <span className="ml-1 text-neutral-400">(Optional)</span>
            </label>
            <Controller<NewProgramFormValues, 'subFinishLineId'>
              name="subFinishLineId"
              control={control}
              render={({ field }) => (
                <SimpleSelect
                  id="subFinishLineId"
                  options={[
                    { value: '', label: 'None' },
                    ...subFinishLines.map((s) => ({
                      value: s.id,
                      label: `${s.code} — ${s.name}`,
                    })),
                  ]}
                  value={(field.value as string) || ''}
                  onChange={(value) => field.onChange(value)}
                  placeholder={`Select a sub-${goal} (optional)`}
                />
              )}
            />
          </div>
        )}

        {/* SDG Goals */}
        <div className="space-y-1.5 md:space-y-2">
          <label htmlFor="sdgGoalIds" className="text-xs md:text-sm font-medium text-neutral-900">
            Sustainable Development Goals (SDG)
            <span className="ml-1 text-neutral-400">(Optional)</span>
          </label>
          <Controller<NewProgramFormValues, 'sdgGoalIds'>
            name="sdgGoalIds"
            control={control}
            render={({ field }) => (
              <MultiSelectCombobox
                options={sdgGoals.map((goal) => ({
                  value: goal.id,
                  label: goal.code,
                  sublabel: goal.name,
                }))}
                value={(field.value as string[]) ?? []}
                onChange={field.onChange}
                placeholder="Select SDG goals (optional)"
                searchPlaceholder="Search goals…"
                disabled={clustersLoading}
                error={!!errors.sdgGoalIds}
              />
            )}
          />
          {errors.sdgGoalIds && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{errors.sdgGoalIds.message}</span>
            </div>
          )}
        </div>

        {/* SGLG Indicator */}
        <div className="space-y-1.5 md:space-y-2">
          <label htmlFor="sglgIndicatorId" className="text-xs md:text-sm font-medium text-neutral-900">
            SGLG Indicator
            <span className="ml-1 text-neutral-400">(Optional)</span>
          </label>
          <Controller<NewProgramFormValues, 'sglgIndicatorId'>
            name="sglgIndicatorId"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                id="sglgIndicatorId"
                options={[
                  { value: '', label: 'None' },
                  ...sglgIndicators.map((sglg) => ({
                    value: sglg.id,
                    label: `${sglg.code} — ${sglg.name}`,
                  })),
                ]}
                value={(field.value as string) || ''}
                onChange={(value) => field.onChange(value)}
                placeholder="Select an SGLG indicator (optional)"
                disabled={clustersLoading}
                error={!!errors.sglgIndicatorId}
              />
            )}
          />
          {errors.sglgIndicatorId && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{errors.sglgIndicatorId.message}</span>
            </div>
          )}
        </div>

        {/* Expected Output / MFO */}
        <div className="space-y-1.5 md:space-y-2">
          <label htmlFor="expectedOutput" className="text-xs md:text-sm font-medium text-neutral-900">
            Expected Output / Major Final Output (MFO)
            <span className="ml-1 text-neutral-400">(Optional)</span>
          </label>
          <Controller<NewProgramFormValues, 'expectedOutput'>
            name="expectedOutput"
            control={control}
            render={({ field }) => (
              <Textarea
                id="expectedOutput"
                placeholder="Describe the measurable outcome this program aims to achieve"
                rows={3}
                {...field}
                value={field.value || ''}
                className={cn(
                  'md:min-h-[120px]',
                  errors.expectedOutput && 'border-red-300 focus:ring-red-500'
                )}
              />
            )}
          />
          {errors.expectedOutput && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{errors.expectedOutput.message}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground/90">
            Describe the measurable outcome this program aims to achieve. You can leave this blank and fill it in later.
          </p>
        </div>

        {/* Target for the budget year — LBP Form 4 */}
        <div className="space-y-1.5 md:space-y-2">
          <label htmlFor="targetForBudgetYear" className="text-xs md:text-sm font-medium text-neutral-900">
            Target for the Budget Year
            <span className="ml-1 text-neutral-400">(Optional)</span>
          </label>
          <Controller<NewProgramFormValues, 'targetForBudgetYear'>
            name="targetForBudgetYear"
            control={control}
            render={({ field }) => (
              <Textarea
                id="targetForBudgetYear"
                placeholder="e.g. Eight (8) risk-based audits with documented follow-up reports"
                rows={2}
                {...field}
                value={field.value || ''}
                className={cn(errors.targetForBudgetYear && 'border-red-300 focus:ring-red-500')}
              />
            )}
          />
          {errors.targetForBudgetYear && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{errors.targetForBudgetYear.message}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground/90">
            What the program will deliver this year. Printed on LBP Form 4.
          </p>
        </div>

        {/* Remarks / Justification */}
        <div className="space-y-1.5 md:space-y-2">
          <label htmlFor="remarks" className="text-xs md:text-sm font-medium text-neutral-900">
            Remarks / Justification
            <span className="ml-1 text-neutral-400">(Optional)</span>
          </label>
          <Controller<NewProgramFormValues, 'remarks'>
            name="remarks"
            control={control}
            render={({ field }) => (
              <Textarea
                id="remarks"
                placeholder="Optional explanation for budget reviewers and approvers"
                rows={3}
                {...field}
                value={field.value || ''}
                className={cn(
                  'md:min-h-[100px]',
                  errors.remarks && 'border-red-300 focus:ring-red-500'
                )}
              />
            )}
          />
          {errors.remarks && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{errors.remarks.message}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground/90">
            Optional explanation for budget reviewers and approvers.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Drawer variant, "3. Strategic alignment": finish-line tiles + SDG/SGLG. */
function DrawerAlignmentFields({
  control,
  setValue,
  clusters,
  sdgGoals,
  sglgIndicators,
  clustersLoading,
  errors,
  locked,
  primaryClusterId,
  subFinishLines,
}: {
  control: Control<NewProgramFormValues>;
  setValue: UseFormSetValue<NewProgramFormValues>;
  clusters: FinishLineOption[];
  sdgGoals: SdgGoalOption[];
  sglgIndicators: SglgIndicatorOption[];
  clustersLoading: boolean;
  errors: FieldErrors<NewProgramFormValues>;
  locked?: boolean;
  primaryClusterId: string;
  subFinishLines: FinishLineOption['subFinishLines'];
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-900">
          Primary {goal}
          <span className="ml-0.5 text-orange-700">*</span>
        </label>
        <Controller<NewProgramFormValues, 'primaryClusterId'>
          name="primaryClusterId"
          control={control}
          render={({ field }) =>
            clusters.length > FINISH_LINE_TILE_LIMIT ? (
              <SimpleSelect
                id="primaryClusterId"
                options={clusters.map((fl) => ({ value: fl.id, label: finishLineLabel(fl) }))}
                value={(field.value as string) || ''}
                onChange={(value) => {
                  field.onChange(value);
                  setValue('subFinishLineId', '');
                }}
                placeholder={
                  clustersLoading
                    ? `Loading ${goals}...`
                    : clusters.length === 0
                      ? `No ${goals} available`
                      : `Select primary ${goal}`
                }
                disabled={clustersLoading || locked || clusters.length === 0}
                error={!!errors.primaryClusterId}
              />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {clusters.map((fl, i) => {
                  const selected = field.value === fl.id;
                  const color = finishLineColor(fl, i, clusters.length);
                  return (
                    <button
                      key={fl.id}
                      type="button"
                      disabled={locked}
                      onClick={() => {
                        field.onChange(fl.id);
                        setValue('subFinishLineId', '');
                      }}
                      className={cn(
                        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                        locked && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          selected ? 'border-primary' : 'border-slate-300',
                        )}
                      >
                        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                          <span
                            className="h-2 w-2 shrink-0 rounded-sm"
                            style={{ backgroundColor: color }}
                          />
                          {fl.visionNumber != null ? `${GOAL} ${fl.visionNumber}` : fl.name}
                        </span>
                        <span className="text-[13px] leading-snug text-slate-900">
                          {finishLineLabel(fl)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          }
        />
        {errors.primaryClusterId && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{errors.primaryClusterId.message}</span>
          </div>
        )}
        <p className="text-xs text-slate-500">
          {GOALS} are managed by admins under {GOALS} settings.
        </p>
      </div>

      {primaryClusterId && subFinishLines.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-900">
            Sub-{goal} <span className="font-normal text-slate-400">optional</span>
          </label>
          <Controller<NewProgramFormValues, 'subFinishLineId'>
            name="subFinishLineId"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                id="subFinishLineId"
                options={[
                  { value: '', label: 'None' },
                  ...subFinishLines.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
                ]}
                value={(field.value as string) || ''}
                onChange={(value) => field.onChange(value)}
                placeholder={`Select a sub-${goal}`}
              />
            )}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-900">
            SDGs <span className="font-normal text-slate-400">optional</span>
          </label>
          <Controller<NewProgramFormValues, 'sdgGoalIds'>
            name="sdgGoalIds"
            control={control}
            render={({ field }) => (
              <MultiSelectCombobox
                options={sdgGoals.map((goal) => ({
                  value: goal.id,
                  label: goal.code,
                  sublabel: goal.name,
                }))}
                value={(field.value as string[]) ?? []}
                onChange={field.onChange}
                placeholder="None selected"
                searchPlaceholder="Search goals…"
                disabled={clustersLoading}
                error={!!errors.sdgGoalIds}
              />
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-900">
            SGLG indicator <span className="font-normal text-slate-400">optional</span>
          </label>
          <Controller<NewProgramFormValues, 'sglgIndicatorId'>
            name="sglgIndicatorId"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                id="sglgIndicatorId"
                options={[
                  { value: '', label: 'None' },
                  ...sglgIndicators.map((sglg) => ({ value: sglg.id, label: `${sglg.code} — ${sglg.name}` })),
                ]}
                value={(field.value as string) || ''}
                onChange={(value) => field.onChange(value)}
                placeholder="None"
                disabled={clustersLoading}
                error={!!errors.sglgIndicatorId}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}

/** Drawer variant, "4. Outputs and budget" (textarea half only — the
 * own-costs block is `ProgramCostSection`, rendered right after this). */
function DrawerOutputsFields({
  control,
  errors,
}: {
  control: Control<NewProgramFormValues>;
  errors: FieldErrors<NewProgramFormValues>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="expectedOutput" className="text-sm font-medium text-slate-900">
          Expected output / Major Final Output (MFO)
        </label>
        <Controller<NewProgramFormValues, 'expectedOutput'>
          name="expectedOutput"
          control={control}
          render={({ field }) => (
            <Textarea
              id="expectedOutput"
              rows={3}
              placeholder="The measurable outcome this program aims to achieve"
              {...field}
              value={field.value || ''}
              className={cn(errors.expectedOutput && 'border-red-300 focus:ring-red-500')}
            />
          )}
        />
        {errors.expectedOutput && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{errors.expectedOutput.message}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="targetForBudgetYear" className="text-sm font-medium text-slate-900">
          Target for the budget year
        </label>
        <Controller<NewProgramFormValues, 'targetForBudgetYear'>
          name="targetForBudgetYear"
          control={control}
          render={({ field }) => (
            <Textarea
              id="targetForBudgetYear"
              rows={2}
              placeholder="e.g. Eight (8) risk-based audits with documented follow-up reports"
              {...field}
              value={field.value || ''}
              className={cn(errors.targetForBudgetYear && 'border-red-300 focus:ring-red-500')}
            />
          )}
        />
        <p className="text-xs text-slate-500">Printed on LBP Form 4.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="remarks" className="text-sm font-medium text-slate-900">
          Remarks / justification
        </label>
        <Controller<NewProgramFormValues, 'remarks'>
          name="remarks"
          control={control}
          render={({ field }) => (
            <Textarea
              id="remarks"
              rows={2}
              placeholder="Context for budget reviewers and approvers"
              {...field}
              value={field.value || ''}
              className={cn(errors.remarks && 'border-red-300 focus:ring-red-500')}
            />
          )}
        />
      </div>
    </div>
  );
}
