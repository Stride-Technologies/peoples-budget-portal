'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PpmpLineItemRow from './ppmp-line-item-row';
import LineItemDetails from './line-item-details';
import LineBudgetLink from './line-budget-link';
import { PPMP_PROJECT_TYPES, PPMP_PROCUREMENT_MODES, type PpmpLineItemFormValues } from '@/lib/schemas';
import { formatCurrency, formatPeso } from '@/lib/currency-formatter';
import { Badge } from '@/components/ui/badge';
import type { PpmpRecord, UacsObjectRecord, CreatePpmpLineItemPayload, PpmpBudgetWarning } from '@/lib/api';
import {
  addPpmpLineItem,
  updatePpmpLineItem,
  deletePpmpLineItem,
  reorderPpmpLineItems,
  uploadPpmpLineItemDocument,
  loadPpmpBudgetWarnings,
} from '@/app/ppmp-registry/[id]/_actions';

const projectTypeLabel = (v: string | null) =>
  v ? (PPMP_PROJECT_TYPES.find((t) => t.value === v)?.label ?? v) : null;
const modeLabel = (v: string | null) =>
  v ? (PPMP_PROCUREMENT_MODES.find((m) => m.value === v)?.label ?? v) : null;

interface PpmpLineItemsSectionProps {
  ppmp: PpmpRecord;
  uacsObjects: UacsObjectRecord[];
  onChange: (ppmp: PpmpRecord) => void;
  /** Scrolls to the "Add a line item" form once on mount — set by the registry table's Plus icon. */
  scrollToAddOnMount?: boolean;
  /** Opens directly in edit mode for one line item — set by the registry table's Pencil icon. */
  focusEditLineItemId?: string | null;
  /** Fires whenever the currently-edited line item changes, with its name (or null when
   * not editing one) — the drawer header uses this to switch to "Line Item Overview". */
  onEditingLineItemChange?: (lineItemName: string | null) => void;
}

export default function PpmpLineItemsSection({
  ppmp,
  uacsObjects,
  onChange,
  scrollToAddOnMount,
  focusEditLineItemId,
  onEditingLineItemChange,
}: Readonly<PpmpLineItemsSectionProps>) {
  const [editingId, setEditingId] = useState<string | null>(focusEditLineItemId ?? null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [reordering, setReordering] = useState(false);
  // Soft warnings (never blocking): linked budget rows that the year's lines
  // add up to more than. Refetched whenever an amount or a link changes.
  const [budgetWarnings, setBudgetWarnings] = useState<PpmpBudgetWarning[]>([]);
  const linkSignature = ppmp.lineItems
    .map((l) => `${l.id}:${l.lineTotal}:${l.programId ?? ''}:${l.projectActivityId ?? ''}:${l.budgetItemId ?? ''}`)
    .join('|');
  useEffect(() => {
    let live = true;
    loadPpmpBudgetWarnings(ppmp.id).then((w) => live && setBudgetWarnings(w));
    return () => {
      live = false;
    };
  }, [ppmp.id, linkSignature]);
  const overLines = new Set(budgetWarnings.flatMap((w) => w.lineItemIds));
  const addSectionRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollToAddOnMount) {
      addSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (focusEditLineItemId) {
      editingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Fires once per mount only — this section is remounted per Project (keyed by `id` upstream).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editing = editingId ? ppmp.lineItems.find((li) => li.id === editingId) : undefined;
    onEditingLineItemChange?.(editing?.lineItemName ?? null);
    // Notifies the parent drawer, which owns no state of its own here — not
    // a same-component setState-in-effect, so the cascading-render lint
    // concern doesn't apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const lineItems = [...ppmp.lineItems].sort((a, b) => a.orderIndex - b.orderIndex);

  const handleAdd = async (values: PpmpLineItemFormValues, file: File | null) => {
    setError(undefined);
    const previousIds = new Set(ppmp.lineItems.map((li) => li.id));
    const result = await addPpmpLineItem(ppmp.id, values as CreatePpmpLineItemPayload);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    let nextPpmp = result.ppmp;
    if (file) {
      const created = nextPpmp.lineItems.find((li) => !previousIds.has(li.id));
      if (created) {
        const uploadResult = await uploadPpmpLineItemDocument(ppmp.id, created.id, file);
        if ('error' in uploadResult) {
          setError(uploadResult.error);
        } else {
          nextPpmp = {
            ...nextPpmp,
            lineItems: nextPpmp.lineItems.map((li) =>
              li.id === created.id
                ? {
                    ...li,
                    supportingDocumentUrl: uploadResult.supportingDocumentUrl,
                    supportingDocumentName: uploadResult.supportingDocumentName,
                  }
                : li,
            ),
          };
        }
      }
    }
    onChange(nextPpmp);
  };

  const handleUpdate = async (lineItemId: string, values: PpmpLineItemFormValues, file: File | null) => {
    setError(undefined);
    const result = await updatePpmpLineItem(ppmp.id, lineItemId, values);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    let nextPpmp = result.ppmp;
    if (file) {
      const uploadResult = await uploadPpmpLineItemDocument(ppmp.id, lineItemId, file);
      if ('error' in uploadResult) {
        setError(uploadResult.error);
      } else {
        nextPpmp = {
          ...nextPpmp,
          lineItems: nextPpmp.lineItems.map((li) =>
            li.id === lineItemId
              ? {
                  ...li,
                  supportingDocumentUrl: uploadResult.supportingDocumentUrl,
                  supportingDocumentName: uploadResult.supportingDocumentName,
                }
              : li,
          ),
        };
      }
    }
    onChange(nextPpmp);
    setEditingId(null);
  };

  const handleDelete = async (lineItemId: string) => {
    setError(undefined);
    const result = await deletePpmpLineItem(ppmp.id, lineItemId);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onChange({
      ...ppmp,
      lineItems: ppmp.lineItems.filter((li) => li.id !== lineItemId),
      grandTotal: result.grandTotal,
    });
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= lineItems.length) return;
    const reordered = [...lineItems];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const ids = reordered.map((li) => li.id);

    setReordering(true);
    setError(undefined);
    const result = await reorderPpmpLineItems(ppmp.id, ids);
    setReordering(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onChange({
      ...ppmp,
      lineItems: reordered.map((li, i) => ({ ...li, orderIndex: i })),
    });
  };

  return (
    <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
      <CardHeader className="flex-row items-center justify-between border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="font-heading text-lg font-semibold text-slate-950">
              Line Items
            </CardTitle>
            <Badge variant="outline" className="font-normal text-slate-600">
              {lineItems.length} line item{lineItems.length === 1 ? '' : 's'}
            </Badge>
          </div>
          <CardDescription>Procurement items planned under this Project</CardDescription>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">
            Estimated Budget / Authorized Budgetary Allocation (PhP)
          </p>
          <p className="text-xl font-semibold text-slate-950">{formatCurrency(ppmp.grandTotal)}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {budgetWarnings.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-medium">
              Planned costs are above the {ppmp.kind === 'FINAL' ? 'enacted budget' : 'AIP amount'} for{' '}
              {budgetWarnings.length === 1 ? 'one linked row' : `${budgetWarnings.length} linked rows`}.
            </p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {budgetWarnings.map((w) => (
                <li key={`${w.field}:${w.id}`}>
                  {w.code ? <span className="font-mono">{w.code}</span> : null} {w.name}: budgeted{' '}
                  {formatPeso(w.budget)}, planned {formatPeso(w.linkedTotal)}
                  {w.ppmpCount > 1 ? ` across ${w.ppmpCount} Projects (this one ${formatPeso(w.thisPpmpTotal)})` : ''}
                  {' '}— over by {formatPeso(w.over)}.
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-amber-800">This is a warning only; nothing is blocked.</p>
          </div>
        )}

        {lineItems.map((li, index) =>
          editingId === li.id ? (
            <div key={li.id} ref={focusEditLineItemId === li.id ? editingRef : undefined}>
            <PpmpLineItemRow
              uacsObjects={uacsObjects}
              existingDocument={
                li.supportingDocumentUrl && li.supportingDocumentName
                  ? { url: li.supportingDocumentUrl, name: li.supportingDocumentName }
                  : null
              }
              initialValues={{
                lineItemName: li.lineItemName,
                typeOfProject: li.typeOfProject ?? undefined,
                modeOfProcurement: li.modeOfProcurement ?? undefined,
                uacsObjectId: li.uacsObjectId,
                quantity: li.quantity,
                unit: li.unit,
                unitCost: li.unitCost,
                fundSource: li.fundSource,
                expenseClass: li.expenseClass,
                preProcurementConferenceRequired: li.preProcurementConferenceRequired,
                procurementStartMonth: li.procurementStartMonth,
                procurementStartYear: li.procurementStartYear,
                procurementEndMonth: li.procurementEndMonth,
                procurementEndYear: li.procurementEndYear,
                deliveryPeriod: li.deliveryPeriod ?? '',
                remarks: li.remarks ?? '',
              }}
              onSubmit={(values, file) => handleUpdate(li.id, values, file)}
              onCancel={() => setEditingId(null)}
              submitLabel="Save changes"
            />
            </div>
          ) : (
            <div key={li.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {li.lineItemName}
                    {overLines.has(li.id) && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1 text-[0.6875rem] font-normal text-amber-800">
                        over budget
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {li.uacsCode} — {li.uacsDescription}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[
                      projectTypeLabel(li.typeOfProject),
                      modeLabel(li.modeOfProcurement),
                      `${li.quantity} ${li.unit} × ${formatCurrency(li.unitCost)}`,
                      li.fundSource,
                      li.expenseClass,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <p className="mr-2 text-sm font-semibold text-slate-950">
                    {formatCurrency(li.lineTotal)}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={reordering || index === 0}
                    onClick={() => move(index, -1)}
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={reordering || index === lineItems.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setViewingId(viewingId === li.id ? null : li.id)}
                    aria-label="View"
                    className={viewingId === li.id ? 'text-blue-600' : undefined}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setViewingId(null);
                      setEditingId(li.id);
                    }}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(li.id)}
                    className="text-red-600"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {viewingId === li.id && (
                <>
                  <LineItemDetails li={li} />
                  <LineBudgetLink
                    ppmp={ppmp}
                    li={li}
                    onSaved={(saved) =>
                      onChange({
                        ...ppmp,
                        lineItems: ppmp.lineItems.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)),
                      })
                    }
                  />
                </>
              )}
            </div>
          ),
        )}

        <div ref={addSectionRef}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Add a line item
          </p>
          <PpmpLineItemRow uacsObjects={uacsObjects} onSubmit={handleAdd} />
        </div>
      </CardContent>
    </Card>
  );
}
