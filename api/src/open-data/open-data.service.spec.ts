import JSZip from 'jszip';
import { NotFoundException } from '@nestjs/common';
import { OpenDataService, NO_OPEN_DATA } from './open-data.service.js';
import { PROGRAM_COLUMNS } from './open-data.mapper.js';
import { Prisma } from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CacheService } from '../cache/cache.service.js';
import {
  programALive,
  programASnapshot,
  programBLive,
  programBSnapshot,
} from './__fixtures__/snapshot.fixture.js';

const CYCLE = {
  id: 'cycle-2027',
  fiscalYear: 2027,
  status: 'OPEN',
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

const row = (
  snapshot: Record<string, unknown>,
  live: Record<string, unknown>,
  submittedAt: string,
) => ({
  ...live,
  // The live draft of a program in PUBLISHED_REVISION: never what is served.
  name: 'LIVE DRAFT NAME',
  publishedVersion: {
    snapshot,
    version: 3,
    submittedAt: new Date(submittedAt),
  },
});

const D = (v: number) => new Prisma.Decimal(v);
const node = (
  id: string,
  parentId: string | null,
  rootItemId: string,
  own: { ps?: number; mooe?: number; co?: number },
  total: number,
) => ({
  id,
  parentId,
  rootItemId,
  officeId: 'office-cago',
  hostOfficeId: null,
  papClass: null,
  aipReferenceCode: `1000-000-1-1-${id}`,
  name: `PPA ${id}`,
  majorFinalOutput: null,
  performanceIndicator: null,
  target: null,
  ps: D(own.ps ?? 0),
  mooe: D(own.mooe ?? 0),
  fe: D(0),
  co: D(own.co ?? 0),
  unsplit: D(0),
  total: D(total),
  fundSource: 'GF',
  orderIndex: 1,
});
/** R1 (own PS 100) over C1 (MOOE 200); R2 alone (CO 50). Σ roots = 350. */
const ITEMS = [
  node('r1', null, 'r1', { ps: 100 }, 300),
  node('c1', 'r1', 'r1', { mooe: 200 }, 200),
  node('r2', null, 'r2', { co: 50 }, 50),
];
const ENACTED_AT = new Date('2026-10-20T00:00:00Z');

function setup(
  openDataEnabled = true,
  { status = 'OPEN', enacted = false } = {},
) {
  const cycle = { ...CYCLE, status, budgetCycleId: 'cycle-2027' };
  const prisma = {
    aIPCycle: {
      findUnique: jest.fn(({ where }: { where: { fiscalYear: number } }) =>
        Promise.resolve(
          where.fiscalYear === 2027 ? { ...cycle, openDataEnabled } : null,
        ),
      ),
      findMany: jest.fn(() => Promise.resolve([{ ...cycle, openDataEnabled }])),
    },
    budgetDocument: {
      findMany: jest.fn(() =>
        Promise.resolve(
          enacted
            ? [
                {
                  id: 'ordinance-2027',
                  kind: 'ORDINANCE',
                  finalizedAt: ENACTED_AT,
                  budgetCycleId: 'cycle-2027',
                  budgetCycle: { aipCycle: { id: 'cycle-2027' } },
                },
              ]
            : [],
        ),
      ),
    },
    budgetItem: {
      findMany: jest.fn(({ where }: { where: { parentId?: null } }) =>
        Promise.resolve(
          where.parentId === null
            ? ITEMS.filter((i) => i.parentId === null).map((i) => ({
                ...i,
                office: {
                  acronym: 'CAgO',
                  name: 'Office of the City Agriculturist',
                  cluster: { name: 'Economic' },
                },
                finishLine: null,
                papSector: null,
              }))
            : ITEMS,
        ),
      ),
    },
    program: {
      groupBy: jest.fn(() => Promise.resolve([{ aipCycleId: 'cycle-2027' }])),
      findMany: jest.fn(() =>
        Promise.resolve([
          row(programASnapshot, programALive, '2026-10-10T00:00:00Z'),
          row(programBSnapshot, programBLive, '2026-10-12T08:00:00Z'),
        ]),
      ),
      findFirst: jest.fn(() =>
        Promise.resolve({ ...programALive, publishedVersion: { version: 3 } }),
      ),
    },
    pPMP: { findMany: jest.fn(() => Promise.resolve([])) },
    programVersion: {
      findMany: jest.fn(() =>
        Promise.resolve([
          { version: 3, submittedAt: new Date('2026-10-10T00:00:00Z') },
        ]),
      ),
    },
  };
  const cache = {
    getOrSet: (_k: string, _t: number, load: () => Promise<unknown>) => load(),
  };
  const service = new OpenDataService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
  );
  return { service, prisma };
}

async function notFoundBody(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(NotFoundException);
    return (e as NotFoundException).getResponse();
  }
  throw new Error('expected a 404');
}

describe('OpenDataService', () => {
  it('answers a closed year and an unknown year with the identical 404', async () => {
    const { service } = setup(false);
    const closed = await notFoundBody(service.findOpenCycle(2027));
    const unknown = await notFoundBody(service.findOpenCycle(1999));
    const garbage = await notFoundBody(service.findOpenCycle(Number('abc')));
    expect(closed).toEqual({ statusCode: 404, message: NO_OPEN_DATA });
    expect(unknown).toEqual(closed);
    expect(garbage).toEqual(closed);
    await notFoundBody(service.getBundle(2027));
    await notFoundBody(service.listPrograms(2027, {}));
  });

  it('returns the cycle for an open year', async () => {
    const { service } = setup();
    await expect(service.findOpenCycle(2027)).resolves.toMatchObject({
      id: 'cycle-2027',
      fiscalYear: 2027,
    });
  });

  it('reads only publicly visible programs of the cycle', async () => {
    const { service, prisma } = setup();
    await service.loadPublishedPrograms('cycle-2027');
    const call = prisma.program.findMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(call[0].where).toEqual({
      deletedAt: null,
      status: { not: 'ARCHIVED' },
      publishedVersionId: { not: null },
      aipCycleId: 'cycle-2027',
    });
  });

  it('serves the published snapshot, not the live draft (FR-002)', async () => {
    const { service } = setup();
    const program = await service.getProgram(2027, String(programASnapshot.id));
    expect(program.name).toBe('Cost Reduction Interventions');
    const list = await service.listPrograms(2027, {});
    expect(list.data.map((p) => p.name)).not.toContain('LIVE DRAFT NAME');
  });

  it('builds a zip with exactly the seven files, headed by the column definitions', async () => {
    const { service } = setup();
    const { zip, dataAsOf } = await service.getBundle(2027);
    const archive = await JSZip.loadAsync(zip);
    expect(Object.keys(archive.files).sort()).toEqual(
      [
        'METADATA.md',
        'climate-tags.csv',
        'funds.csv',
        'sample-budget-2027.json',
        'programs.csv',
        'project-activities.csv',
        'projects.csv',
      ].sort(),
    );
    const csv = await archive.file('programs.csv')!.async('string');
    const header = csv.slice(1).split('\r\n')[0];
    expect(header).toBe(PROGRAM_COLUMNS.map((c) => c.csvName).join(','));
    // The newest publish included, not the build time.
    expect(dataAsOf).toBe('2026-10-12T08:00:00.000Z');
  });

  it('totals.proposed is the sum of the included proposed totals', async () => {
    const { service } = setup();
    const cycle = await service.getCycle(2027);
    expect(cycle.totals.proposed).toBe('27051000.00'); // 851,000 + 26,200,000
    expect(cycle.counts).toEqual({ programs: 2, activities: 6, projects: 0 });
  });

  it('lists versions with the office and never a person', async () => {
    const { service } = setup();
    const versions = await service.listVersions(2027, 'any');
    expect(versions).toEqual([
      {
        version: 3,
        publishedAt: '2026-10-10T00:00:00.000Z',
        office: { code: 'CAgO', name: 'Office of the City Agriculturist' },
      },
    ]);
    expect(JSON.stringify(versions)).not.toMatch(/user|email|SALT/i);
  });

  it('caps limit at 500 and pages', async () => {
    const { service } = setup();
    expect((await service.listPrograms(2027, { limit: 5000 })).limit).toBe(500);
    const page2 = await service.listPrograms(2027, { limit: 1, page: 2 });
    expect(page2).toMatchObject({ page: 2, limit: 1, total: 2 });
    expect(page2.data[0].name).toMatch(/^Diagnostic/);
    const filtered = await service.listPrograms(2027, { office: 'cago' });
    expect(filtered.total).toBe(1);
  });

  describe('one dataset per document (specs/012 D14)', () => {
    it('answers a document the year lacks with the identical 404', async () => {
      const { service } = setup();
      const missing = await notFoundBody(service.getCycle(2027, 'annual'));
      const bogus = await notFoundBody(service.getCycle(2027, 'lep'));
      expect(missing).toEqual({ statusCode: 404, message: NO_OPEN_DATA });
      expect(bogus).toEqual(missing);
      await expect(service.getCycle(2027, 'aip')).resolves.toMatchObject({
        document: 'AIP',
      });
    });

    // CRITICAL: the year URL keeps meaning the AIP while the year has one.
    it('keeps the year URL on the AIP when the year also has an Ordinance', async () => {
      const { service } = setup(true, { status: 'ADOPTED', enacted: true });
      const year = await service.getCycle(2027);
      expect(year.document).toBe('AIP');
      expect(year.totals.proposed).toBe('27051000.00');
      const annual = await service.getCycle(2027, 'annual');
      expect(annual).toMatchObject({
        document: 'ANNUAL_BUDGET',
        dataAsOf: ENACTED_AT.toISOString(),
        counts: { programs: 2, activities: 2, projects: 0 },
      });
      expect(annual.totals).toMatchObject({
        proposed: '350.00',
        ps: '100.00',
        mooe: '200.00',
        co: '50.00',
      });
    });

    it('serves Ordinance PPAs through the same mapper, with no versions', async () => {
      const { service } = setup(true, { status: 'ADOPTED', enacted: true });
      const r1 = await service.getProgram(2027, 'r1', 'annual');
      expect(r1).toMatchObject({
        name: 'PPA r1',
        proposedTotal: '300.00',
        implementationStart: '2027-01',
        implementationEnd: '2027-12',
      });
      expect(r1.activities[0].implementationEnd).toBe('2027-12');
      await notFoundBody(service.getProgram(2027, 'r1'));
      await expect(service.listVersions(2027, 'r1', 'annual')).rejects.toThrow(
        NotFoundException,
      );
      const { zip } = await service.getBundle(2027, 'annual');
      const md = await (await JSZip.loadAsync(zip))
        .file('METADATA.md')!
        .async('string');
      expect(md).toContain('# Sample City 2027 Annual Budget');
    });

    it('lists every document of an open year with its own bundle', async () => {
      const { service } = setup(true, { status: 'ADOPTED', enacted: true });
      const [year] = await service.listCycles();
      expect(year).toMatchObject({
        document: 'AIP',
        bundleUrl: '/open-data/2027/sample-budget-2027.zip',
        documents: [
          {
            document: 'AIP',
            bundleUrl: '/open-data/2027/sample-budget-2027-aip.zip',
          },
          {
            document: 'ANNUAL_BUDGET',
            dataAsOf: ENACTED_AT.toISOString(),
            bundleUrl: '/open-data/2027/sample-budget-2027-annual.zip',
          },
        ],
      });
    });
  });
});
