import ExcelJS from 'exceljs';
import { PpmpExportService } from './ppmp-export.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OfficeScopeService } from '../permissions/office-scope.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import {
  ExpenseClass,
  FundSource,
  Prisma,
  PPMPProjectType,
  PPMPProcurementMode,
  Role,
} from '../generated/prisma/index';

const officeUser: JwtPayload = {
  sub: 'user-1',
  role: Role.STAFF,
  email: 'a@x.com',
  firstName: 'A',
  lastName: 'B',
  identityType: null,
  officeId: 'office-1',
  civilSocietyOrganizationId: null,
};

const officeScopeStub = () =>
  ({
    officeScopeWhere: jest
      .fn()
      .mockResolvedValue({ officeId: { in: ['office-1'] } }),
  }) as unknown as OfficeScopeService;

const ppmpRow = {
  id: 'ppmp-1',
  name: 'Office Supplies Plan',
  fundingProgram: '1000-2-02-22-002-002-000',
  isPublished: false,
  office: {
    id: 'office-1',
    acronym: 'ACTO',
    name: 'Arts, Culture and Tourism Office',
  },
  aipCycle: { fiscalYear: 2027 },
  lineItems: [
    {
      id: 'li-1',
      lineItemName: 'Office Supplies Procurement',
      typeOfProject: PPMPProjectType.GOODS,
      modeOfProcurement: PPMPProcurementMode.SMALL_VALUE_PROCUREMENT,
      uacsCode: '5020301000',
      uacsDescription: 'Office Supplies Expenses',
      quantity: new Prisma.Decimal('10.00'),
      unit: 'box',
      unitCost: new Prisma.Decimal('250.00'),
      lineTotal: new Prisma.Decimal('2500.00'),
      fundSource: FundSource.GF,
      expenseClass: ExpenseClass.MOOE,
      preProcurementConferenceRequired: false,
      procurementStartMonth: 1,
      procurementStartYear: 2027,
      procurementEndMonth: 3,
      procurementEndYear: 2027,
      deliveryPeriod: 'within 30 days of PO',
      supportingDocumentUrl: null,
      supportingDocumentName: null,
      remarks: null,
    },
  ],
};

describe('PpmpExportService.exportAll', () => {
  it('writes one worksheet per office with the PPMP name and line items', async () => {
    const prisma = {
      pPMP: { findMany: jest.fn().mockResolvedValue([ppmpRow]) },
    } as unknown as PrismaService;

    const service = new PpmpExportService(prisma, officeScopeStub());
    const result = await service.exportAll({}, officeUser);

    expect(result.fileName).toBe('ppmp-2027-export.xlsx');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as any);
    const sheet = workbook.getWorksheet('ACTO');
    expect(sheet).toBeDefined();

    const values = sheet!.getSheetValues().flat().map(String);
    expect(values.some((v) => v.includes('Office Supplies Plan'))).toBe(true);
    expect(values).toContain('5020301000');
    expect(values).toContain('1000-2-02-22-002-002-000');
    expect(values).toContain(
      'Estimated Budget / Authorized Budgetary Allocation (PhP)',
    );

    // Exact row layout: office title, one header row, the PPMP title, one
    // line-item row, one total row — not two header rows sandwiching
    // the title (a real bug once caught: `sheet.columns` with a `header` key
    // auto-writes its own header row at row 1).
    const rowTexts = sheet!
      .getRows(1, sheet!.rowCount)!
      .map((r) => (r.getCell(2).value as string | null) ?? '');
    expect(rowTexts).toEqual([
      'Arts, Culture and Tourism Office',
      'Line Item Name',
      'Office Supplies Plan (1000-2-02-22-002-002-000)',
      'Office Supplies Procurement',
      '',
    ]);
  });

  it('sums the line total onto the relabeled total row exactly', async () => {
    const prisma = {
      pPMP: { findMany: jest.fn().mockResolvedValue([ppmpRow]) },
    } as unknown as PrismaService;

    const service = new PpmpExportService(prisma, officeScopeStub());
    const result = await service.exportAll({}, officeUser);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as any);
    const sheet = workbook.getWorksheet('ACTO')!;

    let totalValue: number | undefined;
    sheet.eachRow((row) => {
      if (
        row.getCell(10).value ===
        'Estimated Budget / Authorized Budgetary Allocation (PhP)'
      ) {
        totalValue = row.getCell(11).value as number;
      }
    });
    expect(totalValue).toBe(2500);
  });

  it('emits a placeholder sheet when nothing matches the filters', async () => {
    const prisma = {
      pPMP: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const service = new PpmpExportService(prisma, officeScopeStub());
    const result = await service.exportAll({}, officeUser);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as any);
    expect(workbook.getWorksheet('PPMP')).toBeDefined();
  });
});
