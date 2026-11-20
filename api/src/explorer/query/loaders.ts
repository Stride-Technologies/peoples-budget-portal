/**
 * Rows of one document → engine records, per source (specs/018 redesign P2).
 * Programs and book PPAs reuse `sources.ts`, so their figures keep every
 * invariant the explorer already proves (`explorer.check.ts`). A record's
 * dimension values are catalogue codes; labels are the service's job.
 */
import { FundSource, Prisma } from '../../generated/prisma/index';
import {
  attribute,
  moneyRows,
  toSheetProgram,
  type Costed,
} from '../../aip-registry/lbp-figures.js';
import { ZERO } from '../../aip-registry/excel-style.js';
import {
  LIVE_PROGRAM,
  PUBLICLY_VISIBLE,
} from '../../programs/program-filters.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import {
  codeOf,
  MULTI_FUND_ID,
  NONE_ID,
  rowCoder,
  type Catalogue,
  type CatalogueDocument,
} from '../catalogue.service.js';
import {
  loadAipRows,
  loadDocumentRows,
  type Row,
  type Visibility,
} from '../sources.js';
import { UNCLASSIFIED } from '../labels/taxonomy.js';
import { topicsOf } from '../topics.js';
import type { QueryRecord } from './engine.js';
import type { SourceId } from './fields.js';
import type { Query } from './query.js';

/** Which money split a query asks for, if any (design: "Money splits"). */
export type Split = 'fund' | 'expenseClass' | null;

const CLASSES = ['ps', 'mooe', 'fe', 'co'] as const;
const CLASS_CODE = { ps: 'PS', mooe: 'MOOE', fe: 'FE', co: 'CO' } as const;

/** Programs and PPAs: one record per row, or one per (row, fund | class) when split. */
export function rowRecords(
  rows: Row[],
  doc: CatalogueDocument,
  cat: Catalogue,
  split: Split,
): QueryRecord[] {
  const code = rowCoder(cat);
  const topics = topicsOf(cat.topicRules, code, cat.compounds);
  return rows.flatMap((r): QueryRecord[] => {
    const c = code(r);
    const dims = {
      rowId: r.id,
      year: String(doc.year),
      kind: doc.kind,
      office: c.office,
      cluster: c.cluster,
      sector: c.sector,
      finishLine: c.finishLine,
      subFinishLine: codeOf(cat, 'subFinishLine')(r.subFinishLineId),
      theme: c.themes,
      topic: topics(r),
      name: r.label,
    };
    // A split always adds back up to the row: whatever its parts leave over
    // (a book's money with no class; a row whose fund lines fall short — dev
    // has one, ₱40,000) lands in "Not specified" rather than vanishing.
    const parts = (
      entries: [string, Prisma.Decimal][],
      key: 'fund' | 'expenseClass',
    ) => {
      const rest = entries.reduce((acc, [, v]) => acc.minus(v), r.money.total);
      return [
        ...entries,
        ...(rest.isZero() ? [] : [[NONE_ID, rest] as [string, Prisma.Decimal]]),
      ].map(([k, v]) => ({
        dims: { ...dims, [key]: k },
        money: { amount: v, ps: null, mooe: null, fe: null, co: null },
      }));
    };
    if (split === 'fund') return parts(Object.entries(r.byFund), 'fund');
    if (split === 'expenseClass')
      return parts(
        CLASSES.filter((k) => !r.money[k].isZero()).map((k) => [
          CLASS_CODE[k],
          r.money[k],
        ]),
        'expenseClass',
      );
    return [
      {
        dims: {
          ...dims,
          fund: Object.keys(r.byFund).filter((f) => f !== MULTI_FUND_ID),
        },
        money: {
          amount: r.money.total,
          ps: r.money.ps,
          mooe: r.money.mooe,
          fe: r.money.fe,
          co: r.money.co,
        },
      },
    ];
  });
}

const dec = (v: Prisma.Decimal | null | undefined) => v ?? null;

/** Account lines of a book: already one record per (office, account, class, fund). */
async function objectLineRecords(
  prisma: PrismaService,
  doc: CatalogueDocument,
  cat: Catalogue,
): Promise<QueryRecord[]> {
  const office = codeOf(cat, 'office');
  const clusterOf = new Map(
    cat.dimensions.office.map((o) => [o.id, o.clusterId ?? null]),
  );
  const lines = await prisma.budgetObjectLine.findMany({
    where: { documentId: doc.documentId! },
    select: {
      id: true,
      officeId: true,
      expenseClass: true,
      fundSource: true,
      accountTitle: true,
      uacsCode: true,
      amount: true,
      pastYearActual: true,
      currentYearTotal: true,
      // The real acronym: SPAF is retired (specs/016), so it has no catalogue code.
      office: { select: { acronym: true } },
    },
  });
  return lines.flatMap((l) => {
    const o = office(l.officeId);
    // SPA's sheet repeats the LDF and LDRRMF sheets as two code-less lines
    // (specs/016: "not rows"). The PPA import leaves them out; the object-line
    // import does not yet, which put ₱351M twice into the FY2026 ordinance.
    // ponytail: matched by office + no account code + title; the importer
    // should drop them (follow-up), then this goes.
    if (
      l.office.acronym === 'SPAF' &&
      !l.uacsCode &&
      SPA_ROLLUP.test(l.accountTitle ?? '')
    )
      return [];
    return [
      {
        dims: {
          rowId: l.id,
          year: String(doc.year),
          kind: doc.kind,
          office: o,
          cluster: clusterOf.get(o) ?? null,
          expenseClass: l.expenseClass,
          // No fund → General Fund, as everywhere else (lbp-figures, sources.ts).
          // A special fund's own sheet sits under its retired "office": it is a
          // fund, not an office (specs/016).
          fund:
            SPECIAL_FUND_SHEETS[l.office.acronym] ??
            l.fundSource ??
            FundSource.GF,
          account: l.accountTitle ?? l.uacsCode,
        },
        money: {
          amount: l.amount,
          pastYear: dec(l.pastYearActual),
          currentYear: dec(l.currentYearTotal),
        },
      },
    ];
  });
}

const SPECIAL_FUND_SHEETS: Record<string, FundSource> = {
  SPAF: FundSource.SPA,
  LDF: FundSource.LDF,
  LDRRMF: FundSource.LDRRMF,
};

const SPA_ROLLUP =
  /local development fund|risk reduction (and )?management fund/i;

/**
 * Income lines: leaves only. A parent line restates its children's sum (or
 * the book's printed figure for it), so counting both would double it.
 */
async function receiptRecords(
  prisma: PrismaService,
  doc: CatalogueDocument,
): Promise<QueryRecord[]> {
  const lines = await prisma.budgetReceiptLine.findMany({
    where: { documentId: doc.documentId! },
    select: {
      id: true,
      parentId: true,
      particulars: true,
      incomeClass: true,
      amount: true,
      pastYearActual: true,
      currentYearTotal: true,
    },
  });
  const parents = new Set(lines.map((l) => l.parentId).filter(Boolean));
  return lines
    .filter((l) => !parents.has(l.id))
    .map((l) => ({
      dims: {
        rowId: l.id,
        year: String(doc.year),
        kind: doc.kind,
        incomeClass: l.incomeClass,
        particulars: l.particulars,
      },
      money: {
        amount: dec(l.amount),
        pastYear: dec(l.pastYearActual),
        currentYear: dec(l.currentYearTotal),
      },
    }));
}

// ─── AIP projects/activities and climate tags (one read of the program tree) ──

type Json = Record<string, unknown>;
const list = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const obj = (v: unknown): Json | null =>
  v && typeof v === 'object' ? (v as Json) : null;
/** Live Decimals and snapshot strings alike. */
const decOf = (v: unknown): Prisma.Decimal =>
  Prisma.Decimal.isDecimal(v)
    ? v
    : new Prisma.Decimal(
        typeof v === 'string' || typeof v === 'number' ? v : 0,
      );

const CLIMATE = {
  include: { codes: { include: { ccetCode: true } } },
} as const;
const AIP_TREE = {
  thematicTags: { select: { tagId: true } },
  fundAllocations: { orderBy: { orderIndex: 'asc' } },
  climateChangeTag: CLIMATE,
  projectActivities: {
    orderBy: { orderIndex: 'asc' },
    include: {
      fundAllocations: { orderBy: { orderIndex: 'asc' } },
      climateChangeTag: CLIMATE,
      thematicTags: { select: { tagId: true } },
    },
  },
  publishedVersion: { select: { snapshot: true } },
} satisfies Prisma.ProgramInclude;

/**
 * A cycle's programs: the live row (for joins — office, sector, themes, as the
 * public registry does) and the row the figures come from — the published
 * snapshot for the public, the live row for staff. The snapshot is the raw
 * row with its tree, so both read the same keys (lbp-figures `toSheetProgram`).
 */
async function aipTree(
  prisma: PrismaService,
  cycleId: string,
  visibility: Visibility,
) {
  const rows = await prisma.program.findMany({
    where: {
      aipCycleId: cycleId,
      ...(visibility === 'staff' ? LIVE_PROGRAM : PUBLICLY_VISIBLE),
    },
    include: AIP_TREE,
  });
  return rows.flatMap((live) => {
    const raw = (
      visibility === 'staff' ? live : live.publishedVersion?.snapshot
    ) as Json | undefined;
    return raw ? [{ live, raw, sheet: toSheetProgram(raw, null) }] : [];
  });
}
type AipTree = Awaited<ReturnType<typeof aipTree>>;

/**
 * A row's money by fund, or `_multi` when it is several funds unsplit —
 * `loadAipRows`'s rule (invariant 21), for one PA.
 * ponytail: the same ten lines as sources.ts; share them when that file is free.
 */
function fundsOf(row: Costed): Record<string, Prisma.Decimal> {
  const byFund: Record<string, Prisma.Decimal> = {};
  const add = (k: string, v: Prisma.Decimal) => {
    if (!v.isZero()) byFund[k] = (byFund[k] ?? ZERO).plus(v);
  };
  let placed = false;
  for (const fund of Object.values(FundSource)) {
    const a = attribute(row, fund);
    if (a.money) {
      add(fund, a.money.total);
      placed = true;
    }
    if (a.multiFund) break;
  }
  if (!placed) add(MULTI_FUND_ID, row.total);
  return byFund;
}

const PA_TYPE: Record<string, string> = {
  PROJECT: 'Project',
  ACTIVITY: 'Activity',
};

/**
 * Leaf PAs only — the rows `moneyRows` says carry a program's money, so a
 * parent PA and its children are never counted together, and per program they
 * add up to its `proposedTotal`. A program that states its own costs (or has
 * no PAs) has no records here: it is all in `aip-programs`.
 */
export function activityRecords(
  tree: AipTree,
  doc: CatalogueDocument,
  cat: Catalogue,
  split: Split,
): QueryRecord[] {
  const rows: Row[] = [];
  const extra = new Map<
    string,
    { paType: string | null; program: string; parentId: string }
  >();
  for (const { live, raw, sheet } of tree) {
    const types = new Map(
      list(raw.projectActivities).map((pa) => [String(pa.id), pa.type]),
    );
    const ownTags = new Map(
      live.projectActivities.map((pa) => [
        pa.id,
        pa.thematicTags.map((t) => t.tagId),
      ]),
    );
    const programTags = live.thematicTags.map((t) => t.tagId);
    for (const r of moneyRows(sheet)) {
      if (r === sheet) continue;
      rows.push({
        id: r.id,
        label: r.name,
        officeId: live.officeId,
        sectorId: live.papSectorId,
        finishLineId: live.finishLineId,
        subFinishLineId: live.subFinishLineId,
        // A PA's own tags plus its program's, as the public detail shows them.
        themeIds: [...new Set([...programTags, ...(ownTags.get(r.id) ?? [])])],
        money: { ps: r.ps, mooe: r.mooe, fe: r.fe, co: r.co, total: r.total },
        byFund: fundsOf(r),
      });
      extra.set(r.id, {
        paType: PA_TYPE[String(types.get(r.id))] ?? null,
        program: sheet.name,
        // Its program, for the Records view's expandable rows and page links (specs/020).
        parentId: live.id,
      });
    }
  }
  return rowRecords(rows, doc, cat, split).map((rec) => ({
    ...rec,
    dims: { ...rec.dims, ...extra.get(rec.dims.rowId as string) },
  }));
}

const PILLAR: Record<string, string> = {
  ADAPTATION: 'Adaptation',
  MITIGATION: 'Mitigation',
  CROSSCUTTING: 'Cross-cutting',
};
/** A tag with an amount and no code is allowed (the city's AIP has them). */
export const UNCODED = 'No CCET code yet';

/**
 * Every climate tag of a program and of its PAs, read from the same row the
 * figures come from (published snapshot for the public) — as open data's
 * climate file does. CCA and CCM belong to the whole tag, so a tag with
 * several codes is one record whose codes are multi-valued (no totals across
 * codes). Dev has no program tagged alongside its PAs, nor a tagged parent PA.
 */
export function climateRecords(
  tree: AipTree,
  doc: CatalogueDocument,
  cat: Catalogue,
): QueryRecord[] {
  const office = codeOf(cat, 'office');
  const sector = codeOf(cat, 'sector');
  const finishLine = codeOf(cat, 'finishLine');
  const clusterOf = new Map(
    cat.dimensions.office.map((o) => [o.id, o.clusterId ?? NONE_ID]),
  );
  return tree.flatMap(({ live, raw, sheet }) => {
    const o = office(live.officeId);
    const place = {
      year: String(doc.year),
      kind: doc.kind,
      office: o,
      cluster: clusterOf.get(o) ?? NONE_ID,
      sector: sector(live.papSectorId),
      finishLine: finishLine(live.finishLineId),
      program: sheet.name,
    };
    const tagged: [string, Json][] = [
      ['Program', raw],
      ...list(raw.projectActivities).map((pa): [string, Json] => [
        'Project or activity',
        pa,
      ]),
    ];
    return tagged.flatMap(([level, row]): QueryRecord[] => {
      const t = obj(row.climateChangeTag);
      if (!t) return [];
      const codes = list(t.codes)
        .map((c) => obj(c.ccetCode))
        .filter((c): c is Json => c !== null);
      const cca = decOf(t.ccaAmount);
      const ccm = decOf(t.ccmAmount);
      return [
        {
          dims: {
            ...place,
            rowId: String(row.id),
            level,
            name: typeof row.name === 'string' ? row.name : '',
            ccetCode: codes.map((c) => String(c.code)),
            ccet: codes.length
              ? codes.map((c) => `${String(c.code)} ${String(c.name)}`)
              : [UNCODED],
            pillar: [
              ...new Set(codes.map((c) => PILLAR[String(c.pillar)] ?? null)),
            ].filter((p): p is string => p !== null),
          },
          money: { amount: cca.plus(ccm), cca, ccm },
        },
      ];
    });
  });
}

// ─── Projects (PPMP) ──────────────────────────────────────────────────────────

const CLASSIFICATION: Record<string, string> = {
  GENERAL_ADMINISTRATIVE_SERVICES: 'General Administrative Services',
  SUPPORT_TO_OPERATIONS: 'Support to Operations',
  OPERATIONS: 'Operations',
  DIGITALIZATION: 'Digitalization',
};

/**
 * Published Projects of the year's cycle. A Project has no snapshot layer:
 * `isPublished` on the live row is the whole public rule, and the live row is
 * what the public page shows (docs/modules/ppmp.md; `PublicService.listPpmp`).
 * Its money is its line items' `lineTotal`, so fund and class splits are the
 * lines' own fund and class and always add back to the Project.
 */
async function projectRecords(
  prisma: PrismaService,
  doc: CatalogueDocument,
  cat: Catalogue,
  split: Split,
  visibility: Visibility,
): Promise<QueryRecord[]> {
  const office = codeOf(cat, 'office');
  const clusterOf = new Map(
    cat.dimensions.office.map((o) => [o.id, o.clusterId ?? NONE_ID]),
  );
  const ppmps = await prisma.pPMP.findMany({
    where: {
      aipCycleId: doc.cycleId,
      ...(visibility === 'staff' ? {} : { isPublished: true }),
    },
    select: {
      id: true,
      name: true,
      officeId: true,
      classification: true,
      kind: true,
      fundingProgram: true,
      office: { select: { acronym: true } },
      lineItems: {
        select: { lineTotal: true, fundSource: true, expenseClass: true },
      },
    },
  });
  return ppmps.flatMap((p): QueryRecord[] => {
    // The catalogue lists offices with AIP or book money; an office with only
    // Projects (dev: ACTO) has no code there, so it keeps its acronym rather
    // than vanishing into "Not specified".
    // ponytail: label reads as the bare acronym until the catalogue also
    // counts Project offices (catalogue.service `usedValues`).
    const code = office(p.officeId);
    const o = code === NONE_ID ? p.office.acronym : code;
    const dims = {
      rowId: p.id,
      year: String(doc.year),
      kind: doc.kind,
      office: o,
      cluster: clusterOf.get(o) ?? NONE_ID,
      classification: CLASSIFICATION[p.classification] ?? p.classification,
      plan: p.kind === 'FINAL' ? 'Final' : 'Indicative',
      name: p.name,
      fundingProgram: p.fundingProgram,
    };
    const by = (key: 'fundSource' | 'expenseClass') => {
      const m = new Map<string, Prisma.Decimal>();
      for (const li of p.lineItems)
        m.set(li[key], (m.get(li[key]) ?? ZERO).plus(li.lineTotal));
      return m;
    };
    if (split)
      return [...by(split === 'fund' ? 'fundSource' : 'expenseClass')].map(
        ([k, v]) => ({
          dims: { ...dims, [split]: k },
          money: { amount: v, ps: null, mooe: null, fe: null, co: null },
        }),
      );
    const cls = by('expenseClass');
    return [
      {
        dims: { ...dims, fund: [...by('fundSource').keys()] },
        money: {
          amount: p.lineItems.reduce((a, li) => a.plus(li.lineTotal), ZERO),
          ps: cls.get('PS') ?? ZERO,
          mooe: cls.get('MOOE') ?? ZERO,
          fe: cls.get('FE') ?? ZERO,
          co: cls.get('CO') ?? ZERO,
        },
      },
    ];
  });
}

/** One document's records for one source, each with its labels (W22). */
export async function loadRecords(
  prisma: PrismaService,
  source: SourceId,
  doc: CatalogueDocument,
  cat: Catalogue,
  split: Split,
  visibility: Visibility = 'public',
): Promise<QueryRecord[]> {
  return withLabels(
    prisma,
    source,
    await sourceRecords(prisma, source, doc, cat, split, visibility),
    cat,
  );
}

async function sourceRecords(
  prisma: PrismaService,
  source: SourceId,
  doc: CatalogueDocument,
  cat: Catalogue,
  split: Split,
  visibility: Visibility,
): Promise<QueryRecord[]> {
  switch (source) {
    case 'object-lines':
      return objectLineRecords(prisma, doc, cat);
    case 'receipts':
      return receiptRecords(prisma, doc);
    case 'aip-activities':
      return activityRecords(
        await aipTree(prisma, doc.cycleId, visibility),
        doc,
        cat,
        split,
      );
    case 'climate-tags':
      return climateRecords(
        await aipTree(prisma, doc.cycleId, visibility),
        doc,
        cat,
      );
    case 'projects':
      return projectRecords(prisma, doc, cat, split, visibility);
    case 'terms':
      // Built from aip-programs / budget-ppas records in QueryService.records.
      return [];
    case 'aip-programs':
    case 'budget-ppas':
    case 'over-time': {
      const rows =
        doc.kind === 'aip'
          ? await loadAipRows(prisma, doc.cycleId, visibility)
          : await loadDocumentRows(prisma, doc.documentId!);
      return rowRecords(rows, doc, cat, split);
    }
  }
}

// ─── Labels (redesign W22–W25) ────────────────────────────────────────────────

/**
 * Which annotations a record takes: a program or top-level PPA takes its whole
 * tree's (W25: a program's labels include its children's, counted once); a
 * project/activity, an account line or a Project only its own.
 */
const LABEL_BY: Partial<Record<SourceId, 'rootId' | 'rowId'>> = {
  'aip-programs': 'rootId',
  'budget-ppas': 'rootId',
  'over-time': 'rootId',
  'aip-activities': 'rowId',
  'object-lines': 'rowId',
  projects: 'rowId',
};

async function withLabels(
  prisma: PrismaService,
  source: SourceId,
  records: QueryRecord[],
  cat: Catalogue,
): Promise<QueryRecord[]> {
  const by = LABEL_BY[source];
  if (!by || !cat.dimensions.label?.length) return records;
  const notes = await prisma.explorerAnnotation.findMany({
    // Review labels count nowhere until Stride decides them (W23).
    where: {
      inReview: false,
      [by]: { in: [...new Set(records.map((r) => String(r.dims.rowId)))] },
    },
    select: {
      rowId: true,
      rootId: true,
      labelId: true,
      label: { select: { parentId: true } },
    },
  });
  return labelRecords(
    records,
    notes.map((n) => ({
      key: n[by],
      own: n.rowId === n[by],
      labelId: n.labelId,
      parentId: n.label.parentId,
    })),
    cat,
  );
}

/**
 * Each record's labels and sub-labels, only those the catalogue lists. A
 * sub-label brings its label; a record with none is Not classified (W25).
 * A program or top-level PPA keeps its own labels when it has any (the model
 * read its children's names to give them) and takes its children's only when
 * it has none: one drainage activity must not make a whole office program
 * infrastructure money.
 */
export function labelRecords(
  records: QueryRecord[],
  notes: {
    key: string;
    own: boolean;
    labelId: string;
    parentId: string | null;
  }[],
  cat: Pick<Catalogue, 'dimensions'>,
): QueryRecord[] {
  const tops = new Set(cat.dimensions.label.map((v) => v.id));
  const subs = new Set(cat.dimensions.subLabel.map((v) => v.id));
  const listed = notes.filter((n) => tops.has(n.parentId ?? n.labelId));
  const ownKeys = new Set(listed.filter((n) => n.own).map((n) => n.key));
  const byKey = new Map<string, { label: Set<string>; sub: Set<string> }>();
  for (const n of listed.filter((n) => n.own || !ownKeys.has(n.key))) {
    const top = n.parentId ?? n.labelId;
    if (!tops.has(top)) continue;
    const e = byKey.get(n.key) ?? { label: new Set(), sub: new Set() };
    byKey.set(n.key, e);
    e.label.add(top);
    if (n.parentId && subs.has(n.labelId)) e.sub.add(n.labelId);
  }
  return records.map((r) => {
    const e = byKey.get(String(r.dims.rowId));
    return {
      ...r,
      dims: {
        ...r.dims,
        label: e?.label.size ? [...e.label].sort() : [UNCLASSIFIED],
        subLabel: [...(e?.sub ?? [])].sort(),
      },
    };
  });
}

/**
 * "Infrastructure, by label" means infrastructure's own bars: a row labelled
 * infrastructure and health must not put a Health bar on that chart. Under an
 * `in` filter on `label`, a label breakdown keeps only the chosen labels and
 * a sub-label breakdown only their sub-labels (a row with none of them falls
 * under "Not specified"). Rows are not dropped, so totals do not move.
 */
export function scopeLabels(records: QueryRecord[], q: Query): QueryRecord[] {
  const f = q.filters.find((x) => x.field === 'label' && x.op === 'in');
  const chosen = f && 'values' in f ? f.values : undefined;
  const by = q.dimensions.filter((d) => d === 'label' || d === 'subLabel');
  if (!chosen?.length || !by.length) return records;
  const keep = (field: string, v: string) =>
    field === 'label' ? chosen.includes(v) : chosen.includes(v.split('.')[0]);
  return records.map((r) => {
    const dims = { ...r.dims };
    for (const f of by)
      dims[f] = ((dims[f] as string[] | undefined) ?? []).filter((v) =>
        keep(f, v),
      );
    return { ...r, dims };
  });
}
