'use client';

import { useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Trash2, GripVertical, Paperclip, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SimpleSelect } from '@/components/custom/simple-select';
import { MonthYearPicker, monthYearFromFields } from '@/components/custom/month-year-picker';
import PpmpUacsObjectSelector from './ppmp-uacs-object-selector';
import {
  ppmpLineItemSchema,
  PpmpLineItemFormValues,
  PPMP_PROJECT_TYPES,
  PPMP_PROCUREMENT_MODES,
  PPMP_DEFAULT_PERIOD,
  FUND_SOURCES,
} from '@/lib/schemas';
import type { UacsObjectRecord } from '@/lib/api';
import { formatCurrency } from '@/lib/currency-formatter';

/** Mirrors MAX_DOCUMENT_BYTES in api/src/ppmp/ppmp.controller.ts. */
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const EXPENSE_CLASSES = [
  { value: 'PS', label: 'PS — Personnel Services' },
  { value: 'MOOE', label: 'MOOE — Maintenance & Other Operating Expenses' },
  { value: 'FE', label: 'FE — Financial Expenses' },
  { value: 'CO', label: 'CO — Capital Outlay' },
];

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

export interface ExistingDocument {
  url: string;
  name: string;
}

interface PpmpLineItemRowProps {
  uacsObjects: UacsObjectRecord[];
  initialValues?: PpmpLineItemFormValues;
  existingDocument?: ExistingDocument | null;
  onSubmit: (values: PpmpLineItemFormValues, file: File | null) => Promise<void>;
  onCancel?: () => void;
  onDelete?: () => void;
  submitLabel?: string;
}

const EMPTY_VALUES: PpmpLineItemFormValues = {
  lineItemName: '',
  typeOfProject: undefined,
  modeOfProcurement: undefined,
  uacsObjectId: '',
  quantity: '',
  unit: '',
  unitCost: '',
  fundSource: 'GF',
  expenseClass: 'MOOE',
  preProcurementConferenceRequired: false,
  procurementStartMonth: PPMP_DEFAULT_PERIOD.startMonth,
  procurementStartYear: PPMP_DEFAULT_PERIOD.startYear,
  procurementEndMonth: PPMP_DEFAULT_PERIOD.endMonth,
  procurementEndYear: PPMP_DEFAULT_PERIOD.endYear,
  deliveryPeriod: '',
  remarks: '',
};

const TYPE_OF_PROJECT_OPTIONS = [{ value: '', label: '— None —' }, ...PPMP_PROJECT_TYPES];
const PROCUREMENT_MODE_OPTIONS = [{ value: '', label: '— None —' }, ...PPMP_PROCUREMENT_MODES];

/** One repeatable procurement line item — add or edit, one API call at a time. */
export default function PpmpLineItemRow({
  uacsObjects,
  initialValues,
  existingDocument,
  onSubmit,
  onCancel,
  onDelete,
  submitLabel = 'Add line item',
}: Readonly<PpmpLineItemRowProps>) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PpmpLineItemFormValues>({
    resolver: zodResolver(ppmpLineItemSchema),
    defaultValues: initialValues ?? EMPTY_VALUES,
  });

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [documentCleared, setDocumentCleared] = useState(false);

  const lineItemName = useWatch({ control, name: 'lineItemName' });
  const uacsObjectId = useWatch({ control, name: 'uacsObjectId' });
  const quantity = useWatch({ control, name: 'quantity' });
  const unit = useWatch({ control, name: 'unit' });
  const unitCost = useWatch({ control, name: 'unitCost' });
  // Display-only preview — the server always recomputes the authoritative
  // lineTotal. Matches project-activity/line-item-row.tsx's own preview math.
  const previewTotal = (Number(quantity) || 0) * (Number(unitCost) || 0);

  // Every other required field already has a sensible default (dates,
  // fund source, expense class, type/mode of procurement) — the fields
  // that genuinely start empty and need the office's own input are the
  // ones this progress indicator tracks.
  const PROGRESS_FIELDS = [lineItemName, uacsObjectId, quantity, unit, unitCost];
  const filledCount = PROGRESS_FIELDS.filter((v) => v.trim().length > 0).length;
  const progressPercent = (filledCount / PROGRESS_FIELDS.length) * 100;

  const submit = handleSubmit(async (values) => {
    await onSubmit(values, file);
    if (!initialValues) {
      reset(EMPTY_VALUES);
      setFile(null);
    }
  });

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3 md:p-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-700">Required fields</span>
          <span className="tabular-nums text-slate-500">
            {filledCount} of {PROGRESS_FIELDS.length}
          </span>
        </div>
        {/* Orange, not the default blue "primary" — a line item is edited
            here, distinct from Project-level actions (blue throughout the
            drawer's header/Eye icon), same color split as the registry
            table's per-line-item Eye/Pencil icons. */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full w-full flex-1 bg-orange-500 transition-all"
            style={{ transform: `translateX(-${100 - progressPercent}%)` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-slate-900">
            Line Item Name
            <span className="text-destructive ml-0.5">*</span>
          </label>
          <Controller
            name="lineItemName"
            control={control}
            render={({ field }) => (
              <Input {...field} placeholder="What is being procured" aria-invalid={!!errors.lineItemName} />
            )}
          />
          {errors.lineItemName && <p className="text-xs text-red-600">{errors.lineItemName.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-900">
            Type of Project <span className="text-slate-400">(Optional)</span>
          </label>
          <Controller
            name="typeOfProject"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                options={TYPE_OF_PROJECT_OPTIONS}
                value={field.value ?? ''}
                onChange={(v) => field.onChange(v === '' ? undefined : v)}
                error={!!errors.typeOfProject}
              />
            )}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-900">Quantity</label>
          <Controller
            name="quantity"
            control={control}
            render={({ field }) => (
              <Input {...field} inputMode="decimal" placeholder="0.00" aria-invalid={!!errors.quantity} />
            )}
          />
          {errors.quantity && <p className="text-xs text-red-600">{errors.quantity.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-900">Unit</label>
          <Controller
            name="unit"
            control={control}
            render={({ field }) => (
              <Input {...field} placeholder="e.g. lot, box, unit" aria-invalid={!!errors.unit} />
            )}
          />
          {errors.unit && <p className="text-xs text-red-600">{errors.unit.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-900">Unit Cost</label>
          <Controller
            name="unitCost"
            control={control}
            render={({ field }) => (
              <Input {...field} inputMode="decimal" placeholder="0.00" aria-invalid={!!errors.unitCost} />
            )}
          />
          {errors.unitCost && <p className="text-xs text-red-600">{errors.unitCost.message}</p>}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-slate-900">Line Total</span>
          <p className="flex h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900">
            {formatCurrency(previewTotal)}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-900">
            Recommended Mode of Procurement <span className="text-slate-400">(Optional)</span>
          </label>
          <Controller
            name="modeOfProcurement"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                options={PROCUREMENT_MODE_OPTIONS}
                value={field.value ?? ''}
                onChange={(v) => field.onChange(v === '' ? undefined : v)}
                error={!!errors.modeOfProcurement}
              />
            )}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-900">
            UACS Object
            <span className="text-destructive ml-0.5">*</span>
          </label>
          <Controller
            name="uacsObjectId"
            control={control}
            render={({ field }) => (
              <PpmpUacsObjectSelector
                value={field.value}
                onChange={field.onChange}
                error={!!errors.uacsObjectId}
                uacsObjects={uacsObjects}
              />
            )}
          />
          {errors.uacsObjectId && (
            <p className="text-xs text-red-600">{errors.uacsObjectId.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-900">Fund Source</label>
          <Controller
            name="fundSource"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                options={FUND_SOURCES.map((f) => ({ value: f.value, label: f.label, description: f.description }))}
                value={field.value}
                onChange={field.onChange}
                error={!!errors.fundSource}
              />
            )}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-900">Expense Class</label>
          <Controller
            name="expenseClass"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                options={EXPENSE_CLASSES}
                value={field.value}
                onChange={field.onChange}
                error={!!errors.expenseClass}
              />
            )}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-900">
            Pre-Procurement Conference, if applicable
          </label>
          <Controller
            name="preProcurementConferenceRequired"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                options={YES_NO}
                value={field.value ? 'yes' : 'no'}
                onChange={(v) => field.onChange(v === 'yes')}
                error={!!errors.preProcurementConferenceRequired}
              />
            )}
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <span className="text-xs font-medium text-slate-900">Procurement Activity</span>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <span className="text-[11px] text-slate-500">Start of Procurement Activity</span>
              <Controller
                name="procurementStartMonth"
                control={control}
                render={({ field: monthField }) => (
                  <Controller
                    name="procurementStartYear"
                    control={control}
                    render={({ field: yearField }) => (
                      <MonthYearPicker
                        id="procurementStart"
                        value={monthYearFromFields(monthField.value, yearField.value)}
                        onChange={(v) => {
                          monthField.onChange(v.month);
                          yearField.onChange(v.year);
                        }}
                        error={!!(errors.procurementStartMonth ?? errors.procurementStartYear)}
                      />
                    )}
                  />
                )}
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-slate-500">End of Procurement Activity</span>
              <Controller
                name="procurementEndMonth"
                control={control}
                render={({ field: monthField }) => (
                  <Controller
                    name="procurementEndYear"
                    control={control}
                    render={({ field: yearField }) => (
                      <MonthYearPicker
                        id="procurementEnd"
                        value={monthYearFromFields(monthField.value, yearField.value)}
                        onChange={(v) => {
                          monthField.onChange(v.month);
                          yearField.onChange(v.year);
                        }}
                        error={!!(errors.procurementEndMonth ?? errors.procurementEndYear)}
                      />
                    )}
                  />
                )}
              />
            </div>
          </div>
          {(errors.procurementStartMonth ?? errors.procurementStartYear) && (
            <p className="text-xs text-red-600">
              {errors.procurementStartMonth?.message ?? errors.procurementStartYear?.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-slate-900">
            Expected Delivery/Implementation Period <span className="text-slate-400">(Optional)</span>
          </label>
          <Controller
            name="deliveryPeriod"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                placeholder="e.g. within 30 days of PO"
                aria-invalid={!!errors.deliveryPeriod}
              />
            )}
          />
          {errors.deliveryPeriod && (
            <p className="text-xs text-red-600">{errors.deliveryPeriod.message}</p>
          )}
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-slate-900">
            Attached Supporting Documents <span className="text-slate-400">(Optional)</span>
          </label>
          {existingDocument && !documentCleared && !file && (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-slate-500" />
              <a
                href={existingDocument.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-blue-700 hover:underline"
              >
                {existingDocument.name}
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDocumentCleared(true)}
                aria-label="Replace document"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          {(!existingDocument || documentCleared || file) && (
            <div className="flex items-center gap-2">
              <label className="flex h-11 flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">
                <Paperclip className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {file ? file.name : 'PDF, Word, Excel, JPG or PNG — up to 10MB'}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const picked = e.target.files?.[0] ?? null;
                    // The API, the server action and nginx all cap the body at
                    // ~10 MB; say so here rather than let the upload 413.
                    if (picked && picked.size > MAX_DOCUMENT_BYTES) {
                      setFileError('That file is over 10 MB. Choose a smaller one.');
                      setFile(null);
                      e.target.value = '';
                      return;
                    }
                    setFileError(null);
                    setFile(picked);
                  }}
                />
              </label>
              {file && (
                <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)} aria-label="Clear">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          {fileError && (
            <p role="alert" className="text-sm text-destructive">
              {fileError}
            </p>
          )}
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-slate-900">Remarks</label>
          <Controller
            name="remarks"
            control={control}
            render={({ field }) => <Textarea {...field} rows={2} placeholder="Optional" />}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1 text-slate-400">
          {onDelete && <GripVertical className="h-4 w-4" aria-hidden />}
        </div>
        <div className="flex gap-2">
          {onDelete && (
            <Button type="button" variant="ghost" size="sm" onClick={onDelete} className="text-red-600">
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          )}
          {onCancel && (
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={isSubmitting}
            className="bg-orange-500 text-white hover:bg-orange-600"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
