/**
 * The query (specs/018 redesign P2, `redesign-p2-query.md`): what the
 * workspace's shelves, the chat and the old view grammar all become. Pure;
 * `validateQuery` is the one place the rules are kept.
 */
import type { Catalogue } from '../catalogue.service.js';
import type { DocumentKind } from '../view.js';
import { CALC_TYPES, RUNS_ALONG, type Calc } from './calcs.js';
import type { Filter, Measure } from './engine.js';
import { fieldOf, SOURCE_IDS, SOURCES, type SourceId } from './fields.js';

export interface Query {
  source: SourceId;
  documents: { kind: DocumentKind; years: number[] }[];
  dimensions: string[];
  measures: Measure[];
  filters: Filter[];
  /** `{ by: 'm0', dir: 'asc' }` with a limit is bottom N; `m1` ranks by the second measure. */
  sort?: { by: string; dir: 'asc' | 'desc' };
  limit?: number;
  /** Steps on the aggregated rows: share of total, change from the previous year, rank, running total. */
  calcs?: Calc[];
}

export interface QueryError {
  path: string;
  message: string;
}

export const MAX_DIMENSIONS = 3;
export const MAX_MEASURES = 3;
export const MAX_FILTER_VALUES = 50;
export const MAX_LIMIT = 500;
const AGGS = [
  'sum',
  'count',
  'countDistinct',
  'avg',
  'min',
  'max',
  'perCapita',
] as const;

/** The money split a query asks for (design: "Money splits"), if any. */
export function splitOf(q: Query): 'fund' | 'expenseClass' | null {
  const used = [...q.dimensions, ...q.filters.map((f) => f.field)];
  const split = used.find((f) => fieldOf(q.source, f)?.type === 'split') as
    | 'fund'
    | 'expenseClass'
    | undefined;
  return split ?? null;
}

/**
 * `grain: 'rows'` is the data grid: records listed, nothing added up, so the
 * rules against adding years or kinds together do not apply.
 */
export function validateQuery(
  q: Query,
  cat: Catalogue,
  grain: 'aggregate' | 'rows' = 'aggregate',
): QueryError[] {
  const errors: QueryError[] = [];
  const e = (path: string, message: string) => errors.push({ path, message });
  if (!(SOURCE_IDS as readonly string[]).includes(q.source)) {
    e('source', `Unknown source "${q.source}".`);
    return errors;
  }
  const src = SOURCES[q.source];
  const kinds = q.documents.map((d) => d.kind);

  if (!q.documents.length)
    e('documents', 'Pick at least one document and year.');
  for (const [i, d] of q.documents.entries()) {
    if (!src.kinds.includes(d.kind))
      e(`documents[${i}]`, `${src.label} has no ${d.kind.toUpperCase()} data.`);
    if (!d.years.length) e(`documents[${i}].years`, 'Pick at least one year.');
    for (const y of d.years)
      if (!cat.documents.some((c) => c.kind === d.kind && c.year === y))
        e(
          `documents[${i}].years`,
          `FY${y} has no public ${d.kind.toUpperCase()}.`,
        );
  }
  // Plan, proposal and enactment are not the same money (R8/R9); years are
  // never added together (P0). Both are fine as separate groups only.
  const adds = grain === 'aggregate';
  if (adds && new Set(kinds).size > 1 && !q.dimensions.includes('kind'))
    e(
      'dimensions',
      'Different documents are not the same money: break down by document.',
    );
  if (
    adds &&
    q.documents.some((d) => d.years.length > 1) &&
    !q.dimensions.includes('year')
  )
    e('dimensions', 'Years are never added together: break down by year.');

  if (q.dimensions.length > MAX_DIMENSIONS)
    e('dimensions', `At most ${MAX_DIMENSIONS} breakdowns.`);
  for (const [i, id] of q.dimensions.entries()) {
    const f = fieldOf(q.source, id);
    if (!f || f.role !== 'dimension')
      e(`dimensions[${i}]`, `${src.label} has no breakdown "${id}".`);
    else if (f.kinds && kinds.some((k) => !f.kinds!.includes(k)))
      e(`dimensions[${i}]`, `"${f.label}" is not in every document asked for.`);
  }
  const splits = q.dimensions.filter(
    (id) => fieldOf(q.source, id)?.type === 'split',
  );
  if (splits.length > 1)
    e('dimensions', 'Break down by fund or by expense class, not both.');
  if (splits.length && q.dimensions.some((id) => fieldOf(q.source, id)?.multi))
    e(
      'dimensions',
      'A fund or class split cannot be combined with themes, topics or labels.',
    );

  if (adds && (!q.measures.length || q.measures.length > MAX_MEASURES))
    e('measures', `Pick 1 to ${MAX_MEASURES} measures.`);
  for (const [i, m] of q.measures.entries()) {
    if (!(AGGS as readonly string[]).includes(m.agg)) {
      e(`measures[${i}]`, `Unknown aggregation "${m.agg}".`);
      continue;
    }
    if (m.agg === 'count') continue;
    const f = fieldOf(q.source, m.field);
    const want = m.agg === 'countDistinct' ? 'dimension' : 'money';
    if (!f || f.role !== want)
      e(
        `measures[${i}]`,
        `"${m.field}" cannot be ${m.agg === 'countDistinct' ? 'counted' : 'added up'}.`,
      );
  }

  // Words are several per row: a terms query is always by word (specs/020 A4).
  if (
    q.source === 'terms' &&
    grain === 'aggregate' &&
    !q.dimensions.includes('term')
  )
    e('dimensions', 'Words overlap: break down by word.');

  // Per person divides by a barangay's population (specs/020 A3): it needs that
  // breakdown, and "Other" has no single population to divide by.
  if (q.measures.some((m) => m.agg === 'perCapita')) {
    if (!q.dimensions.includes('barangay'))
      e('measures', 'A per-person figure needs a barangay breakdown.');
    if (q.limit !== undefined)
      e('limit', 'A per-person figure shows every barangay: no Top N.');
  }

  for (const [i, f] of q.filters.entries()) {
    const def = fieldOf(q.source, f.field);
    if (!def) {
      e(`filters[${i}]`, `${src.label} has no field "${f.field}".`);
      continue;
    }
    if (f.op === 'between' && def.role !== 'money')
      e(`filters[${i}]`, 'A range filter needs an amount.');
    if (
      (f.op === 'in' || f.op === 'notIn') &&
      (def.role !== 'dimension' ||
        !f.values.length ||
        f.values.length > MAX_FILTER_VALUES)
    )
      e(
        `filters[${i}]`,
        `Pick 1 to ${MAX_FILTER_VALUES} values of a breakdown.`,
      );
    if (
      f.op === 'contains' &&
      (def.type !== 'text' || !f.text.trim() || f.text.length > 60)
    )
      e(`filters[${i}]`, 'Search a name with 1 to 60 characters.');
  }

  for (const [i, c] of (q.calcs ?? []).entries()) {
    if (!(CALC_TYPES as readonly string[]).includes(c.type))
      e(`calcs[${i}]`, `Unknown calculation "${c.type}".`);
    else if (!q.measures[c.measure])
      e(`calcs[${i}]`, 'A calculation needs one of the measures asked for.');
    else if (
      RUNS_ALONG.includes(c.type) &&
      !q.dimensions.includes(c.along ?? 'year')
    )
      e(
        `calcs[${i}]`,
        `Break down by ${c.along ?? 'year'} to compare with the one before.`,
      );
    else if (
      c.type === 'percentOfTotal' &&
      (q.dimensions.some((id) => fieldOf(q.source, id)?.multi) ||
        q.documents.reduce((n, d) => n + d.years.length, 0) > 1)
    )
      e(`calcs[${i}]`, 'There is no single total here to take a share of.');
  }
  if ((q.calcs?.length ?? 0) > 3) e('calcs', 'At most 3 calculations.');
  // The grid lists records, so any of their fields sorts it; a chart sorts what it drew.
  if (q.sort && grain === 'rows' && !fieldOf(q.source, q.sort.by))
    e('sort', 'Sort the records by one of their fields.');
  if (
    q.sort &&
    grain === 'aggregate' &&
    !q.sort.by.startsWith('m') &&
    !q.dimensions.includes(q.sort.by)
  )
    e('sort', 'Sort by a measure or one of the breakdowns.');

  if (
    q.limit !== undefined &&
    (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > MAX_LIMIT)
  )
    e('limit', `Top must be 1 to ${MAX_LIMIT}.`);
  return errors;
}
