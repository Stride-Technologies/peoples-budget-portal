/**
 * Table calculations (specs/018 redesign P2, from Tableau's VizQL grammar):
 * steps on the aggregated rows, so "share of the city", "change since last
 * year" and "rank" are computed here and never by the model (W6). Pure;
 * money stays Decimal and leaves as a string.
 */
import { Prisma } from '../../generated/prisma/index';

export const CALC_TYPES = [
  'percentOfTotal',
  'differenceFromPrevious',
  'percentDifferenceFromPrevious',
  'rank',
  'runningTotal',
] as const;
export type CalcType = (typeof CALC_TYPES)[number];

export interface Calc {
  type: CalcType;
  /** Which measure (index into `measures`). */
  measure: number;
  /** The breakdown it runs along (previous / running); the others partition. Default `year`. */
  along?: string;
}

/** Needs an ordered breakdown to run along. */
export const RUNS_ALONG: CalcType[] = [
  'differenceFromPrevious',
  'percentDifferenceFromPrevious',
  'runningTotal',
];

interface Row {
  keys: (string | null)[];
  values: string[];
}

const D = (v: string) => new Prisma.Decimal(v);
const ratio = (num: Prisma.Decimal, den: Prisma.Decimal) =>
  den.isZero() ? null : num.div(den).toFixed(4);

/** One column per calc, in the order asked; `null` where it has no value (a first year, no total). */
export function applyCalcs(
  rows: Row[],
  calcs: Calc[],
  dimensions: string[],
  totals: string[] | null,
): (string | null)[][] {
  const cols = calcs.map((c) => column(rows, c, dimensions, totals));
  return rows.map((_, i) => cols.map((col) => col[i]));
}

function column(
  rows: Row[],
  c: Calc,
  dimensions: string[],
  totals: string[] | null,
): (string | null)[] {
  const v = (r: Row) => D(r.values[c.measure]);
  if (c.type === 'percentOfTotal') {
    const total = totals?.[c.measure];
    return rows.map((r) => (total ? ratio(v(r), D(total)) : null));
  }
  if (c.type === 'rank') {
    // Competition ranking: equal values share a rank, the next skips (1, 2, 2, 4).
    const sorted = [...rows].map(v).sort((a, b) => b.comparedTo(a));
    return rows.map((r) => String(sorted.findIndex((x) => x.equals(v(r))) + 1));
  }
  const along = dimensions.indexOf(c.along ?? 'year');
  const partitionOf = (r: Row) =>
    JSON.stringify(r.keys.filter((_, i) => i !== along));
  const order = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) =>
      String(a.r.keys[along] ?? '').localeCompare(
        String(b.r.keys[along] ?? ''),
        'en',
        { numeric: true },
      ),
    );
  const out: (string | null)[] = rows.map(() => null);
  const last = new Map<string, Prisma.Decimal>();
  const run = new Map<string, Prisma.Decimal>();
  for (const { r, i } of order) {
    const p = partitionOf(r);
    const prev = last.get(p);
    if (c.type === 'runningTotal') {
      const sum = (run.get(p) ?? new Prisma.Decimal(0)).plus(v(r));
      run.set(p, sum);
      out[i] = sum.toFixed(2);
    } else if (prev) {
      out[i] =
        c.type === 'differenceFromPrevious'
          ? v(r).minus(prev).toFixed(2)
          : ratio(v(r).minus(prev), prev);
    }
    last.set(p, v(r));
  }
  return out;
}
