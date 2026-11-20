'use client';

import { PPMP_PROJECT_TYPES, PPMP_PROCUREMENT_MODES } from '@/lib/schemas';
import type { PpmpLineItemRecord } from '@/lib/api';

const projectTypeLabel = (v: string | null) =>
  v ? (PPMP_PROJECT_TYPES.find((t) => t.value === v)?.label ?? v) : null;
const modeLabel = (v: string | null) =>
  v ? (PPMP_PROCUREMENT_MODES.find((m) => m.value === v)?.label ?? v) : null;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const monthYear = (month: number, year: number) => `${MONTH_NAMES[month - 1] ?? month} ${year}`;

/** Read-only view of every field on a line item not already shown in a compact table row. */
export default function LineItemDetails({ li }: Readonly<{ li: PpmpLineItemRecord }>) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[160px_1fr] gap-2 py-1">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{value ?? '—'}</dd>
    </div>
  );

  return (
    <dl className="mt-2 rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2">
      {row('Type of Project', projectTypeLabel(li.typeOfProject))}
      {row('Mode of Procurement', modeLabel(li.modeOfProcurement))}
      {row('Pre-Procurement Conference', li.preProcurementConferenceRequired ? 'Yes' : 'No')}
      {row(
        'Procurement Activity',
        `${monthYear(li.procurementStartMonth, li.procurementStartYear)} – ${monthYear(li.procurementEndMonth, li.procurementEndYear)}`,
      )}
      {row('Expected Delivery/Implementation Period', li.deliveryPeriod)}
      {row('Remarks', li.remarks)}
      {row(
        'Attached Supporting Document',
        li.supportingDocumentUrl ? (
          <a
            href={li.supportingDocumentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
          >
            {li.supportingDocumentName ?? 'View document'}
          </a>
        ) : null,
      )}
    </dl>
  );
}
