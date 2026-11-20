import type { Compound } from './phrases.js';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { BudgetDocumentKind, FundSource } from '../generated/prisma/index';
import { CacheService } from '../cache/cache.service.js';
import {
  PUBLIC_REGISTRY_KEY_PREFIX,
  PUBLIC_REGISTRY_TTL_SECONDS,
} from '../cache/cache.constants.js';
import { FUND_SOURCE_NAMES } from '../open-data/open-data.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PUBLIC_ANNUAL_DOCUMENT } from '../public/ordinance-registry.js';
import { explorerIncludesDrafts } from './explorer.config.js';
import { loadAipRows, loadDocumentRows, type Row } from './sources.js';
import {
  RULE_KINDS,
  topicsOf,
  type RowCodes,
  type TopicRule,
} from './topics.js';
import { UNCLASSIFIED } from './labels/taxonomy.js';
import type { Dimension, DocumentKind, ExplorerView } from './view.js';

export type Lang = 'en' | 'fil' | 'bcl';

export interface CatalogueDocument {
  kind: DocumentKind;
  year: number;
  cycleId: string;
  /** The BudgetDocument for `lep` / `ordinance`; the AIP has none. */
  documentId: string | null;
  label: string;
  /** What the figure is called on this document (ARCHITECTURE-ESSENTIALS). */
  moneyWord: 'Estimated cost' | 'Proposed budget' | 'Appropriation';
  /** What `count` counts on this document. */
  countWord: 'programs' | 'PPAs';
  /** Not public: a draft book shown only where EXPLORER_INCLUDE_DRAFTS is on (W15). */
  draft?: true;
}

export interface DimensionValue {
  /** Stable, readable, environment-independent: `CHO`, `GF`, `PS`, `fl-3`. */
  id: string;
  label: string;
  sublabel?: string;
  /** Database ids this value stands for (several for a lineage of offices). */
  dbIds: string[];
  /** How people say it, per language — the AI's and the card matcher's vocabulary. */
  aliases: Partial<Record<Lang, string[]>>;
  /** Decorative identity colour (finish lines); never the only signal. */
  accent?: string | null;
  /** Office only: its cluster value id. */
  clusterId?: string;
  /** Sub-label only: its label's value id. */
  parentId?: string;
}

export interface Card {
  id: string;
  question: Partial<Record<Lang, string>>;
  view: ExplorerView;
  tags: string[];
}

export interface Catalogue {
  version: string;
  documents: CatalogueDocument[];
  dimensions: Record<Dimension, DimensionValue[]>;
  /** Each listed topic's rules (redesign W16); membership is derived per read. */
  topicRules: Record<string, TopicRule[]>;
  /** Reviewed compounds that must not trigger a topic or label (`explorer-compounds.json`, decision #16). */
  compounds: Compound[];
  cards: Card[];
}

/** Rows with no value on a dimension gather here; never filterable. */
export const NONE_ID = '_none';
/** An unsplit multi-fund row's bucket on a by-fund chart (invariant 21). */
export const MULTI_FUND_ID = '_multi';

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();

// The API runs from `api/` (nest start, the Docker image, jest), as the upload dir does.
const DATA_DIR = join(process.cwd(), 'prisma', 'data');
const readJson = <T>(name: string, fallback: T): T => {
  const file = join(DATA_DIR, name);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as T)
    : fallback;
};

type AliasFile = Partial<
  Record<Dimension, Record<string, Partial<Record<Lang, string[]>>>>
>;

const KEY = `${PUBLIC_REGISTRY_KEY_PREFIX}explorer:catalogue`;

const ANNUAL_SELECT = {
  id: true,
  kind: true,
  budgetCycle: {
    select: { fiscalYear: true, aipCycle: { select: { id: true } } },
  },
} as const;

/**
 * What the explorer may show (specs/018 design §2): the public years of each
 * document, every dimension's values with stable codes and multilingual
 * aliases, and the curated question cards. Built from the database, cached
 * under the public-registry prefix (publishing invalidates it; the TTL is the
 * safety net), and versioned by content so every
 * view response and cache key can say which catalogue it was computed with.
 */
@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  get(): Promise<Catalogue> {
    return this.cache.getOrSet(KEY, PUBLIC_REGISTRY_TTL_SECONDS, () =>
      this.build(),
    );
  }

  /**
   * Which document kinds a year shows. `aip` = at least one public program;
   * `ordinance` / `lep` = whatever `PUBLIC_ANNUAL_DOCUMENT` makes public (an
   * enacted ordinance; a historical year's submitted LEP, specs/017) — the
   * one predicate every public read uses, never a copy of it. With
   * `EXPLORER_INCLUDE_DRAFTS=1` (dev only, redesign W15) every other LEP and
   * ordinance joins, labelled "(draft)".
   */
  private async publicDocuments(): Promise<CatalogueDocument[]> {
    // Any year with published data, whether or not its open data download is on
    // (decisions.md R6, amended 2026-11-09): the explorer shows what the site shows.
    const annualKinds = [BudgetDocumentKind.ORDINANCE, BudgetDocumentKind.LEP];
    const [cycles, published, drafts] = await Promise.all([
      this.prisma.aIPCycle.findMany({
        select: {
          id: true,
          fiscalYear: true,
          _count: {
            select: {
              programs: {
                where: {
                  deletedAt: null,
                  status: { not: 'ARCHIVED' },
                  publishedVersionId: { not: null },
                },
              },
            },
          },
        },
        orderBy: { fiscalYear: 'desc' },
      }),
      this.prisma.budgetDocument.findMany({
        where: PUBLIC_ANNUAL_DOCUMENT,
        select: ANNUAL_SELECT,
      }),
      explorerIncludesDrafts()
        ? this.prisma.budgetDocument.findMany({
            where: { kind: { in: annualKinds } },
            select: ANNUAL_SELECT,
          })
        : Promise.resolve([]),
    ]);
    const docs: CatalogueDocument[] = cycles
      .filter((c) => c._count.programs > 0)
      .map((c) => ({
        kind: 'aip' as const,
        year: c.fiscalYear,
        cycleId: c.id,
        documentId: null,
        label: `FY${c.fiscalYear} Annual Investment Program`,
        moneyWord: 'Estimated cost' as const,
        countWord: 'programs' as const,
      }));
    const publicIds = new Set(published.map((d) => d.id));
    const seen = new Set<string>();
    for (const d of [...published, ...drafts]) {
      const kind = d.kind === BudgetDocumentKind.LEP ? 'lep' : 'ordinance';
      const year = d.budgetCycle.fiscalYear;
      // One document per kind and year; a published one wins over a draft.
      if (seen.has(`${kind}:${year}`)) continue;
      seen.add(`${kind}:${year}`);
      const draft = publicIds.has(d.id) ? '' : ' (draft)';
      docs.push({
        kind,
        year,
        cycleId: d.budgetCycle.aipCycle?.id ?? '',
        documentId: d.id,
        label:
          kind === 'lep'
            ? `FY${year} Proposed Budget (LEP)${draft}`
            : `FY${year} Annual Budget (ordinance)${draft}`,
        moneyWord: kind === 'lep' ? 'Proposed budget' : 'Appropriation',
        countWord: 'PPAs',
        ...(draft ? { draft: true as const } : {}),
      });
    }
    return docs.sort((a, b) => b.year - a.year);
  }

  private async build(): Promise<Catalogue> {
    const aliasFile = readJson<AliasFile>('explorer-aliases.json', {});
    const withAliases = (
      dim: Dimension,
      v: Omit<DimensionValue, 'aliases'>,
      auto: string[],
    ): DimensionValue => ({
      ...v,
      aliases: { en: [...new Set(auto)], ...(aliasFile[dim]?.[v.id] ?? {}) },
    });

    const [
      documents,
      offices,
      sectors,
      finishLines,
      subFinishLines,
      clusters,
      tags,
      topicRows,
      labelRows,
      labelUse,
      labelStamp,
    ] = await Promise.all([
      this.publicDocuments(),
      this.prisma.office.findMany({
        select: {
          id: true,
          acronym: true,
          name: true,
          lineageId: true,
          isActive: true,
          cluster: { select: { name: true } },
        },
        orderBy: { acronym: 'asc' },
      }),
      this.prisma.pAPSector.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.finishLine.findMany({
        select: {
          id: true,
          name: true,
          fullName: true,
          shortName: true,
          visionNumber: true,
          color: true,
        },
        orderBy: { visionNumber: 'asc' },
      }),
      this.prisma.subFinishLine.findMany({
        select: { id: true, code: true, name: true, finishLineId: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.cluster.findMany({
        select: { id: true, name: true, fullName: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.thematicTag.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      // Approved topics; drafts too where drafts are on (dev, W15/W16).
      this.prisma.explorerTopic.findMany({
        where: explorerIncludesDrafts() ? {} : { status: 'approved' },
        select: {
          id: true,
          label: true,
          description: true,
          aliases: true,
          rules: { select: { kind: true, value: true } },
        },
        orderBy: { label: 'asc' },
      }),
      // Labels (W22–W24): approved; drafts too where drafts are on (dev).
      this.prisma.explorerLabel.findMany({
        where: explorerIncludesDrafts() ? {} : { status: 'approved' },
        select: {
          id: true,
          parentId: true,
          label: true,
          definition: true,
          aliases: true,
        },
        orderBy: { orderIndex: 'asc' },
      }),
      this.prisma.explorerAnnotation.groupBy({
        by: ['labelId'],
        where: { inReview: false },
        _count: { _all: true },
      }),
      // A new labelling run or review changes what the cached records say.
      this.prisma.explorerRow.aggregate({
        _max: { labelledAt: true, reviewedAt: true },
        _count: { _all: true },
      }),
    ]);

    // An office keeps one line across years: every office in a lineage folds
    // into the surviving row (R7). Retired offices without a lineage still get
    // a value — their past years' money has to land somewhere honest.
    // ponytail: cluster is the office's *current* cluster; freeze it per year
    // when the city reorganises clusters (R11).
    // Only values the public data actually uses (Phase 0 finding 3): a picker
    // that offers an empty sector or a test tag answers "Nothing matches".
    // ponytail: built from public rows, so a staff read could meet a value
    // missing here — it lands under "Not specified"; widen when staff mode lands.
    const rows = (
      await Promise.all(
        documents.map((d) =>
          d.kind === 'aip'
            ? loadAipRows(this.prisma, d.cycleId, 'public')
            : loadDocumentRows(this.prisma, d.documentId!),
        ),
      )
    ).flat();
    const used = usedValues(rows);
    const byId = new Map(offices.map((o) => [o.id, o]));
    const lineageOf = (o: (typeof offices)[number]) =>
      (o.lineageId && byId.get(o.lineageId)) || o;
    const lineages = new Map<string, (typeof offices)[number][]>();
    for (const o of offices) {
      const root = lineageOf(o);
      lineages.set(root.id, [...(lineages.get(root.id) ?? []), o]);
    }
    const office: DimensionValue[] = [...lineages.entries()]
      .filter(([, members]) => members.some((m) => used.office.has(m.id)))
      .map(([rootId, members]) => {
        const root = byId.get(rootId)!;
        return withAliases(
          'office',
          {
            // The id stays the acronym (URLs, aliases); people read the name.
            id: root.acronym,
            label: root.name,
            sublabel: root.acronym,
            dbIds: members.map((m) => m.id),
            clusterId: slug(root.cluster.name),
          },
          members.flatMap((m) => [m.acronym, m.name]),
        );
      });
    const clustersUsed = new Set(office.map((o) => o.clusterId));

    const dimensions: Record<Dimension, DimensionValue[]> = {
      office,
      sector: sectors
        .filter((s) => used.sector.has(s.id))
        .map((s) =>
          withAliases('sector', { id: s.code, label: s.name, dbIds: [s.id] }, [
            s.name,
          ]),
        ),
      fund: Object.values(FundSource)
        .filter((f) => used.fund.has(f))
        .map((f) =>
          withAliases(
            'fund',
            {
              id: f,
              label: FUND_SOURCE_NAMES[f] ?? f,
              sublabel: f,
              dbIds: [f],
            },
            [f, FUND_SOURCE_NAMES[f] ?? f],
          ),
        ),
      finishLine: finishLines
        .filter((f) => used.finishLine.has(f.id))
        .map((f) =>
          withAliases(
            'finishLine',
            {
              id: f.visionNumber ? `fl-${f.visionNumber}` : slug(f.name),
              label: f.shortName ?? f.name,
              sublabel: f.fullName,
              dbIds: [f.id],
              accent: f.color,
            },
            [f.name, f.fullName, ...(f.shortName ? [f.shortName] : [])],
          ),
        ),
      subFinishLine: subFinishLines
        .filter((s) => used.subFinishLine.has(s.id))
        .map((s) =>
          withAliases(
            'subFinishLine',
            { id: s.code, label: s.name, dbIds: [s.id] },
            [s.name],
          ),
        ),
      cluster: clusters
        .filter((c) => clustersUsed.has(slug(c.name)))
        .map((c) =>
          withAliases(
            'cluster',
            {
              id: slug(c.name),
              label: c.name,
              sublabel: c.fullName ?? undefined,
              dbIds: [c.id],
            },
            [c.name, ...(c.fullName ? [c.fullName] : [])],
          ),
        ),
      theme: tags
        .filter((t) => used.theme.has(t.id))
        .map((t) =>
          withAliases(
            'theme',
            { id: slug(t.name), label: t.name, dbIds: [t.id] },
            [t.name],
          ),
        ),
      expenseClass: (
        [
          ['PS', 'Personnel Services'],
          ['MOOE', 'Maintenance and Other Operating Expenses'],
          ['FE', 'Financial Expenses'],
          ['CO', 'Capital Outlay'],
        ] as const
      )
        .filter(([id]) => used.expenseClass.has(id))
        .map(([id, label]) =>
          withAliases(
            'expenseClass',
            { id, label, sublabel: id, dbIds: [id] },
            [id, label],
          ),
        ),
      topic: [],
      ...labelDimensions(labelRows, labelUse),
    };

    // Topics (W16): listed only when some public row falls in them.
    const allRules: Record<string, TopicRule[]> = Object.fromEntries(
      topicRows.map((t) => [
        t.id,
        t.rules
          .filter((r) => (RULE_KINDS as readonly string[]).includes(r.kind))
          .map((r) => ({ kind: r.kind as TopicRule['kind'], value: r.value })),
      ]),
    );
    const compounds =
      readJson<{ compounds?: Compound[] }>('explorer-compounds.json', {})
        .compounds ?? [];
    const inTopics = topicsOf(allRules, rowCoder({ dimensions }), compounds);
    const usedTopics = new Set(rows.flatMap(inTopics));
    dimensions.topic = topicRows
      .filter((t) => usedTopics.has(t.id))
      .map((t) => {
        const aliases = (t.aliases ?? {}) as Partial<Record<Lang, string[]>>;
        return {
          id: t.id,
          label: t.label,
          ...(t.description ? { sublabel: t.description } : {}),
          dbIds: [],
          aliases: {
            ...aliases,
            en: [...new Set([t.label, ...(aliases.en ?? [])])],
          },
        };
      });
    const topicRules = Object.fromEntries(
      dimensions.topic.map((v) => [v.id, allRules[v.id]]),
    );

    const cards = readJson<Card[]>('explorer-cards.json', []).filter((card) =>
      card.view.series.every((s) =>
        s.years.every((y) =>
          documents.some((d) => d.kind === s.document && d.year === y),
        ),
      ),
    );

    const version = createHash('sha256')
      .update(
        JSON.stringify({
          documents,
          ids: Object.fromEntries(
            Object.entries(dimensions).map(([k, v]) => [k, v.map((x) => x.id)]),
          ),
          cards: cards.map((c) => c.id),
          topicRules,
          // A reviewed compound changes topic membership, so it changes the version
          // (and with it every cached record and prepared match index).
          compounds,
          labelStamp,
        }),
      )
      .digest('hex')
      .slice(0, 16);

    return { version, documents, dimensions, topicRules, compounds, cards };
  }
}

type LabelRow = {
  id: string;
  parentId: string | null;
  label: string;
  definition: string;
  aliases: unknown;
};

/**
 * The label and sub-label values (W22–W25): a label is listed when it or one
 * of its sub-labels is on a live row; a sub-label only under a listed label.
 * "Not classified" closes the list whenever anything is labelled, so a theme
 * chart still adds up and shows its gap (W25).
 */
export function labelDimensions(
  rows: LabelRow[],
  use: { labelId: string; _count: { _all: number } }[],
): Pick<Record<Dimension, DimensionValue[]>, 'label' | 'subLabel'> {
  const used = new Set(
    use.filter((u) => u._count._all > 0).map((u) => u.labelId),
  );
  const value = (r: LabelRow, parent?: LabelRow): DimensionValue => {
    const aliases = (r.aliases ?? {}) as Partial<Record<Lang, string[]>>;
    return {
      id: r.id,
      label: r.label,
      sublabel: parent ? parent.label : r.definition,
      dbIds: [r.id],
      aliases: {
        ...aliases,
        en: [...new Set([r.label, ...(aliases.en ?? [])])],
      },
      ...(parent ? { parentId: parent.id } : {}),
    };
  };
  const tops = rows.filter((r) => !r.parentId);
  const listed = tops.filter(
    (t) =>
      used.has(t.id) || rows.some((s) => s.parentId === t.id && used.has(s.id)),
  );
  const label = listed.map((t) => value(t));
  if (used.size)
    label.push({
      id: UNCLASSIFIED,
      label: 'Not classified',
      sublabel: 'No evidence in the row for any label',
      dbIds: [],
      aliases: { en: ['not classified', 'unclassified'] },
    });
  const subLabel = listed.flatMap((t) =>
    rows
      .filter((s) => s.parentId === t.id && used.has(s.id))
      .map((s) => value(s, t)),
  );
  return { label, subLabel };
}

/**
 * Which values the rows use, per dimension: database ids for office, sector,
 * finish lines and themes; codes for fund and expense class (a class counts
 * only when some row has money in it — FE shows only when non-zero).
 */
export function usedValues(rows: Row[]) {
  const used = {
    office: new Set<string>(),
    sector: new Set<string>(),
    finishLine: new Set<string>(),
    subFinishLine: new Set<string>(),
    theme: new Set<string>(),
    fund: new Set<string>(),
    expenseClass: new Set<string>(),
  };
  const put = (set: Set<string>, v: string | null) => v && set.add(v);
  for (const r of rows) {
    put(used.office, r.officeId);
    put(used.sector, r.sectorId);
    put(used.finishLine, r.finishLineId);
    put(used.subFinishLine, r.subFinishLineId);
    r.themeIds.forEach((t) => used.theme.add(t));
    for (const [fund, v] of Object.entries(r.byFund))
      if (fund !== MULTI_FUND_ID && !v.isZero()) used.fund.add(fund);
    for (const [cls, v] of [
      ['PS', r.money.ps],
      ['MOOE', r.money.mooe],
      ['FE', r.money.fe],
      ['CO', r.money.co],
    ] as const)
      if (!v.isZero()) used.expenseClass.add(cls);
  }
  return used;
}

/** Database ids behind a list of value codes; unknown codes are dropped (the validator has already refused them). */
export function dbIdsOf(
  cat: Pick<Catalogue, 'dimensions'>,
  dim: Dimension,
  codes: string[],
): Set<string> {
  const byCode = new Map(cat.dimensions[dim].map((v) => [v.id, v.dbIds]));
  return new Set(codes.flatMap((c) => byCode.get(c) ?? []));
}

/** Value code for a database id on a dimension, or `_none`. */
export function codeOf(
  cat: Pick<Catalogue, 'dimensions'>,
  dim: Dimension,
): (dbId: string | null | undefined) => string {
  const map = new Map<string, string>();
  for (const v of cat.dimensions[dim])
    for (const id of v.dbIds) map.set(id, v.id);
  return (dbId) => (dbId ? (map.get(dbId) ?? NONE_ID) : NONE_ID);
}

/** A row's catalogue codes (office, its cluster, sector, finish line, themes, funds, name). */
export function rowCoder(
  cat: Pick<Catalogue, 'dimensions'>,
): (r: Row) => RowCodes {
  const office = codeOf(cat, 'office');
  const sector = codeOf(cat, 'sector');
  const finishLine = codeOf(cat, 'finishLine');
  const theme = codeOf(cat, 'theme');
  const clusterOf = new Map(
    cat.dimensions.office.map((o) => [o.id, o.clusterId ?? NONE_ID]),
  );
  return (r) => {
    const o = office(r.officeId);
    return {
      office: o,
      cluster: clusterOf.get(o) ?? NONE_ID,
      sector: sector(r.sectorId),
      finishLine: finishLine(r.finishLineId),
      themes: r.themeIds.map(theme),
      funds: Object.keys(r.byFund).filter((f) => f !== MULTI_FUND_ID),
      label: r.label,
    };
  };
}
