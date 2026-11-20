/**
 * Starter workbooks (specs/018 redesign P7, W13): finished workbooks a visitor
 * opens from the guide or a blank sheet and picks apart. Built from the
 * catalogue, so each names only documents this site holds, and from the P2
 * sources only. Each is an ordinary `Workbook`: `checkWorkbook` passes it,
 * and opening one is one undo step.
 */
import type { CatalogueDocument } from './view-url.ts';
import type { Mark, Sheet, Workbook, WorkbookQuery } from './workbook.ts';

export type StarterId = 'aip' | 'climate' | 'income' | 'overTime' | 'places' | 'words';

export interface Starter {
  id: StarterId;
  /** The fiscal year it reads, for its description; absent on the over-time one. */
  year?: number;
  workbook: Workbook;
}

/** Copy for a starter, read from `en.json` by the caller (`explore.guide.starter.<id>.*`). */
export type Words = (key: string, vars?: Record<string, string | number>) => string;

type Doc = Pick<CatalogueDocument, 'kind' | 'year'> & { draft?: true };

/** The newest published document of these kinds (a draft only when nothing else exists); an ordinance beats an LEP of the same year. */
function latest(docs: Doc[], kinds: string[]): Doc | undefined {
  return docs
    .filter((d) => kinds.includes(d.kind))
    .sort((a, b) => Number(!!a.draft) - Number(!!b.draft) || b.year - a.year || Number(b.kind === 'ordinance') - Number(a.kind === 'ordinance'))[0];
}

const query = (source: string, doc: Doc, dimensions: string[], extra: Partial<WorkbookQuery> = {}): WorkbookQuery => ({
  source,
  documents: [{ kind: doc.kind, years: [doc.year] }],
  dimensions,
  measures: [{ field: 'amount', agg: 'sum' }],
  filters: [],
  ...extra,
});

/** A workbook of sheets, opened on a dashboard of all of them when there are two or more. */
function book(name: string, sheets: [string, WorkbookQuery, Mark][], board: string): Workbook {
  const s: Sheet[] = sheets.map(([n, q, mark], i) => ({ id: `s${i + 1}`, name: n, query: q, mark }));
  return {
    v: 2,
    name,
    sheets: s,
    active: 0,
    ...(s.length > 1 ? { dashboards: [{ id: 'd1', name: board, sheets: s.map((x) => x.id) }], board: 'd1' } : {}),
  };
}

export function starters(docs: Doc[], w: Words): Starter[] {
  const out: Starter[] = [];
  const k = (id: StarterId, part: string, vars?: Record<string, string | number>) => w(`explore.guide.starter.${id}.${part}`, vars);
  const board = w('explore.guide.starter.board');

  const aip = latest(docs, ['aip']);
  if (aip) {
    const y = { year: aip.year };
    out.push({
      id: 'aip',
      year: aip.year,
      workbook: book(
        k('aip', 'name', y),
        [
          [k('aip', 'sheet1'), query('aip-programs', aip, ['office'], { limit: 10 }), 'bar'],
          [k('aip', 'sheet2'), query('aip-programs', aip, ['finishLine']), 'bar'],
          [k('aip', 'sheet3'), query('aip-programs', aip, ['expenseClass']), 'treemap'],
        ],
        board,
      ),
    });
    out.push({
      id: 'climate',
      year: aip.year,
      workbook: book(
        k('climate', 'name', y),
        [
          [k('climate', 'sheet1'), query('climate-tags', aip, ['pillar']), 'bar'],
          [k('climate', 'sheet2'), query('climate-tags', aip, ['office'], { limit: 10 }), 'bar'],
        ],
        board,
      ),
    });
  }

  const book_ = latest(docs, ['ordinance', 'lep']);
  if (book_) {
    out.push({
      id: 'income',
      year: book_.year,
      workbook: book(
        k('income', 'name', { year: book_.year }),
        [
          [k('income', 'sheet1'), query('receipts', book_, ['incomeClass']), 'bar'],
          [k('income', 'sheet2'), query('receipts', book_, ['particulars'], { limit: 10 }), 'bar'],
        ],
        board,
      ),
    });
  }

  // Every document on one line per kind: years and kinds side by side, never added (P0, R8/R9).
  if (docs.length > 1) {
    const kinds = [...new Set(docs.map((d) => d.kind))];
    out.push({
      id: 'overTime',
      workbook: book(
        k('overTime', 'name'),
        [
          [
            k('overTime', 'sheet1'),
            {
              source: 'over-time',
              documents: kinds.map((kind) => ({ kind, years: docs.filter((d) => d.kind === kind).map((d) => d.year).sort((a, b) => a - b) })),
              dimensions: ['year', ...(kinds.length > 1 ? ['kind'] : [])],
              measures: [{ field: 'amount', agg: 'sum' }],
              filters: [],
              sort: { by: 'year', dir: 'asc' },
            },
            'line',
          ],
        ],
        board,
      ),
    });
  }
  // Where the plan's projects are (specs/020 A3): per resident on a map, and the largest by total.
  if (aip) {
    out.push({
      id: 'places',
      year: aip.year,
      workbook: book(
        k('places', 'name', { year: aip.year }),
        [
          [k('places', 'sheet1'), query('aip-activities', aip, ['barangay'], { measures: [{ field: 'amount', agg: 'perCapita' }] }), 'map'],
          [k('places', 'sheet2'), query('aip-activities', aip, ['barangay'], { sort: { by: 'm0', dir: 'desc' } }), 'bar'],
        ],
        board,
      ),
    });
  }
  // The words the plan spends on (specs/020 A4): sized by pesos, coloured by label.
  if (aip) {
    out.push({
      id: 'words',
      year: aip.year,
      workbook: book(
        k('words', 'name', { year: aip.year }),
        [[k('words', 'sheet1'), query('terms', aip, ['term', 'termLabel'], { sort: { by: 'm0', dir: 'desc' }, limit: 60 }), 'words']],
        board,
      ),
    });
  }
  return out;
}
