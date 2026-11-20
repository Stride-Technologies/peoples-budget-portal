/**
 * The workspace's chart compiler (specs/018 redesign P3, `redesign-p3-workbook.md`):
 * a sheet's query and the engine's answer → a Vega-Lite spec (a Vega spec for
 * the treemap, which Vega-Lite does not have). Pure, so it is tested in Node.
 *
 * Every figure the chart prints is formatted here from the engine's decimal
 * string; `Number()` is used only for pixel positions.
 */
import { compactPeso } from '../currency-formatter.ts';
import { readableOn } from '../finish-lines.ts';
import { DIV, isDarkPaper, SCHEMA_VG, SCHEMA_VL, SEQ, vegaConfig } from './theme.ts';
import type { Mark, WorkbookQuery } from './workbook.ts';

/** The API's `QueryResult` (api/src/explorer/query/query.service.ts). */
export interface QueryResult {
  catalogueVersion: string;
  query: WorkbookQuery;
  columns: { field: string; label: string; role: 'dimension' | 'money' | 'count' | 'ratio' | 'rank' }[];
  rows: { keys: { code: string | null; label: string }[]; values: string[]; calcs: (string | null)[] }[];
  other: { label: string; values: string[]; n: number } | null;
  totals: string[] | null;
  n: number;
  documents: { kind: string; year: number; label: string; draft: boolean }[];
}

/** One source of `GET /public/explorer/sources`. */
export interface SourceInfo {
  id: string;
  label: string;
  grain: string;
  kinds: string[];
  fields: { id: string; label: string; role: 'dimension' | 'money'; type: string; multi?: boolean; kinds?: string[] }[];
}

/** Colours read from the workspace's CSS tokens at render time (light or dark). */
export interface Theme {
  series: string[];
  ink: string;
  muted: string;
  grid: string;
  paper: string;
  font: string;
  /** Big figures (KPI tiles, facet headers); the body font when absent. */
  display?: string;
}

export type Drawn = Exclude<Mark, 'auto'>;
type Role = QueryResult['columns'][number]['role'];

/** Series that must never be added together: documents and years (P0, W15). */
const NEVER_ADDED = new Set(['year', 'kind']);

export function allowedMarks(q: WorkbookQuery): Drawn[] {
  const dims = q.dimensions.length;
  const out: Drawn[] = ['table'];
  if (dims >= 1) out.push('bar', 'line', 'area');
  if (dims >= 2 && q.measures.length === 1 && !NEVER_ADDED.has(q.dimensions[1])) out.push('stacked');
  if (dims >= 1 && q.measures.length >= 2) out.push('scatter');
  if (dims >= 2) out.push('heatmap');
  if (dims === 1 && q.measures.length === 1) out.push('treemap');
  if (dims <= 1 && q.measures.length === 1) out.push('kpi');
  if (dims === 1 && q.dimensions[0] === 'barangay') out.push('map');
  if (q.source === 'terms' && q.dimensions[0] === 'term' && q.measures.length === 1) out.push('words');
  return out;
}

/** "Show Me": the mark a sheet set to Automatic draws. */
export function showMe(q: WorkbookQuery, r: Pick<QueryResult, 'rows'>): Drawn {
  if (!q.dimensions.length) return q.measures.length === 1 ? 'kpi' : 'table';
  if (q.dimensions[0] === 'year') return 'line';
  if (q.dimensions.length === 1 && q.dimensions[0] === 'barangay') return 'map';
  if (q.source === 'terms' && q.dimensions[0] === 'term' && q.measures.length === 1) return 'words';
  if (q.dimensions.length === 1 && q.measures.length >= 2) return 'scatter';
  if (q.dimensions.length >= 2 && new Set(r.rows.map((x) => x.keys[1]?.label)).size > 8) return 'heatmap';
  return 'bar';
}

export const markOf = (mark: Mark, q: WorkbookQuery, r: Pick<QueryResult, 'rows'>): Drawn =>
  mark !== 'auto' && allowedMarks(q).includes(mark) ? mark : showMe(q, r);

export function formatValue(v: string | null, role: Role): string {
  if (v === null) return '—';
  // Under ₱1,000 (a per-resident figure) the centavos are the figure: ₱0.44, not ₱0.
  if (role === 'money') return /^-?0*\d{1,3}(\.\d*)?$/.test(v) && !/^-?0*(\.0*)?$/.test(v) ? pesoFull(v) : compactPeso(v);
  if (role === 'ratio') return `${(Number(v) * 100).toFixed(1)}%`;
  if (role === 'rank') return `#${v}`;
  return Number(v).toLocaleString('en-PH');
}

/** A decimal string as full pesos, grouped, without passing through a float. */
export function pesoFull(v: string): string {
  const [int, frac = '00'] = v.replace('-', '').split('.');
  return `${v.startsWith('-') ? '−' : ''}₱${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac.padEnd(2, '0').slice(0, 2)}`;
}

/** The value a measure shows: its "show as" calculation when it has one. */
function measureCols(r: QueryResult) {
  const dims = r.query.dimensions.length;
  const nm = r.query.measures.length;
  return r.query.measures.map((_, j) => {
    const k = (r.query.calcs ?? []).findIndex((c) => c.measure === j);
    const col = r.columns[k >= 0 ? dims + nm + k : dims + j];
    return { label: col.label, role: col.role, calc: k };
  });
}

export interface Datum {
  y: string;
  s: string;
  v: number;
  t: string;
  v2?: number;
  t2?: string;
  draft: boolean;
  fill: string;
  stroke: string;
  /** The first breakdown's code and label, for a click (absent on "Other"). */
  k0?: string | null;
  l0?: string;
}

/** Long rows for the chart, one per (row, series), in the engine's order. */
export function chartData(r: QueryResult, theme: Theme): { data: Datum[]; series: string[]; drafts: boolean } {
  const q = r.query;
  const ms = measureCols(r);
  const drafts = r.documents.filter((d) => d.draft);
  const yearAt = q.dimensions.indexOf('year');
  const kindAt = q.dimensions.indexOf('kind');
  const isDraft = (keys: QueryResult['rows'][number]['keys']) =>
    drafts.some(
      (d) =>
        (yearAt < 0 || keys[yearAt]?.code === String(d.year)) && (kindAt < 0 || keys[kindAt]?.code === d.kind),
    );
  const bySeries = q.dimensions.length >= 2;
  const series: string[] = [];
  const colour = (s: string) => {
    let i = series.indexOf(s);
    if (i < 0) i = series.push(s) - 1;
    return { i, c: theme.series[i % theme.series.length] };
  };
  const datum = (y: string, s: string, raw: string | null, role: Role, draft: boolean): Datum => {
    const { i, c } = colour(s);
    return {
      y,
      s,
      v: raw === null ? 0 : Number(raw), // ponytail: pixels only; the label is `t`
      t: formatValue(raw, role),
      draft,
      fill: draft ? `url(#ws-hatch-${i % theme.series.length})` : c,
      stroke: c,
    };
  };
  const data: Datum[] = [];
  for (const row of r.rows) {
    const y = [row.keys[0]?.label, row.keys[2]?.label].filter(Boolean).join(' · ');
    const draft = isDraft(row.keys);
    const val = (j: number) => (ms[j].calc >= 0 ? row.calcs[ms[j].calc] : row.values[j]);
    const key = { k0: row.keys[0]?.code ?? null, l0: row.keys[0]?.label };
    if (bySeries) {
      data.push({ ...datum(y, row.keys[1].label, val(0), ms[0].role, draft), ...key });
      continue;
    }
    const d = { ...datum(y, ms[0].label, val(0), ms[0].role, draft), ...key };
    if (ms.length >= 2) {
      d.v2 = Number(val(1) ?? 0);
      d.t2 = formatValue(val(1), ms[1].role);
    }
    data.push(d);
  }
  // "Other" carries plain values only: no calculation is defined for it.
  if (r.other && !bySeries && ms[0].calc < 0)
    data.push(datum(r.other.label, ms[0].label, r.other.values[0], ms[0].role, drafts.length === r.documents.length));
  return { data, series, drafts: drafts.length > 0 };
}

// Three significant figures, SI suffixes as the site writes them: ₱73.1K, ₱2.5B.
const AXIS_PESO = "'₱' + replace(replace(format(datum.value, '.3~s'), 'G', 'B'), 'k', 'K')";

function axisLabel(role: Role) {
  if (role === 'money') return { labelExpr: AXIS_PESO };
  if (role === 'ratio') return { format: '.0%' };
  return { format: '~s' };
}

/** The unit an axis title carries (A1.2): "Estimated cost (₱)". Never written by a model. */
export function axisTitle(label: string, role: Role): string {
  const unit = role === 'money' ? '₱' : role === 'ratio' ? '%' : role === 'rank' ? 'rank' : '';
  return unit ? `${label} (${unit})` : label;
}

/** The unit word of a result's first measure, for the subtitle. */
export const unitOf = (r: QueryResult): Role | 'perCapita' =>
  r.query.measures[0]?.agg === 'perCapita' ? 'perCapita' : (measureCols(r)[0]?.role ?? 'money');

/** More series than this become small multiples (Javed et al. 2010). */
export const MAX_SERIES_ONE_PANEL = 4;
/** KPI tiles a sheet may draw before it reads as a table. */
export const MAX_KPI = 12;

// ---- linter (A1.5) ------------------------------------------------------------------

/** Why a mark would mislead: the chart falls back to the table and says so. */
export const LINT_RULES = [
  'empty',
  'tooManyCategories',
  'tooManySeries',
  'mixedUnits',
  'ratioStacked',
  'negativeArea',
  'rankAsLength',
  'lineUnordered',
  'onePoint',
  'fewPoints',
  'heatmapThin',
  'kpiMany',
  'otherDominates',
  'mapTotals',
] as const;
export type LintRule = (typeof LINT_RULES)[number];

const CHANGE_CALCS = new Set(['differenceFromPrevious', 'percentDifferenceFromPrevious']);

/**
 * Chart rules from Draco / VizLinter and Pandey 2015, checked on the engine's
 * answer. Bars always start at zero and nothing is drawn in 3D: those are
 * true by construction in `compile`, so they are not rules here.
 */
export function lint(mark: Drawn, r: QueryResult): LintRule | null {
  if (mark === 'table') return null;
  const q = r.query;
  const ms = measureCols(r);
  const role = ms[0].role;
  const vals = r.rows.map((x) => (ms[0].calc >= 0 ? x.calcs[ms[0].calc] : x.values[0]));
  const ys = new Set(r.rows.map((x) => x.keys[0]?.label));
  const ss = new Set(r.rows.map((x) => x.keys[1]?.label));
  const zero = (v: string | null) => v === null || /^-?0*(\.0*)?$/.test(v);
  if (vals.every(zero)) return 'empty';
  if (mark !== 'scatter' && ms.length >= 2 && new Set(ms.map((m) => m.role)).size > 1) return 'mixedUnits';
  if (mark === 'kpi') return r.rows.length > MAX_KPI ? 'kpiMany' : null;
  // A map of totals mostly shows where people live (Harrower & Brewer 2003).
  if (mark === 'map') return q.measures[0]?.agg === 'perCapita' ? null : 'mapTotals';
  if ((mark === 'stacked' || mark === 'treemap') && role === 'ratio') return 'ratioStacked';
  if ((mark === 'stacked' || mark === 'treemap') && vals.some((v) => v?.startsWith('-'))) return 'negativeArea';
  if (role === 'rank' && (mark === 'bar' || mark === 'stacked' || mark === 'treemap')) return 'rankAsLength';
  if ((mark === 'line' || mark === 'area') && q.dimensions[0] !== 'year') return 'lineUnordered';
  if ((mark === 'line' || mark === 'area') && ys.size < 2) return 'onePoint';
  if (mark === 'scatter' && r.rows.length < 3) return 'fewPoints';
  if (mark === 'heatmap' && (ys.size < 2 || ss.size < 2)) return 'heatmapThin';
  if ((mark === 'bar' || mark === 'stacked' || mark === 'heatmap' || mark === 'treemap') && ys.size > 40) return 'tooManyCategories';
  if ((mark === 'stacked' || mark === 'area') && ss.size > 8) return 'tooManySeries';
  if ((mark === 'treemap' || mark === 'stacked') && r.other && ms[0].calc < 0) {
    // Part-to-whole charts hide everything when "Other" is most of the whole.
    const toCents = (v: string) => BigInt(v.replace(/^(-?\d+)(?:\.(\d{0,2})\d*)?$/, (_, i, f = '') => i + f.padEnd(2, '0')));
    const shown = r.rows.reduce((a, x) => a + toCents(x.values[0] ?? '0'), BigInt(0));
    if (toCents(r.other.values[0] ?? '0') > shown) return 'otherDominates';
  }
  return null;
}

// ---- compile --------------------------------------------------------------------------

type Size = { width: number; height: number };
type Out = { kind: 'vega-lite' | 'vega'; spec: Record<string, unknown> };

/** A spec ready for `vega-lite.compile` (or Vega's `parse` for the treemap and KPI tiles). */
export function compile(mark: Drawn, r: QueryResult, theme: Theme, size: Size): Out | null {
  if (mark === 'table') return null;
  const { data, series } = chartData(r, theme);
  const ms = measureCols(r);
  const dimLabel = r.columns[0]?.label ?? '';
  const order = [...new Set(data.map((d) => d.y))];
  const tooltip = [
    { field: 'y', title: dimLabel },
    ...(series.length > 1 ? [{ field: 's', title: r.columns[1]?.role === 'dimension' ? r.columns[1].label : 'Series' }] : []),
    { field: 't', title: ms[0].label },
    ...(mark === 'scatter' ? [{ field: 't2', title: ms[1].label }] : []),
  ];
  const raw = { scale: null };
  const base = {
    $schema: SCHEMA_VL,
    width: size.width,
    height: size.height,
    autosize: { type: 'fit', contains: 'padding' },
    background: null,
    data: { values: data },
    config: vegaConfig(theme),
  };
  const valueAxis = (j: number) => ({ title: axisTitle(ms[j].label, ms[j].role), axis: axisLabel(ms[j].role) });

  if (mark === 'treemap') return treemap(data, theme, size);
  if (mark === 'map') return map(r, data, theme, size);
  if (mark === 'words') return words(data, ms[0].label, theme, size);
  if (mark === 'kpi') return kpi(data, ms[0].label, theme, size);

  if (mark === 'heatmap') {
    // A2: rows and columns by total, largest first; labels where a cell has room;
    // a change calc diverges around zero (red ↔ grey ↔ blue), anything else is one hue.
    const sum = (k: 'y' | 's') => {
      const m = new Map<string, number>();
      for (const d of data) m.set(d[k], (m.get(d[k]) ?? 0) + Math.abs(d.v));
      return [...m.keys()].sort((a, b) => m.get(b)! - m.get(a)!);
    };
    const [rows, cols] = [sum('y'), sum('s')];
    const calc = ms[0].calc >= 0 ? r.query.calcs?.[ms[0].calc]?.type : undefined;
    const diverging = !!calc && CHANGE_CALCS.has(calc);
    const dark = isDarkPaper(theme.paper);
    const max = Math.max(0, ...data.map((d) => Math.abs(d.v)));
    const scale = diverging
      ? { type: 'linear', domain: [-max, max], range: dark ? DIV.dark : DIV.light }
      : { type: 'linear', domain: [0, max], range: dark ? SEQ.dark : SEQ.light };
    // ponytail: the label column's width is guessed at 160px, not measured.
    const roomy = (size.width - 160) / Math.max(1, cols.length) >= 52 && size.height / Math.max(1, rows.length) >= 18;
    // White on the strong end of either ramp, ink elsewhere (the ramps are measured for it).
    const strong = diverging ? `abs(datum.v) > ${max * 0.55}` : `datum.v > ${max * 0.55}`;
    return {
      kind: 'vega-lite',
      spec: {
        ...base,
        encoding: {
          y: { field: 'y', type: 'nominal', sort: rows, title: null },
          x: { field: 's', type: 'nominal', sort: cols, title: null, axis: { labelAngle: -30, orient: 'top' } },
        },
        layer: [
          {
            mark: { type: 'rect', cornerRadius: 2, stroke: theme.paper, strokeWidth: 2 },
            encoding: {
              color: { field: 'v', type: 'quantitative', scale, legend: { orient: 'bottom', direction: 'horizontal', title: axisTitle(ms[0].label, ms[0].role), ...axisLabel(ms[0].role) } },
              tooltip,
            },
          },
          ...(roomy
            ? [
                {
                  mark: { type: 'text', fontSize: 10, fontWeight: 600 },
                  encoding: {
                    text: { field: 't' },
                    color: { condition: { test: strong, value: dark ? theme.ink : '#FFFFFF' }, value: dark ? '#FFFFFF' : theme.ink },
                  },
                },
              ]
            : []),
        ],
      },
    };
  }

  if (mark === 'scatter') {
    // Name only the three largest on each axis: small points crowd the origin.
    const top = (k: 'v' | 'v2') => new Set([...data].sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0)).slice(0, 3));
    const [tx, ty] = [top('v'), top('v2')];
    const named = data.map((d) => ({ ...d, lab: tx.has(d) || ty.has(d) ? d.y : '' }));
    return {
      kind: 'vega-lite',
      spec: {
        ...base,
        data: { values: named },
        layer: [
          {
            mark: { type: 'point', filled: true, size: 70 },
            encoding: {
              x: { field: 'v', type: 'quantitative', ...valueAxis(0) },
              y: { field: 'v2', type: 'quantitative', ...valueAxis(1) },
              fill: { field: 'fill', type: 'nominal', ...raw },
              stroke: { field: 'stroke', type: 'nominal', ...raw },
              tooltip,
            },
          },
          {
            mark: { type: 'text', align: 'left', dx: 7, fontSize: 11 },
            encoding: { x: { field: 'v', type: 'quantitative' }, y: { field: 'v2', type: 'quantitative' }, text: { field: 'lab' } },
          },
        ],
      },
    };
  }

  // Beyond four series one panel per series, on one shared scale (A1.3).
  const facet = mark !== 'stacked' && series.length > MAX_SERIES_ONE_PANEL;
  // Every panel carries its own label column (bars) or value axis (lines), header and axis row.
  // ponytail: those are estimated in px, not measured.
  const perCol = (mark === 'bar' ? 126 : 56) + 16;
  const perRow = 24 + 40 + 16;
  const cellOf = (c: number) => {
    const rows = Math.ceil(series.length / c);
    return { width: Math.floor((size.width - c * perCol) / c), height: Math.floor((size.height - rows * perRow) / rows) };
  };
  // The column count whose panels are least cramped (a panel wants to be about twice as wide as tall).
  const cols = facet
    ? Array.from({ length: series.length }, (_, i) => i + 1).reduce((best, c) => {
        const [a, b] = [cellOf(c), cellOf(best)];
        return Math.min(a.width / 2, a.height) > Math.min(b.width / 2, b.height) ? c : best;
      }, 1)
    : 1;
  const cell = facet ? { width: Math.max(60, cellOf(cols).width), height: Math.max(40, cellOf(cols).height) } : size;
  const frame = (inner: Record<string, unknown>) =>
    facet
      ? {
          ...base,
          width: undefined,
          height: undefined,
          autosize: { type: 'pad' },
          facet: { field: 's', type: 'nominal', sort: series, title: null },
          columns: cols,
          spacing: 16,
          spec: { width: cell.width, height: cell.height, ...inner },
        }
      : { ...base, ...inner };

  if (mark === 'line' || mark === 'area') {
    const x = { field: 'y', type: 'ordinal', sort: r.query.dimensions[0] === 'year' ? 'ascending' : order, title: null, axis: { labelAngle: 0 } };
    const y = { field: 'v', type: 'quantitative', stack: null, ...valueAxis(0) };
    const colour = { field: 's', type: 'nominal', sort: series, scale: { domain: series, range: theme.series }, legend: null };
    const one = facet || series.length === 1;
    return {
      kind: 'vega-lite',
      spec: frame({
        encoding: { x, y },
        layer: [
          ...(mark === 'area' ? [{ mark: { type: 'area', opacity: 0.22 }, encoding: { color: colour } }] : []),
          { mark: { type: 'line', strokeWidth: 2 }, encoding: { color: colour } },
          {
            mark: { type: 'point', filled: true, size: 64, strokeWidth: 2 },
            encoding: { fill: { field: 'fill', type: 'nominal', ...raw }, stroke: { field: 'stroke', type: 'nominal', ...raw }, tooltip },
          },
          ...(one ? [{ mark: { type: 'text', dy: -12, fontSize: 11, fontWeight: 600 }, encoding: { text: { field: 't' } } }] : []),
        ],
      }),
    };
  }

  // bar and stacked
  const grouped = mark === 'bar' && series.length > 1 && !facet;
  // Room past the longest bar for its printed figure: the domain grows so ~56px stay free.
  // ponytail: the category labels' width is guessed at their 220px cap, not measured.
  const plotW = Math.max(60, cell.width - (facet ? 0 : 240));
  const maxV = Math.max(0, ...data.map((d) => d.v));
  const roomy = mark === 'bar' && maxV > 0 ? { scale: { domainMax: (maxV * plotW) / Math.max(plotW - 56, plotW / 2) } } : {};
  return {
    kind: 'vega-lite',
    spec: frame({
      encoding: {
        y: { field: 'y', type: 'nominal', sort: order, title: null, scale: { paddingInner: 0.25 }, ...(facet ? { axis: { labelLimit: 110 } } : {}) },
        x: { field: 'v', type: 'quantitative', ...(mark === 'stacked' ? { stack: 'zero' } : { stack: null }), ...roomy, ...valueAxis(0) },
        ...(grouped ? { yOffset: { field: 's', sort: series, scale: { paddingInner: 0.15 } } } : {}),
      },
      layer: [
        {
          // A 2px paper gap between adjacent fills, stacked segments included.
          mark: { type: 'bar', cornerRadiusEnd: mark === 'stacked' ? 0 : 3, strokeWidth: 1 },
          encoding: {
            fill: { field: 'fill', type: 'nominal', ...raw },
            stroke: { field: 'stroke', type: 'nominal', ...raw },
            ...(mark === 'stacked' ? { order: { field: 's', sort: 'ascending' }, detail: { field: 's' } } : {}),
            tooltip,
          },
        },
        ...(mark === 'bar'
          ? [{ mark: { type: 'text', align: 'left', baseline: 'middle', dx: 4, fontSize: grouped || facet ? 10 : 11, fontWeight: 600 }, encoding: { text: { field: 't' } } }]
          : []),
      ],
    }),
  };
}

function treemap(data: Datum[], theme: Theme, size: Size): Out {
  const leaves = data.filter((d) => d.v > 0);
  return {
    kind: 'vega',
    spec: {
      $schema: SCHEMA_VG,
      width: size.width,
      height: size.height,
      padding: 0,
      autosize: 'none',
      background: null,
      data: [
        {
          name: 'tree',
          values: [{ id: 'root' }, ...leaves.map((d, i) => ({ ...d, id: `n${i}`, parent: 'root', fg: readableOn(d.stroke) }))],
          transform: [
            { type: 'stratify', key: 'id', parentKey: 'parent' },
            { type: 'treemap', field: 'v', round: true, method: 'squarify', size: [{ signal: 'width' }, { signal: 'height' }] },
          ],
        },
        { name: 'leaves', source: 'tree', transform: [{ type: 'filter', expr: 'datum.parent' }] },
      ],
      marks: [
        {
          type: 'rect',
          from: { data: 'leaves' },
          // The SVG is one labelled image (the Table view holds the figures); unnamed
          // per-box ARIA nodes failed axe's svg-img-alt (P7). Vega-Lite marks name theirs.
          aria: false,
          encode: {
            update: {
              x: { field: 'x0' },
              y: { field: 'y0' },
              x2: { field: 'x1' },
              y2: { field: 'y1' },
              fill: { field: 'fill' },
              stroke: { value: theme.paper },
              strokeWidth: { value: 2 },
              tooltip: { signal: "datum.y + ' · ' + datum.t" },
            },
          },
        },
        ...['y', 't'].map((f, k) => ({
          type: 'text',
          from: { data: 'leaves' },
          interactive: false,
          aria: false,
          encode: {
            update: {
              x: { signal: 'datum.x0 + 6' },
              y: { signal: `datum.y0 + ${16 + k * 15}` },
              text: { signal: `datum.x1 - datum.x0 > 70 && datum.y1 - datum.y0 > ${22 + k * 15} ? datum.${f} : ''` },
              limit: { signal: 'datum.x1 - datum.x0 - 10' },
              // Measured, not chosen: white fails AA on several of the eight hues.
              fill: { signal: 'datum.draft ? datum.stroke : datum.fg' },
              font: { value: theme.font },
              fontSize: { value: k ? 11 : 12 },
              fontWeight: { value: k ? 400 : 600 },
            },
          },
        })),
      ],
    },
  };
}

/** The city-wide bucket's code (`CITY_WIDE` in `api/src/explorer/query/barangay.ts`). */
export const CITY_WIDE = '_citywide';
/** Naga's barangays, simplified from HDX COD-AB admin-4 (CC BY-IGO), served by the site itself. */
export const BARANGAY_TOPOJSON = '/geo/naga-barangays.topo.json';
export const MAP_CREDIT = ['Boundaries: OCHA COD-AB (NAMRIA, PSA),', 'CC BY-IGO. Population: PSA 2020.', 'Place read from each row\'s name.'];

/**
 * The barangay map (specs/020 A3.4): a one-hue choropleth of per-resident
 * figures joined to the boundaries by PSGC code, and the city-wide money
 * (rows that name no barangay) printed beside it, never painted on a place.
 * Vega-Lite's own geoshape and topojson reader: no new library, no tiles.
 */
function map(r: QueryResult, data: Datum[], theme: Theme, size: Size): Out {
  const ms = measureCols(r);
  const places = data.filter((d) => d.k0 && d.k0 !== CITY_WIDE);
  const city = data.find((d) => d.k0 === CITY_WIDE);
  const dark = isDarkPaper(theme.paper);
  const side = Math.min(240, Math.max(160, size.width * 0.28));
  return {
    kind: 'vega-lite',
    spec: {
      $schema: SCHEMA_VL,
      background: null,
      config: vegaConfig(theme),
      autosize: { type: 'pad' },
      spacing: 24,
      hconcat: [
        {
          width: Math.max(120, size.width - side - 48),
          // Naga runs east–west about 2.7:1, so a taller frame is only empty paper.
          height: Math.max(120, Math.min(size.height - 70, (size.width - side - 48) / 2.4)),
          projection: { type: 'mercator' },
          data: { url: BARANGAY_TOPOJSON, format: { type: 'topojson', feature: 'barangays' } },
          transform: [
            { lookup: 'properties.pcode', from: { data: { values: places }, key: 'k0', fields: ['v', 't', 'y', 'k0', 'l0'] } },
            // A barangay no row names is drawn, at zero, so the city stays whole.
            { calculate: 'isValid(datum.v) ? datum.v : 0', as: 'v' },
            { calculate: "isValid(datum.t) ? datum.t : '—'", as: 't' },
            { calculate: 'datum.properties.name', as: 'name' },
          ],
          mark: { type: 'geoshape', stroke: theme.paper, strokeWidth: 1 },
          encoding: {
            color: {
              field: 'v',
              type: 'quantitative',
              scale: { range: dark ? SEQ.dark : SEQ.light, zero: true },
              legend: { orient: 'bottom', direction: 'horizontal', title: axisTitle(ms[0].label, ms[0].role), ...axisLabel(ms[0].role) },
            },
            tooltip: [
              { field: 'name', title: 'Barangay' },
              { field: 't', title: ms[0].label },
            ],
          },
        },
        {
          width: side,
          height: 130,
          data: { values: [{ t: city?.t ?? '—', label: city?.y ?? 'LGU-wide or no barangay named', x: 0 }] },
          layer: [
            { mark: { type: 'text', align: 'left', baseline: 'top', fontSize: 30, fontWeight: 700, font: theme.display ?? theme.font, x: 0, y: 4 }, encoding: { text: { field: 't' } } },
            { mark: { type: 'text', align: 'left', baseline: 'top', fontSize: 12, color: theme.muted, x: 0, y: 46, limit: side, lineBreak: '\n' }, encoding: { text: { field: 'label' } } },
            // The sources the map stands on (CC BY-IGO asks for credit).
            ...MAP_CREDIT.map((line, i) => ({ mark: { type: 'text', align: 'left', baseline: 'top', fontSize: 10, color: theme.muted, x: 0, y: 84 + i * 14, limit: side, text: line } })),
          ],
        },
      ],
    },
  };
}

/** Words drawn in the cloud; the ranked list beside it shows the first `WORDS_LISTED`. */
export const MAX_WORDS = 60;
export const WORDS_LISTED = 12;

/**
 * The word map (specs/020 A4.2): budget words sized by the pesos of the rows
 * that use them (not by how often they appear, Hearst et al. 2020), coloured by
 * the label each is most typical of, with a ranked bar list beside it for exact
 * reading. Vega's own `wordcloud` transform; the list is laid out here.
 */
function words(data: Datum[], measure: string, theme: Theme, size: Size): Out {
  // The transform writes its own x and y, so the word travels in a field of its own.
  const ws = data.filter((d) => d.k0 && d.v > 0).slice(0, MAX_WORDS).map((d) => ({ ...d, word: d.y }));
  const listW = Math.min(340, Math.max(240, size.width * 0.34));
  const cloudW = Math.max(160, size.width - listW - 24);
  const top = ws.slice(0, WORDS_LISTED);
  // Vega's wordcloud silently drops a word that does not fit, and the biggest is the
  // likeliest to: so the largest size is one at which the longest of the top words
  // fits the cloud's width. ponytail: glyphs estimated at 0.62 em (bold), not measured.
  const longest = Math.max(1, ...ws.slice(0, 5).map((d) => d.word.length));
  const maxFont = Math.max(14, Math.min(64, size.height / 7, (cloudW * 0.9) / (longest * 0.62)));
  const maxV = Math.max(1, ...top.map((d) => d.v));
  const rowH = Math.min(28, (size.height - 24) / Math.max(1, top.length));
  // Label column 140px, then the bar, then ~70px for its figure.
  const barMax = Math.max(20, listW - 140 - 74);
  const list = top.map((d, i) => ({ ...d, n: `${i + 1}`, ly: 22 + i * rowH, bw: Math.max(2, (d.v / maxV) * barMax) }));
  const text = (field: string, x: number | { signal: string }, extra: Record<string, unknown> = {}) => ({
    type: 'text',
    from: { data: 'list' },
    interactive: false,
    aria: false,
    encode: {
      update: {
        x: typeof x === 'number' ? { value: x } : x,
        y: { signal: `datum.ly + ${rowH / 2}` },
        baseline: { value: 'middle' },
        text: { field },
        font: { value: theme.font },
        fontSize: { value: 11 },
        fill: { value: theme.ink },
        ...extra,
      },
    },
  });
  return {
    kind: 'vega',
    spec: {
      $schema: SCHEMA_VG,
      width: size.width,
      height: size.height,
      padding: 0,
      autosize: 'none',
      background: null,
      data: [
        {
          name: 'words',
          values: ws,
          transform: [
            {
              type: 'wordcloud',
              size: [cloudW, size.height],
              text: { field: 'word' },
              font: theme.display ?? theme.font,
              fontWeight: 700,
              fontSize: { field: 'v' },
              fontSizeRange: [11, maxFont],
              padding: 3,
              // No rotation: every word reads left to right.
              rotate: 0,
            },
          ],
        },
        { name: 'list', values: list },
      ],
      marks: [
        {
          type: 'text',
          from: { data: 'words' },
          encode: {
            enter: { align: { value: 'center' }, baseline: { value: 'alphabetic' } },
            update: {
              x: { field: 'x' },
              y: { field: 'y' },
              angle: { field: 'angle' },
              // The transform adds positions and sizes, not the text.
              text: { field: 'word' },
              font: { field: 'font' },
              fontSize: { field: 'fontSize' },
              fontWeight: { value: 700 },
              fill: { field: 'stroke' },
              tooltip: { signal: "datum.word + ' · ' + datum.t" },
              cursor: { value: 'pointer' },
            },
            hover: { fill: { value: theme.ink } },
          },
        },
        {
          type: 'group',
          encode: { update: { x: { value: cloudW + 24 }, y: { value: 0 }, width: { value: listW }, height: { value: size.height } } },
          marks: [
            {
              type: 'text',
              interactive: false,
              aria: false,
              encode: { update: { x: { value: 0 }, y: { value: 8 }, text: { value: measure }, font: { value: theme.font }, fontSize: { value: 11 }, fill: { value: theme.muted } } },
            },
            text('n', 0, { fill: { value: theme.muted }, fontSize: { value: 10 } }),
            text('y', 16, { limit: { value: 120 } }),
            {
              type: 'rect',
              from: { data: 'list' },
              encode: {
                update: {
                  x: { value: 140 },
                  y: { signal: `datum.ly + ${rowH * 0.25}` },
                  width: { field: 'bw' },
                  height: { value: rowH * 0.5 },
                  fill: { field: 'stroke' },
                  cornerRadiusTopRight: { value: 3 },
                  cornerRadiusBottomRight: { value: 3 },
                  tooltip: { signal: "datum.y + ' · ' + datum.t" },
                },
              },
            },
            text('t', { signal: '144 + datum.bw' }, { fontWeight: { value: 600 }, fontSize: { value: 10 } }),
          ],
        },
      ],
    },
  };
}

/**
 * KPI tiles (A1.4): one colour block per value with its figure big. The grid is
 * laid out here, so the spec is plain rects and text (and exports as such).
 * Text colour is `readableOn` the block, never chosen by eye.
 */
export function kpi(data: Datum[], measure: string, theme: Theme, size: Size): Out {
  const n = Math.max(1, data.length);
  const gap = 12;
  const cols = Math.min(n, Math.max(1, Math.round(Math.sqrt((n * size.width) / Math.max(1, size.height)))));
  const rows = Math.ceil(n / cols);
  const w = (size.width - gap * (cols - 1)) / cols;
  const h = Math.min(180, (size.height - gap * (rows - 1)) / rows);
  const big = Math.max(18, Math.min(56, h * 0.36, w / 6));
  // Each tile its own block, in palette order (the label names it; colour only sets it apart).
  const tiles = data.map((d, i) => {
    const c = theme.series[i % theme.series.length];
    const fill = d.draft ? `url(#ws-hatch-${i % theme.series.length})` : c;
    return {
      x: (i % cols) * (w + gap),
      y: Math.floor(i / cols) * (h + gap),
      w,
      h,
      fill,
      fg: d.draft ? theme.ink : readableOn(c),
      label: d.y || measure,
      t: d.t,
      tip: `${d.y || measure} · ${d.t}`,
      k0: d.k0,
      l0: d.l0,
    };
  });
  const text = (field: string, dy: number, fontSize: number, weight: number, font: string) => ({
    type: 'text',
    from: { data: 'tiles' },
    interactive: false,
    aria: false,
    encode: {
      update: {
        x: { signal: 'datum.x + 14' },
        y: { signal: `datum.y + ${dy}` },
        baseline: { value: 'top' },
        text: { field },
        limit: { signal: 'datum.w - 28' },
        fill: { field: 'fg' },
        font: { value: font },
        fontSize: { value: fontSize },
        fontWeight: { value: weight },
      },
    },
  });
  return {
    kind: 'vega',
    spec: {
      $schema: SCHEMA_VG,
      width: size.width,
      height: size.height,
      padding: 0,
      autosize: 'none',
      background: null,
      data: [{ name: 'tiles', values: tiles }],
      marks: [
        {
          type: 'rect',
          from: { data: 'tiles' },
          aria: false,
          encode: {
            update: {
              x: { field: 'x' },
              y: { field: 'y' },
              width: { field: 'w' },
              height: { field: 'h' },
              fill: { field: 'fill' },
              cornerRadius: { value: 4 },
              tooltip: { field: 'tip' },
            },
          },
        },
        text('label', 14, 13, 500, theme.font),
        text('t', 14 + 22, big, 700, theme.display ?? theme.font),
      ],
    },
  };
}

/** SVG `<defs>` for draft hatching, one pattern per series colour. */
export const hatchDefs = (theme: Theme) =>
  `<defs>${theme.series
    .map(
      (c, i) =>
        `<pattern id="ws-hatch-${i}" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><rect width="5" height="5" fill="${theme.paper}"/><rect width="2.4" height="5" fill="${c}"/></pattern>`,
    )
    .join('')}</defs>`;

/** The answer as CSV: every column the engine returned, full-precision values. */
export function resultCsv(r: QueryResult): string {
  const cell = (s: string | null) => (s === null ? '' : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const nd = r.query.dimensions.length;
  const lines = [r.columns.map((c) => cell(c.label)).join(',')];
  for (const row of r.rows) lines.push([...row.keys.map((k) => k.label), ...row.values, ...row.calcs].map(cell).join(','));
  if (r.other) lines.push([r.other.label, ...Array(nd - 1).fill(''), ...r.other.values].map(cell).join(','));
  return `${lines.join('\n')}\n`;
}
