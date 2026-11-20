'use client';

import { Fragment, useState, type MouseEvent } from 'react';
import { ChevronRight, Eye, Pencil, Plus, Upload, RefreshCw, EyeOff, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCurrency, addDecimalStrings } from '@/lib/currency-formatter';
import { useAIPExpand } from '@/hooks/useAIPExpand';
import type { PpmpOfficeGroup, GroupablePpmp } from '@/lib/ppmp-grouping';
import { groupByClassification } from '@/lib/ppmp-grouping';
import type { PpmpLineItemRecord, PpmpClassification } from '@/lib/api';
import LineItemDetails from './line-item-details';
import type { EditableProject } from './edit-project-drawer';

export interface PpmpListRow extends GroupablePpmp {
  name: string;
  fundingProgram: string;
  classification: PpmpClassification;
  /** Three-state approval gate — DRAFT at creation, APPROVED unlocks
   *  Publish, REVISION means it was published, then edited, and needs
   *  re-approval + Republish before the edit goes public again. */
  status: 'DRAFT' | 'APPROVED' | 'REVISION';
  isPublished: boolean;
  /** Null until the first successful Publish — distinguishes a first-time
   *  "Publish" from a "Republish" of a Project that's been live before. */
  publishedAt: string | null;
  lineItemCount: number;
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  GOODS: 'Goods',
  SERVICES: 'Services',
  CONSULTING_SERVICES: 'Consulting Services',
  INFRASTRUCTURE_PROJECTS: 'Infrastructure Projects',
};

const PROCUREMENT_MODE_LABELS: Record<string, string> = {
  SMALL_VALUE_PROCUREMENT: 'Small Value Procurement',
  COMPETITIVE_BIDDING: 'Competitive Bidding',
  NEGOTIATED_PROCUREMENT: 'Negotiated Procurement',
  HIGHLY_TECHNICAL_CONSULTANTS: 'Highly Technical Consultants',
};

interface PpmpMasterListProps {
  groups: PpmpOfficeGroup<PpmpListRow>[];
  showBreakdown: boolean;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onView: (id: string) => void;
  onAddLineItem: (id: string) => void;
  onEditLineItem: (ppmpId: string, lineItemId: string) => void;
  onEditProject: (project: EditableProject) => void;
  busyId: string | null;
  /** Lazily loaded on expand (Full mode only) — the list endpoint stays lightweight. */
  lineItemsById: Record<string, PpmpLineItemRecord[] | undefined>;
  loadingLineItemIds: Set<string>;
  onExpandRow: (id: string) => void;
}

/**
 * Shared column template so the header and every row line up exactly. Row
 * height is fixed (not `items-center` alone) — the Project column shows a
 * two-line block (name + AIP code), so without a fixed height a long name
 * would grow that one row taller than its neighbors and throw off alignment.
 */
const ROW_GRID = 'grid grid-cols-[1fr_110px_170px_140px_auto] items-center gap-3';
const ROW_HEIGHT = 'min-h-[52px]';

/** Small outlined icon button with a tooltip — mirrors aip-master-list.tsx's `ActionIconButton`. */
function ActionIconButton({
  label,
  icon: Icon,
  onClick,
  className,
}: {
  label: string;
  icon: typeof Eye;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className={className}
          />
        }
      >
        <Icon className="size-4" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function OfficeDividerContent({
  label,
  sublabel,
  ppmpCount,
  total,
  expanded,
}: {
  label: string;
  sublabel?: string;
  ppmpCount: number;
  total: string;
  expanded: boolean;
}) {
  return (
    <div className="flex flex-1 items-center gap-2 min-w-0">
      <ChevronRight
        className={cn(
          'size-4 shrink-0 text-slate-400 transition-transform',
          expanded && 'rotate-90',
        )}
      />
      <span className="font-semibold text-slate-900">{label}</span>
      {sublabel && sublabel !== label && (
        <span className="truncate text-sm text-slate-500">{sublabel}</span>
      )}
      <span className="ml-auto shrink-0 text-xs text-slate-500">
        {ppmpCount} PPMP{ppmpCount === 1 ? '' : 's'}
      </span>
      <span className="shrink-0 text-sm font-semibold text-slate-950">
        {formatCurrency(total)}
      </span>
    </div>
  );
}

function PpmpLineItemsSubTable({
  ppmpId,
  lineItems,
  loading,
  onEditLineItem,
}: {
  ppmpId: string;
  lineItems: PpmpLineItemRecord[] | undefined;
  loading: boolean;
  onEditLineItem: (ppmpId: string, lineItemId: string) => void;
}) {
  const [viewingLineItemId, setViewingLineItemId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Loading line items…
      </div>
    );
  }
  if (!lineItems || lineItems.length === 0) {
    return <p className="px-4 py-4 text-sm text-slate-500">No line items yet.</p>;
  }

  return (
    <div className="overflow-x-auto bg-slate-50/60">
      <table className="w-full min-w-[960px] text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Line Item Name</th>
            <th className="px-3 py-2 font-medium">Type of Project</th>
            <th className="px-3 py-2 font-medium">Mode of Procurement</th>
            <th className="px-3 py-2 font-medium">UACS</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 font-medium">Unit</th>
            <th className="px-3 py-2 text-right font-medium">Unit Cost</th>
            <th className="px-3 py-2 font-medium">Fund Source</th>
            <th className="px-3 py-2 font-medium">Expense Class</th>
            <th className="px-3 py-2 text-right font-medium">Line Total</th>
            <th className="px-3 py-2" aria-hidden />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lineItems.map((li) => (
            <Fragment key={li.id}>
              <tr className="group">
                <td className="max-w-[220px] truncate px-3 py-2 font-medium text-slate-900" title={li.lineItemName}>
                  {li.lineItemName}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {li.typeOfProject ? (PROJECT_TYPE_LABELS[li.typeOfProject] ?? li.typeOfProject) : '—'}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {li.modeOfProcurement
                    ? (PROCUREMENT_MODE_LABELS[li.modeOfProcurement] ?? li.modeOfProcurement)
                    : '—'}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {li.uacsCode} — {li.uacsDescription}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">{li.quantity}</td>
                <td className="px-3 py-2 text-slate-700">{li.unit}</td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {formatCurrency(li.unitCost)}
                </td>
                <td className="px-3 py-2 text-slate-700">{li.fundSource}</td>
                <td className="px-3 py-2 text-slate-700">{li.expenseClass}</td>
                <td className="px-3 py-2 text-right font-medium text-slate-950">
                  {formatCurrency(li.lineTotal)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <ActionIconButton
                      label={`View ${li.lineItemName}`}
                      icon={Eye}
                      onClick={() => setViewingLineItemId(viewingLineItemId === li.id ? null : li.id)}
                      className={cn(
                        'border-orange-200 text-orange-600 hover:bg-orange-50 hover:text-orange-700',
                        'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
                        viewingLineItemId === li.id && 'bg-orange-50 opacity-100',
                      )}
                    />
                    <ActionIconButton
                      label={`Edit ${li.lineItemName}`}
                      icon={Pencil}
                      onClick={() => onEditLineItem(ppmpId, li.id)}
                    />
                  </div>
                </td>
              </tr>
              {viewingLineItemId === li.id && (
                <tr>
                  <td colSpan={11} className="bg-orange-50/40 px-3 pb-3">
                    <LineItemDetails li={li} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PpmpRow({
  row,
  showBreakdown,
  isExpanded,
  onToggleExpand,
  onPublish,
  onUnpublish,
  onView,
  onAddLineItem,
  onEditLineItem,
  onEditProject,
  busy,
  lineItems,
  loadingLineItems,
}: {
  row: PpmpListRow;
  showBreakdown: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onView: (id: string) => void;
  onAddLineItem: (id: string) => void;
  onEditLineItem: (ppmpId: string, lineItemId: string) => void;
  onEditProject: (project: EditableProject) => void;
  busy: boolean;
  lineItems: PpmpLineItemRecord[] | undefined;
  loadingLineItems: boolean;
}) {
  const canExpand = showBreakdown;
  const notApproved = row.status !== 'APPROVED';
  /** Has this Project gone live at least once — "Republish" vs. "Publish". */
  const isRepublish = row.publishedAt !== null;
  const publishDisabledReason =
    row.lineItemCount === 0
      ? 'Add a line item before publishing'
      : notApproved
        ? `This Project must be approved before it can be ${isRepublish ? 're' : ''}published`
        : undefined;

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div
        className={cn(
          'group',
          ROW_GRID,
          ROW_HEIGHT,
          'px-4 py-2 pl-10',
          canExpand && 'cursor-pointer hover:bg-slate-50',
        )}
        onClick={canExpand ? onToggleExpand : undefined}
      >
        <div className="flex min-w-0 items-center gap-2">
          {canExpand ? (
            <ChevronRight
              className={cn(
                'size-4 shrink-0 text-slate-400 transition-transform',
                isExpanded && 'rotate-90',
              )}
            />
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              title={row.name}
              className="block w-full truncate text-left text-sm font-medium text-slate-900 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onView(row.id);
              }}
            >
              {row.name}
            </button>
            <p className="truncate text-[11px] text-slate-500" title={row.fundingProgram}>
              {row.fundingProgram}
            </p>
          </div>
        </div>

        <span className="text-xs text-slate-500">
          {row.lineItemCount} line item{row.lineItemCount === 1 ? '' : 's'}
        </span>

        <div className="flex flex-wrap items-center gap-1">
          {row.isPublished ? (
            <Badge className="border-green-200 bg-green-50 text-green-700">Published</Badge>
          ) : (
            <Badge variant="outline" className="text-slate-500">Unpublished</Badge>
          )}
          {row.status === 'APPROVED' ? (
            <Badge className="border-blue-200 bg-blue-50 text-blue-700">Approved</Badge>
          ) : row.status === 'REVISION' ? (
            <Badge className="border-violet-200 bg-violet-50 text-violet-700">Revision</Badge>
          ) : (
            <Badge variant="outline" className="border-amber-200 text-amber-700">Draft</Badge>
          )}
        </div>

        <p className="shrink-0 text-right text-sm font-semibold text-slate-950">
          {formatCurrency(row.grandTotal)}
        </p>

        <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <ActionIconButton
            label={`View ${row.name}`}
            icon={Eye}
            onClick={() => onView(row.id)}
            className="border-blue-200 text-blue-600 opacity-0 transition-opacity hover:bg-blue-50 hover:text-blue-700 group-hover:opacity-100 group-focus-within:opacity-100"
          />
          <ActionIconButton
            label={`Add line item to ${row.name}`}
            icon={Plus}
            onClick={() => onAddLineItem(row.id)}
            className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          />
          <ActionIconButton
            label={`Edit ${row.name}`}
            icon={Pencil}
            onClick={() =>
              onEditProject({
                id: row.id,
                officeId: row.officeId,
                classification: row.classification,
                name: row.name,
                fundingProgram: row.fundingProgram,
              })
            }
          />
          {row.isPublished ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Unpublish ${row.name}`}
              onClick={() => onUnpublish(row.id)}
              disabled={busy}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <EyeOff className="size-4" />}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${isRepublish ? 'Republish' : 'Publish'} ${row.name}`}
              onClick={() => onPublish(row.id)}
              disabled={busy || row.lineItemCount === 0 || notApproved}
              title={publishDisabledReason}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isRepublish ? (
                <RefreshCw className="size-4" />
              ) : (
                <Upload className="size-4" />
              )}
            </Button>
          )}
        </div>
      </div>
      {canExpand && isExpanded && (
        <PpmpLineItemsSubTable
          ppmpId={row.id}
          lineItems={lineItems}
          loading={loadingLineItems}
          onEditLineItem={onEditLineItem}
        />
      )}
    </div>
  );
}

export default function PpmpMasterList({
  groups,
  showBreakdown,
  onPublish,
  onUnpublish,
  onView,
  onAddLineItem,
  onEditLineItem,
  onEditProject,
  busyId,
  lineItemsById,
  loadingLineItemIds,
  onExpandRow,
}: Readonly<PpmpMasterListProps>) {
  const { isExpanded, toggleExpand, setManyExpanded } = useAIPExpand();

  const handleToggleRow = (id: string) => {
    const wasExpanded = isExpanded(id);
    toggleExpand(id);
    if (!wasExpanded) onExpandRow(id);
  };

  if (groups.length === 0) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-sm text-slate-500">
        No PPMPs match the current filters.
      </div>
    );
  }

  const grandTotal = groups.reduce(
    (acc, group) => addDecimalStrings([acc, group.total]),
    '0',
  );

  return (
    <div className="divide-y divide-slate-200">
      <div className={cn(ROW_GRID, 'px-4 py-2 pl-10 text-xs font-semibold uppercase tracking-wide text-slate-500')}>
        <span>Project</span>
        <span>Line Items</span>
        <span>Status</span>
        <span className="text-right">Estimated Total Budget</span>
        <span aria-hidden />
      </div>
      {groups.map((group) => {
        const key = group.officeId ?? '__unassigned_office__';
        const officeExpanded = isExpanded(key);
        return (
          <div key={key} id={`ppmp-office-row-${key}`}>
            <button
              type="button"
              className="flex w-full items-center gap-2 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
              onClick={() => setManyExpanded([key], !officeExpanded)}
            >
              <OfficeDividerContent
                label={group.officeAcronym}
                sublabel={group.officeName}
                ppmpCount={group.ppmpCount}
                total={group.total}
                expanded={officeExpanded}
              />
            </button>

            {officeExpanded && (
              <div>
                {groupByClassification(group.ppmps).map((section) => (
                  <div key={section.classification}>
                    <div className="border-y border-slate-200 bg-slate-50 px-4 py-2 pl-10 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                      {section.label}
                    </div>
                    {section.ppmps.map((row) => (
                      <div key={row.id}>
                        <PpmpRow
                          row={row}
                          showBreakdown={showBreakdown}
                          isExpanded={isExpanded(row.id)}
                          onToggleExpand={() => handleToggleRow(row.id)}
                          onPublish={onPublish}
                          onUnpublish={onUnpublish}
                          onView={onView}
                          onAddLineItem={onAddLineItem}
                          onEditProject={onEditProject}
                          onEditLineItem={onEditLineItem}
                          busy={busyId === row.id}
                          lineItems={lineItemsById[row.id]}
                          loadingLineItems={loadingLineItemIds.has(row.id)}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className={cn(ROW_GRID, 'bg-slate-50 px-4 py-3 pl-10 font-semibold text-slate-900')}>
        <span>Grand Total</span>
        <span />
        <span />
        <span className="text-right">{formatCurrency(grandTotal)}</span>
        <span aria-hidden />
      </div>
    </div>
  );
}
