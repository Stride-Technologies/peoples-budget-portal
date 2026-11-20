import type { CacheService } from '../cache/cache.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/index';
import { CatalogueService, usedValues } from './catalogue.service.js';
import type { Row } from './sources.js';

/**
 * decisions.md R6 (amended 2026-11-09): a year is in the explorer when it has
 * published data, whether or not its open data download is switched on.
 */
describe('CatalogueService public years', () => {
  const cycle = (fiscalYear: number, programs: number) => ({
    id: `c${fiscalYear}`,
    fiscalYear,
    _count: { programs },
  });
  const doc = (id: string, kind: 'LEP' | 'ORDINANCE', fiscalYear: number) => ({
    id,
    kind,
    budgetCycle: { fiscalYear, aipCycle: { id: `c${fiscalYear}` } },
  });
  const cycles = jest
    .fn()
    .mockResolvedValue([cycle(2027, 492), cycle(2026, 0), cycle(2025, 0)]);
  // First call: PUBLIC_ANNUAL_DOCUMENT; second (drafts on): every LEP/ordinance.
  const documents = jest
    .fn()
    .mockImplementation(({ where }: { where: unknown }) =>
      Promise.resolve(
        JSON.stringify(where).includes('"in"')
          ? [
              doc('o2026', 'ORDINANCE', 2026),
              doc('l2026', 'LEP', 2026),
              doc('l2024', 'LEP', 2024),
            ]
          : [doc('o2026', 'ORDINANCE', 2026), doc('l2025', 'LEP', 2025)],
      ),
    );
  const svc = new CatalogueService(
    {
      aIPCycle: { findMany: cycles },
      budgetDocument: { findMany: documents },
    } as unknown as PrismaService,
    {} as CacheService,
  );
  const docs = () =>
    (
      svc as unknown as {
        publicDocuments(): Promise<
          { kind: string; year: number; label: string; draft?: true }[]
        >;
      }
    ).publicDocuments();
  afterEach(() => delete process.env.EXPLORER_INCLUDE_DRAFTS);

  it('does not filter on openDataEnabled', async () => {
    await docs();
    expect(JSON.stringify(cycles.mock.calls[0][0])).not.toContain(
      'openDataEnabled',
    );
  });

  it('lists a published AIP and the public annual documents, and no draft', async () => {
    expect((await docs()).map((d) => `${d.kind}:${d.year}`)).toEqual([
      'aip:2027',
      'ordinance:2026',
      'lep:2025',
    ]);
  });

  it('adds drafts only when EXPLORER_INCLUDE_DRAFTS=1, labelled as drafts (W15)', async () => {
    process.env.EXPLORER_INCLUDE_DRAFTS = '1';
    const out = await docs();
    expect(out.map((d) => `${d.kind}:${d.year}`)).toEqual([
      'aip:2027',
      'ordinance:2026',
      'lep:2026',
      'lep:2025',
      'lep:2024',
    ]);
    expect(out.find((d) => d.year === 2024)?.label).toContain('(draft)');
    expect(out.find((d) => d.year === 2024)?.draft).toBe(true);
    expect(out.find((d) => d.kind === 'ordinance')?.label).not.toContain(
      'draft',
    );
  });
});

/** Phase 0 finding 3: pickers list only values the public data uses. */
describe('usedValues', () => {
  const d = (v: string) => new Prisma.Decimal(v);
  const row = (o: Partial<Row>): Row => ({
    id: 'r',
    label: 'r',
    officeId: null,
    sectorId: null,
    finishLineId: null,
    subFinishLineId: null,
    themeIds: [],
    money: { ps: d('0'), mooe: d('5'), fe: d('0'), co: d('0'), total: d('5') },
    byFund: {},
    ...o,
  });

  it('collects ids and codes that carry rows, and skips empty classes and the multi-fund bucket', () => {
    const u = usedValues([
      row({
        officeId: 'cho',
        sectorId: 's3000',
        themeIds: ['youth'],
        byFund: { GF: d('5'), _multi: d('1'), SEF: d('0') },
      }),
      row({ officeId: null, finishLineId: 'fl1' }),
    ]);
    expect([...u.office]).toEqual(['cho']);
    expect([...u.sector]).toEqual(['s3000']);
    expect([...u.finishLine]).toEqual(['fl1']);
    expect([...u.theme]).toEqual(['youth']);
    expect([...u.fund]).toEqual(['GF']);
    expect([...u.expenseClass]).toEqual(['MOOE']);
  });
});
