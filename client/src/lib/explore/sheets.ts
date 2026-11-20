/**
 * Workbook helpers for the workspace (specs/018 redesign P3): the default
 * workbook, new sheets, and an old `?v=1` view read into a sheet.
 */
import type { CatalogueDocument, ExplorerView } from './view-url.ts';
import type { Mark, Sheet, Workbook, WorkbookQuery } from './workbook.ts';

export const STORAGE_KEY = 'explorer-workbook-v2';

export const newId = () => Math.random().toString(36).slice(2, 10);

const SOURCE_OF = { aip: 'aip-programs', lep: 'budget-ppas', ordinance: 'budget-ppas' } as const;

/** The latest public AIP (else the latest document), estimated cost by office, top 10. */
export function defaultQuery(docs: Pick<CatalogueDocument, 'kind' | 'year'>[]): WorkbookQuery {
  const pick = [...docs].sort((a, b) => Number(b.kind === 'aip') - Number(a.kind === 'aip') || b.year - a.year)[0];
  const kind = pick?.kind ?? 'aip';
  return {
    source: SOURCE_OF[kind],
    documents: [{ kind, years: [pick?.year ?? new Date().getFullYear()] }],
    dimensions: ['office'],
    measures: [{ field: 'amount', agg: 'sum' }],
    filters: [],
    limit: 10,
  };
}

/**
 * A sheet with no breakdown yet (P7, W13): the canvas teaches how to start
 * instead of drawing one total. It keeps the sheet's source, its first
 * document's latest year and its first amount.
 */
export function blankQuery(q: WorkbookQuery): WorkbookQuery {
  const d = q.documents[0];
  return { source: q.source, documents: d ? [{ kind: d.kind, years: [Math.max(...d.years)] }] : [], dimensions: [], measures: q.measures.slice(0, 1), filters: [] };
}
/** Nothing chosen yet: no breakdown and no filter. A filtered total (a chat answer, say) is an answer, not a blank sheet. */
export const isBlank = (q: WorkbookQuery) => q.dimensions.length === 0 && q.filters.length === 0;

export const newSheet = (name: string, query: WorkbookQuery, mark: Mark = 'auto'): Sheet => ({ id: newId(), name, query, mark });

/** A new workbook opens on a blank sheet of the latest AIP (P7: the guide takes it from there). */
export const defaultWorkbook = (docs: Pick<CatalogueDocument, 'kind' | 'year'>[], names: { workbook: string; sheet: string }): Workbook => ({
  v: 2,
  name: names.workbook,
  sheets: [newSheet(names.sheet, blankQuery(defaultQuery(docs)))],
  active: 0,
});

const MARK_OF: Record<ExplorerView['chart'], Mark> = { bar: 'bar', stackedBar: 'stacked', line: 'line', table: 'table' };

/**
 * An old view (Ask's answer, a `/explore?v=1&…` link) as one query: the
 * mirror of `ViewService.resolveSeries` on the API. Several document kinds
 * become the "Budget over time" source with Document as a breakdown, several
 * years add Fiscal year, so nothing is ever added across them. Filters are the
 * first series' (the old grammar's sheet edits only those).
 */
export function viewToQuery(view: ExplorerView): { query: WorkbookQuery; mark: Mark } {
  const years = new Map<string, Set<number>>();
  for (const s of view.series) for (const y of s.years) (years.get(s.document) ?? years.set(s.document, new Set()).get(s.document)!).add(y);
  const kinds = [...years.keys()] as (keyof typeof SOURCE_OF)[];
  const manyYears = [...years.values()].some((ys) => ys.size > 1);
  const dims: string[] = [view.groupBy];
  if (kinds.length > 1) dims.push('kind');
  if (manyYears && view.groupBy !== 'year') dims.push('year');
  const first = view.series[0];
  const byYear = view.groupBy === 'year';
  return {
    query: {
      source: kinds.length === 1 ? SOURCE_OF[kinds[0]] : 'over-time',
      documents: kinds.map((kind) => ({ kind, years: [...years.get(kind)!].sort((a, b) => b - a) })),
      dimensions: dims.slice(0, 3),
      measures: [first?.measure === 'count' ? { field: '', agg: 'count' } : { field: 'amount', agg: 'sum' }],
      filters: Object.entries(first?.filters ?? {})
        .filter(([, v]) => v?.length)
        .map(([field, values]) => ({ field, op: 'in' as const, values: values! })),
      ...(byYear ? { sort: { by: 'year', dir: 'asc' as const } } : { limit: Math.min(view.top ?? 12, 50) }),
    },
    mark: MARK_OF[view.chart],
  };
}

/**
 * A query refitted to its source after a hand edit: fields the source lacks
 * are dropped, and several documents or years bring in the Document or Fiscal
 * year breakdown, because the engine never adds across them (P0, W15).
 * They go on Colour, and breakdowns are capped at three, keeping those.
 */
export function fitQuery(q: WorkbookQuery, fields: { id: string; role: string }[]): WorkbookQuery {
  const has = (id: string) => fields.some((f) => f.id === id);
  const need = [
    ...(q.documents.length > 1 ? ['kind'] : []),
    ...(q.documents.some((d) => d.years.length > 1) ? ['year'] : []),
  ].filter(has);
  // What the documents need goes on Colour, straight after Rows: series side by side.
  const base = q.dimensions.filter(has);
  const missing = need.filter((d) => !base.includes(d));
  const dims = base.length ? [base[0], ...missing, ...base.slice(1)] : missing;
  for (let i = dims.length - 1; dims.length > 3 && i >= 0; i--) if (!need.includes(dims[i])) dims.splice(i, 1);
  let measures = q.measures.filter((m) => m.agg === 'count' || has(m.field));
  if (!measures.length) measures = [has('amount') ? { field: 'amount', agg: 'sum' } : { field: '', agg: 'count' }];
  const out: WorkbookQuery = {
    source: q.source,
    documents: q.documents,
    dimensions: dims,
    measures,
    filters: q.filters.filter((f) => has(f.field)),
  };
  if (q.sort && (/^m\d$/.test(q.sort.by) || dims.includes(q.sort.by))) out.sort = q.sort;
  if (q.limit !== undefined) out.limit = q.limit;
  const calcs = q.calcs?.filter((c) => c.measure < measures.length);
  if (calcs?.length) out.calcs = calcs;
  return out;
}

/** A clicked mark or table row: the value of one breakdown (W21). */
export interface Picked {
  field: string;
  code: string;
  label: string;
}

/** One level down from a breakdown; the first the source has and the sheet is not already showing. */
const DRILL: Record<string, string[]> = {
  cluster: ['sector', 'office'],
  sector: ['office'],
  finishLine: ['subFinishLine', 'office'],
  subFinishLine: ['office'],
  topic: ['office'],
  theme: ['office'],
  fund: ['office'],
  expenseClass: ['office'],
  pillar: ['ccetCode'],
  office: ['program', 'name', 'account'],
  program: ['name'],
  incomeClass: ['particulars'],
  classification: ['name'],
  paType: ['name'],
  level: ['name'],
};

export function drillField(field: string, fields: { id: string }[], dims: string[]): string | null {
  return DRILL[field]?.find((f) => fields.some((x) => x.id === f) && !dims.includes(f)) ?? null;
}

/**
 * The sheet narrowed to a picked value: *keep* replaces any filter on its
 * field, *exclude* adds it to that field's exclusions, *drill* keeps it and
 * moves Rows one level down. Years and documents are not picked: they are the
 * documents the sheet reads, chosen in the inspector.
 */
export function narrow(q: WorkbookQuery, p: Picked, how: 'keep' | 'exclude' | 'drill', fields: { id: string }[]): WorkbookQuery {
  // A word on the word map keeps the rows whose names use it (specs/020 A4.2).
  if (p.field === 'term' && how !== 'exclude' && fields.some((f) => f.id === 'name'))
    return { ...q, filters: [...q.filters.filter((f) => !(f.field === 'name' && f.op === 'contains')), { field: 'name', op: 'contains', text: p.label.slice(0, 60) }] };
  const other = q.filters.filter((f) => f.field !== p.field);
  if (how === 'exclude') {
    const prev = q.filters.find((f) => f.field === p.field && f.op === 'notIn');
    const values = [...new Set([...(prev?.op === 'notIn' ? prev.values : []), p.code])].slice(0, 50);
    return { ...q, filters: [...other, { field: p.field, op: 'notIn', values }] };
  }
  const kept: WorkbookQuery = { ...q, filters: [...other, { field: p.field, op: 'in', values: [p.code] }] };
  if (how === 'keep') return kept;
  const next = drillField(p.field, fields, q.dimensions);
  if (!next) return kept;
  const at = q.dimensions.indexOf(p.field);
  return { ...kept, dimensions: at >= 0 ? q.dimensions.map((d, i) => (i === at ? next : d)) : [next, ...q.dimensions.slice(1)] };
}

/** A dashboard tile under another tile's selection: filtered to it when its source has the field. */
export const linked = (q: WorkbookQuery, sel: Picked | null, fields: { id: string }[]): WorkbookQuery =>
  sel && fields.some((f) => f.id === sel.field) ? narrow(q, sel, 'keep', fields) : q;
