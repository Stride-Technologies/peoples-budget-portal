import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/index';
import { CacheService } from '../../cache/cache.service.js';
import {
  PUBLIC_REGISTRY_KEY_PREFIX,
  PUBLIC_REGISTRY_TTL_SECONDS,
} from '../../cache/cache.constants.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CatalogueService,
  NONE_ID,
  MULTI_FUND_ID,
  type Catalogue,
  type CatalogueDocument,
} from '../catalogue.service.js';
import {
  OTHER,
  passes,
  runQuery,
  type EngineResult,
  type QueryRecord,
} from './engine.js';
import type { Visibility } from '../sources.js';
import { fieldOf, SOURCES } from './fields.js';
import { applyCalcs } from './calcs.js';
import { loadRecords, scopeLabels } from './loaders.js';
import { termRecords } from './terms.js';
import {
  barangayLabel,
  CITY_POPULATION,
  populationOf,
  withBarangay,
} from './barangay.js';
import { splitOf, validateQuery, type Query } from './query.js';

export interface QueryColumn {
  field: string;
  label: string;
  role: 'dimension' | 'money' | 'count' | 'ratio' | 'rank';
}

const CALC_LABEL = {
  percentOfTotal: 'Share of total',
  differenceFromPrevious: 'Change from previous year',
  percentDifferenceFromPrevious: 'Change from previous year (%)',
  rank: 'Rank',
  runningTotal: 'Running total',
} as const;

export const MAX_PAGE = 200;

export interface QueryRows {
  columns: {
    field: string;
    label: string;
    role: 'dimension' | 'money';
    /** Made by the explorer, not the city's data (specs/020). */
    derived?: boolean;
  }[];
  /** Per field: an amount (string), a name (string), codes with labels, or null (not in this document). */
  rows: Record<
    string,
    string | null | { code: string | null; label: string }[]
  >[];
  /** A listed AIP program's projects and activities, by its id: the Records view expands them. */
  children?: Record<string, { id: string; name: string; amount: string }[]>;
  /** Records that passed the filters, before paging. */
  total: number;
  offset: number;
  size: number;
}

export interface QueryResult {
  catalogueVersion: string;
  query: Query;
  columns: QueryColumn[];
  /** Dimension cells are `{ code, label }`; measure cells decimal strings (counts as integers). */
  rows: {
    keys: { code: string | null; label: string }[];
    values: string[];
    /** One per `query.calcs`: a ratio (4 decimals), an amount, a rank, or null (a first year). */
    calcs: (string | null)[];
  }[];
  other: { label: string; values: string[]; n: number } | null;
  /** Null when a breakdown can hold a record more than once (themes, topics) or kinds/years differ. */
  totals: string[] | null;
  /** Records that passed the filters. */
  n: number;
  documents: { kind: string; year: number; label: string; draft: boolean }[];
}

type Stored = {
  dims: QueryRecord['dims'];
  money: Record<string, string | null>;
};
const store = (r: QueryRecord): Stored => ({
  dims: r.dims,
  money: Object.fromEntries(
    Object.entries(r.money).map(([k, v]) => [k, v?.toFixed(2) ?? null]),
  ),
});
const restore = (r: Stored): QueryRecord => ({
  dims: r.dims,
  money: Object.fromEntries(
    Object.entries(r.money).map(([k, v]) => [
      k,
      v === null ? null : new Prisma.Decimal(v),
    ]),
  ),
});

const KIND_LABEL: Record<string, string> = {
  aip: 'AIP (plan)',
  lep: 'LEP (proposed)',
  ordinance: 'Ordinance (enacted)',
};

/**
 * One server computation for every figure the workspace, the chat and the
 * exports show (redesign P2). Records are cached per catalogue version,
 * source, document and split through CacheService.
 */
/**
 * Bumped whenever a loader's record gains or loses a field: records are cached
 * per catalogue version, which a code deploy does not change, so without this
 * the cache would serve the old shape until it expired. 2: `parentId` on
 * activities (specs/020).
 */
const RECORDS_SHAPE = 2;

@Injectable()
export class QueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly catalogue: CatalogueService,
  ) {}

  async run(q: Query): Promise<QueryResult> {
    const cat = await this.catalogue.get();
    const { res, all, docs } = await this.aggregate(q, cat);
    const mixed = docs.length > 1; // several years or kinds: never one total
    const totals = mixed || !res.additive ? null : res.totals;
    // Calculations run over every group, then follow the rows shown: the
    // smallest of 40 offices is rank 40, not rank 3 of the 3 on screen.
    const fullCalcs = applyCalcs(all, q.calcs ?? [], q.dimensions, totals);
    const byKeys = new Map(
      all.map((r, i) => [JSON.stringify(r.keys), fullCalcs[i]]),
    );
    const calcs = res.rows.map((r) => byKeys.get(JSON.stringify(r.keys)) ?? []);

    const label = this.labeller(q, cat);
    return {
      catalogueVersion: cat.version,
      query: q,
      columns: [
        ...q.dimensions.map((f) => ({
          field: f,
          label: fieldOf(q.source, f)!.label,
          role: 'dimension' as const,
        })),
        ...q.measures.map((m) => ({
          field: m.agg === 'count' ? 'count' : m.field,
          label:
            m.agg === 'count'
              ? 'Number of rows'
              : m.agg === 'countDistinct'
                ? `Number of ${fieldOf(q.source, m.field)!.label.toLowerCase()}s`
                : m.agg === 'perCapita'
                  ? `${fieldOf(q.source, m.field)!.label} per resident`
                  : fieldOf(q.source, m.field)!.label,
          role:
            m.agg === 'count' || m.agg === 'countDistinct'
              ? ('count' as const)
              : ('money' as const),
        })),
        ...(q.calcs ?? []).map((c) => ({
          field: `${c.type}:m${c.measure}`,
          label: CALC_LABEL[c.type],
          role:
            c.type === 'rank'
              ? ('rank' as const)
              : c.type === 'percentOfTotal' ||
                  c.type === 'percentDifferenceFromPrevious'
                ? ('ratio' as const)
                : ('money' as const),
        })),
      ],
      rows: res.rows.map((r, i) => ({
        calcs: calcs[i],
        keys: r.keys.map((k, i) => ({
          code: k,
          label: label(q.dimensions[i], k),
        })),
        values: r.values,
      })),
      other: res.other
        ? {
            label: `Other (${res.other.n})`,
            values: res.other.values,
            n: res.other.n,
          }
        : null,
      totals,
      n: res.n,
      documents: docs.map((d) => ({
        kind: d.kind,
        year: d.year,
        label: d.label,
        draft: !!d.draft,
      })),
    };
  }

  /**
   * The data grid (W3, grain `rows`): the records that pass the filters, one
   * per program / PPA / line, every public field labelled, sorted (by a field
   * or the amount, largest first) and paged. Nothing is added up.
   */
  async rows(
    q: Query,
    page: { offset: number; size: number },
  ): Promise<QueryRows> {
    const cat = await this.catalogue.get();
    const errors = validateQuery(q, cat, 'rows');
    if (errors.length)
      throw new BadRequestException({ message: 'Invalid query.', errors });
    const size = Math.min(Math.max(page.size, 1), MAX_PAGE);
    const offset = Math.max(page.offset, 0);
    const docs = q.documents.flatMap((d) =>
      d.years.map(
        (y) => cat.documents.find((c) => c.kind === d.kind && c.year === y)!,
      ),
    );
    const kept = (
      await Promise.all(
        docs.map((d) => this.records(q.source, d, cat, null, 'public')),
      )
    )
      .flat()
      .filter((r) => q.filters.every((f) => passes(r, f)))
      // Words are several records per row: Records lists each row once (specs/020).
      .filter(
        (r, i, all) =>
          q.source !== 'terms' ||
          all.findIndex((x) => x.dims.rowId === r.dims.rowId) === i,
      );
    const by = q.sort?.by ?? 'amount';
    const dir = q.sort?.dir === 'asc' ? 1 : -1;
    const fields = SOURCES[q.source].fields;
    const isMoney = fields.find((f) => f.id === by)?.role === 'money';
    kept.sort((a, b) => {
      if (isMoney) {
        const x = a.money[by];
        const y = b.money[by];
        if (!x || !y) return x ? -1 : y ? 1 : 0; // no figure sorts last
        return dir * x.comparedTo(y);
      }
      return (
        dir *
        String(a.dims[by] ?? '').localeCompare(String(b.dims[by] ?? ''), 'en', {
          numeric: true,
        })
      );
    });
    const label = this.labeller(
      {
        ...q,
        dimensions: fields
          .filter((f) => f.role === 'dimension')
          .map((f) => f.id),
      },
      cat,
    );
    const shown = kept.slice(offset, offset + size);
    return {
      columns: fields.map((f) => ({
        field: f.id,
        label: f.label,
        role: f.role,
        ...(f.derived ? { derived: true } : {}),
      })),
      children: await this.childrenOf(q, docs, cat, shown),
      rows: shown.map((r) => {
        type Cell = QueryRows['rows'][number][string];
        const cell = (f: (typeof fields)[number]): Cell => {
          if (f.role === 'money') return r.money[f.id]?.toFixed(2) ?? null;
          const v = r.dims[f.id];
          if (v === undefined) return null;
          const list = Array.isArray(v) ? v : [v];
          return f.type === 'text'
            ? (list[0] ?? null)
            : list.map((c) => ({ code: c, label: label(f.id, c) }));
        };
        return Object.fromEntries<Cell>([
          // The record's own id, for a link to its page (the chat's PPA list).
          ['id', typeof r.dims.rowId === 'string' ? r.dims.rowId : null],
          // An activity's program, for its page link.
          [
            'parentId',
            typeof r.dims.parentId === 'string' ? r.dims.parentId : null,
          ],
          ...fields.map((f): [string, Cell] => [f.id, cell(f)]),
        ]);
      }),
      total: kept.length,
      offset,
      size,
    };
  }

  /**
   * The projects and activities under each listed AIP program, largest first:
   * what Records expands a program into. Only for AIP program rows (a book's
   * PPAs are already its top level, and their parts are not a source yet).
   */
  private async childrenOf(
    q: Query,
    docs: CatalogueDocument[],
    cat: Catalogue,
    shown: QueryRecord[],
  ): Promise<QueryRows['children']> {
    if (q.source !== 'aip-programs' && q.source !== 'terms') return undefined;
    const ids = new Set(shown.map((r) => String(r.dims.rowId)));
    const out: NonNullable<QueryRows['children']> = {};
    for (const d of docs.filter((x) => x.kind === 'aip')) {
      for (const a of await this.records(
        'aip-activities',
        d,
        cat,
        null,
        'public',
      )) {
        const p = String(a.dims.parentId);
        if (!ids.has(p)) continue;
        (out[p] ??= []).push({
          id: String(a.dims.rowId),
          name: typeof a.dims.name === 'string' ? a.dims.name : '',
          amount: (a.money.amount ?? new Prisma.Decimal(0)).toFixed(2),
        });
      }
    }
    for (const list of Object.values(out))
      list.sort((x, y) => new Prisma.Decimal(y.amount).comparedTo(x.amount));
    return out;
  }

  /**
   * The engine's result in codes, before labels — what `run` and the old
   * view grammar (`ViewService`) both build on, so they cannot disagree.
   */
  async aggregate(
    q: Query,
    cat: Catalogue,
    visibility: Visibility = 'public',
  ): Promise<{
    res: EngineResult;
    all: EngineResult['rows'];
    docs: CatalogueDocument[];
  }> {
    const errors = validateQuery(q, cat);
    if (errors.length)
      throw new BadRequestException({ message: 'Invalid query.', errors });
    const split = splitOf(q);
    const docs = q.documents.flatMap((d) =>
      d.years.map(
        (y) => cat.documents.find((c) => c.kind === d.kind && c.year === y)!,
      ),
    );
    const records = (
      await Promise.all(
        docs.map((d) => this.records(q.source, d, cat, split, visibility)),
      )
    ).flat();
    const multi = (f: string) => !!fieldOf(q.source, f)?.multi;
    const at = q.dimensions.indexOf('barangay');
    const per = (keys: (string | null)[]) =>
      keys.length
        ? at >= 0
          ? populationOf(keys[at])
          : null
        : new Prisma.Decimal(CITY_POPULATION);
    const res = runQuery(scopeLabels(records, q), q, multi, per);
    return {
      res,
      // Every group, for table calculations (only computed when asked for).
      all:
        q.calcs?.length && q.limit
          ? runQuery(
              scopeLabels(records, q),
              { ...q, limit: undefined },
              multi,
              per,
            ).rows
          : res.rows,
      docs,
    };
  }

  private async records(
    source: Query['source'],
    doc: CatalogueDocument,
    cat: Catalogue,
    split: ReturnType<typeof splitOf>,
    visibility: Visibility,
  ): Promise<QueryRecord[]> {
    // Words are read from names after the cache too (specs/020 A4), from the
    // document's own rows: AIP programs, or a book's PPAs.
    if (source === 'terms')
      return termRecords(
        await this.records(
          doc.kind === 'aip' ? 'aip-programs' : 'budget-ppas',
          doc,
          cat,
          split,
          visibility,
        ),
      );
    // Barangays are read from names after the cache, every time (specs/020 A3).
    return withBarangay(
      source,
      await this.cachedRecords(source, doc, cat, split, visibility),
    );
  }

  private async cachedRecords(
    source: Query['source'],
    doc: CatalogueDocument,
    cat: Catalogue,
    split: ReturnType<typeof splitOf>,
    visibility: Visibility,
  ): Promise<QueryRecord[]> {
    // Staff reads live rows and is never cached (as ViewService always did).
    if (visibility === 'staff')
      return loadRecords(this.prisma, source, doc, cat, split, 'staff');
    const key = `${PUBLIC_REGISTRY_KEY_PREFIX}explorer:q:${RECORDS_SHAPE}:${cat.version}:${source}:${doc.kind}:${doc.year}:${split ?? '-'}`;
    const stored = await this.cache.getOrSet(
      key,
      PUBLIC_REGISTRY_TTL_SECONDS,
      async () =>
        (await loadRecords(this.prisma, source, doc, cat, split)).map(store),
    );
    return stored.map(restore);
  }

  /** Code → what people read: catalogue labels, FY years, document names. */
  private labeller(q: Query, cat: Catalogue) {
    const maps = new Map<string, Map<string, string>>();
    for (const f of q.dimensions) {
      const def = fieldOf(q.source, f);
      if (def?.catalogue)
        maps.set(
          f,
          new Map(cat.dimensions[def.catalogue].map((v) => [v.id, v.label])),
        );
    }
    return (field: string, code: string | null): string => {
      if (code === null || code === NONE_ID) return 'Not specified';
      if (code === OTHER) return 'Other';
      if (code === MULTI_FUND_ID) return 'Several funds (not split)';
      if (field === 'year') return `FY${code}`;
      if (field === 'barangay') return barangayLabel(code);
      if (field === 'kind') return KIND_LABEL[code] ?? code;
      if (field === 'incomeClass')
        return code === 'RECURRING'
          ? 'Recurring income'
          : code === 'NON_RECURRING'
            ? 'Non-recurring income'
            : code;
      return maps.get(field)?.get(code) ?? code;
    };
  }
}

export const sourceList = () =>
  Object.values(SOURCES).map(({ id, label, grain, kinds, fields }) => ({
    id,
    label,
    grain,
    kinds,
    fields,
  }));
