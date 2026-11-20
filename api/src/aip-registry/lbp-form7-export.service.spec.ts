import { ForbiddenException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { FundSource, Prisma } from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  ALL_OFFICES,
  type OfficeScopeService,
} from '../permissions/office-scope.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { LbpForm7ExportService } from './lbp-form7-export.service.js';

const user = { sub: 'u1', role: 'SUPER_ADMIN' } as unknown as JwtPayload;

const OFFICES = [
  {
    id: 'cmo',
    acronym: 'CMO',
    form7Column: 'GENERAL_PUBLIC',
  },
  {
    id: 'cto',
    acronym: 'CTO',
    form7Column: 'GENERAL_PUBLIC',
  },
  { id: 'cho', acronym: 'CHO', form7Column: 'SOCIAL' },
  {
    id: 'ncgh',
    acronym: 'NCGH',
    form7Column: 'ECONOMIC_ENTERPRISE',
  },
  { id: 'new', acronym: 'NEW', form7Column: null },
];

/** A direct-cost GF program with its own PS/MOOE/FE/CO. */
function program(
  id: string,
  officeId: string,
  m: { ps?: string; mooe?: string; fe?: string; co?: string },
  fundSources: string[] = ['GF'],
) {
  const total = ['ps', 'mooe', 'fe', 'co']
    .map((k) => new Prisma.Decimal(m[k as keyof typeof m] ?? '0'))
    .reduce((a, b) => a.plus(b));
  return {
    id,
    officeId,
    hostOfficeId: null,
    office: { id: officeId, name: officeId, acronym: officeId.toUpperCase() },
    papClass: 'OPERATIONS',
    tentativeAipReferenceCode: `CODE-${id}`,
    aipReferenceCode: null,
    name: `Program ${id}`,
    costMode: 'DIRECT_COSTS',
    fundSources,
    fundAllocations: [],
    psProposedTotal: m.ps ?? '0',
    mooeProposedTotal: m.mooe ?? '0',
    feProposedTotal: m.fe ?? '0',
    coProposedTotal: m.co ?? '0',
    proposedTotal: total.toFixed(2),
    projectActivities: [],
    publishedVersionId: 'v',
    publishedVersion: null,
  };
}

const PROGRAMS = [
  program('a', 'cmo', { ps: '100', mooe: '50' }),
  program('b', 'cto', { mooe: '20', fe: '5' }),
  program('c', 'cho', { co: '300' }),
  program('d', 'ncgh', { mooe: '40' }),
  program('e', 'new', { mooe: '7' }),
  // A special fund's row sits under a real office: on the GF form it is the
  // SPA lump sum, not CMO's column, and its sum wins over the stated amount.
  program('f', 'cmo', { mooe: '11' }, ['SPA']),
];

function setup(scope: string[] | typeof ALL_OFFICES = ALL_OFFICES) {
  const prisma = {
    aIPCycle: {
      findUnique: jest.fn().mockResolvedValue({ id: 'c1', fiscalYear: 2027 }),
    },
    office: { findMany: jest.fn().mockResolvedValue(OFFICES) },
    fundStatedAmount: {
      findMany: jest.fn().mockResolvedValue([
        { fundSource: 'LDF', statedAmount: new Prisma.Decimal('272000000') },
        { fundSource: 'SPA', statedAmount: new Prisma.Decimal('99') },
      ]),
    },
    program: { findMany: jest.fn().mockResolvedValue(PROGRAMS) },
    aIPExportLog: {
      create: jest.fn().mockResolvedValue({ id: 'log' }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const scopeService = {
    effectiveOfficeIds: jest.fn().mockResolvedValue(scope),
  };
  return {
    prisma,
    service: new LbpForm7ExportService(
      prisma as unknown as PrismaService,
      scopeService as unknown as OfficeScopeService,
    ),
  };
}

describe('LbpForm7ExportService', () => {
  it('adds each office into its own column and nowhere else', async () => {
    const f = await setup().service.figures('c1', FundSource.GF, 'working');
    expect(f.byColumn.GENERAL_PUBLIC.total.toFixed(2)).toBe('175.00');
    expect(f.byColumn.GENERAL_PUBLIC.fe.toFixed(2)).toBe('5.00');
    expect(f.byColumn.SOCIAL.co.toFixed(2)).toBe('300.00');
    expect(f.byColumn.ECONOMIC.total.isZero()).toBe(true);
    expect(f.byColumn.ECONOMIC_ENTERPRISE.total.toFixed(2)).toBe('40.00');
    expect(f.appropriations.total.toFixed(2)).toBe('515.00');
  });

  it('keeps special funds out of the columns, in the lump sums only', async () => {
    const f = await setup().service.figures('c1', FundSource.GF, 'working');
    const lump = (a: string) =>
      f.lumpSums.find((l) => l.fund === a)!.amount.toFixed(2);
    // SPA money sits on a CMO program: its sum wins over the stated amount.
    expect(lump('SPA')).toBe('11.00');
    // LDF lists none: its stated amount stands in, flagged.
    expect(lump('LDF')).toBe('272000000.00');
    // LDRRMF has neither: the row still prints, at zero.
    expect(lump('LDRRMF')).toBe('0.00');
    expect(f.lumpSums.map((l) => l.fund)).toEqual(['SPA', 'LDF', 'LDRRMF']);
    expect(f.specialFundFlags.map((g) => [g.officeAcronym, g.code])).toEqual([
      ['SPA', 'stated ≠ programs'],
      ['LDF', 'stated, no PPAs'],
    ]);
  });

  it("puts a special fund's own form in the columns, with no lump sums", async () => {
    const f = await setup().service.figures('c1', FundSource.SPA, 'working');
    expect(f.byColumn.GENERAL_PUBLIC.total.toFixed(2)).toBe('11.00');
    expect(f.lumpSums.every((l) => l.amount.isZero())).toBe(true);
    expect(f.specialFundFlags).toEqual([]);
    expect(f.grandTotal.toFixed(2)).toBe('11.00');
  });

  it('makes GRAND TOTAL = TOTAL APPROPRIATIONS + the lump sums', async () => {
    const f = await setup().service.figures('c1', FundSource.GF, 'working');
    expect(f.grandTotal.toFixed(2)).toBe('272000526.00');
  });

  it('leaves an office with no column out, and lists it', async () => {
    const f = await setup().service.figures('c1', FundSource.GF, 'working');
    expect(
      f.unassigned.map((g) => [g.officeAcronym, g.amount.toFixed(2)]),
    ).toEqual([['NEW', '7.00']]);
  });

  it('refuses a caller scoped to some offices', async () => {
    const { service, prisma } = setup(['cmo']);
    await expect(
      service.export(
        { cycleId: 'c1', fund: FundSource.GF, figures: 'working' },
        user,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.aIPExportLog.create).not.toHaveBeenCalled();
  });

  it('writes a protected workbook whose GRAND TOTAL row matches the figures', async () => {
    const { service } = setup();
    const file = await service.export(
      { cycleId: 'c1', fund: FundSource.GF, figures: 'working' },
      user,
    );
    expect(file.fileName).toBe('LBP7-2027-GF-DRAFT.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer as never);
    const sheet = wb.getWorksheet('LBP Form 7')!;
    let grand: unknown;
    sheet.eachRow((row) => {
      if (row.getCell(1).value === 'GRAND TOTAL') grand = row.getCell(7).value;
    });
    expect(grand).toBe(272000526);
    for (const s of wb.worksheets)
      expect(
        (s as unknown as { sheetProtection?: { sheet?: boolean } })
          .sheetProtection?.sheet,
      ).toBe(true);
  });
});
