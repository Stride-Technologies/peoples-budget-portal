/**
 * The query engine's pure core (specs/018 redesign P2): records in, a table
 * out. No database, no catalogue — loaders turn rows into records and the
 * service turns codes into labels. Money is Prisma.Decimal end to end and
 * leaves as a decimal string; nothing here is ever a JS number except counts.
 */
import { Prisma } from '../../generated/prisma/index';

const ZERO = new Prisma.Decimal(0);

/** A dimension value: a code, nothing, or several codes (themes, topics). */
export type DimValue = string | null | string[];

export interface QueryRecord {
  dims: Record<string, DimValue>;
  money: Record<string, Prisma.Decimal | null>;
}

export type Agg =
  | 'sum'
  | 'count'
  | 'countDistinct'
  | 'avg'
  | 'min'
  | 'max'
  | 'perCapita';

/**
 * What a `perCapita` measure divides a group's sum by (specs/020 A3): the
 * population of the place in its keys; `[]` asks for the whole's (totals).
 */
export type Denominator = (keys: (string | null)[]) => Prisma.Decimal | null;

export interface Measure {
  /** A money field for sum/avg/min/max; a dimension for countDistinct; ignored for count. */
  field: string;
  agg: Agg;
}

export type Filter =
  | { field: string; op: 'in' | 'notIn'; values: string[] }
  | { field: string; op: 'between'; min?: string; max?: string }
  | { field: string; op: 'contains'; text: string };

export interface EngineQuery {
  dimensions: string[];
  measures: Measure[];
  filters: Filter[];
  sort?: { by: string; dir: 'asc' | 'desc' };
  limit?: number;
}

export interface EngineResult {
  /** One per group: its dimension codes, then one value per measure. */
  rows: { keys: (string | null)[]; values: string[] }[];
  /** The groups past `limit`, per first-dimension key, summed (never dropped). */
  other: { keys: (string | null)[]; values: string[]; n: number } | null;
  /** Over every record that passed, each counted once. */
  totals: string[];
  /** False when a dimension is multi-valued: a row can sit in several groups, so the groups do not add up to `totals` (R12). */
  additive: boolean;
  /** Rows that passed the filters: distinct `rowId`s when records carry one (a split row is one row). */
  n: number;
}

export const OTHER = '_other';
export const NONE = '_none';

/** Ties: by code, "Not specified" (null) always last — a stable, readable order. */
function byKeys(a: (string | null)[], b: (string | null)[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const an = a[i] === null || a[i] === NONE;
    const bn = b[i] === null || b[i] === NONE;
    if (an !== bn) return an ? 1 : -1;
    if (an) continue;
    return a[i]!.localeCompare(b[i]!, 'en', { numeric: true });
  }
  return 0;
}

const asList = (v: DimValue): (string | null)[] =>
  Array.isArray(v) ? (v.length ? v : [null]) : [v];

const textOf = (v: DimValue) =>
  (Array.isArray(v) ? v.join(' ') : (v ?? '')).toLowerCase();

export function passes(r: QueryRecord, f: Filter): boolean {
  if (f.op === 'contains')
    return textOf(r.dims[f.field]).includes(f.text.toLowerCase());
  if (f.op === 'between') {
    const v = r.money[f.field];
    if (!v) return false;
    if (f.min !== undefined && v.lessThan(f.min)) return false;
    if (f.max !== undefined && v.greaterThan(f.max)) return false;
    return true;
  }
  const has = asList(r.dims[f.field] ?? null).some(
    (v) => v !== null && f.values.includes(v),
  );
  return f.op === 'in' ? has : !has;
}

interface Acc {
  n: number;
  sum: Record<string, Prisma.Decimal>;
  seen: Record<string, number>;
  min: Record<string, Prisma.Decimal>;
  max: Record<string, Prisma.Decimal>;
  distinct: Record<string, Set<string>>;
}

const newAcc = (): Acc => ({
  n: 0,
  sum: {},
  seen: {},
  min: {},
  max: {},
  distinct: {},
});

function add(acc: Acc, r: QueryRecord, measures: Measure[]) {
  acc.n += 1;
  // A field is accumulated once however many measures read it (sum and avg of
  // the amount must not count it twice).
  const done = new Set<string>();
  for (const m of measures) {
    if (m.agg === 'count') continue;
    const key = `${m.agg === 'countDistinct' ? 'd' : 'm'}:${m.field}`;
    if (done.has(key)) continue;
    done.add(key);
    if (m.agg === 'countDistinct') {
      const set = (acc.distinct[m.field] ??= new Set());
      for (const v of asList(r.dims[m.field] ?? null))
        if (v !== null) set.add(v);
      continue;
    }
    const v = r.money[m.field];
    if (!v) continue; // "not in this kind" is not zero
    acc.sum[m.field] = (acc.sum[m.field] ?? ZERO).plus(v);
    acc.seen[m.field] = (acc.seen[m.field] ?? 0) + 1;
    if (!acc.min[m.field] || v.lessThan(acc.min[m.field])) acc.min[m.field] = v;
    if (!acc.max[m.field] || v.greaterThan(acc.max[m.field]))
      acc.max[m.field] = v;
  }
}

function merge(into: Acc, from: Acc) {
  into.n += from.n;
  for (const [k, v] of Object.entries(from.sum))
    into.sum[k] = (into.sum[k] ?? ZERO).plus(v);
  for (const [k, v] of Object.entries(from.seen))
    into.seen[k] = (into.seen[k] ?? 0) + v;
  for (const [k, v] of Object.entries(from.min))
    if (!into.min[k] || v.lessThan(into.min[k])) into.min[k] = v;
  for (const [k, v] of Object.entries(from.max))
    if (!into.max[k] || v.greaterThan(into.max[k])) into.max[k] = v;
  for (const [k, v] of Object.entries(from.distinct))
    v.forEach((x) => (into.distinct[k] ??= new Set()).add(x));
}

function valueOf(
  acc: Acc,
  m: Measure,
  keys: (string | null)[] = [],
  per?: Denominator,
): string {
  switch (m.agg) {
    case 'perCapita': {
      const d = per?.(keys);
      return d && !d.isZero()
        ? (acc.sum[m.field] ?? ZERO).div(d).toFixed(2)
        : '0.00';
    }
    case 'count':
      return String(acc.n);
    case 'countDistinct':
      return String(acc.distinct[m.field]?.size ?? 0);
    case 'sum':
      return (acc.sum[m.field] ?? ZERO).toFixed(2);
    case 'avg':
      return acc.seen[m.field]
        ? acc.sum[m.field].div(acc.seen[m.field]).toFixed(2)
        : '0.00';
    case 'min':
      return (acc.min[m.field] ?? ZERO).toFixed(2);
    case 'max':
      return (acc.max[m.field] ?? ZERO).toFixed(2);
  }
}

/**
 * Filter → group by up to three dimensions (a multi-valued one puts a record
 * in every group it names) → aggregate → sort → top N by the first dimension
 * with the rest gathered as "Other".
 */
export function runQuery(
  records: QueryRecord[],
  q: EngineQuery,
  multi: (field: string) => boolean,
  per?: Denominator,
): EngineResult {
  const kept = records.filter((r) => q.filters.every((f) => passes(r, f)));
  const groups = new Map<string, { keys: (string | null)[]; acc: Acc }>();
  const all = newAcc();
  for (const r of kept) {
    add(all, r, q.measures);
    let combos: (string | null)[][] = [[]];
    for (const d of q.dimensions)
      combos = combos.flatMap((c) =>
        [...new Set(asList(r.dims[d] ?? null))].map((v) => [...c, v]),
      );
    for (const keys of combos) {
      const id = JSON.stringify(keys);
      const g = groups.get(id) ?? { keys, acc: newAcc() };
      add(g.acc, r, q.measures);
      groups.set(id, g);
    }
  }

  const sortIdx = q.sort?.by.startsWith('m') ? Number(q.sort.by.slice(1)) : 0;
  const dimIdx =
    q.sort && !q.sort.by.startsWith('m') ? q.dimensions.indexOf(q.sort.by) : -1;
  const dir = q.sort?.dir === 'asc' ? 1 : -1;
  const list = [...groups.values()];
  const metric = (g: { acc: Acc; keys?: (string | null)[] }) =>
    new Prisma.Decimal(
      valueOf(g.acc, q.measures[sortIdx] ?? q.measures[0], g.keys, per),
    );
  list.sort((a, b) => {
    if (dimIdx >= 0)
      return (
        dir *
        String(a.keys[dimIdx] ?? '').localeCompare(
          String(b.keys[dimIdx] ?? ''),
          'en',
          { numeric: true },
        )
      );
    const c = metric(a).comparedTo(metric(b));
    return c !== 0 ? dir * c : byKeys(a.keys, b.keys);
  });

  // Top N by the first dimension's own total, so a stacked/coloured chart keeps
  // whole bars; groups past it fold into one "Other" per remaining key path.
  let shown = list;
  let other: EngineResult['other'] = null;
  if (q.limit && q.dimensions.length) {
    const firstTotals = new Map<string, Acc>();
    for (const g of list) {
      const k = String(g.keys[0]);
      merge(
        (firstTotals.get(k) ?? firstTotals.set(k, newAcc()).get(k))!,
        g.acc,
      );
    }
    const keep = new Set(
      [...firstTotals.entries()]
        .sort(
          (a, b) =>
            dir * metric({ acc: a[1] }).comparedTo(metric({ acc: b[1] })) ||
            byKeys([a[0]], [b[0]]),
        )
        .slice(0, q.limit)
        .map(([k]) => k),
    );
    const rest = list.filter((g) => !keep.has(String(g.keys[0])));
    shown = list.filter((g) => keep.has(String(g.keys[0])));
    if (rest.length) {
      const acc = newAcc();
      rest.forEach((g) => merge(acc, g.acc));
      other = {
        keys: [OTHER, ...q.dimensions.slice(1).map(() => null)],
        values: q.measures.map((m) => valueOf(acc, m)),
        n: new Set(rest.map((g) => String(g.keys[0]))).size,
      };
    }
  }

  return {
    rows: shown.map((g) => ({
      keys: g.keys,
      values: q.measures.map((m) => valueOf(g.acc, m, g.keys, per)),
    })),
    other,
    totals: q.measures.map((m) => valueOf(all, m, [], per)),
    additive: !q.dimensions.some(multi),
    n: kept.some((r) => r.dims.rowId !== undefined)
      ? new Set(kept.map((r) => String(r.dims.rowId))).size
      : kept.length,
  };
}
