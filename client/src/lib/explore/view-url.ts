/**
 * The explorer's view object and its URL grammar (specs/018 design §1), as
 * the client reads and writes it. The API (`api/src/explorer/view.ts`) owns
 * validation; this file only encodes and decodes the same grammar so a page
 * can build links and the readout sentence can edit the URL.
 *
 *   /explore?v=1&s=aip:2027,2026:money&f=office:CHO&f1=fund:GF&by=sector&chart=bar&top=12
 */
export const DOCUMENTS = ['aip', 'lep', 'ordinance'] as const;
export type DocumentKind = (typeof DOCUMENTS)[number];
export const DIMENSIONS = ['office', 'sector', 'fund', 'finishLine', 'subFinishLine', 'cluster', 'theme', 'expenseClass', 'topic'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const GROUP_BYS = [...DIMENSIONS, 'year'] as const;
export type GroupBy = (typeof GROUP_BYS)[number];
export const CHARTS = ['bar', 'stackedBar', 'line', 'table'] as const;
export type Chart = (typeof CHARTS)[number];
export type Measure = 'money' | 'count';

export interface Series {
  document: DocumentKind;
  years: number[];
  measure: Measure;
  filters: Partial<Record<Dimension, string[]>>;
  label?: string;
}

export interface ExplorerView {
  v: 1;
  series: Series[];
  groupBy: GroupBy;
  chart: Chart;
  top?: number;
}

// ─── What the API returns (contracts/explorer-api.md) ────────────────────────

export interface CatalogueDocument {
  kind: DocumentKind;
  year: number;
  label: string;
  moneyWord: string;
  countWord: string;
  /** Not published: shown only where the API reads drafts (dev, W15). */
  draft?: true;
}
export interface DimensionValue {
  id: string;
  label: string;
  sublabel?: string;
  accent?: string | null;
  clusterId?: string;
}
export interface Card {
  id: string;
  question: Partial<Record<'en' | 'fil' | 'bcl', string>>;
  view: ExplorerView;
  tags: string[];
}
export interface Catalogue {
  version: string;
  documents: CatalogueDocument[];
  dimensions: Record<Dimension, DimensionValue[]>;
  cards: Card[];
}
export interface ResolvedRow {
  id: string;
  label: string;
  sublabel?: string;
  value: string;
  share: number | null;
  accent?: string | null;
}
export interface ResolvedSeries {
  key: string;
  label: string;
  document: DocumentKind;
  years: number[];
  moneyWord: string;
  countWord: string;
  measure: Measure;
  rows: ResolvedRow[];
  other: { value: string; n: number } | null;
  /** Null on a by-year series: years are never added together. */
  total: string | null;
  n: number;
}
export type Caveat = 'estimated-cost-not-spent' | 'kinds-differ' | 'tags-overlap' | 'other-row' | 'count-of-ppas';
export interface FactRow {
  /** The table row (`row-<id>`) the figure belongs to. */
  id: string;
  label: string;
  value: string;
  share: number | null;
}
/** What Explain is built from (API `FactSheet`, design §4): figures computed once, on the server. */
export interface FactSheet {
  documents: { kind: DocumentKind; year: number; label: string; moneyWord: string }[];
  groupBy: GroupBy;
  series: {
    key: string;
    label: string;
    total: string | null;
    n: number;
    top: FactRow[];
    bottom: FactRow[];
    biggestChange: { label: string; from: string; to: string; delta: string; pct: number | null } | null;
  }[];
  caveats: Caveat[];
}
export interface ResolvedView {
  catalogueVersion: string;
  view: ExplorerView;
  series: ResolvedSeries[];
  facts: FactSheet;
  notes: string[];
}
export interface ViewError {
  path: string;
  code: string;
  message: string;
}
export interface Capabilities {
  explorer: boolean;
  ai: boolean;
  stt: { enabled: boolean; languages: string[]; maxSeconds: number };
  mode: 'normal' | 'resting';
  logQuestions: boolean;
  /** specs/020 B4: show the unticked "help improve" box. */
  trainingCapture?: boolean;
}

/** The whole feature, client side; the API has its own `EXPLORER_ENABLED`. */
export const EXPLORER_ENABLED = process.env.NEXT_PUBLIC_EXPLORER_ENABLED === '1';

const isIn = <T extends string>(list: readonly T[], v: string | null | undefined): v is T =>
  v != null && (list as readonly string[]).includes(v);

/** The grammar, leniently: unknown tokens are dropped, the API decides validity. */
export function decodeView(params: URLSearchParams): ExplorerView | null {
  const series: Series[] = [];
  for (const raw of params.getAll('s')) {
    const [doc, years, measure, ...label] = raw.split(':');
    if (!isIn(DOCUMENTS, doc)) continue;
    const ys = [...new Set((years ?? '').split(',').map(Number).filter(Number.isInteger))];
    if (!ys.length) continue;
    series.push({
      document: doc,
      years: ys,
      measure: measure === 'count' ? 'count' : 'money',
      filters: {},
      ...(label.length ? { label: label.join(':') } : {}),
    });
  }
  if (!series.length) return null;
  const apply = (raw: string, targets: Series[]) => {
    const [dim, values] = raw.split(':');
    if (!isIn(DIMENSIONS, dim)) return;
    const vals = (values ?? '').split(',').filter(Boolean);
    for (const s of targets) s.filters[dim] = [...new Set([...(s.filters[dim] ?? []), ...vals])];
  };
  for (const raw of params.getAll('f')) apply(raw, series);
  series.forEach((s, i) => {
    for (const raw of params.getAll(`f${i}`)) apply(raw, [s]);
  });
  const by = params.get('by');
  const chart = params.get('chart');
  const top = Number(params.get('top'));
  return {
    v: 1,
    series,
    groupBy: isIn(GROUP_BYS, by) ? by : 'sector',
    chart: isIn(CHARTS, chart) ? chart : 'bar',
    ...(Number.isInteger(top) && top > 0 ? { top } : {}),
  };
}

export function encodeView(view: ExplorerView): URLSearchParams {
  const q = new URLSearchParams();
  q.set('v', '1');
  view.series.forEach((s, i) => {
    q.append('s', [s.document, s.years.join(','), s.measure, ...(s.label ? [s.label] : [])].join(':'));
    for (const [dim, vals] of Object.entries(s.filters)) if (vals?.length) q.append(`f${i}`, `${dim}:${vals.join(',')}`);
  });
  q.set('by', view.groupBy);
  q.set('chart', view.chart);
  if (view.top !== undefined) q.set('top', String(view.top));
  return q;
}

/** `/explore?…` for a view (the caller wraps it in `LocaleLink`). */
export const viewHref = (view: ExplorerView) => `/explore?${encodeView(view).toString()}`;
