"use client";

import { Controller, Control, FieldErrors, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, AlertCircle, Info } from "lucide-react";
import { AddProjectActivityFormValues } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { MonthYearPicker, monthYearFromFields } from "@/components/custom/month-year-picker";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { AIP_CODE_FORMAT_HINT } from "@/components/aip/aip-code-display";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface ProjectActivityDetailsSectionProps {
  control: Control<AddProjectActivityFormValues>;
  errors: FieldErrors<AddProjectActivityFormValues>;
  isGeneratingCode: boolean;
  codeGenerationError?: string;
  parentStartMonth?: number;
  parentStartYear?: number;
  parentEndMonth?: number;
  parentEndYear?: number;
  /**
   * 'card' (default) renders the original stacked layout, used by the
   * full-page add form and the in-place edit drawer. 'drawer' renders the
   * flat layout the New Project/Activity drawer uses — same fields and
   * wiring, just a tighter one-row period picker and a tooltip instead of a
   * helper paragraph for the code format.
   */
  variant?: 'card' | 'drawer';
}

const MONTH_LABELS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];


export default function ProjectActivityDetailsSection({
  control,
  errors,
  isGeneratingCode,
  codeGenerationError,
  parentStartMonth,
  parentStartYear,
  parentEndMonth,
  parentEndYear,
  variant = 'card',
}: Readonly<ProjectActivityDetailsSectionProps>) {
  const aipCode = useWatch({ control, name: "aipReferenceCode" });
  const entryType = useWatch({ control, name: "entryType" });
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (aipCode) {
      navigator.clipboard.writeText(aipCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const hasParentPeriod = !!(parentStartMonth && parentStartYear && parentEndMonth && parentEndYear);
  const nameLabel = entryType === 'activity' ? 'Activity name' : 'Project name';
  const namePlaceholder = entryType === 'activity'
    ? 'e.g. Office Supplies Procurement'
    : 'e.g. Records Digitization Project';

  if (variant === 'drawer') {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="projectActivityName" className="text-sm font-medium text-slate-900">
            {nameLabel}
            <span className="ml-0.5 text-orange-700">*</span>
          </label>
          <Controller<AddProjectActivityFormValues, "projectActivityName">
            name="projectActivityName"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="projectActivityName"
                placeholder={namePlaceholder}
                aria-invalid={!!errors.projectActivityName}
                className={cn(errors.projectActivityName && 'border-red-300 focus:ring-red-500')}
              />
            )}
          />
          {errors.projectActivityName && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{errors.projectActivityName.message}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Tooltip>
            <TooltipTrigger
              render={<label className="w-fit cursor-help text-sm font-medium text-slate-900" />}
            >
              AIP reference code{' '}
              <span className="font-normal text-slate-400">auto-generated</span>
            </TooltipTrigger>
            <TooltipContent>{AIP_CODE_FORMAT_HINT}</TooltipContent>
          </Tooltip>
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-lg bg-slate-50 px-3 font-mono text-sm text-slate-900">
              <span className="truncate">
                {aipCode || (isGeneratingCode ? 'Generating…' : '—')}
              </span>
              {isGeneratingCode && <Loader2 className="ml-2 h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />}
            </div>
            {aipCode && (
              <Button type="button" variant="outline" onClick={handleCopy} className="gap-2">
                <Copy className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy'}
              </Button>
            )}
          </div>
          {codeGenerationError && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{codeGenerationError}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-900">
            Implementation period
            <span className="ml-1 font-normal text-slate-400">optional</span>
          </label>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
            <Controller<AddProjectActivityFormValues>
              name="implementationStartMonth"
              control={control}
              render={({ field: monthField }) => (
                <Controller<AddProjectActivityFormValues>
                  name="implementationStartYear"
                  control={control}
                  render={({ field: yearField }) => (
                    <MonthYearPicker
                      id="implementationStart"
                      value={monthYearFromFields(
                        monthField.value as number | undefined,
                        yearField.value as number | undefined,
                      )}
                      onChange={(v) => {
                        monthField.onChange(v.month);
                        yearField.onChange(v.year);
                      }}
                      error={!!(errors.implementationStartMonth ?? errors.implementationStartYear)}
                      aria-invalid={!!(errors.implementationStartMonth ?? errors.implementationStartYear)}
                      placeholder="Start"
                      minYear={parentStartYear}
                      maxYear={parentEndYear}
                    />
                  )}
                />
              )}
            />
            <span className="text-xs text-slate-400">to</span>
            <Controller<AddProjectActivityFormValues>
              name="implementationEndMonth"
              control={control}
              render={({ field: monthField }) => (
                <Controller<AddProjectActivityFormValues>
                  name="implementationEndYear"
                  control={control}
                  render={({ field: yearField }) => (
                    <MonthYearPicker
                      id="implementationEnd"
                      value={monthYearFromFields(
                        monthField.value as number | undefined,
                        yearField.value as number | undefined,
                      )}
                      onChange={(v) => {
                        monthField.onChange(v.month);
                        yearField.onChange(v.year);
                      }}
                      error={!!(errors.implementationEndMonth ?? errors.implementationEndYear)}
                      aria-invalid={!!(errors.implementationEndMonth ?? errors.implementationEndYear)}
                      placeholder="End"
                      minYear={parentStartYear}
                      maxYear={parentEndYear}
                    />
                  )}
                />
              )}
            />
          </div>
          {hasParentPeriod && (
            <p className="text-xs text-slate-500">
              Must fall within the program period, {MONTH_LABELS_LONG[(parentStartMonth ?? 1) - 1]}{' '}
              {parentStartYear} – {MONTH_LABELS_LONG[(parentEndMonth ?? 12) - 1]} {parentEndYear}.
            </p>
          )}
          {(errors.implementationStartMonth ?? errors.implementationStartYear ?? errors.implementationEndMonth ?? errors.implementationEndYear) && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {errors.implementationStartMonth?.message
                  ?? errors.implementationStartYear?.message
                  ?? errors.implementationEndMonth?.message
                  ?? errors.implementationEndYear?.message}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="expectedOutput" className="text-sm font-medium text-slate-900">
            Expected output
            <span className="ml-1 font-normal text-slate-400">optional</span>
          </label>
          <Controller<AddProjectActivityFormValues, "expectedOutput">
            name="expectedOutput"
            control={control}
            render={({ field }) => (
              <Textarea
                {...field}
                value={field.value ?? ''}
                id="expectedOutput"
                rows={3}
                placeholder="The deliverable and its measurable outcome"
                aria-invalid={!!errors.expectedOutput}
                className={cn('resize-none', errors.expectedOutput && 'border-red-300 focus:ring-red-500')}
              />
            )}
          />
          {errors.expectedOutput && (
            <p className="text-xs text-red-600">{errors.expectedOutput.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="remarks" className="text-sm font-medium text-slate-900">
            Remarks / justification
            <span className="ml-1 font-normal text-slate-400">optional</span>
          </label>
          <Controller<AddProjectActivityFormValues, "remarks">
            name="remarks"
            control={control}
            render={({ field }) => (
              <Textarea
                {...field}
                id="remarks"
                value={field.value ?? ''}
                rows={2}
                placeholder="Context for budget reviewers and approvers"
                className={cn('resize-none', errors.remarks && 'border-red-300 focus:ring-red-500')}
              />
            )}
          />
          {errors.remarks && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{errors.remarks.message}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* AIP Reference Code */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="aipReferenceCode" className="text-xs md:text-sm font-medium text-neutral-900">
            AIP Reference Code
            <span className="text-destructive ml-0.5">*</span>
          </label>
          <span className="text-xs text-neutral-500">(Auto-generated)</span>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="aipReferenceCode"
              name="aipReferenceCode"
              value={aipCode || ""}
              readOnly
              disabled
              className="bg-neutral-50 font-mono text-xs text-neutral-600"
              placeholder={
                isGeneratingCode ? "Generating..." : "Code will appear here"
              }
            />
            {isGeneratingCode && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              </div>
            )}
          </div>
          {aipCode && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">
                {copied ? "Copied" : "Copy"}
              </span>
            </Button>
          )}
        </div>
        {aipCode && (
          <p className="text-xs text-neutral-500">
            {AIP_CODE_FORMAT_HINT}
          </p>
        )}
        {codeGenerationError && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{codeGenerationError}</span>
          </p>
        )}
      </div>

      {/* Project/Activity Name */}
      <div className="space-y-1.5">
        <label htmlFor="projectActivityName" className="text-xs md:text-sm font-medium text-neutral-900">
          Project / Activity Name
          <span className="text-destructive ml-0.5">*</span>
        </label>
        <Controller<AddProjectActivityFormValues, "projectActivityName">
          name="projectActivityName"
          control={control}
          render={({ field }) => (
            <Input
              {...field}
              id="projectActivityName"
              placeholder="Enter project or activity name"
              aria-invalid={!!errors.projectActivityName}
              className={cn(
                errors.projectActivityName &&
                  "border-red-300 focus:ring-red-500",
              )}
            />
          )}
        />
        {errors.projectActivityName && (
          <p className="text-xs text-red-600">
            {errors.projectActivityName.message}
          </p>
        )}
      </div>

      {/* Expected Output / Supporting Details */}
      <div className="space-y-1.5">
        <label htmlFor="expectedOutput" className="text-xs md:text-sm font-medium text-neutral-900">
          Expected Output / Supporting Details
          <span className="ml-1 text-neutral-400">(Optional)</span>
        </label>
        <Controller<AddProjectActivityFormValues, "expectedOutput">
          name="expectedOutput"
          control={control}
          render={({ field }) => (
            <Textarea
              {...field}
              value={field.value ?? ''}
              id="expectedOutput"
              placeholder="Describe the measurable outcome and any supporting justification"
              aria-invalid={!!errors.expectedOutput}
              className={cn(
                "min-h-28 resize-none md:min-h-32",
                errors.expectedOutput && "border-red-300 focus:ring-red-500",
              )}
            />
          )}
        />
        {errors.expectedOutput && (
          <p className="text-xs text-red-600">
            {errors.expectedOutput.message}
          </p>
        )}
        <p className="text-xs text-neutral-500">
          Include the deliverable, measurable outcome, and any short
          justification if needed.
        </p>
      </div>

      {/* Remarks / Justification */}
      <div className="space-y-1.5">
        <label htmlFor="remarks" className="text-xs md:text-sm font-medium text-neutral-900">
          Remarks / Justification
          <span className="ml-1 text-neutral-400">(Optional)</span>
        </label>
        <Controller<AddProjectActivityFormValues, "remarks">
          name="remarks"
          control={control}
          render={({ field }) => (
            <Textarea
              {...field}
              id="remarks"
              value={field.value ?? ''}
              placeholder="Optional explanation for budget reviewers and approvers"
              rows={3}
              className={cn(
                'md:min-h-[100px]',
                errors.remarks && 'border-red-300 focus:ring-red-500',
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
      </div>

      {/* Implementation Period */}
      <div className="space-y-1.5 md:space-y-2">
        <label className="text-xs md:text-sm font-medium text-neutral-900">
          Implementation Period
          {hasParentPeriod
            ? <span className="text-destructive ml-0.5">*</span>
            : <span className="ml-1 text-neutral-400">(Optional)</span>}
        </label>

        {hasParentPeriod && (
          <div className="flex items-start gap-1.5 rounded-sm border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs text-blue-800">
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Allowed range:{' '}
              <span className="font-medium">
                {MONTH_LABELS_LONG[(parentStartMonth ?? 1) - 1]} {parentStartYear} – {MONTH_LABELS_LONG[(parentEndMonth ?? 12) - 1]} {parentEndYear}
              </span>
            </span>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <span className="text-xs font-medium text-neutral-700">Start</span>
            <Controller<AddProjectActivityFormValues>
              name="implementationStartMonth"
              control={control}
              render={({ field: monthField }) => (
                <Controller<AddProjectActivityFormValues>
                  name="implementationStartYear"
                  control={control}
                  render={({ field: yearField }) => (
                    <MonthYearPicker
                      id="implementationStart"
                      value={monthYearFromFields(
                        monthField.value as number | undefined,
                        yearField.value as number | undefined,
                      )}
                      onChange={(v) => {
                        monthField.onChange(v.month);
                        yearField.onChange(v.year);
                      }}
                      error={!!(errors.implementationStartMonth ?? errors.implementationStartYear)}
                      aria-invalid={!!(errors.implementationStartMonth ?? errors.implementationStartYear)}
                      placeholder="Select start month & year"
                      minYear={parentStartYear}
                      maxYear={parentEndYear}
                    />
                  )}
                />
              )}
            />
            {(errors.implementationStartMonth ?? errors.implementationStartYear) && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  {(errors.implementationStartMonth?.message ?? errors.implementationStartYear?.message) === 'Start period must be before or equal to end period'
                    ? 'Start period must be before or equal to end period'
                    : hasParentPeriod
                      ? `Implementation start is required — the program runs ${MONTH_LABELS_LONG[(parentStartMonth ?? 1) - 1]} ${parentStartYear} – ${MONTH_LABELS_LONG[(parentEndMonth ?? 12) - 1]} ${parentEndYear}`
                      : 'Implementation start is required'}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-neutral-700">End</span>
            <Controller<AddProjectActivityFormValues>
              name="implementationEndMonth"
              control={control}
              render={({ field: monthField }) => (
                <Controller<AddProjectActivityFormValues>
                  name="implementationEndYear"
                  control={control}
                  render={({ field: yearField }) => (
                    <MonthYearPicker
                      id="implementationEnd"
                      value={monthYearFromFields(
                        monthField.value as number | undefined,
                        yearField.value as number | undefined,
                      )}
                      onChange={(v) => {
                        monthField.onChange(v.month);
                        yearField.onChange(v.year);
                      }}
                      error={!!(errors.implementationEndMonth ?? errors.implementationEndYear)}
                      aria-invalid={!!(errors.implementationEndMonth ?? errors.implementationEndYear)}
                      placeholder="Select end month & year"
                      minYear={parentStartYear}
                      maxYear={parentEndYear}
                    />
                  )}
                />
              )}
            />
            {(errors.implementationEndMonth ?? errors.implementationEndYear) && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  {hasParentPeriod
                    ? `Implementation end is required — the program runs ${MONTH_LABELS_LONG[(parentStartMonth ?? 1) - 1]} ${parentStartYear} – ${MONTH_LABELS_LONG[(parentEndMonth ?? 12) - 1]} ${parentEndYear}`
                    : 'Implementation end is required'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
