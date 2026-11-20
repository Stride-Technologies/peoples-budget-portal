'use client';

import { Fragment, useState } from 'react';
import { Eye } from 'lucide-react';
import { formatCurrency } from '@/lib/currency-formatter';
import { cn } from '@/lib/utils';
import LineItemDetails from '@/components/ppmp/line-item-details';
import type { PublicPpmpRecord } from '@/lib/api';

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

/**
 * Shared line-item table markup — used by the per-Project public detail page
 * and the public list's per-row dropdown, so the two never drift apart.
 */
export default function PublicPpmpLineItemsTable({
  lineItems,
  loading,
}: Readonly<{
  lineItems: PublicPpmpRecord['lineItems'] | undefined;
  loading?: boolean;
}>) {
  const [viewingId, setViewingId] = useState<string | null>(null);

  if (loading) {
    return (
      <p className="px-3 py-6 text-center text-sm text-tbl-muted-2">Loading line items…</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-tbl-rule bg-tbl-surface">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-tbl-rule bg-tbl-fill text-xs text-tbl-muted-2">
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
          {!lineItems || lineItems.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-3 py-6 text-center text-tbl-muted-2">
                No line items.
              </td>
            </tr>
          ) : (
            lineItems.map((li) => (
              <Fragment key={li.id}>
                <tr>
                  <td className="px-3 py-2 font-medium text-tbl-ink">{li.lineItemName}</td>
                  <td className="px-3 py-2 text-tbl-ink-3">
                    {li.typeOfProject
                      ? (PROJECT_TYPE_LABELS[li.typeOfProject] ?? li.typeOfProject)
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-tbl-ink-3">
                    {li.modeOfProcurement
                      ? (PROCUREMENT_MODE_LABELS[li.modeOfProcurement] ?? li.modeOfProcurement)
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-tbl-ink-3">
                    {li.uacsCode} — {li.uacsDescription}
                  </td>
                  <td className="px-3 py-2 text-right text-tbl-ink-3">{li.quantity}</td>
                  <td className="px-3 py-2 text-tbl-ink-3">{li.unit}</td>
                  <td className="px-3 py-2 text-right text-tbl-ink-3">
                    {formatCurrency(li.unitCost)}
                  </td>
                  <td className="px-3 py-2 text-tbl-ink-3">{li.fundSource}</td>
                  <td className="px-3 py-2 text-tbl-ink-3">{li.expenseClass}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-950">
                    {formatCurrency(li.lineTotal)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      aria-label={`View ${li.lineItemName}`}
                      title="View line item overview"
                      onClick={() => setViewingId(viewingId === li.id ? null : li.id)}
                      className={cn(
                        'flex items-center justify-center rounded-md border border-orange-200 p-1.5 text-orange-600 hover:bg-orange-50 hover:text-orange-700',
                        viewingId === li.id && 'bg-orange-50',
                      )}
                    >
                      <Eye className="size-4" />
                    </button>
                  </td>
                </tr>
                {viewingId === li.id && (
                  <tr>
                    <td colSpan={11} className="bg-orange-50/40 px-3 pb-3">
                      <LineItemDetails li={li} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
