/**
 * Pure shaping for the explorer's charts and table (no React, unit-tested).
 * Bar lengths are display geometry only, so they use Number; every printed
 * figure is formatted from the API's Decimal string.
 */
import { compactPeso, formatWholePesos } from '../currency-formatter.ts';
import type { ResolvedSeries } from './view-url.ts';

export interface Cell {
  value: string | null;
  share: number | null;
}
export interface Line {
  id: string;
  label: string;
  sublabel?: string;
  accent?: string | null;
  /** One cell per series, in series order; null where the series has no such row. */
  cells: Cell[];
}

/** Rows of every series joined on row id, in the first series' order, "Other" last. */
export function joinRows(series: ResolvedSeries[], otherLabel: (n: number) => string): Line[] {
  const order: string[] = [];
  const meta = new Map<string, Omit<Line, 'cells'>>();
  for (const s of series)
    for (const r of s.rows)
      if (!meta.has(r.id)) {
        order.push(r.id);
        meta.set(r.id, { id: r.id, label: r.label, sublabel: r.sublabel, accent: r.accent });
      }
  // By year (the one breakdown with no total), series of different kinds cover
  // different years: FY2023–25 LEP after FY2026–27 AIP read out of order.
  if (series.every((s) => s.total === null)) order.sort((a, b) => Number(a) - Number(b));
  const lines: Line[] = order.map((id) => ({
    ...meta.get(id)!,
    cells: series.map((s): Cell => {
      const r = s.rows.find((x) => x.id === id);
      return r ? { value: r.value, share: r.share } : { value: null, share: null };
    }),
  }));
  if (series.some((s) => s.other))
    lines.push({
      id: '_other',
      label: otherLabel(Math.max(...series.map((s) => s.other?.n ?? 0))),
      cells: series.map((s): Cell => (s.other ? { value: s.other.value, share: null } : { value: null, share: null })),
    });
  return lines;
}

/** The largest single value, for one shared scale across series. */
export const maxValue = (lines: Line[]) =>
  lines.reduce((m, l) => Math.max(m, ...l.cells.map((c) => Number(c.value ?? 0))), 0);

/** The largest row sum, for a stacked scale. */
export const maxStack = (lines: Line[]) =>
  lines.reduce((m, l) => Math.max(m, l.cells.reduce((a, c) => a + Number(c.value ?? 0), 0)), 0);

export const fmt = (s: Pick<ResolvedSeries, 'measure'>, value: string) =>
  s.measure === 'money' ? compactPeso(value) : formatWholePesos(value);

/** CSV of the joined rows: one column per series, full-precision values. */
export function toCsv(series: ResolvedSeries[], lines: Line[], heading: string): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = [heading, ...series.map((s) => s.label)];
  const body = lines.map((l) => [l.sublabel ? `${l.label} (${l.sublabel})` : l.label, ...l.cells.map((c) => c.value ?? '')]);
  const total = series.every((s) => s.total !== null) ? [['Total', ...series.map((s) => s.total!)]] : [];
  return [head, ...body, ...total].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}
