import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/index';
import type { CacheService } from '../cache/cache.service.js';
import type { CatalogueService } from './catalogue.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

// No row is labelled here; labels have their own checks (labels/labelling.spec.ts).
const prisma = {
  explorerAnnotation: { findMany: () => Promise.resolve([]) },
} as unknown as PrismaService;
import type { Row } from './sources.js';
import { CAT } from './test-catalogue.js';
import { QueryService } from './query/query.service.js';
import { ViewService } from './view.service.js';
import type { ExplorerView } from './view.js';

const d = (v: string | number) => new Prisma.Decimal(v);
const row = (over: Partial<Row> & { id: string; total: string }): Row => ({
  label: over.id,
  officeId: 'db-CHO',
  sectorId: 'db-3000',
  finishLineId: 'db-fl-1',
  subFinishLineId: null,
  themeIds: [],
  money: { ps: d(0), mooe: d(0), fe: d(0), co: d(0), total: d(over.total) },
  byFund: { GF: d(over.total) },
  ...over,
});

const ROWS: Record<string, Row[]> = {
  'aip:2027': [
    row({
      id: 'a',
      total: '100.00',
      themeIds: ['db-climate', 'db-gad'],
      money: { ps: d(60), mooe: d(30), fe: d(0), co: d(10), total: d(100) },
    }),
    row({
      id: 'b',
      total: '50.00',
      officeId: 'db-CPDO',
      sectorId: 'db-1000',
      themeIds: ['db-climate'],
      byFund: { SHF: d(50) },
    }),
    row({
      id: 'c',
      label: 'Barangay clinic upgrade',
      total: '25.50',
      officeId: null,
      finishLineId: 'db-fl-2',
      byFund: { _multi: d('25.50') },
    }),
  ],
  'aip:2026': [row({ id: 'x', total: '120.00' })],
  'ordinance:2026': [row({ id: 'o', total: '130.00' })],
};

jest.mock('./sources.js', () => ({
  loadAipRows: (_p: unknown, cycleId: string) =>
    Promise.resolve(ROWS[cycleId === 'c27' ? 'aip:2027' : 'aip:2026']),
  loadDocumentRows: () => Promise.resolve(ROWS['ordinance:2026']),
}));

const cache = {
  getOrSet: (_k: string, _t: number, load: () => Promise<unknown>) => load(),
} as unknown as CacheService;
const catalogue = {
  get: () => Promise.resolve(CAT),
} as unknown as CatalogueService;
const service = new ViewService(
  prisma,
  cache,
  catalogue,
  new QueryService(prisma, cache, catalogue),
);

const view = (over: Partial<ExplorerView> = {}): ExplorerView => ({
  v: 1,
  series: [{ document: 'aip', years: [2027], measure: 'money', filters: {} }],
  groupBy: 'office',
  chart: 'bar',
  ...over,
});

describe('ViewService.resolve', () => {
  it('groups money by office, keeps Decimal strings, and puts unassigned rows under "Not specified"', async () => {
    const r = await service.resolve(view());
    expect(r.series[0].total).toBe('175.50');
    expect(r.series[0].n).toBe(3);
    expect(r.series[0].rows.map((x) => [x.label, x.value, x.share])).toEqual([
      ['CHO', '100.00', 0.5698],
      ['CPDO', '50.00', 0.2849],
      ['Not specified', '25.50', 0.1453],
    ]);
    expect(r.notes).toEqual([
      'AIP figures are estimated costs of planned programs, not money spent.',
    ]);
  });

  it('counts programs, not money', async () => {
    const r = await service.resolve(
      view({
        series: [
          { document: 'aip', years: [2027], measure: 'count', filters: {} },
        ],
      }),
    );
    expect(r.series[0].total).toBe('3');
    expect(r.series[0].rows[0]).toMatchObject({ label: 'CHO', value: '1' });
  });

  it('never sums themes: shares are of the rows, and the overlap note is set (R12)', async () => {
    const r = await service.resolve(view({ groupBy: 'theme' }));
    const rows = Object.fromEntries(
      r.series[0].rows.map((x) => [x.label, x.value]),
    );
    expect(rows).toEqual({
      climate: '150.00',
      gad: '100.00',
      'Not specified': '25.50',
    });
    // 150 + 100 + 25.5 = 275.5 > the series total of 175.5: shares use the rows' own sum
    expect(r.series[0].rows.find((x) => x.label === 'climate')?.share).toBe(
      0.5445,
    );
    expect(r.facts.caveats).toContain('tags-overlap');
  });

  it('breaks down by topic from its rules: office or name keyword, counted under each (W16)', async () => {
    const r = await service.resolve(view({ groupBy: 'topic' }));
    expect(r.series[0].rows.map((x) => [x.id, x.value])).toEqual([
      ['health', '125.50'], // a (CHO office) + c (named "…clinic…", no office)
      ['planning', '50.00'], // b (CPDO office)
    ]);
    expect(r.facts.caveats).toContain('tags-overlap');
  });

  it('marks a series from a draft book as a draft, even under a written label (W15)', async () => {
    const draftCat = {
      ...CAT,
      documents: CAT.documents.map((d) =>
        d.kind === 'ordinance' ? { ...d, draft: true as const } : d,
      ),
    };
    const draftCatalogue = {
      get: () => Promise.resolve(draftCat),
    } as unknown as CatalogueService;
    const svc = new ViewService(
      prisma,
      cache,
      draftCatalogue,
      new QueryService(prisma, cache, draftCatalogue),
    );
    const r = await svc.resolve(
      view({
        series: [
          {
            document: 'ordinance',
            years: [2026],
            measure: 'money',
            filters: {},
            label: 'Enacted 2026',
          },
        ],
      }),
    );
    expect(r.series[0].label).toBe('Enacted 2026 (draft)');
  });

  it('filters on a topic', async () => {
    const r = await service.resolve(
      view({
        series: [
          {
            document: 'aip',
            years: [2027],
            measure: 'money',
            filters: { topic: ['health'] },
          },
        ],
      }),
    );
    expect(r.series[0].total).toBe('125.50');
    expect(r.series[0].rows.map((x) => x.id).sort()).toEqual(['CHO', '_none']);
  });

  it('breaks down by expense class and by fund, with the multi-fund bucket', async () => {
    const byClass = await service.resolve(view({ groupBy: 'expenseClass' }));
    expect(
      Object.fromEntries(byClass.series[0].rows.map((x) => [x.id, x.value])),
    ).toEqual({ PS: '60.00', MOOE: '30.00', CO: '10.00', _none: '75.50' }); // FE: no money, no row; rows b and c state no class, kept so the split adds up (P2)
    const byFund = await service.resolve(view({ groupBy: 'fund' }));
    expect(
      Object.fromEntries(byFund.series[0].rows.map((x) => [x.label, x.value])),
    ).toEqual({ GF: '100.00', SHF: '50.00', 'Multiple funds': '25.50' });
  });

  it('filters on codes, through the catalogue', async () => {
    const r = await service.resolve(
      view({
        series: [
          {
            document: 'aip',
            years: [2027],
            measure: 'money',
            filters: { sector: ['1000'] },
          },
        ],
      }),
    );
    expect(r.series[0].total).toBe('50.00');
    const c = await service.resolve(
      view({
        series: [
          {
            document: 'aip',
            years: [2027],
            measure: 'money',
            filters: { cluster: ['governance'] },
          },
        ],
      }),
    );
    expect(c.series[0].total).toBe('50.00');
  });

  it('runs a series over years and reports the biggest change', async () => {
    const r = await service.resolve(
      view({
        groupBy: 'year',
        chart: 'line',
        series: [
          {
            document: 'aip',
            years: [2026, 2027],
            measure: 'money',
            filters: {},
          },
        ],
      }),
    );
    expect(r.series[0].rows.map((x) => [x.label, x.value])).toEqual([
      ['FY2026', '120.00'],
      ['FY2027', '175.50'],
    ]);
    expect(r.facts.series[0].biggestChange).toEqual({
      label: 'FY2026 → FY2027',
      from: '120.00',
      to: '175.50',
      delta: '55.50',
      pct: 46.3,
    }); // Years are never added up: FY2026 + FY2027 is no published figure.
    expect(r.series[0].total).toBeNull();
    expect(r.series[0].rows.map((x) => x.share)).toEqual([null, null]);
    expect(r.facts.series[0].total).toBeNull();
  });

  it('shows kinds side by side with the context note, never added (R9)', async () => {
    const r = await service.resolve(
      view({
        groupBy: 'sector',
        series: [
          { document: 'aip', years: [2026], measure: 'money', filters: {} },
          {
            document: 'ordinance',
            years: [2026],
            measure: 'money',
            filters: {},
          },
        ],
      }),
    );
    expect(r.series.map((s) => [s.moneyWord, s.total])).toEqual([
      ['Estimated cost', '120.00'],
      ['Appropriation', '130.00'],
    ]);
    expect(r.facts.caveats).toContain('kinds-differ');
  });

  it('gathers rows past top-N under Other', async () => {
    const r = await service.resolve(view({ top: 1 }));
    expect(r.series[0].rows).toHaveLength(1);
    expect(r.series[0].other).toEqual({ value: '75.50', n: 2 });
    expect(r.facts.caveats).toContain('other-row');
  });

  it('refuses an invalid view with the validator errors', async () => {
    await expect(
      service.resolve(view({ chart: 'line' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
