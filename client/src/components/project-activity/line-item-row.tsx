"use client";

import {
  Controller,
  Control,
  FieldErrors,
  useWatch,
} from "react-hook-form";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/custom/currency-input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  AddProjectActivityFormValues,
} from "@/lib/schemas";
import { formatCurrency } from "@/lib/currency-formatter";
import { cn } from "@/lib/utils";
import UACSObjectSelector from "@/components/project-activity/uacs-object-selector";
import type { UacsObjectRecord } from "@/lib/api";

interface LineItemRowProps {
  index: number;
  control: Control<AddProjectActivityFormValues>;
  errors: FieldErrors<AddProjectActivityFormValues>;
  onRemove: () => void;
  showRemoveButton: boolean;
  uacsObjects: UacsObjectRecord[];
}

/**
 * Line Item Row
 * Editable row for budget line item entry
 */
export default function LineItemRow({
  index,
  control,
  errors,
  onRemove,
  showRemoveButton,
  uacsObjects,
}: Readonly<LineItemRowProps>) {
  const expenseClass = useWatch({ control, name: `lineItems.${index}.expenseClass` });
  const quantity = useWatch({ control, name: `lineItems.${index}.quantity` });
  const unitCost = useWatch({ control, name: `lineItems.${index}.unitCost` });

  const expenseClassLabels = {
    PS: "Personnel Services",
    MOOE: "Maintenance & Operating",
    FE: "Financial Expenses",
    CO: "Capital Outlay",
  } as const;

  const lineTotal = (quantity || 0) * (unitCost || 0);

  const expenseClassColors = {
    PS: "border-l-4 border-l-blue-500",
    MOOE: "border-l-4 border-l-teal-500",
    FE: "border-l-4 border-l-violet-500",
    CO: "border-l-4 border-l-orange-500",
  };

  const headerClassColors = {
    PS: "text-blue-700",
    MOOE: "text-teal-700",
    FE: "text-violet-700",
    CO: "text-orange-700",
  };

  const headerBackgroundColors = {
    PS: "bg-blue-50",
    MOOE: "bg-teal-50",
    FE: "bg-violet-50",
    CO: "bg-orange-50",
  };

  return (
    <div
      className={cn(
        "bg-white border rounded p-3 space-y-3",
        expenseClassColors[expenseClass],
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between mb-2 rounded-md px-2 py-1",
          headerBackgroundColors[expenseClass],
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-semibold uppercase tracking-wide rounded px-2 py-0.5",
              headerClassColors[expenseClass],
              headerBackgroundColors[expenseClass],
            )}
          >
            {expenseClass}
          </span>
          <span className="text-xs text-neutral-500">Line {index + 1}</span>
        </div>
        {showRemoveButton && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-7 w-7 p-0 text-neutral-600 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Expense Class Selector */}
      <div>
        <label className="text-xs font-medium text-neutral-600 mb-1 block">
          Expense Class
        </label>
        <Controller<AddProjectActivityFormValues, `lineItems.${number}.expenseClass`>
          name={`lineItems.${index}.expenseClass`}
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-10 text-sm">
                <span>
                  {field.value
                    ? `${field.value} — ${expenseClassLabels[field.value]}`
                    : "Select Expense Class"}
                </span>
              </SelectTrigger>
              <SelectContent
                className="max-h-60 w-[min(78vw,560px)]"
                align="start"
                alignItemWithTrigger={false}
              >
                {(["PS", "MOOE", "FE", "CO"] as const).map((cls) => (
                  <SelectItem key={cls} value={cls}>
                    <div className="flex items-center gap-3 py-1.5 px-3">
                      <span className="w-20 shrink-0 font-mono text-sm text-slate-900">
                        {cls}
                      </span>
                      <span className="min-w-0 text-sm text-neutral-700">
                        {expenseClassLabels[cls]}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* UACS Object Selector */}
      <div>
        <label className="text-xs font-medium text-neutral-600 mb-1 block">
          UACS Code
        </label>
        <UACSObjectSelector
          control={control}
          fieldIndex={index}
          errors={errors}
          uacsObjects={uacsObjects}
        />
      </div>

      {/* Quantity & Unit */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1 block">
            Qty
          </label>
          <Controller<AddProjectActivityFormValues, `lineItems.${number}.quantity`>
            name={`lineItems.${index}.quantity`}
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                type="number"
                min="1"
                step="1"
                onChange={(e) => field.onChange(Number(e.target.value))}
                aria-invalid={!!errors.lineItems?.[index]?.quantity}
                className="h-8 text-xs"
              />
            )}
          />
          {errors.lineItems?.[index]?.quantity && (
            <p className="mt-1 text-[11px] text-destructive">{errors.lineItems[index].quantity.message}</p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1 block">
            Unit
          </label>
          <Controller<AddProjectActivityFormValues, `lineItems.${number}.unit`>
            name={`lineItems.${index}.unit`}
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                placeholder="pcs, reams, hrs"
                aria-invalid={!!errors.lineItems?.[index]?.unit}
                className="h-8 text-xs"
              />
            )}
          />
          {errors.lineItems?.[index]?.unit && (
            <p className="mt-1 text-[11px] text-destructive">{errors.lineItems[index].unit.message}</p>
          )}
        </div>
      </div>

      {/* Unit Cost & Total */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1 block">
            Unit Cost
          </label>
          <Controller<AddProjectActivityFormValues, `lineItems.${number}.unitCost`>
            name={`lineItems.${index}.unitCost`}
            control={control}
            render={({ field }) => (
              <CurrencyInput
                // unitCost is number-typed in the schema; CurrencyInput speaks
                // decimal strings, so the coercion lives here. toFixed(2) so the
                // blur padding survives the round-trip.
                value={field.value == null ? '' : field.value.toFixed(2)}
                onChange={(v) => field.onChange(v === '' ? 0 : Number(v))}
                placeholder="₱ 0.00"
                aria-invalid={!!errors.lineItems?.[index]?.unitCost}
                className="h-8 text-xs font-mono"
              />
            )}
          />
          {errors.lineItems?.[index]?.unitCost && (
            <p className="mt-1 text-[11px] text-destructive">{errors.lineItems[index].unitCost.message}</p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1 block">
            Total
          </label>
          <div className="h-8 bg-neutral-50 border border-neutral-200 rounded px-2.5 py-1.5 flex items-center justify-end">
            <span className="text-xs font-mono font-semibold text-neutral-900">
              {formatCurrency(lineTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Remarks */}
      <div className="space-y-1.5">
        <label className="text-xs md:text-sm font-medium text-neutral-900">
          Remarks (Optional)
        </label>
        <Controller<AddProjectActivityFormValues, `lineItems.${number}.remarks`>
          name={`lineItems.${index}.remarks`}
          control={control}
          render={({ field }) => (
            <Textarea
              {...field}
              value={field.value ?? ''}
              placeholder="Additional notes"
              className="min-h-20 resize-none text-xs"
            />
          )}
        />
      </div>
    </div>
  );
}
