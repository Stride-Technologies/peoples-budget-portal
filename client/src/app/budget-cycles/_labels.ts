import type { BudgetDocumentKind, BudgetDocumentStatus } from '@/lib/api';

export const KIND_LABEL: Record<BudgetDocumentKind, string> = {
  LEP: 'Local Expenditure Program',
  ORDINANCE: 'Appropriation Ordinance',
};

export const STATUS_LABEL: Record<BudgetDocumentStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  ENACTED: 'Enacted',
};

export const STATUS_COLOR: Record<BudgetDocumentStatus, string> = {
  DRAFT: 'bg-amber-100 text-amber-800',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  ENACTED: 'bg-green-100 text-green-800',
};

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—';
