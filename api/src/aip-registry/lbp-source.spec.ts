import { BadRequestException } from '@nestjs/common';
import { FundSource, Prisma } from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';
import { attribute, loadLbpSource, moneyRows } from './lbp-figures.js';

/** specs/012 P6: LBP figures read from a finalized budget document. */
const D = (v: number) => new Prisma.Decimal(v);
const node = (
  id: string,
  parentId: string | null,
  own: { ps?: number; mooe?: number },
  total: number,
  fundSource: string | null = 'GF',
) => ({
  id,
  parentId,
  rootItemId: 'r1',
  officeId: 'o1',
  hostOfficeId: null,
  papClass: 'OPERATIONS',
  aipReferenceCode: `1000-${id}`,
  name: `PPA ${id}`,
  majorFinalOutput: null,
  performanceIndicator: null,
  target: null,
  ps: D(own.ps ?? 0),
  mooe: D(own.mooe ?? 0),
  fe: D(0),
  co: D(0),
  unsplit: D(0),
  total: D(total),
  fundSource,
  orderIndex: 1,
});
/** A root with own PS 100 over a child with MOOE 200 on the Special Health Fund. */
const ITEMS = [
  node('r1', null, { ps: 100 }, 300),
  node('c1', 'r1', { mooe: 200 }, 200, 'SHF'),
];

function prisma(status = 'ENACTED') {
  return {
    budgetDocument: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'doc-1'
            ? {
                id: 'doc-1',
                kind: 'ORDINANCE',
                status,
                budgetCycle: { fiscalYear: 2026 },
              }
            : null,
        ),
      ),
    },
    budgetItem: {
      findMany: jest.fn(({ where }: { where: { parentId?: null } }) =>
        Promise.resolve(
          where.parentId === null
            ? [
                {
                  ...ITEMS[0],
                  office: { id: 'o1', name: 'City Health', acronym: 'CHO' },
                },
              ]
            : ITEMS,
        ),
      ),
    },
  } as unknown as PrismaService;
}

describe('loadLbpSource: document', () => {
  it("reads the document's PPAs, each money row once, on its own fund", async () => {
    const loaded = await loadLbpSource(
      prisma(),
      { cycleId: 'c', figures: 'document', documentId: 'doc-1' },
      'ALL',
    );
    expect(loaded.sourceLabel).toBe('FY2026 Appropriation Ordinance (enacted)');
    const [p] = loaded.programs;
    expect(p.total.toFixed(2)).toBe('300.00');
    const on = (fund: FundSource) =>
      moneyRows(p)
        .map((r) => attribute(r, fund).money?.total.toFixed(2))
        .filter(Boolean);
    // The root's own money is a leaf of its own; nothing is counted twice.
    expect(on(FundSource.GF)).toEqual(['100.00']);
    expect(on(FundSource.SHF)).toEqual(['200.00']);
  });

  it('refuses a draft, a missing id, or another year', async () => {
    for (const [db, documentId] of [
      [prisma('DRAFT'), 'doc-1'],
      [prisma(), undefined],
      [prisma(), 'doc-other-year'],
    ] as const)
      await expect(
        loadLbpSource(
          db,
          { cycleId: 'c', figures: 'document', documentId },
          'ALL',
        ),
      ).rejects.toThrow(BadRequestException);
  });
});
