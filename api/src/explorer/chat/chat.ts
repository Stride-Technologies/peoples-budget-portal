/**
 * The chat agent's pure core (specs/018 redesign P5, W6, W26–W29). The model
 * writes a query and sentences with placeholders; it never writes a figure.
 * Every number in an answer is filled here from the engine's result, and a
 * sentence with a digit the model wrote itself is dropped (W26).
 */
import { Prisma } from '../../generated/prisma/index';
import type { Catalogue, Lang } from '../catalogue.service.js';
import { NONE_ID } from '../catalogue.service.js';
import { OTHER, type Filter, type Measure } from '../query/engine.js';
import {
  fieldOf,
  SOURCE_IDS,
  SOURCES,
  type SourceId,
} from '../query/fields.js';
import type { Query } from '../query/query.js';
import { MARKS, type Mark } from '../workbook/workbook.js';
import type { DocumentKind } from '../view.js';

export const LANGS = ['en', 'fil', 'bcl'] as const;
export const ACTIONS = ['answer', 'askBack', 'refuse'] as const;
/** Earlier turns the model sees (W27); nothing older, nothing about the person. */
export const MAX_TURNS = 4;

// ─── What the model may answer ────────────────────────────────────────────────

const QUERY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'source',
    'documents',
    'dimensions',
    'measures',
    'filters',
    'sort',
    'limit',
  ],
  properties: {
    source: { type: 'string', enum: [...SOURCE_IDS] },
    documents: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'years'],
        properties: {
          kind: { type: 'string', enum: ['aip', 'lep', 'ordinance'] },
          years: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
    dimensions: { type: 'array', items: { type: 'string' } },
    measures: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'agg'],
        properties: {
          field: { type: 'string' },
          agg: {
            type: 'string',
            enum: ['sum', 'count', 'countDistinct', 'avg', 'min', 'max'],
          },
        },
      },
    },
    filters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'op', 'values', 'text'],
        properties: {
          field: { type: 'string' },
          op: { type: 'string', enum: ['in', 'notIn', 'contains'] },
          values: { type: 'array', items: { type: 'string' } },
          text: { type: 'string' },
        },
      },
    },
    sort: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['by', 'dir'],
          properties: {
            by: { type: 'string' },
            dir: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
      ],
    },
    limit: { anyOf: [{ type: 'null' }, { type: 'integer' }] },
  },
};

const OPTION = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'query'],
  properties: { label: { type: 'string' }, query: { $ref: '#/$defs/query' } },
};

/** One JSON step (W7: no vendor tool calling, so a self-hosted model works). */
export const CHAT_SCHEMA = {
  name: 'chat_step',
  schema: {
    type: 'object',
    additionalProperties: false,
    $defs: { query: QUERY_SCHEMA },
    required: [
      'lang',
      'action',
      'reading',
      'query',
      'mark',
      'sentences',
      'alternatives',
      'askBack',
      'refusal',
    ],
    properties: {
      lang: { type: 'string', enum: [...LANGS] },
      action: { type: 'string', enum: [...ACTIONS] },
      reading: { type: 'string' },
      query: { anyOf: [{ type: 'null' }, { $ref: '#/$defs/query' }] },
      mark: { type: 'string', enum: [...MARKS] },
      sentences: { type: 'array', items: { type: 'string' } },
      alternatives: { type: 'array', items: OPTION },
      askBack: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            required: ['question', 'options'],
            properties: {
              question: { type: 'string' },
              options: { type: 'array', items: OPTION },
            },
          },
        ],
      },
      refusal: { type: 'string' },
    },
  },
};

type RawQuery = {
  source?: unknown;
  documents?: { kind?: unknown; years?: unknown }[];
  dimensions?: unknown;
  measures?: { field?: unknown; agg?: unknown }[];
  filters?: {
    field?: unknown;
    op?: unknown;
    values?: unknown;
    text?: unknown;
  }[];
  sort?: { by?: unknown; dir?: unknown } | null;
  limit?: unknown;
};

export interface Step {
  lang: Lang;
  action: (typeof ACTIONS)[number];
  reading: string;
  query: Query | null;
  mark: Mark;
  sentences: string[];
  alternatives: { label: string; query: Query }[];
  askBack: {
    question: string;
    options: { label: string; query: Query }[];
  } | null;
  refusal: string;
}

const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** The model's query as the engine's `Query`; empty parts dropped. Validation is `validateQuery`'s. */
export function toQuery(raw: RawQuery | null | undefined): Query | null {
  if (!raw || typeof raw.source !== 'string') return null;
  return {
    source: raw.source as SourceId,
    documents: (raw.documents ?? []).map((d) => ({
      kind: String(d.kind) as DocumentKind,
      years: (Array.isArray(d.years) ? d.years : []).map(Number),
    })),
    dimensions: strs(raw.dimensions),
    measures: (raw.measures ?? []).map((m) => ({
      field: String(m.field),
      agg: String(m.agg) as Measure['agg'],
    })),
    filters: (raw.filters ?? []).map(
      (f): Filter =>
        f.op === 'contains'
          ? {
              field: String(f.field),
              op: 'contains',
              text: typeof f.text === 'string' ? f.text : '',
            }
          : {
              field: String(f.field),
              op: f.op === 'notIn' ? 'notIn' : 'in',
              values: strs(f.values),
            },
    ),
    ...(raw.sort && typeof raw.sort.by === 'string'
      ? {
          sort: {
            by: raw.sort.by,
            dir: raw.sort.dir === 'asc' ? 'asc' : 'desc',
          },
        }
      : {}),
    ...(typeof raw.limit === 'number' && raw.limit > 0
      ? { limit: Math.floor(raw.limit) }
      : {}),
  };
}

export function parseStep(text: string): Step {
  const b = JSON.parse(text) as Record<string, unknown> & {
    query?: RawQuery;
    alternatives?: { label?: unknown; query?: RawQuery }[];
    askBack?: {
      question?: unknown;
      options?: { label?: unknown; query?: RawQuery }[];
    } | null;
  };
  const options = (xs: { label?: unknown; query?: RawQuery }[] | undefined) =>
    (xs ?? []).flatMap((o) => {
      const query = toQuery(o.query);
      return query && typeof o.label === 'string'
        ? [{ label: o.label.slice(0, 80), query }]
        : [];
    });
  return {
    lang: (LANGS as readonly unknown[]).includes(b.lang)
      ? (b.lang as Lang)
      : 'en',
    action: (ACTIONS as readonly unknown[]).includes(b.action)
      ? (b.action as Step['action'])
      : 'refuse',
    reading: typeof b.reading === 'string' ? b.reading.slice(0, 300) : '',
    query: toQuery(b.query),
    mark: (MARKS as readonly unknown[]).includes(b.mark)
      ? (b.mark as Mark)
      : 'auto',
    sentences: strs(b.sentences)
      .slice(0, 3)
      .map((s) => s.slice(0, 400)),
    alternatives: options(b.alternatives).slice(0, 2),
    askBack:
      b.askBack && typeof b.askBack.question === 'string'
        ? {
            question: b.askBack.question.slice(0, 200),
            options: options(b.askBack.options).slice(0, 3),
          }
        : null,
    refusal: typeof b.refusal === 'string' ? b.refusal.slice(0, 300) : '',
  };
}

// ─── Figures: only the engine's ──────────────────────────────────────────────

export const PLACEHOLDERS = [
  'total',
  'count',
  'base',
  'share',
  'top1',
  'top1.amount',
  'top1.share',
  'top2',
  'top2.amount',
  'groups',
  'change',
  'unclassified',
  'unclassified.count',
  // specs/020 B2.2: what drove the year-on-year change (`drivers`).
  'driver1',
  'driver1.change',
  'driver2',
] as const;
export type Facts = Partial<Record<(typeof PLACEHOLDERS)[number], string>>;

const B = new Prisma.Decimal(1e9);
const M = new Prisma.Decimal(1e6);

/** ₱2.87B, ₱640.20M, ₱85,000.00 — from the decimal string, never a float. */
export function peso(v: string): string {
  const d = new Prisma.Decimal(v);
  const abs = d.abs();
  const sign = d.isNegative() ? '−' : '';
  if (abs.gte(B)) return `${sign}₱${abs.div(B).toFixed(2)}B`;
  if (abs.gte(M)) return `${sign}₱${abs.div(M).toFixed(2)}M`;
  const [whole, cents] = abs.toFixed(2).split('.');
  return `${sign}₱${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
}

/** 36%, 4.5%, 0.3% — a ratio of two decimal strings. */
export function percent(part: string, whole: string): string | undefined {
  const w = new Prisma.Decimal(whole);
  if (w.isZero()) return undefined;
  const p = new Prisma.Decimal(part).div(w).mul(100);
  return `${p.abs().lt(10) ? p.toFixed(1) : p.toFixed(0)}%`;
}

/** Years the question is about may be written; any other digit is the model's own. */
export function hasOwnDigits(s: string, years: number[]): boolean {
  const stripped = s
    .replace(/\{[a-z0-9.]+\}/g, '')
    .replace(/\b(?:FY\s?)?(\d{4})\b/g, (m, y: string) =>
      years.includes(Number(y)) ? '' : m,
    );
  return /\d/.test(stripped);
}

/**
 * A template with its placeholders filled, or null when it names a fact the
 * engine did not produce, or writes a figure of its own (W26).
 */
export function fill(
  template: string,
  facts: Facts,
  years: number[],
): string | null {
  if (hasOwnDigits(template, years)) return null;
  let missing = false;
  const out = template.replace(/\{([a-z0-9.]+)\}/g, (_, k: string) => {
    const v = facts[k as keyof Facts];
    if (v === undefined) missing = true;
    return v ?? '';
  });
  return missing ? null : out.trim();
}

/**
 * specs/020 B2.3, the reverse of `fill`'s check: facts the engine computed
 * that no kept sentence uses. Logged, never shown: a headline answer that
 * leaves `{total}` unused, or a change answer that never names its driver,
 * is a prompt problem to fix (Wiseman et al. 2017, content selection).
 */
export function unusedFacts(kept: string[], facts: Facts): string[] {
  const used = new Set(
    kept.flatMap((t) => [...t.matchAll(/\{([a-z0-9.]+)\}/g)].map((m) => m[1])),
  );
  return Object.keys(facts).filter((k) => !used.has(k));
}

// ─── What drove a change (specs/020 B2.2; Wu & Madden 2013, Scorpion) ────────

/** Breakdowns a change is explained by, additive ones first: their parts add up to the change. */
export const DRIVER_FIELDS = ['office', 'fund', 'label'] as const;

/**
 * The groups that moved most between the last two years of a `[year, field]`
 * breakdown, by absolute change. A group absent in one year counts as zero
 * there. `share` is the group's change over the total change: with an
 * additive field the parts add up to the whole, with a label they need not.
 */
export function drivers(
  rows: { keys: { code: string | null; label: string }[]; values: string[] }[],
  years: [number, number],
): { code: string; label: string; change: Prisma.Decimal }[] {
  const by = new Map<
    string,
    { label: string; prev: Prisma.Decimal; cur: Prisma.Decimal }
  >();
  const zero = new Prisma.Decimal(0);
  for (const r of rows) {
    const [y, g] = r.keys;
    const year = Number(y.code ?? y.label);
    if (isGap(g.code) || g.code === OTHER || !years.includes(year)) continue;
    const e = by.get(g.code) ?? { label: g.label, prev: zero, cur: zero };
    const v = new Prisma.Decimal(r.values[0] ?? 0);
    if (year === years[0]) e.prev = e.prev.plus(v);
    else e.cur = e.cur.plus(v);
    by.set(g.code, e);
  }
  return [...by.entries()]
    .map(([code, e]) => ({ code, label: e.label, change: e.cur.minus(e.prev) }))
    .filter((d) => !d.change.isZero())
    .sort(
      (a, b) =>
        b.change.abs().comparedTo(a.change.abs()) || (a.code < b.code ? -1 : 1),
    );
}

/** +₱12.40M / −₱3.10M: a signed peso change. */
export const pesoChange = (d: Prisma.Decimal) =>
  d.isNegative() ? peso(d.toFixed(2)) : `+${peso(d.toFixed(2))}`;

// ─── Next steps (W26): from what the result allows ───────────────────────────

/**
 * Two or three ways on, never one that answers empty: a breakdown of a
 * non-empty result always has rows. By office, by sub-label (when a label is
 * chosen), by fund, over the years.
 */
export function nextSteps(
  q: Query,
  cat: Catalogue,
): { id: 'office' | 'subLabel' | 'fund' | 'years'; query: Query }[] {
  const out: { id: 'office' | 'subLabel' | 'fund' | 'years'; query: Query }[] =
    [];
  const has = (f: string) => !!fieldOf(q.source, f);
  const by = (field: string): Query => ({
    ...q,
    dimensions: [
      ...q.dimensions.filter((d) => d === 'year' || d === 'kind'),
      field,
    ].slice(-3),
    sort: { by: 'm0', dir: 'desc' },
    limit: 15,
    calcs: undefined,
  });
  const labelFilter = q.filters.find(
    (f) => f.field === 'label' && f.op === 'in',
  );
  if (labelFilter && has('subLabel') && !q.dimensions.includes('subLabel'))
    out.push({ id: 'subLabel', query: by('subLabel') });
  if (has('office') && !q.dimensions.includes('office'))
    out.push({ id: 'office', query: by('office') });
  if (
    has('fund') &&
    !q.dimensions.includes('fund') &&
    !q.dimensions.some((d) => fieldOf(q.source, d)?.multi)
  )
    out.push({ id: 'fund', query: by('fund') });
  const kind = q.documents.length === 1 ? q.documents[0].kind : null;
  const years = kind
    ? cat.documents
        .filter((d) => d.kind === kind)
        .map((d) => d.year)
        .sort()
    : [];
  if (kind && years.length > 1 && !q.dimensions.includes('year'))
    out.push({
      id: 'years',
      query: {
        ...q,
        documents: [{ kind, years }],
        dimensions: ['year'],
        sort: undefined,
        limit: undefined,
        calcs: undefined,
      },
    });
  return out.slice(0, 3);
}

/** The same question without what narrows it: the whole document, for "of ₱8.07B". */
export const baseOf = (q: Query): Query => ({
  ...q,
  dimensions: q.dimensions.filter((d) => d === 'year' || d === 'kind'),
  filters: [],
  sort: undefined,
  limit: undefined,
  calcs: undefined,
});

/** The question with every breakdown dropped: one total (or one per year). */
export const totalOf = (q: Query): Query => ({
  ...q,
  dimensions: q.dimensions.filter((d) => d === 'year' || d === 'kind'),
  sort: undefined,
  limit: undefined,
  calcs: undefined,
});

/** Was the figure counted from labels (W22)? Then the coverage line says so. */
export const usesLabels = (q: Query) =>
  [...q.dimensions, ...q.filters.map((f) => f.field)].some(
    (f) => f === 'label' || f === 'subLabel',
  );

/** The fields the prompt lists per source, with roles and kinds (topics are the old Ask's: labels replace them here). */
export function sourceListing(): string {
  return SOURCE_IDS.map((id) => {
    const s = SOURCES[id];
    return [
      `- ${id} — ${s.label} (${s.kinds.join(', ')}): one record is ${s.grain}.`,
      `  breakdowns: ${s.fields
        .filter((f) => f.role === 'dimension' && f.id !== 'topic')
        .map((f) => `${f.id}${f.multi ? '*' : ''}`)
        .join(', ')}`,
      `  money: ${s.fields
        .filter((f) => f.role === 'money')
        .map((f) => f.id)
        .join(', ')}`,
    ].join('\n');
  }).join('\n');
}

/** A dimension value no row has: "Not specified" and "Not classified" are not choices. */
export const isGap = (code: string | null) => code === null || code === NONE_ID;

/**
 * Deterministic clean-ups, run on fresh and cached steps alike
 * (ARCHITECTURE-ESSENTIALS, Data Explorer): a topic becomes the label of the
 * same id (labels replace topics in the chat, W22); "one label, by label" is
 * one bar, so it becomes "that label, by sub-label" (W26: the chart shows the
 * theme by sub-label).
 */
export function tidy(q: Query, cat: Catalogue): Query {
  const labels = new Set(cat.dimensions.label.map((v) => v.id));
  const subs = cat.dimensions.subLabel;
  // A label or sub-label named in words ("health", "kalusugan", "roads") → its ids.
  const named = (field: 'label' | 'subLabel', text: string) => {
    const t = text.trim().toLowerCase();
    return cat.dimensions[field]
      .filter(
        (v) =>
          v.id === t ||
          v.id.split('.').pop() === t ||
          [v.label, ...Object.values(v.aliases).flat()].some(
            (a) => a?.toLowerCase() === t,
          ),
      )
      .map((v) => v.id);
  };
  const filters: Filter[] = [];
  for (const f of q.filters) {
    const field = f.field === 'topic' ? 'label' : f.field;
    if ((field === 'label' || field === 'subLabel') && f.op === 'contains') {
      const ids = named(field, f.text);
      if (ids.length) filters.push({ field, op: 'in', values: ids });
      continue;
    }
    if (field === 'label' && 'values' in f) {
      // A sub-label written as a label ("roads") moves to the sub-label filter.
      const asSub = f.values.flatMap((v) =>
        labels.has(v) ? [] : named('subLabel', v),
      );
      const own = f.values.filter((v) => labels.has(v));
      if (own.length) filters.push({ ...f, field, values: own });
      if (asSub.length)
        filters.push({ field: 'subLabel', op: f.op, values: asSub });
      continue;
    }
    filters.push(field === f.field ? f : { ...f, field });
  }
  let dimensions = q.dimensions.map((d) => (d === 'topic' ? 'label' : d));
  const one = filters.find((f) => f.field === 'label' && f.op === 'in');
  if (
    one &&
    'values' in one &&
    one.values.length === 1 &&
    fieldOf(q.source, 'subLabel')
  ) {
    dimensions = dimensions.map((d) => (d === 'label' ? 'subLabel' : d));
    // W26: a theme's chart shows it by sub-label.
    if (
      !dimensions.some((d) => d !== 'year' && d !== 'kind') &&
      subs.some((s) => s.parentId === one.values[0])
    )
      dimensions = [...dimensions, 'subLabel'];
  }
  return { ...q, dimensions: [...new Set(dimensions)], filters };
}

export function tidyStep(s: Step, cat: Catalogue): Step {
  const opt = (o: { label: string; query: Query }) => ({
    ...o,
    query: tidy(o.query, cat),
  });
  return {
    ...s,
    query: s.query ? tidy(s.query, cat) : null,
    alternatives: s.alternatives.map(opt),
    askBack: s.askBack
      ? { ...s.askBack, options: s.askBack.options.map(opt) }
      : null,
  };
}

/**
 * An ask-back with one option is not a question: answer that option (the model did this for
 * "what is the 2026 budget for infrastructure?" on 2026-11-12). Runs on cached steps too.
 * `{total}` is the only sentence: the option's label, as the reading, says what it is.
 */
export function soleOption(s: Step): Step {
  const only = s.action === 'askBack' ? s.askBack?.options : undefined;
  if (only?.length !== 1) return s;
  return {
    ...s,
    action: 'answer',
    query: only[0].query,
    reading: only[0].label || s.reading,
    sentences: ['{total}'],
    askBack: null,
  };
}

/** The same question on the documents that exist: for a year or kind the data does not have. */
export function onExisting(q: Query, cat: Catalogue): Query[] {
  const kinds = SOURCES[q.source].kinds;
  return cat.documents
    .filter((d) => kinds.includes(d.kind))
    .slice(0, 3)
    .map((d) => ({
      ...q,
      documents: [{ kind: d.kind, years: [d.year] }],
      dimensions: q.dimensions.filter((x) => x !== 'year' && x !== 'kind'),
    }));
}
