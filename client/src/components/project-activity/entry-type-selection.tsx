"use client";

import { Controller, Control, useWatch, UseFormSetValue } from "react-hook-form";
import {
  AddProjectActivityFormValues,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Info } from "lucide-react";

interface EntryTypeSelectionProps {
  control: Control<AddProjectActivityFormValues>;
  setValue: UseFormSetValue<AddProjectActivityFormValues>;
  editMode?: boolean;
  /**
   * 'card' (default) renders the original dropdown-based layout, used by the
   * full-page add form and the in-place edit drawer. 'drawer' renders the
   * flat, tile-based layout the New Project/Activity drawer uses — same
   * fields and wiring.
   */
  variant?: 'card' | 'drawer';
}

/**
 * Base UI needs `items` on `Select.Root` to render a label in the trigger — the
 * popup is portalled, so without this `Select.Value` shows the raw value and the
 * field reads "DIRECT_COSTS" instead of "Direct Costs". Same fix as the office
 * grid dropdowns.
 */
const COST_MODE_ITEMS: Record<string, string> = {
  DIRECT_COSTS: 'Direct Costs',
  ACTIVITY_CHILDREN: 'Activity-Derived Costs',
};

/**
 * Entry Type Selection
 * Project vs Activity selector with costMode option for projects
 */
export default function EntryTypeSelection({
  control,
  setValue,
  editMode = false,
  variant = 'card',
}: Readonly<EntryTypeSelectionProps>) {
  const entryType = useWatch({ control, name: "entryType" });
  const costMode = useWatch({ control, name: "costMode" });

  if (variant === 'drawer') {
    return (
      <DrawerEntryTypeFields
        setValue={setValue}
        editMode={editMode}
        entryType={entryType}
        costMode={costMode}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            setValue('entryType', 'project');
          }}
          className={cn(
            "flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors md:px-5 md:py-4",
            entryType === "project"
              ? "border-blue-300 bg-blue-50 text-blue-900"
              : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300",
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border-2",
                entryType === "project"
                  ? "border-blue-600 bg-blue-600"
                  : "border-neutral-300",
              )}
            >
              {entryType === "project" && (
                <div className="h-2 w-2 rounded-full bg-white" />
              )}
            </div>
            <span>Project</span>
          </div>
          <p className="mt-1 text-xs opacity-70">
            Major component with activities
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setValue('entryType', 'activity');
          }}
          className={cn(
            "flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors md:px-5 md:py-4",
            entryType === "activity"
              ? "border-cyan-300 bg-cyan-50 text-cyan-900"
              : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300",
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border-2",
                entryType === "activity"
                  ? "border-cyan-600 bg-cyan-600"
                  : "border-neutral-300",
              )}
            >
              {entryType === "activity" && (
                <div className="h-2 w-2 rounded-full bg-white" />
              )}
            </div>
            <span>Activity</span>
          </div>
          <p className="mt-1 text-xs opacity-70">
            Direct execution under program
          </p>
        </button>
      </div>

      {/* Cost Mode Selector (Projects only) */}
      {entryType === "project" && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 flex-1">
              <h4 className="text-xs md:text-sm font-medium text-neutral-900">
                Cost Structure
              </h4>
              <p className="text-xs text-neutral-600">
                Choose how this project&apos;s budget is composed. This cannot be changed after creation.
              </p>
            </div>
          </div>

          <Controller<AddProjectActivityFormValues, "costMode">
            name="costMode"
            control={control}
            render={({ field }) => (
              <Select
                items={COST_MODE_ITEMS}
                value={field.value ? String(field.value) : "DIRECT_COSTS"}
                onValueChange={(val) => {
                  field.onChange(val);
                  // Empty for both modes in Phase 1: the line-item block is
                  // deferred (D5), so seeding a blank DIRECT_COSTS row leaves a
                  // required item the user cannot see, fill, or delete — the
                  // form then fails validation on an invisible field. Restore
                  // the seed when line-item entry ships.
                  setValue('lineItems', []);
                }}
                disabled={editMode}
              >
                <SelectTrigger
                  className={cn(
                    "w-full bg-white",
                    editMode && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <SelectValue placeholder="Select cost structure" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIRECT_COSTS">
                    <div className="space-y-1">
                      <p className="font-medium">Direct Costs</p>
                      <p className="text-xs text-neutral-600">
                        Enter line items with costs directly under this project
                      </p>
                    </div>
                  </SelectItem>
                  <SelectItem value="ACTIVITY_CHILDREN">
                    <div className="space-y-1">
                      <p className="font-medium">Activity-Derived Costs</p>
                      <p className="text-xs text-neutral-600">
                        Costs roll up from child activities; no direct line items
                      </p>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          />

          {editMode && (
            <div className="flex items-center gap-2 text-xs text-neutral-600">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Cost structure is locked after creation</span>
            </div>
          )}

          {/* Cost Mode Explanation */}
          {costMode === "ACTIVITY_CHILDREN" && (
            <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium mb-1">Activity-Derived Costs:</p>
              <p>
                Line items will be entered under child activities, not directly here. Total project cost will be computed from child activity totals.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ENTRY_TYPES = [
  { value: 'project' as const, label: 'Project', desc: 'A major component that groups its own activities.' },
  { value: 'activity' as const, label: 'Activity', desc: 'Executed directly under the program, with its own costs.' },
];

const COST_STRUCTS = [
  { value: 'DIRECT_COSTS' as const, label: 'Direct Costs', desc: 'Enter line items with costs directly under this project.' },
  { value: 'ACTIVITY_CHILDREN' as const, label: 'Activity-Derived Costs', desc: 'Costs roll up from child activities; no direct line items.' },
];

function TileOption({
  label,
  description,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-slate-200 bg-white hover:border-slate-300',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px]',
          selected ? 'border-primary' : 'border-slate-300',
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[14.5px] font-semibold text-slate-950">{label}</span>
        <span className="text-xs text-slate-500">{description}</span>
      </span>
    </button>
  );
}

function DrawerEntryTypeFields({
  setValue,
  editMode,
  entryType,
  costMode,
}: {
  setValue: UseFormSetValue<AddProjectActivityFormValues>;
  editMode: boolean;
  entryType: AddProjectActivityFormValues['entryType'];
  costMode: AddProjectActivityFormValues['costMode'];
}) {
  const isProject = entryType === 'project';
  const lockNote = isProject
    ? 'The type and cost structure cannot be changed after saving.'
    : 'The type cannot be changed after saving. Activities always carry their own costs.';

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13.5px] text-slate-500">{lockNote}</p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {ENTRY_TYPES.map((t) => (
          <TileOption
            key={t.value}
            label={t.label}
            description={t.desc}
            selected={entryType === t.value}
            disabled={editMode}
            onClick={() => setValue('entryType', t.value)}
          />
        ))}
      </div>

      {isProject && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-900">
            Cost structure
            <span className="ml-0.5 text-orange-700">*</span>
          </label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {COST_STRUCTS.map((t) => (
              <TileOption
                key={t.value}
                label={t.label}
                description={t.desc}
                selected={costMode === t.value}
                disabled={editMode}
                onClick={() => {
                  setValue('costMode', t.value);
                  setValue('lineItems', []);
                }}
              />
            ))}
          </div>
          {editMode && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Cost structure is locked after creation</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
