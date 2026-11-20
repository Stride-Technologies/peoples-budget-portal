/**
 * The query engine against a real database (specs/018 redesign P2): every
 * source, for every catalogue document, adds up to the figure the site
 * already publishes or the book prints, to the centavo.
 *
 *   pnpm --filter api exec tsx src/explorer/explorer.check.ts
 *   EXPLORER_INCLUDE_DRAFTS=1 pnpm --filter api exec tsx src/explorer/explorer.check.ts
 *
 * | source        | expected                                              | gate          |
 * |---------------|-------------------------------------------------------|---------------|
 * | aip-programs  | Σ publishedProposedTotal (the public registry headline) | public        |
 * | budget-ppas   | Σ top-level BudgetItem.total (the book's rolled-up PPAs) | public      |
 * | object-lines  | the PPA total                                          | enacted ordinance |
 * | receipts      | Σ printed RECEIPTS totals                              | never (book's own) |
 * | over-time     | each (year, kind) = that document's own total          | public        |
 * | printed       | Form 7 grand total, Σ object-sheet totals              | never         |
 * | terms         | rows with a word + rows with none = the source total (each row once) | public |
 * | barangay      | one + several + city-wide = the source total; Σ by barangay = one + Σ several × n + city-wide | public |
 *
 * Every split (office, sector, fund, class, income class) is summed back and
 * held to the same expected figure: splits always add up to the unsplit
 * total. A draft document (dev, EXPLORER_INCLUDE_DRAFTS=1) is reported, never
 * failed. Exit 1 only on a gated mismatch.
 */
import { Prisma } from './../generated/prisma/index';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './../generated/prisma/client';
import { PUBLICLY_VISIBLE } from '../programs/program-filters.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CacheService } from '../cache/cache.service.js';
import {
  CatalogueService,
  MULTI_FUND_ID,
  NONE_ID,
  type Catalogue,
  type CatalogueDocument,
} from './catalogue.service.js';
import { QueryService } from './query/query.service.js';
import type { SourceId } from './query/fields.js';
import { CITY_WIDE } from './query/barangay.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
}) as unknown as PrismaService;
// No cache: every figure is read fresh from the database.
const cache = {
  getOrSet: <T>(_k: string, _t: number, f: () => Promise<T>) => f(),
} as unknown as CacheService;
const catalogue = new CatalogueService(prisma, cache);
const query = new QueryService(prisma, cache, catalogue);

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);

type Status = 'ok' | 'FAIL' | 'diff' | '=' | '≠';
interface Line {
  source: string;
  doc: string;
  check: string;
  expected: Prisma.Decimal | null;
  got: Prisma.Decimal;
  status: Status;
  note: string;
}
const lines: Line[] = [];

/** `gate`: a mismatch fails the run; otherwise it is reported as `diff`. `info`: the book's own figures, `=`/`≠`. */
function record(
  source: string,
  doc: CatalogueDocument,
  check: string,
  expected: Prisma.Decimal | null,
  got: Prisma.Decimal,
  mode: 'gate' | 'report' | 'info',
  note = '',
) {
  const same = expected !== null && expected.equals(got);
  const status: Status =
    mode === 'info'
      ? same
        ? '='
        : '≠'
      : same
        ? 'ok'
        : mode === 'gate'
          ? 'FAIL'
          : 'diff';
  lines.push({ source, doc: docName(doc), check, expected, got, status, note });
}

const docName = (d: CatalogueDocument) =>
  `FY${d.year} ${d.kind.toUpperCase()}${d.draft ? ' (draft)' : ''}`;

/** Σ of one money measure over a query's groups (no limit, so no "Other"). */
async function grouped(
  source: SourceId,
  doc: CatalogueDocument,
  dims: string[],
  cat: Catalogue,
  field = 'amount',
) {
  const { res } = await query.aggregate(
    {
      source,
      documents: [{ kind: doc.kind, years: [doc.year] }],
      dimensions: dims,
      measures: [{ field, agg: 'sum' }],
      filters: [],
    },
    cat,
  );
  const of = (key: string) =>
    res.rows
      .filter((r) => r.keys[0] === key)
      .reduce((a, r) => a.plus(r.values[0]), ZERO);
  return {
    sum: res.rows.reduce((a, r) => a.plus(r.values[0]), ZERO),
    total: D(res.totals[0]),
    n: res.n,
    none: of(NONE_ID).plus(
      res.rows
        .filter((r) => r.keys[0] === null)
        .reduce((a, r) => a.plus(r.values[0]), ZERO),
    ),
    multi: of(MULTI_FUND_ID),
    of,
  };
}

const peso = (v: Prisma.Decimal) =>
  `${v.isNegative() ? '-' : ''}₱${v
    .abs()
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** Total, then each split summed back to the same expected figure. */
async function splits(
  source: SourceId,
  doc: CatalogueDocument,
  cat: Catalogue,
  expected: Prisma.Decimal,
  dims: string[],
  mode: 'gate' | 'report',
) {
  const t = await grouped(source, doc, [], cat);
  record(source, doc, `total (${t.n} rows)`, expected, t.total, mode);
  for (const d of dims) {
    const g = await grouped(source, doc, [d], cat);
    const notes = [
      g.none.isZero() ? '' : `not specified ${peso(g.none)}`,
      g.multi.isZero() ? '' : `several funds ${peso(g.multi)}`,
    ].filter(Boolean);
    record(source, doc, `by ${d}`, expected, g.sum, mode, notes.join('; '));
  }
  return t.total;
}

/**
 * specs/020 A3.5: barangays are read from names at query time and several per
 * row, so the map has no total. What must hold: every row is in exactly one of
 * "one barangay", "several", "city-wide", and those add up to the source; and
 * the barangay breakdown counts a several-barangay row once in each.
 */
async function barangays(
  source: SourceId,
  doc: CatalogueDocument,
  cat: Catalogue,
  expected: Prisma.Decimal,
  mode: 'gate' | 'report',
) {
  // ponytail: reads QueryService's own record path (cache-free here), so the check sees what queries see.
  const records = (await (
    query as unknown as {
      records: (...a: unknown[]) => Promise<
        {
          dims: Record<string, unknown>;
          money: Record<string, Prisma.Decimal | null>;
        }[]
      >;
    }
  ).records(source, doc, cat, null, 'public')) as {
    dims: { barangay?: string[] };
    money: { amount: Prisma.Decimal | null };
  }[];
  const parts = { one: ZERO, several: ZERO, city: ZERO, weighted: ZERO };
  const n = { one: 0, several: 0, city: 0 };
  for (const r of records) {
    const v = r.money.amount ?? ZERO;
    const b = r.dims.barangay ?? [CITY_WIDE];
    const k = b[0] === CITY_WIDE ? 'city' : b.length === 1 ? 'one' : 'several';
    parts[k] = parts[k].plus(v);
    n[k] += 1;
    parts.weighted = parts.weighted.plus(k === 'city' ? v : v.mul(b.length));
  }
  record(
    'barangay',
    doc,
    `${source}: one + several + city-wide`,
    expected,
    parts.one.plus(parts.several).plus(parts.city),
    mode,
    `one ${n.one} rows ${peso(parts.one)}; several ${n.several} rows ${peso(parts.several)}; city-wide ${n.city} rows ${peso(parts.city)}`,
  );
  const g = await grouped(source, doc, ['barangay'], cat);
  record(
    'barangay',
    doc,
    `${source}: Σ by barangay (each place counted)`,
    parts.weighted,
    g.sum,
    mode,
    `${g.n} rows`,
  );
}

/**
 * specs/020 A4: the word map sizes a word by the money of the rows that use it,
 * so words overlap and have no total. What must hold: the rows behind the words
 * are the source's own rows, each once, at their own amounts.
 */
async function terms(
  base: SourceId,
  doc: CatalogueDocument,
  cat: Catalogue,
  expected: Prisma.Decimal,
  mode: 'gate' | 'report',
) {
  type R = {
    dims: { rowId?: unknown; term?: string };
    money: { amount: Prisma.Decimal | null };
  };
  const read = (source: string) =>
    (
      query as unknown as { records: (...a: unknown[]) => Promise<R[]> }
    ).records(source, doc, cat, null, 'public');
  const [rows, words] = await Promise.all([read(base), read('terms')]);
  const worded = new Map<string, Prisma.Decimal>();
  for (const w of words)
    worded.set(String(w.dims.rowId), w.money.amount ?? ZERO);
  let withWord = ZERO;
  let without = ZERO;
  let nWithout = 0;
  for (const r of rows) {
    const v = r.money.amount ?? ZERO;
    if (worded.has(String(r.dims.rowId))) {
      withWord = withWord.plus(v);
      // A word's record carries its row's own amount, never a share of it.
      if (!worded.get(String(r.dims.rowId))!.equals(v))
        withWord = withWord.plus(D('0.01'));
    } else {
      without = without.plus(v);
      nWithout += 1;
    }
  }
  record(
    'terms',
    doc,
    `rows with a word + rows with none`,
    expected,
    withWord.plus(without),
    mode,
    `${new Set(words.map((w) => w.dims.term)).size} words; ${worded.size} rows with one ${peso(withWord)}; ${nWithout} rows with none ${peso(without)}`,
  );
}

async function main() {
  // Drafts are included unless explicitly switched off: a draft is reported, never failed.
  process.env.EXPLORER_INCLUDE_DRAFTS ??= '1';
  const cat = await catalogue.get();
  const single = new Map<string, Prisma.Decimal>(); // `${kind}:${year}` → the document's own total

  for (const doc of cat.documents) {
    const gate = doc.draft ? 'report' : 'gate';
    if (doc.kind === 'aip') {
      const headline = await prisma.program.aggregate({
        where: { aipCycleId: doc.cycleId, ...PUBLICLY_VISIBLE },
        _sum: { publishedProposedTotal: true },
      });
      const expected = headline._sum.publishedProposedTotal ?? ZERO;
      single.set(`aip:${doc.year}`, expected);
      await splits(
        'aip-programs',
        doc,
        cat,
        expected,
        ['sector', 'office', 'fund', 'expenseClass'],
        gate,
      );
      await barangays('aip-programs', doc, cat, expected, gate);
      await terms('aip-programs', doc, cat, expected, gate);
      const acts = await grouped('aip-activities', doc, [], cat);
      await barangays('aip-activities', doc, cat, acts.total, gate);
      continue;
    }

    const documentId = doc.documentId!;
    const [book, printed] = await Promise.all([
      prisma.budgetItem.aggregate({
        where: { documentId, parentId: null },
        _sum: { total: true },
      }),
      prisma.budgetPrintedTotal.findMany({
        where: {
          documentId,
          kind: { in: ['FORM7', 'OBJECT_SHEET', 'RECEIPTS'] },
        },
        select: { kind: true, scope: true, label: true, amount: true },
      }),
    ]);
    const expected = book._sum.total ?? ZERO;
    single.set(`${doc.kind}:${doc.year}`, expected);
    const ppas = await splits(
      'budget-ppas',
      doc,
      cat,
      expected,
      ['office', 'fund', 'expenseClass'],
      gate,
    );
    await barangays('budget-ppas', doc, cat, expected, gate);
    await terms('budget-ppas', doc, cat, expected, gate);
    // A scanned book can print one Form 7 per fund file (General Admin,
    // Economic Enterprises) beside the whole-book one. ponytail: the largest
    // grand total stands for the book; when only per-file ones were read
    // (FY2023), it is a part and shows as ≠ — the note names the file.
    const form7 = printed
      .filter(
        (p) =>
          p.kind === 'FORM7' &&
          p.scope === 'ALL' &&
          /^Grand total/.test(p.label),
      )
      .sort((a, b) => b.amount.comparedTo(a.amount))[0];
    if (form7)
      record(
        'printed',
        doc,
        'PPAs vs Form 7 grand total',
        form7.amount,
        ppas,
        'info',
        form7.label.match(/\((.+)\)/)?.[1] ?? '',
      );

    // Account lines: the same money as the PPAs only once a book is enacted
    // (an LEP's object sheets are OCR'd and still under review, specs/017).
    const accounts = await grouped('object-lines', doc, [], cat);
    if (accounts.n) {
      const enacted = doc.kind === 'ordinance' && !doc.draft;
      record(
        'object-lines',
        doc,
        `total (${accounts.n} lines) vs PPAs`,
        expected,
        accounts.total,
        enacted ? 'gate' : 'report',
      );
      let byOffice: Awaited<ReturnType<typeof grouped>> | null = null;
      for (const d of ['office', 'fund', 'expenseClass']) {
        const g = await grouped('object-lines', doc, [d], cat);
        if (d === 'office') byOffice = g;
        record(
          'object-lines',
          doc,
          `by ${d} = lines`,
          accounts.total,
          g.sum,
          gate,
          g.none.isZero() ? '' : `not specified ${peso(g.none)}`,
        );
      }
      // Each office's lines against the totals its own sheets print (an office
      // may print several sheets; not every sheet prints one).
      const sheets = new Map<string, Prisma.Decimal>();
      for (const p of printed)
        if (p.kind === 'OBJECT_SHEET')
          sheets.set(p.scope, (sheets.get(p.scope) ?? ZERO).plus(p.amount));
      if (sheets.size && byOffice) {
        const off = [...sheets].filter(([o, v]) => !byOffice.of(o).equals(v));
        record(
          'printed',
          doc,
          `lines of ${sheets.size} offices vs their sheet totals`,
          [...sheets.values()].reduce((a, v) => a.plus(v), ZERO),
          [...sheets.keys()].reduce((a, o) => a.plus(byOffice.of(o)), ZERO),
          'info',
          off.length
            ? `${off.length} differ: ${off
                .slice(0, 6)
                .map(([o]) => o)
                .join(', ')}${off.length > 6 ? '…' : ''}`
            : '',
        );
      }
    }

    // Income: leaves only, never added to spending. Its own check is the book's
    // printed receipts totals; the GA/EE split sheets restate part of the GF, so
    // they are left out of the sum.
    const income = await grouped('receipts', doc, [], cat);
    if (income.n) {
      const byClass = await grouped('receipts', doc, ['incomeClass'], cat);
      record(
        'receipts',
        doc,
        'by incomeClass = lines',
        income.total,
        byClass.sum,
        gate,
      );
      const scopes = printed.filter(
        (p) => p.kind === 'RECEIPTS' && !['GA', 'EE'].includes(p.scope),
      );
      record(
        'receipts',
        doc,
        `${income.n} leaf lines vs Σ printed (${scopes.map((p) => p.scope).join(', ') || 'none'})`,
        scopes.length ? scopes.reduce((a, p) => a.plus(p.amount), ZERO) : null,
        income.total,
        'info',
      );
    }
  }

  // Over time: every document at once, broken down by year and kind; each
  // cell must be that document's own total.
  const kinds = [...new Set(cat.documents.map((d) => d.kind))];
  const { res } = await query.aggregate(
    {
      source: 'over-time',
      documents: kinds.map((kind) => ({
        kind,
        years: cat.documents.filter((d) => d.kind === kind).map((d) => d.year),
      })),
      dimensions: ['year', 'kind'],
      measures: [{ field: 'amount', agg: 'sum' }],
      filters: [],
    },
    cat,
  );
  for (const doc of cat.documents) {
    const row = res.rows.find(
      (r) => r.keys[0] === String(doc.year) && r.keys[1] === doc.kind,
    );
    record(
      'over-time',
      doc,
      'year × kind cell',
      single.get(`${doc.kind}:${doc.year}`) ?? null,
      D(row?.values[0] ?? 0),
      doc.draft ? 'report' : 'gate',
    );
  }

  print();
  const failed = lines.filter((l) => l.status === 'FAIL');
  if (!cat.documents.length) {
    console.error('no catalogue document — has anything been published?');
    process.exitCode = 1;
  } else if (failed.length) {
    console.error(`\n${failed.length} gated mismatch(es).`);
    process.exitCode = 1;
  } else
    console.log(
      `\nok: ${cat.documents.length} documents, ${lines.length} checks, no gated mismatch.`,
    );
}

function print() {
  const rows = lines.map((l) => [
    l.source,
    l.doc,
    l.check,
    l.expected ? peso(l.expected) : '—',
    peso(l.got),
    l.expected ? peso(l.got.minus(l.expected)) : '—',
    l.status,
    l.note,
  ]);
  const head = [
    'source',
    'document',
    'check',
    'expected',
    'got',
    'difference',
    'status',
    'note',
  ];
  const right = new Set([3, 4, 5]);
  const width = head.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const fmt = (r: string[]) =>
    `| ${r.map((c, i) => (right.has(i) ? c.padStart(width[i]) : c.padEnd(width[i]))).join(' | ')} |`;
  console.log(fmt(head));
  console.log(
    `|${width.map((w, i) => (right.has(i) ? `${'-'.repeat(w + 1)}:` : '-'.repeat(w + 2))).join('|')}|`,
  );
  rows.forEach((r) => console.log(fmt(r)));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => (prisma as unknown as PrismaClient).$disconnect());
