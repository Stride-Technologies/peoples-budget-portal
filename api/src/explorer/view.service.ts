import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/index';
import { ZERO } from '../aip-registry/excel-style.js';
import { CacheService } from '../cache/cache.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CatalogueService,
  MULTI_FUND_ID,
  NONE_ID,
  type Catalogue,
  type CatalogueDocument,
  type DimensionValue,
} from './catalogue.service.js';
import type { Visibility } from './sources.js';
import { QueryService } from './query/query.service.js';
import type { Query } from './query/query.js';
import {
  DEFAULT_TOP,
  MAX_TOP,
  validateView,
  type ExplorerView,
  type Series,
} from './view.js';

export interface ResolvedRow {
  id: string;
  label: string;
  sublabel?: string;
  /** Decimal string for money, integer string for count. */
  value: string;
  /** 0..1 of the series total; on a theme breakdown, of the series' rows (non-additive). */
  /** Null on a by-year series, whose years have no whole to be a share of. */
  share: number | null;
  accent?: string | null;
}

export interface ResolvedSeries {
  key: string;
  label: string;
  document: CatalogueDocument['kind'];
  years: number[];
  moneyWord: string;
  countWord: string;
  measure: Series['measure'];
  rows: ResolvedRow[];
  other: { value: string; n: number } | null;
  /** Null on a by-year series: adding years together is no figure anyone published. */
  total: string | null;
  /** Rows in the series before grouping (programs / PPAs). */
  n: number;
}

export type Caveat =
  | 'estimated-cost-not-spent'
  | 'kinds-differ'
  | 'tags-overlap'
  | 'other-row'
  | 'count-of-ppas';

export interface FactSheet {
  documents: {
    kind: CatalogueDocument['kind'];
    year: number;
    label: string;
    moneyWord: string;
  }[];
  groupBy: ExplorerView['groupBy'];
  series: {
    key: string;
    label: string;
    total: string | null;
    n: number;
    /** `id` is the table row the figure belongs to (Explain links to it). */
    top: { id: string; label: string; value: string; share: number | null }[];
    bottom: {
      id: string;
      label: string;
      value: string;
      share: number | null;
    }[];
    biggestChange: {
      label: string;
      from: string;
      to: string;
      delta: string;
      pct: number | null;
    } | null;
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

const NOTES: Record<Caveat, string> = {
  'estimated-cost-not-spent':
    'AIP figures are estimated costs of planned programs, not money spent.',
  'kinds-differ':
    'The AIP is the plan, the LEP is what the local chief executive proposed, and the ordinance is what was enacted. They are not the same money and are shown side by side, never added.',
  'tags-overlap':
    'A program can count under more than one theme, so themes do not add up to the total.',
  'other-row': 'Smaller rows are gathered under "Other".',
  'count-of-ppas':
    'On an Annual Budget the count is of PPAs (programs, projects and activities) as the ordinance lists them.',
};

const money = (d: Prisma.Decimal) => d.toFixed(2);

/**
 * The one place a figure is computed (specs/018 design §3). `resolve` turns a
 * validated view into series of rows plus the fact sheet Explain reads; the
 * chart, the table, the export and the AI all read this and nothing else.
 */
@Injectable()
export class ViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly catalogue: CatalogueService,
    private readonly queries: QueryService,
  ) {}

  async resolve(
    view: ExplorerView,
    visibility: Visibility = 'public',
  ): Promise<ResolvedView> {
    const cat = await this.catalogue.get();
    const errors = validateView(view, cat);
    if (errors.length)
      throw new BadRequestException({ message: 'Invalid view.', errors });

    const series = await Promise.all(
      view.series.map((s, i) =>
        this.resolveSeries(view, s, i, cat, visibility),
      ),
    );
    const caveats = caveatsOf(view, series);
    return {
      catalogueVersion: cat.version,
      view: { ...view, top: view.top ?? DEFAULT_TOP },
      series,
      facts: factsOf(view, series, cat, caveats),
      notes: caveats.map((c) => NOTES[c]),
    };
  }

  /**
   * One series through the query engine (redesign P2): the old URL grammar is
   * an adapter onto `Query`, so the phone page, Ask and the workspace share
   * one computation. Shape of the result unchanged.
   */
  private async resolveSeries(
    view: ExplorerView,
    s: Series,
    index: number,
    cat: Catalogue,
    visibility: Visibility,
  ): Promise<ResolvedSeries> {
    for (const y of s.years)
      if (!cat.documents.some((d) => d.kind === s.document && d.year === y))
        throw new NotFoundException(`FY${y} has no public ${s.document}.`);
    const byYear = view.groupBy === 'year';
    const nonAdditive = view.groupBy === 'theme' || view.groupBy === 'topic';
    const q: Query = {
      source: s.document === 'aip' ? 'aip-programs' : 'budget-ppas',
      documents: [{ kind: s.document, years: s.years }],
      dimensions: [view.groupBy],
      measures: [
        s.measure === 'money'
          ? { field: 'amount', agg: 'sum' }
          : { field: '', agg: 'count' },
      ],
      filters: Object.entries(s.filters)
        .filter(([, v]) => v?.length)
        .map(([field, values]) => ({ field, op: 'in' as const, values })),
      ...(byYear
        ? { sort: { by: 'year', dir: 'asc' as const } }
        : { limit: Math.min(view.top ?? DEFAULT_TOP, MAX_TOP) }),
    };
    const { res, docs } = await this.queries.aggregate(q, cat, visibility);

    const total = new Prisma.Decimal(res.totals[0]);
    // Themes and topics overlap: a share is of the rows' own sum, not the total.
    const denominator = nonAdditive
      ? [
          ...res.rows.map((r) => r.values[0]),
          ...(res.other ? [res.other.values[0]] : []),
        ].reduce((acc, v) => acc.plus(v), ZERO)
      : total;
    const fmt = (v: string) =>
      s.measure === 'money'
        ? new Prisma.Decimal(v).toFixed(2)
        : String(Number(v));
    const share = (v: string) =>
      byYear || denominator.isZero()
        ? null
        : Number(new Prisma.Decimal(v).div(denominator).toFixed(4));
    const labelOf = labeller(view, cat);
    const doc0 = docs[0];
    return {
      key: `s${index}`,
      // Every figure from a draft book says so, whoever wrote the label (W15).
      label: `${s.label ?? seriesLabel(s, docs)}${docs.some((d) => d.draft) ? ' (draft)' : ''}`,
      document: s.document,
      years: s.years,
      moneyWord: doc0.moneyWord,
      countWord: doc0.countWord,
      measure: s.measure,
      rows: res.rows.map((r) => {
        const id = r.keys[0] ?? NONE_ID;
        const l = labelOf(id);
        return {
          id,
          label: l.label,
          ...(l.sublabel ? { sublabel: l.sublabel } : {}),
          value: fmt(r.values[0]),
          share: share(r.values[0]),
          ...(l.accent !== undefined ? { accent: l.accent } : {}),
        };
      }),
      other: res.other
        ? { value: fmt(res.other.values[0]), n: res.other.n }
        : null,
      // Years are never added together (P0).
      total: byYear ? null : fmt(res.totals[0]),
      n: res.n,
    };
  }
}

function labeller(
  view: ExplorerView,
  cat: Catalogue,
): (id: string) => {
  label: string;
  sublabel?: string;
  accent?: string | null;
} {
  if (view.groupBy === 'year') return (id) => ({ label: `FY${id}` });
  const values: DimensionValue[] = cat.dimensions[view.groupBy];
  const byId = new Map(values.map((v) => [v.id, v]));
  return (id) => {
    if (id === NONE_ID) return { label: 'Not specified' };
    if (id === MULTI_FUND_ID)
      return {
        label: 'Multiple funds',
        sublabel: 'Rows funded from several sources without a split',
      };
    const v = byId.get(id);
    return v
      ? { label: v.label, sublabel: v.sublabel, accent: v.accent }
      : { label: id };
  };
}

function seriesLabel(s: Series, docs: CatalogueDocument[]): string {
  const d = docs[0];
  const years =
    s.years.length > 1
      ? `FY${Math.min(...s.years)}–${Math.max(...s.years)}`
      : `FY${s.years[0]}`;
  const what = s.measure === 'money' ? d.moneyWord : `Number of ${d.countWord}`;
  const kind =
    d.kind === 'aip' ? 'AIP' : d.kind === 'lep' ? 'LEP' : 'Annual Budget';
  return `${what} · ${years} ${kind}`;
}

function caveatsOf(view: ExplorerView, series: ResolvedSeries[]): Caveat[] {
  const c = new Set<Caveat>();
  if (view.series.some((s) => s.document === 'aip'))
    c.add('estimated-cost-not-spent');
  if (new Set(view.series.map((s) => s.document)).size > 1)
    c.add('kinds-differ');
  if (view.groupBy === 'theme' || view.groupBy === 'topic')
    c.add('tags-overlap');
  if (series.some((s) => s.other)) c.add('other-row');
  if (view.series.some((s) => s.measure === 'count' && s.document !== 'aip'))
    c.add('count-of-ppas');
  return [...c];
}

function factsOf(
  view: ExplorerView,
  series: ResolvedSeries[],
  cat: Catalogue,
  caveats: Caveat[],
): FactSheet {
  const docs = view.series.flatMap((s) =>
    s.years.map(
      (y) => cat.documents.find((d) => d.kind === s.document && d.year === y)!,
    ),
  );
  const seen = new Set<string>();
  return {
    documents: docs
      .filter(
        (d) =>
          d &&
          !seen.has(`${d.kind}${d.year}`) &&
          seen.add(`${d.kind}${d.year}`),
      )
      .map((d) => ({
        kind: d.kind,
        year: d.year,
        label: d.label,
        moneyWord: d.moneyWord,
      })),
    groupBy: view.groupBy,
    series: series.map((s) => {
      const pick = (r: ResolvedRow) => ({
        id: r.id,
        label: r.label,
        value: r.value,
        share: r.share,
      });
      const byValue = [...s.rows].sort((a, b) =>
        new Prisma.Decimal(b.value).comparedTo(new Prisma.Decimal(a.value)),
      );
      let biggestChange: FactSheet['series'][number]['biggestChange'] = null;
      if (view.groupBy === 'year' && s.rows.length >= 2) {
        for (let i = 1; i < s.rows.length; i++) {
          const from = new Prisma.Decimal(s.rows[i - 1].value);
          const to = new Prisma.Decimal(s.rows[i].value);
          const delta = to.minus(from);
          if (
            !biggestChange ||
            delta
              .abs()
              .greaterThan(new Prisma.Decimal(biggestChange.delta).abs())
          )
            biggestChange = {
              label: `${s.rows[i - 1].label} → ${s.rows[i].label}`,
              from: s.rows[i - 1].value,
              to: s.rows[i].value,
              delta: s.measure === 'money' ? money(delta) : delta.toFixed(0),
              pct: from.isZero()
                ? null
                : Number(delta.div(from).mul(100).toFixed(1)),
            };
        }
      }
      return {
        key: s.key,
        label: s.label,
        total: s.total,
        n: s.n,
        top: byValue.slice(0, 5).map(pick),
        bottom: byValue.length > 5 ? byValue.slice(-3).map(pick) : [],
        biggestChange,
      };
    }),
    caveats,
  };
}

// Rows travel through the JSON cache; Decimals come back as strings.

export const viewHash = (view: ExplorerView) =>
  createHash('sha256').update(JSON.stringify(view)).digest('hex').slice(0, 16);
