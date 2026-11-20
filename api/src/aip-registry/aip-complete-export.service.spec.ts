import ExcelJS from 'exceljs';
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';
import { OfficeScopeService } from '../permissions/office-scope.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { AIPCompleteExportService } from './aip-complete-export.service.js';

const SUPER_ADMIN: JwtPayload = {
  sub: 'user-1',
  role: 'SUPER_ADMIN',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
  identityType: null,
  officeId: 'office-cmo',
  civilSocietyOrganizationId: null,
};

function buildScopeMock(scope: 'ALL' | string[] = 'ALL') {
  return {
    effectiveOfficeIds: jest.fn().mockResolvedValue(scope),
  } as unknown as OfficeScopeService;
}

const peso = (value: string) => new Prisma.Decimal(value);

type ActivityOverrides = Partial<{
  parentProjectActivityId: string | null;
  fundSources: string[];
  psEstimate: Prisma.Decimal | null;
  mooeEstimate: Prisma.Decimal | null;
  feEstimate: Prisma.Decimal | null;
  coEstimate: Prisma.Decimal | null;
  proposedBudget: Prisma.Decimal | null;
  cca: string;
  ccm: string;
}>;

function activity(
  id: string,
  orderIndex: number,
  over: ActivityOverrides = {},
) {
  return {
    id,
    parentProjectActivityId: over.parentProjectActivityId ?? null,
    type: 'ACTIVITY',
    orderIndex,
    createdAt: new Date('2027-01-01T00:00:00Z'),
    name: `Activity ${id}`,
    expectedOutput: 'An output',
    aipReferenceCode: `CODE-${id}`,
    tentativeAipReferenceCode: `TMP-${id}`,
    implementationStartMonth: 1,
    implementationStartYear: 2027,
    implementationEndMonth: 12,
    implementationEndYear: 2027,
    fundSources: over.fundSources ?? ['GF'],
    psEstimate: over.psEstimate ?? null,
    mooeEstimate: over.mooeEstimate ?? null,
    feEstimate: over.feEstimate ?? null,
    coEstimate: over.coEstimate ?? null,
    proposedBudget: over.proposedBudget ?? null,
    climateChangeTag:
      over.cca || over.ccm
        ? {
            ccaAmount: peso(over.cca ?? '0'),
            ccmAmount: peso(over.ccm ?? '0'),
            codes: [{ ccetCode: { code: 'CCA_003' } }],
          }
        : null,
  };
}

function office(
  id: string,
  acronym: string,
  name: string,
  papSectorCode: string,
  aipSectorGroup: string | null = null,
) {
  return {
    id,
    acronym,
    name,
    officeType: 'MANDATORY',
    officeCode: '01',
    aipSectorGroup,
    papSector: { code: papSectorCode },
  };
}

function program(
  id: string,
  officeRecord: ReturnType<typeof office>,
  projectActivities: ReturnType<typeof activity>[],
) {
  return {
    id,
    name: `Program ${id}`,
    papClass: 'OPERATIONS',
    aipReferenceCode: `PROG-${id}`,
    tentativeAipReferenceCode: `TMP-PROG-${id}`,
    expectedOutput: 'A programme output',
    implementationStartMonth: 1,
    implementationStartYear: 2027,
    implementationEndMonth: 12,
    implementationEndYear: 2027,
    office: officeRecord,
    hostOffice: null,
    supportingOffices: [],
    sdgGoals: [],
    projectActivities,
  };
}

// CMO: papSector 1000 with no override — the fallback path to GENERAL_PUBLIC.
const CMO = office('office-cmo', 'CMO', 'City Mayor Office', '1000');
// CPRFMO and OSCA are both papSector 1000, so the fallback would file them under
// GENERAL_PUBLIC. Their overrides are the whole reason the column exists.
const CPRFMO = office(
  'office-cprfmo',
  'CPRFMO',
  'City Parks Office',
  '1000',
  'ENVI_INFRA',
);
const OSCA = office(
  'office-osca',
  'OSCA',
  'Senior Citizens Office',
  '1000',
  'SOCIAL',
);
// papSector 8000 with no override — the other fallback branch.
const CAGO = office('office-cago', 'CAgO', 'City Agriculture Office', '8000');

const programs = [
  program('cmo', CMO, [
    activity('gf', 1, {
      psEstimate: peso('1000000'),
      mooeEstimate: peso('2000000'),
      proposedBudget: peso('3000000'),
      cca: '100000',
    }),
    // Two funds cited and no amount split anywhere in the schema — this row is
    // the reason MULTIPLE SOURCES exists.
    activity('multi', 2, {
      fundSources: ['GF', 'NGA'],
      proposedBudget: peso('5000000'),
    }),
    // No fund cited at all: falls back to GF, as the column did before the
    // field existed.
    activity('none', 3, {
      fundSources: [],
      proposedBudget: peso('1000000'),
    }),
    // A parent and its child. buildProgramRows rolls the child's climate amount
    // up into the parent, so counting both would double it.
    activity('parent', 4, {}),
    activity('child', 5, {
      parentProjectActivityId: 'parent',
      proposedBudget: peso('4000000'),
      cca: '400000',
    }),
  ]),
  program('cprfmo', CPRFMO, [
    activity('park', 1, { proposedBudget: peso('7000000') }),
  ]),
  program('osca', OSCA, [
    activity('senior', 1, { proposedBudget: peso('2000000') }),
  ]),
  program('cago', CAGO, [
    activity('farm', 1, { proposedBudget: peso('6000000') }),
  ]),
];

/** Column header row on every sector sheet — title, sector label, then headers. */
const HEADER_ROW = 3;

function buildPrismaMock(records: unknown[] = programs) {
  return {
    aIPCycle: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'cycle-2027',
        fiscalYear: 2027,
      }),
    },
    office: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ name: 'City Mayor Office', acronym: 'CMO' }),
    },
    program: {
      findMany: jest.fn().mockResolvedValue(records),
    },
    aIPExportLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      update: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
  } as unknown as PrismaService;
}

/** First row whose column A holds `label`, or 0. */
function rowOf(sheet: ExcelJS.Worksheet, label: string): number {
  let found = 0;
  sheet.eachRow((row, rowNumber) => {
    if (!found && row.getCell(1).value === label) found = rowNumber;
  });
  return found;
}

async function exportWorkbook(prisma = buildPrismaMock(), scope = 'ALL') {
  const service = new AIPCompleteExportService(
    prisma,
    buildScopeMock(scope as 'ALL'),
  );
  const result = await service.exportComplete('cycle-2027', SUPER_ADMIN);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.buffer as unknown as ExcelJS.Buffer);
  return { result, workbook };
}

describe('AIPCompleteExportService', () => {
  it('opens on the cover page, then the summary, the sector sheets, then fund source', async () => {
    const { result, workbook } = await exportWorkbook();

    expect(result.fileName).toBe('aip-2027-complete-export.xlsx');
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Export Info',
      'Executive Summary',
      'GENERAL PUBLIC',
      'ECONOMIC',
      'ENVIINFRA',
      'SOCIAL',
      'Fund Source',
    ]);
  });

  it('records who generated the file, from where, and what it covers', async () => {
    const { workbook } = await exportWorkbook();
    const sheet = workbook.getWorksheet('Export Info')!;

    expect(sheet.getCell('A1').value).toBe('2027 COMPLETE AIP EXPORT');
    const value = (label: string) =>
      sheet.getCell(`B${rowOf(sheet, label)}`).value;

    expect(value('Generated by')).toBe('Admin User (admin@example.com)');
    expect(value('Office')).toBe('City Mayor Office (CMO)');
    expect(value('Fiscal year')).toBe(2027);
    expect(value('Programs included')).toBe('4 across 4 office(s)');
    // The timestamp is the point of the sheet, so assert its shape rather than
    // freezing the clock.
    expect(value('Generated at')).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/,
    );

    // The per-sheet table ties to the sector sheets: 13 + 6 + 7 + 2 = 28M.
    const totalRow = rowOf(sheet, 'TOTAL');
    expect(sheet.getCell(`D${totalRow}`).value).toBe(28);
  });

  it('says "no office assigned" rather than blank when the exporter has none', async () => {
    const prisma = buildPrismaMock();
    (prisma.office.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new AIPCompleteExportService(prisma, buildScopeMock());
    const out = await service.exportComplete('cycle-2027', {
      ...SUPER_ADMIN,
      officeId: null,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(out.buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Export Info')!;
    expect(sheet.getCell(`B${rowOf(sheet, 'Office')}`).value).toBe(
      '— (no office assigned)',
    );
  });

  it('bands a sheet in its sector hue, over constant chrome', async () => {
    const { workbook } = await exportWorkbook();
    const sheet = workbook.getWorksheet('GENERAL PUBLIC')!;
    const fill = (row: number) =>
      (sheet.getCell(row, 1).fill as ExcelJS.FillPattern)?.fgColor?.argb;

    // Chrome: the same on every sheet, because these two rows mean the same
    // thing on every sheet.
    expect(fill(HEADER_ROW)).toBe('FF1E293B');
    expect(fill(rowOf(sheet, 'TOTAL'))).toBe('FF1E293B');

    // Hue: the office band and its subtotal carry the sector's colour.
    expect(fill(4)).toBe('FF1447E6');
    expect(fill(rowOf(sheet, 'SUB-TOTAL, CMO'))).toBe('FFDBE4FD');

    // papClass headings stay on the city's own grey.
    expect(fill(5)).toBe('FFCCCCCC');

    // The band runs the sheet's full width, not just to the last written cell.
    expect(
      (sheet.getCell(4, 15).fill as ExcelJS.FillPattern)?.fgColor?.argb,
    ).toBe('FF1447E6');
    expect(sheet.getCell(4, 1).font?.color?.argb).toBe('FFFFFFFF');
  });

  it('gives each sector sheet its own hue and tab, and the rest the chrome', async () => {
    const { workbook } = await exportWorkbook();
    const tab = (name: string) =>
      (workbook.getWorksheet(name)!.properties.tabColor as { argb?: string })
        ?.argb;

    expect(tab('GENERAL PUBLIC')).toBe('FF1447E6');
    expect(tab('ECONOMIC')).toBe('FFB45309');
    expect(tab('ENVIINFRA')).toBe('FF15803D');
    expect(tab('SOCIAL')).toBe('FF7E22CE');
    // Neither cross-cutting sheet is a sector, so neither takes a sector hue.
    expect(tab('Export Info')).toBe('FF1E293B');
    expect(tab('Fund Source')).toBe('FF1E293B');

    // Each office band differs per sheet — the hue is the point.
    const officeFill = (name: string) =>
      (workbook.getWorksheet(name)!.getCell(4, 1).fill as ExcelJS.FillPattern)
        ?.fgColor?.argb;
    expect(officeFill('ENVIINFRA')).toBe('FF15803D');
    expect(officeFill('SOCIAL')).toBe('FF7E22CE');
  });

  it('files an office by its override, not its PAP sector', async () => {
    const { workbook } = await exportWorkbook();

    // All three offices are papSector 1000. Without the override column every
    // one of them would land on GENERAL PUBLIC.
    expect(
      rowOf(workbook.getWorksheet('GENERAL PUBLIC')!, 'CITY MAYOR OFFICE'),
    ).toBeGreaterThan(0);
    expect(
      rowOf(workbook.getWorksheet('ENVIINFRA')!, 'CITY PARKS OFFICE'),
    ).toBeGreaterThan(0);
    expect(
      rowOf(workbook.getWorksheet('SOCIAL')!, 'SENIOR CITIZENS OFFICE'),
    ).toBeGreaterThan(0);
    // papSector 8000 with no override still reaches ECONOMIC by the fallback.
    expect(
      rowOf(workbook.getWorksheet('ECONOMIC')!, 'CITY AGRICULTURE OFFICE'),
    ).toBeGreaterThan(0);

    // And none of them leaked onto the sheet the fallback would have chosen.
    expect(
      rowOf(workbook.getWorksheet('GENERAL PUBLIC')!, 'CITY PARKS OFFICE'),
    ).toBe(0);
    expect(
      rowOf(workbook.getWorksheet('GENERAL PUBLIC')!, 'SENIOR CITIZENS OFFICE'),
    ).toBe(0);
  });

  it('lays out the sheet as title, sector, header, office, section', async () => {
    const { workbook } = await exportWorkbook();
    const sheet = workbook.getWorksheet('GENERAL PUBLIC')!;

    expect(sheet.getCell('A1').value).toBe('2027 ANNUAL INVESTMENT PLAN');
    expect(sheet.getCell('A2').value).toBe('General Public Services');
    expect(sheet.getCell('A3').value).toBe('AIP Reference Code');
    expect(sheet.getCell('H3').value).toBe('PS');
    expect(sheet.getCell('A4').value).toBe('CITY MAYOR OFFICE');
    expect(sheet.getCell('A5').value).toBe('OPERATIONS');
    expect(sheet.getCell('A6').value).toBe('PROG-cmo');
  });

  it('sums leaf rows only, so climate amounts are not double-counted', async () => {
    const { workbook } = await exportWorkbook();
    const sheet = workbook.getWorksheet('GENERAL PUBLIC')!;
    const subtotal = rowOf(sheet, 'SUB-TOTAL, CMO');

    // 3 + 5 + 1 + 4 = 13M. The parent row and the program row carry no money.
    expect(sheet.getCell(`L${subtotal}`).value).toBe(13);
    expect(sheet.getCell(`H${subtotal}`).value).toBe(1);
    expect(sheet.getCell(`I${subtotal}`).value).toBe(2);

    // The child's ₱400k is rolled up into its parent *and* into the program
    // row. Counting every row would report 1.4M here instead of 0.5M.
    expect(sheet.getCell(`M${subtotal}`).value).toBe(0.5);
  });

  it('adds the subtotal cells for the grand total rather than re-summing', async () => {
    const { workbook } = await exportWorkbook();
    const sheet = workbook.getWorksheet('GENERAL PUBLIC')!;
    const subtotal = rowOf(sheet, 'SUB-TOTAL, CMO');
    const total = rowOf(sheet, 'TOTAL');

    expect(total).toBeGreaterThan(subtotal);
    expect(sheet.getCell(`L${total}`).value).toEqual({
      formula: `L${subtotal}`,
      // ExcelJS keeps a result slot on formula cells; only the formula matters.
      result: undefined,
    });
  });

  it('attributes a PPA wholly to its single fund, and never splits a multi-fund one', async () => {
    const { workbook } = await exportWorkbook();
    const sheet = workbook.getWorksheet('Fund Source')!;

    // GF gets the one GF row (3M), the unsourced row that defaults to GF (1M),
    // and the child row (4M) — 8M. The two-fund row is not divided into it.
    const gf = rowOf(sheet, 'GF');
    expect(sheet.getCell(`F${gf}`).value).toBe(8);

    const multiple = rowOf(sheet, 'MULTIPLE SOURCES');
    expect(sheet.getCell(`F${multiple}`).value).toBe(5);

    // NGA is cited only by that row, so it must stay empty rather than pick up
    // half of it.
    const nga = rowOf(sheet, 'NGA');
    expect(sheet.getCell(`F${nga}`).value).toBe(0);
  });

  it('summarises each office within its sector, then the sectors against the city', async () => {
    const { workbook } = await exportWorkbook();
    const sheet = workbook.getWorksheet('Executive Summary')!;

    // This year only: office, PS, MOOE, FE, CO, Total, % — no prior-year columns.
    const header = rowOf(sheet, 'NAME OF OFFICE');
    expect(
      [1, 2, 3, 4, 5, 6, 7, 8].map((col) => sheet.getCell(header, col).value),
    ).toEqual(['NAME OF OFFICE', 'PS', 'MOOE', 'FE', 'CO', 'Total', '%', null]);

    // CMO is the whole GENERAL PUBLIC block: 3 + 5 + 1 + 4 = 13M, 100% of it.
    const cmo = rowOf(sheet, 'City Mayor Office');
    expect(sheet.getCell(`F${cmo}`).value).toBe(13);
    expect(sheet.getCell(`G${cmo}`).value).toBe(1);
    expect(sheet.getCell(`B${cmo}`).value).toBe(1);
    expect(sheet.getCell(`C${cmo}`).value).toBe(2);

    // The sector table adds up to the city: 13 + 6 + 7 + 2 = 28M.
    const sectors = rowOf(sheet, 'SECTOR / EXPENDITURE TYPE');
    let cityTotal: unknown;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > sectors && row.getCell(1).value === 'TOTAL') {
        cityTotal ??= row.getCell(6).value;
      }
    });
    expect(cityTotal).toBe(28);
    const general = (() => {
      let found = 0;
      sheet.eachRow((row, rowNumber) => {
        if (
          !found &&
          rowNumber > sectors &&
          row.getCell(1).value === 'General Public Services'
        )
          found = rowNumber;
      });
      return found;
    })();
    expect(general).toBeGreaterThan(0);
    expect(sheet.getCell(`G${general}`).value).toBeCloseTo(13 / 28, 5);
  });

  it('prints a fund under its label, so DON/GRANTS, TF and JV are not always zero', async () => {
    const donated = program('donated', OSCA, [
      activity('grant', 1, {
        fundSources: ['DONATIONS_GRANTS'],
        proposedBudget: peso('3000000'),
      }),
    ]);
    const { workbook } = await exportWorkbook(
      buildPrismaMock([...programs, donated]),
    );
    const sheet = workbook.getWorksheet('Fund Source')!;
    expect(rowOf(sheet, 'DONATIONS_GRANTS')).toBe(0);
    // Read it off the city-wide SUMMARY block: OSCA is a SOCIAL office.
    const summary = rowOf(sheet, 'SUMMARY');
    let donations: unknown;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > summary && row.getCell(1).value === 'DON/GRANTS') {
        donations ??= row.getCell(6).value;
      }
    });
    expect(donations).toBe(3);
  });

  it('ties the fund source SUMMARY to the whole city', async () => {
    const { workbook } = await exportWorkbook();
    const sheet = workbook.getWorksheet('Fund Source')!;
    const summaryRow = rowOf(sheet, 'SUMMARY');
    expect(summaryRow).toBeGreaterThan(0);

    // 13 (CMO) + 7 (CPRFMO) + 2 (OSCA) + 6 (CAgO) = 28M.
    let cityTotal: unknown;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > summaryRow && row.getCell(1).value === 'TOTAL') {
        cityTotal ??= row.getCell(6).value;
      }
    });
    expect(cityTotal).toBe(28);
  });

  it('still emits every sheet when a sector group has no programs', async () => {
    const { workbook } = await exportWorkbook(buildPrismaMock([]));

    expect(workbook.worksheets).toHaveLength(7);
    const sheet = workbook.getWorksheet('SOCIAL')!;
    expect(sheet.getCell('A3').value).toBe('AIP Reference Code');
    expect(sheet.getCell(`L${rowOf(sheet, 'TOTAL')}`).value).toBe(0);
  });

  it('refuses a caller scoped to specific offices', async () => {
    const prisma = buildPrismaMock();
    const service = new AIPCompleteExportService(
      prisma,
      buildScopeMock(['office-cmo']),
    );

    await expect(
      service.exportComplete('cycle-2027', SUPER_ADMIN),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // Refused before anything was logged or queried.
    expect(prisma.aIPExportLog.create).not.toHaveBeenCalled();
    expect(prisma.program.findMany).not.toHaveBeenCalled();
  });

  it('records the export log as generated', async () => {
    const prisma = buildPrismaMock();
    await exportWorkbook(prisma);

    expect(prisma.aIPExportLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'COMPLETE_AIP',
          status: 'PENDING',
          fileName: 'aip-2027-complete-export.xlsx',
        }),
      }),
    );
    expect(prisma.aIPExportLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'GENERATED' },
      }),
    );
  });
});
