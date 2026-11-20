/**
 * The explorer's one object (specs/018 design §1): what the URL holds, the
 * readout sentence edits, the AI writes and Explain reads. Pure TypeScript —
 * the API owns parsing and validation; the client only encodes the same
 * grammar (`client/src/lib/explore/view-url.ts`) and shows the API's errors.
 */
import type { Catalogue } from './catalogue.service.js';

export const DOCUMENTS = ['aip', 'lep', 'ordinance'] as const;
export type DocumentKind = (typeof DOCUMENTS)[number];

export const DIMENSIONS = [
  'office',
  'sector',
  'fund',
  'finishLine',
  'subFinishLine',
  'cluster',
  'theme',
  'expenseClass',
  /** Curated subjects (redesign W16); like themes, a row can be in several. */
  'topic',
  /** What a row IS (redesign W22): labels from the labelling run; several per row. */
  'label',
  /** A label's second level ("Infrastructure › Drainage and flood control"). */
  'subLabel',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const GROUP_BYS = [...DIMENSIONS, 'year'] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

export const CHARTS = ['bar', 'stackedBar', 'line', 'table'] as const;
export type Chart = (typeof CHARTS)[number];

export const MEASURES = ['money', 'count'] as const;
export type Measure = (typeof MEASURES)[number];

export type Filters = Partial<Record<Dimension, string[]>>;

export interface Series {
  /** One kind per series — a line never mixes AIP, LEP and ordinance money (R8). */
  document: DocumentKind;
  years: number[];
  measure: Measure;
  /** Catalogue value codes (`CHO`, `GF`, `PS`…), never database ids. */
  filters: Filters;
  label?: string;
}

export interface ExplorerView {
  v: 1;
  series: Series[];
  groupBy: GroupBy;
  chart: Chart;
  /** Rows shown before "Other"; the engine clamps to 1..50. */
  top?: number;
}

export interface ViewError {
  path: string;
  code: string;
  message: string;
}

export const MAX_SERIES = 4;
export const MAX_FILTER_VALUES = 8;
export const MAX_TOP = 50;
export const DEFAULT_TOP = 12;

/** The view a bad or empty URL falls back to (US1): the latest AIP by sector. */
export function defaultView(catalogue: Catalogue): ExplorerView | null {
  const latest = [...catalogue.documents].sort((a, b) =>
    a.kind === b.kind ? b.year - a.year : a.kind === 'aip' ? -1 : 1,
  )[0];
  if (!latest) return null;
  return {
    v: 1,
    series: [
      {
        document: latest.kind,
        years: [latest.year],
        measure: 'money',
        filters: {},
      },
    ],
    groupBy: 'sector',
    chart: 'bar',
  };
}

type Query = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

const isDoc = (s: string): s is DocumentKind =>
  (DOCUMENTS as readonly string[]).includes(s);
const isDim = (s: string): s is Dimension =>
  (DIMENSIONS as readonly string[]).includes(s);

/**
 * `?v=1&s=aip:2027,2026:money[:label]&s=lep:2026:money&f=office:CHO,CPDO&f1=fund:GF&by=sector&chart=bar&top=12`
 *
 * `f` applies to every series, `f<i>` to series i. Grammar errors are
 * returned, not thrown: the controller answers 400 with them and the client
 * falls back to the default view (spec edge cases).
 */
export function parseViewQuery(q: Query): {
  view: ExplorerView;
  errors: ViewError[];
} {
  const errors: ViewError[] = [];
  const series: Series[] = [];

  for (const [i, raw] of list(q.s).entries()) {
    const [doc, years, measure, ...label] = raw.split(':');
    if (!doc || !isDoc(doc)) {
      errors.push({
        path: `s[${i}].document`,
        code: 'unknown-document',
        message: `Unknown document "${doc ?? ''}".`,
      });
      continue;
    }
    const ys = (years ?? '')
      .split(',')
      .filter(Boolean)
      .map((y) => Number(y));
    if (ys.length === 0 || ys.some((y) => !Number.isInteger(y)))
      errors.push({
        path: `s[${i}].years`,
        code: 'bad-years',
        message: 'Years must be whole numbers.',
      });
    const m = (measure || 'money') as Measure;
    if (!(MEASURES as readonly string[]).includes(m))
      errors.push({
        path: `s[${i}].measure`,
        code: 'unknown-measure',
        message: `Unknown measure "${measure}".`,
      });
    series.push({
      document: doc,
      years: [...new Set(ys)],
      measure: m,
      filters: {},
      ...(label.length ? { label: label.join(':').slice(0, 80) } : {}),
    });
  }

  const applyFilter = (raw: string, targets: Series[], path: string) => {
    const [dim, values] = raw.split(':');
    if (!dim || !isDim(dim)) {
      errors.push({
        path,
        code: 'unknown-dimension',
        message: `Unknown filter "${dim ?? ''}".`,
      });
      return;
    }
    const vals = [...new Set((values ?? '').split(',').filter(Boolean))];
    for (const s of targets)
      s.filters[dim] = [...new Set([...(s.filters[dim] ?? []), ...vals])];
  };
  for (const raw of list(q.f)) applyFilter(raw, series, 'f');
  for (const key of Object.keys(q)) {
    const m = /^f(\d+)$/.exec(key);
    if (!m) continue;
    const s = series[Number(m[1])];
    if (!s) {
      errors.push({
        path: key,
        code: 'no-such-series',
        message: `No series ${m[1]}.`,
      });
      continue;
    }
    for (const raw of list(q[key])) applyFilter(raw, [s], key);
  }

  const by = (list(q.by)[0] ?? 'sector') as GroupBy;
  if (!(GROUP_BYS as readonly string[]).includes(by))
    errors.push({
      path: 'by',
      code: 'unknown-group-by',
      message: `Unknown breakdown "${by}".`,
    });
  const chart = (list(q.chart)[0] ?? 'bar') as Chart;
  if (!(CHARTS as readonly string[]).includes(chart))
    errors.push({
      path: 'chart',
      code: 'unknown-chart',
      message: `Unknown chart "${chart}".`,
    });
  const topRaw = list(q.top)[0];
  const top = topRaw === undefined ? undefined : Number(topRaw);
  if (top !== undefined && (!Number.isInteger(top) || top < 1))
    errors.push({
      path: 'top',
      code: 'bad-top',
      message: 'top must be a whole number ≥ 1.',
    });

  if (series.length === 0)
    errors.push({
      path: 's',
      code: 'no-series',
      message: 'At least one series is required.',
    });

  return {
    view: {
      v: 1,
      series,
      groupBy: by,
      chart,
      ...(top !== undefined ? { top: Math.min(top, MAX_TOP) } : {}),
    },
    errors,
  };
}

/**
 * The rules the chart must keep (R8, R9, R12 and the limits). Every error
 * names its path so the readout sentence can point at the token to fix.
 */
export function validateView(view: ExplorerView, cat: Catalogue): ViewError[] {
  const errors: ViewError[] = [];
  const e = (path: string, code: string, message: string) =>
    errors.push({ path, code, message });

  if (view.series.length === 0)
    e('s', 'no-series', 'At least one series is required.');
  if (view.series.length > MAX_SERIES)
    e('s', 'too-many-series', `At most ${MAX_SERIES} series.`);

  view.series.forEach((s, i) => {
    const p = `s[${i}]`;
    for (const y of s.years)
      if (!cat.documents.some((d) => d.kind === s.document && d.year === y))
        e(
          `${p}.years`,
          'year-not-public',
          `FY${y} has no public ${s.document.toUpperCase()}.`,
        );
    if (view.groupBy === 'year' && s.years.length < 2)
      e(
        `${p}.years`,
        'need-two-years',
        'A by-year chart needs at least two years in each series.',
      );
    if (view.groupBy !== 'year' && s.years.length > 1)
      e(
        `${p}.years`,
        'one-year-per-series',
        'Pick one year per series, or break down by year.',
      );
    if (
      s.measure === 'count' &&
      (view.groupBy === 'expenseClass' || view.groupBy === 'fund')
    )
      e(
        `${p}.measure`,
        'count-has-no-class',
        'A count of programs has no expense class or fund split.',
      );
    for (const dim of Object.keys(s.filters) as Dimension[]) {
      const vals = s.filters[dim] ?? [];
      if (vals.length > MAX_FILTER_VALUES)
        e(
          `${p}.filters.${dim}`,
          'too-many-values',
          `At most ${MAX_FILTER_VALUES} values per filter.`,
        );
      const known = new Set(cat.dimensions[dim].map((v) => v.id));
      for (const v of vals)
        if (!known.has(v))
          e(`${p}.filters.${dim}`, 'unknown-value', `Unknown ${dim} "${v}".`);
    }
  });

  if (view.chart === 'line' && view.groupBy !== 'year')
    e(
      'chart',
      'line-needs-years',
      'A line chart runs over years; break down by year.',
    );
  const kinds = new Set(view.series.map((s) => s.document));
  if (view.chart === 'stackedBar' && kinds.size > 1)
    e(
      'chart',
      'no-stack-across-kinds',
      'AIP, LEP and ordinance figures are not the same money and cannot be stacked (R9).',
    );
  if (
    view.chart === 'stackedBar' &&
    (['theme', 'topic', 'label', 'subLabel'] as string[]).includes(view.groupBy)
  )
    e(
      'chart',
      'no-stack-themes',
      'A program can carry several themes or topics; a stacked chart would double-count (R12).',
    );
  if (view.top !== undefined && (view.top < 1 || view.top > MAX_TOP))
    e('top', 'bad-top', `top must be between 1 and ${MAX_TOP}.`);

  return errors;
}

/** The URL for a view, in the same grammar `parseViewQuery` reads. */
export function viewToQuery(view: ExplorerView): URLSearchParams {
  const q = new URLSearchParams();
  q.set('v', '1');
  view.series.forEach((s, i) => {
    q.append(
      's',
      [
        s.document,
        s.years.join(','),
        s.measure,
        ...(s.label ? [s.label] : []),
      ].join(':'),
    );
    for (const [dim, vals] of Object.entries(s.filters))
      if (vals?.length) q.append(`f${i}`, `${dim}:${vals.join(',')}`);
  });
  q.set('by', view.groupBy);
  q.set('chart', view.chart);
  if (view.top !== undefined) q.set('top', String(view.top));
  return q;
}
