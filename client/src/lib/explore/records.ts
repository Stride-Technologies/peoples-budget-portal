/**
 * What the Records view shows (specs/020, owner feedback 2026-11-13): the row's
 * name, its office and its money first; every other field of the city's data
 * in the row's details; and the explorer's own readings (labels, topics,
 * barangays, words) only there, under their own heading. Pure, so tested in Node.
 */
import type { WorkbookQuery } from './workbook.ts';

export interface RowsColumn {
  field: string;
  label: string;
  role: 'dimension' | 'money';
  derived?: boolean;
}
export type RowsCell = string | null | { code: string | null; label: string }[];
export type RowsRow = Record<string, RowsCell>;

/** The field that names a record, in the order sources use them. */
const NAME_FIELDS = ['name', 'particulars', 'account'];

const filled = (v: RowsCell | undefined) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length);
const text = (v: RowsCell | undefined) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.map((x) => x.label).join(', ') : v);

export function recordColumns(columns: RowsColumn[], rows: RowsRow[]) {
  const has = (c: RowsColumn) => rows.some((r) => filled(r[c.field]));
  const name = columns.find((c) => NAME_FIELDS.includes(c.field));
  const office = columns.find((c) => c.field === 'office' && has(c));
  const amount = columns.find((c) => c.field === 'amount') ?? columns.find((c) => c.role === 'money');
  // Year and document only when the page mixes them.
  const varies = (f: string) => columns.find((c) => c.field === f && new Set(rows.map((r) => text(r[f]))).size > 1);
  const primary = [varies('year'), varies('kind'), office, amount].filter((c): c is RowsColumn => !!c);
  const details = columns.filter((c) => !c.derived && c !== name && has(c));
  const derived = columns.filter((c) => c.derived && has(c));
  return { name, primary, details, derived };
}

/** A record's own page on the site, when it has one (AIP programs and their projects/activities). */
export function recordHref(q: Pick<WorkbookQuery, 'source' | 'documents'>, row: RowsRow): string | null {
  const id = typeof row.id === 'string' ? row.id : null;
  const aip = q.documents.every((d) => d.kind === 'aip');
  if (!id || !aip) return null;
  if (q.source === 'aip-activities') return typeof row.parentId === 'string' ? `/budget/${row.parentId}/${id}` : null;
  if (q.source === 'aip-programs' || q.source === 'terms') return `/budget/${id}`;
  return null;
}

export const cellText = text;
