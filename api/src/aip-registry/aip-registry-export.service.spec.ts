import ExcelJS from 'exceljs';
import { PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';
import { OfficeScopeService } from '../permissions/office-scope.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { AIPRegistryExportService } from './aip-registry-export.service.js';

/**
 * Office scope stub. Defaults to ALL so the existing tests — which export as
 * SUPER_ADMIN — see every office, exactly as they did before the service started
 * narrowing sheets to the caller's scope.
 */
function buildScopeMock(scope: 'ALL' | string[] = 'ALL') {
  return {
    effectiveOfficeIds: jest.fn().mockResolvedValue(scope),
  } as unknown as OfficeScopeService;
}

const clusterRecord = {
  id: 'cluster-1',
  name: 'Safe & Secure Communities',
  finishLineClusters: [
    {
      finishLine: {
        id: 'fl-1',
        name: 'Safe and Secure Communities',
        fullName: 'Safe and Secure Communities',
        visionNumber: 3,
      },
    },
  ],
  offices: [{ id: 'office-1', acronym: 'CMO', name: 'City Mayor Office' }],
  civilSocietyOrganizations: [],
};

const exportPrograms = [
  {
    id: 'program-1',
    aipReferenceCode: '1000-2000',
    tentativeAipReferenceCode: 'TMP-1000-2000',
    officeId: 'office-1',
    name: 'Peace and Order Program',
    expectedOutput: 'Safer communities',
    implementationStartMonth: 1,
    implementationStartYear: 2027,
    implementationEndMonth: 12,
    implementationEndYear: 2027,
    // Phase 1 D17: the line-item rollup family is structurally 0 in real data;
    // money lives in the proposed family.
    psTotal: new Prisma.Decimal('0'),
    mooeTotal: new Prisma.Decimal('0'),
    feTotal: new Prisma.Decimal('0'),
    coTotal: new Prisma.Decimal('0'),
    grandTotal: new Prisma.Decimal('0'),
    psProposedTotal: new Prisma.Decimal('0'),
    mooeProposedTotal: new Prisma.Decimal('2000000'),
    feProposedTotal: new Prisma.Decimal('0'),
    coProposedTotal: new Prisma.Decimal('0'),
    proposedTotal: new Prisma.Decimal('8000000'),
    office: { id: 'office-1', acronym: 'CMO', name: 'City Mayor Office' },
    civilSocietyOrganization: null,
    supportingOffices: [
      {
        office: {
          id: 'office-2',
          acronym: 'PSO',
          name: 'Public Safety Office',
        },
      },
    ],
    sdgGoals: [
      { sdgGoal: { code: 'SDG-01' } },
      { sdgGoal: { code: 'SDG-16' } },
    ],
    projectActivities: [
      {
        id: 'pa-1',
        parentProjectActivityId: null,
        orderIndex: 1,
        createdAt: new Date('2027-01-01T00:00:00Z'),
        name: 'Neighborhood Patrol Activity',
        expectedOutput: 'Patrol coverage increased',
        implementationStartMonth: 2,
        implementationStartYear: 2027,
        implementationEndMonth: 11,
        implementationEndYear: 2027,
        aipReferenceCode: '1000-2000-001',
        tentativeAipReferenceCode: 'TMP-1000-2000-001',
        psTotal: new Prisma.Decimal('0'),
        mooeTotal: new Prisma.Decimal('0'),
        feTotal: new Prisma.Decimal('0'),
        coTotal: new Prisma.Decimal('0'),
        grandTotal: new Prisma.Decimal('0'),
        // Per-expense-class split entered (D3).
        psEstimate: null,
        mooeEstimate: new Prisma.Decimal('2000000'),
        feEstimate: new Prisma.Decimal('0'),
        coEstimate: new Prisma.Decimal('0'),
        proposedBudget: new Prisma.Decimal('2000000'),
        climateChangeTag: {
          ccaAmount: new Prisma.Decimal('100000'),
          ccmAmount: new Prisma.Decimal('200000'),
          codes: [{ ccetCode: { code: 'CCA_003' } }],
        },
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `pa-extra-${index + 1}`,
        parentProjectActivityId: null,
        orderIndex: index + 2,
        createdAt: new Date(`2027-01-0${index + 2}T00:00:00Z`),
        name: `Supplemental Safety Activity ${index + 1}`,
        expectedOutput: 'Additional safety coverage',
        implementationStartMonth: 1,
        implementationStartYear: 2027,
        implementationEndMonth: 12,
        implementationEndYear: 2027,
        aipReferenceCode: `1000-2000-00${index + 2}`,
        tentativeAipReferenceCode: `TMP-1000-2000-00${index + 2}`,
        psTotal: new Prisma.Decimal('0'),
        mooeTotal: new Prisma.Decimal('0'),
        feTotal: new Prisma.Decimal('0'),
        coTotal: new Prisma.Decimal('0'),
        grandTotal: new Prisma.Decimal('0'),
        // Shortlist-imported rows: a bare proposedBudget, no class split.
        psEstimate: null,
        mooeEstimate: null,
        feEstimate: null,
        coEstimate: null,
        proposedBudget: new Prisma.Decimal('1000000'),
        climateChangeTag: null,
      })),
    ],
  },
];

function mergeRanges(worksheet: ExcelJS.Worksheet | undefined): string[] {
  return worksheet ? [...(worksheet.model.merges ?? [])] : [];
}

function buildPrismaMock() {
  return {
    aIPCycle: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'cycle-2027',
        fiscalYear: 2027,
      }),
    },
    cluster: {
      findUnique: jest.fn().mockResolvedValue(clusterRecord),
    },
    office: {
      findUnique: jest.fn().mockResolvedValue({ clusterId: 'cluster-1' }),
      // How many offices of the requested cluster fall inside the caller's scope.
      count: jest.fn().mockResolvedValue(1),
    },
    civilSocietyOrganization: {
      findUnique: jest.fn(),
    },
    program: {
      findMany: jest.fn().mockResolvedValue(exportPrograms),
    },
    aIPExportLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      update: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
  } as unknown as PrismaService;
}

// Each test builds a real xlsx workbook: well under a second alone, but past
// Jest's 5 s default when pre-push runs while the machine is loaded.
jest.setTimeout(30_000);

describe('AIPRegistryExportService', () => {
  const originalExportMaxRows = process.env.AIP_EXPORT_MAX_ROWS;
  const originalTemplateFile = process.env.AIP_TEMPLATE_FILE;

  afterEach(() => {
    if (originalExportMaxRows === undefined) {
      delete process.env.AIP_EXPORT_MAX_ROWS;
    } else {
      process.env.AIP_EXPORT_MAX_ROWS = originalExportMaxRows;
    }
    if (originalTemplateFile === undefined) {
      delete process.env.AIP_TEMPLATE_FILE;
    } else {
      process.env.AIP_TEMPLATE_FILE = originalTemplateFile;
    }
  });

  it('generates a cluster workbook and records the export log', async () => {
    const prisma = buildPrismaMock();
    const service = new AIPRegistryExportService(prisma, buildScopeMock());

    const result = await service.exportCluster('cycle-2027', 'cluster-1', {
      sub: 'user-1',
      role: 'SUPER_ADMIN',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      identityType: null,
      officeId: null,
      civilSocietyOrganizationId: null,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as any);

    expect(result.fileName).toBe(
      'aip-2027-safe-secure-communities-export.xlsx',
    );
    // The metadata cover sheet is prepended before GOALS.
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Export Info',
      'GOALS',
      'CMO - Basic AIP Form',
      'CMO - Extended AIP Form',
    ]);

    const basicSheet = workbook.getWorksheet('CMO - Basic AIP Form');
    expect(basicSheet?.getCell('A4').value).toBe(
      'Department/Office: CITY MAYOR OFFICE',
    );
    expect(basicSheet?.getCell('A8').value).toBe(
      'I. GENERAL ADMINISTRATIVE SERVICES',
    );
    expect(basicSheet?.getCell('A9').value).toBeNull();
    expect(basicSheet?.getCell('A10').value).toBe('II. SUPPORT TO OPERATIONS');
    expect(basicSheet?.getCell('A11').value).toBeNull();
    expect(basicSheet?.getCell('A12').value).toBe('III. OPERATIONS');
    expect(basicSheet?.getCell('A13').value).toBe('1000-2000');
    expect(basicSheet?.getCell('B13').value).toBe(
      '3.1 Peace and Order Program',
    );
    // Parent (program) rows: bold description, all other columns blank.
    expect(basicSheet?.getCell('B13').font?.bold).toBe(true);
    expect(basicSheet?.getCell('C13').value).toBeNull();
    expect(basicSheet?.getCell('G13').value).toBeNull();
    expect(basicSheet?.getCell('H13').value).toBeNull();
    expect(basicSheet?.getCell('I13').value).toBeNull();
    expect(basicSheet?.getCell('L13').value).toBeNull();
    // Leaf rows: not bold, implementing office + funding source populated.
    expect(basicSheet?.getCell('B14').value).toBe(
      '3.1.1 Neighborhood Patrol Activity',
    );
    expect(basicSheet?.getCell('B14').font?.bold).toBeFalsy();
    expect(basicSheet?.getCell('C14').value).toBe('CMO, PSO');
    expect(basicSheet?.getCell('G14').value).toBe('GF');
    // Amounts come from the estimate/proposed family (millions of pesos).
    expect(basicSheet?.getCell('I14').value).toBe(2);
    expect(basicSheet?.getCell('I14').numFmt).toBe('0.00');
    expect(basicSheet?.getCell('L14').value).toBe(2);
    // A shortlist row with no per-expense-class split still shows its total.
    expect(basicSheet?.getCell('H15').value).toBeNull();
    expect(basicSheet?.getCell('I15').value).toBeNull();
    expect(basicSheet?.getCell('K15').value).toBeNull();
    expect(basicSheet?.getCell('L15').value).toBe(1);
    expect(basicSheet?.getCell('M14').value).toBe(0.1);
    expect(basicSheet?.getCell('N14').value).toBe(0.2);
    expect(basicSheet?.getCell('O14').value).toBe('CCA_003');
    expect(basicSheet?.getCell('D14').value).toBe('Feb 2027');
    expect(basicSheet?.getCell('E14').value).toBe('Nov 2027');
    // Every operations cell carries a full box border (the template is missing the
    // top border on some columns, so the service re-applies it).
    for (const col of ['A', 'B', 'F', 'O']) {
      const border = basicSheet?.getCell(`${col}14`).border;
      expect(border?.top?.style).toBe('thin');
      expect(border?.bottom?.style).toBe('thin');
      expect(border?.left?.style).toBe('thin');
      expect(border?.right?.style).toBe('thin');
    }
    // TOTAL row stops at column L (no climate columns), bold label.
    const totalRow = 13 + 8; // first operations row + 8 entries (program + 7 leaves)
    expect(basicSheet?.getCell(`A${totalRow}`).value).toBe('TOTAL');
    expect(basicSheet?.getCell(`A${totalRow}`).font?.bold).toBe(true);
    // Spans from the first data row rather than the first Operations entry:
    // sections are variable-length now, so the range covers all three. The
    // header rows it crosses are merged and carry no amount.
    expect(basicSheet?.getCell(`L${totalRow}`).value).toEqual({
      formula: `SUM(L8:L${totalRow - 1})`,
    });
    expect(basicSheet?.getCell(`M${totalRow}`).value).toBeNull();
    expect(mergeRanges(basicSheet)).toEqual(
      expect.arrayContaining([
        'A1:O1',
        'D6:E6',
        'H6:L6',
        'A8:O8',
        'A10:O10',
        'A12:O12',
      ]),
    );

    const extendedSheet = workbook.getWorksheet('CMO - Extended AIP Form');
    expect(extendedSheet?.getCell('A8').value).toEqual({
      formula: "'CMO - Basic AIP Form'!A13",
    });
    expect(extendedSheet?.getCell('H9').value).toEqual({
      formula: "'CMO - Basic AIP Form'!L14",
    });
    expect(extendedSheet?.getCell('A14').value).toEqual({
      formula: "'CMO - Basic AIP Form'!A19",
    });
    expect(extendedSheet?.getCell('H14').value).toEqual({
      formula: "'CMO - Basic AIP Form'!L19",
    });
    expect(mergeRanges(extendedSheet)).toEqual(
      expect.arrayContaining(['A1:J1', 'C4:D4', 'H6:J6']),
    );
    // The first program-name row is no longer underlined.
    expect(extendedSheet?.getCell('B8').font?.underline).toBeFalsy();

    // Column C is the template's SDG column: every row of the program's
    // subtree inherits the program's tags.
    expect(extendedSheet?.getCell('C8').value).toBe('SDG-01, SDG-16');
    expect(extendedSheet?.getCell('C9').value).toBe('SDG-01, SDG-16');

    // Metadata cover sheet captures provenance + stats.
    const info = workbook.getWorksheet('Export Info');
    expect(info?.getCell('A1').value).toBe('2027 AIP CLUSTER EXPORT');
    const labels = (info ? info.getColumn('A').values : [])
      .filter(Boolean)
      .map(String);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Cluster',
        'Exported At',
        'Exported By',
        'Programs',
        'OFFICES INCLUDED',
      ]),
    );

    // The workbook is read-only: every sheet is protected.
    for (const sheet of workbook.worksheets) {
      const protection = (
        sheet as unknown as { sheetProtection?: { sheet?: boolean } }
      ).sheetProtection;
      expect(protection?.sheet).toBe(true);
    }

    expect(prisma.aIPExportLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'CLUSTER',
        status: 'PENDING',
        aipCycleId: 'cycle-2027',
        clusterId: 'cluster-1',
        fileName: 'aip-2027-safe-secure-communities-export.xlsx',
        requestedByUserId: 'user-1',
      }),
    });
    expect(prisma.aIPExportLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { status: 'GENERATED' },
    });
  });

  it('uses the caller cluster automatically for office users', async () => {
    const prisma = buildPrismaMock();
    const service = new AIPRegistryExportService(prisma, buildScopeMock());

    await service.exportCluster('cycle-2027', undefined, {
      sub: 'user-2',
      role: 'STAFF',
      email: 'staff@example.com',
      firstName: 'Staff',
      lastName: 'User',
      identityType: 'LGU',
      officeId: 'office-1',
      civilSocietyOrganizationId: null,
    });

    expect(prisma.office.findUnique).toHaveBeenCalledWith({
      where: { id: 'office-1' },
      select: { clusterId: true },
    });
    expect(prisma.aIPExportLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'PENDING',
        clusterId: 'cluster-1',
        requestedByUserId: 'user-2',
      }),
    });
  });

  it('fails oversized exports before workbook rendering and marks the log failed', async () => {
    process.env.AIP_EXPORT_MAX_ROWS = '1';
    const prisma = buildPrismaMock();
    const service = new AIPRegistryExportService(prisma, buildScopeMock());

    await expect(
      service.exportCluster('cycle-2027', 'cluster-1', {
        sub: 'user-1',
        role: 'SUPER_ADMIN',
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        identityType: null,
        officeId: null,
        civilSocietyOrganizationId: null,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    expect(prisma.aIPExportLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'PENDING',
        requestedByUserId: 'user-1',
      }),
    });
    expect(prisma.aIPExportLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        errorMessage: expect.stringContaining('exceeding the configured limit'),
      }),
    });
  });

  it('rejects template traversal without leaking filesystem paths', async () => {
    process.env.AIP_TEMPLATE_FILE = '../../etc/passwd';
    const prisma = buildPrismaMock();
    const service = new AIPRegistryExportService(prisma, buildScopeMock());

    await expect(
      service.exportCluster('cycle-2027', 'cluster-1', {
        sub: 'user-1',
        role: 'SUPER_ADMIN',
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        identityType: null,
        officeId: null,
        civilSocietyOrganizationId: null,
      }),
    ).rejects.toThrow('Invalid AIP template file name');

    expect(prisma.aIPExportLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        errorMessage: expect.not.stringContaining('/etc/passwd'),
      }),
    });
  });

  /**
   * The sheet used to print all three section headers and then dump every entry
   * under Operations. papClass is what routes them, and the Extended sheet
   * cross-references Basic rows by formula — so variable-length sections are
   * exactly where those formulas can silently drift onto a header row.
   */
  it('routes entries into GAS / STO / Operations and keeps Extended formulas aligned', async () => {
    const makeProgram = (
      suffix: string,
      papClass: 'GAS' | 'STO' | 'OPERATIONS' | null,
      fundSources: string[],
    ) => ({
      id: `program-${suffix}`,
      aipReferenceCode: `1000-${suffix}`,
      tentativeAipReferenceCode: `TMP-1000-${suffix}`,
      officeId: 'office-1',
      papClass,
      name: `Program ${suffix}`,
      expectedOutput: 'Output',
      implementationStartMonth: 1,
      implementationStartYear: 2027,
      implementationEndMonth: 12,
      implementationEndYear: 2027,
      psTotal: new Prisma.Decimal('0'),
      mooeTotal: new Prisma.Decimal('0'),
      feTotal: new Prisma.Decimal('0'),
      coTotal: new Prisma.Decimal('0'),
      grandTotal: new Prisma.Decimal('0'),
      psProposedTotal: new Prisma.Decimal('0'),
      mooeProposedTotal: new Prisma.Decimal('1000000'),
      feProposedTotal: new Prisma.Decimal('0'),
      coProposedTotal: new Prisma.Decimal('0'),
      proposedTotal: new Prisma.Decimal('1000000'),
      office: { id: 'office-1', acronym: 'CMO', name: 'City Mayor Office' },
      civilSocietyOrganization: null,
      supportingOffices: [],
      sdgGoals: [],
      projectActivities: [
        {
          id: `pa-${suffix}`,
          parentProjectActivityId: null,
          orderIndex: 1,
          createdAt: new Date('2027-01-01T00:00:00Z'),
          name: `Activity ${suffix}`,
          expectedOutput: 'Output',
          implementationStartMonth: 1,
          implementationStartYear: 2027,
          implementationEndMonth: 12,
          implementationEndYear: 2027,
          aipReferenceCode: `1000-${suffix}-001`,
          tentativeAipReferenceCode: `TMP-1000-${suffix}-001`,
          fundSources,
          psTotal: new Prisma.Decimal('0'),
          mooeTotal: new Prisma.Decimal('0'),
          feTotal: new Prisma.Decimal('0'),
          coTotal: new Prisma.Decimal('0'),
          grandTotal: new Prisma.Decimal('0'),
          psEstimate: null,
          mooeEstimate: null,
          feEstimate: null,
          coEstimate: null,
          proposedBudget: new Prisma.Decimal('1000000'),
          climateChangeTag: null,
        },
      ],
    });

    const prisma = buildPrismaMock();
    // Deliberately supplied out of order, and one legacy row with no papClass.
    (prisma.program.findMany as jest.Mock).mockResolvedValue([
      makeProgram('ops', 'OPERATIONS', ['GF']),
      makeProgram('gas', 'GAS', ['SEF', 'GF']),
      makeProgram('legacy', null, []),
      makeProgram('sto', 'STO', ['LDRRMF', 'TRUST_FUND']),
    ]);

    const result = await new AIPRegistryExportService(
      prisma,
      buildScopeMock(),
    ).exportCluster('cycle-2027', 'cluster-1', {
      sub: 'user-1',
      role: 'SUPER_ADMIN',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      identityType: null,
      officeId: null,
      civilSocietyOrganizationId: null,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as any);
    const basic = workbook.getWorksheet('CMO - Basic AIP Form');

    // GAS: header, its program, its activity. Then STO, then Operations —
    // which holds both the OPERATIONS program and the legacy null-papClass one.
    expect(basic?.getCell('A8').value).toBe(
      'I. GENERAL ADMINISTRATIVE SERVICES',
    );
    expect(basic?.getCell('B9').value).toContain('Program gas');
    expect(basic?.getCell('B10').value).toContain('Activity gas');
    expect(basic?.getCell('A11').value).toBe('II. SUPPORT TO OPERATIONS');
    expect(basic?.getCell('B12').value).toContain('Program sto');
    expect(basic?.getCell('B13').value).toContain('Activity sto');
    expect(basic?.getCell('A14').value).toBe('III. OPERATIONS');
    expect(basic?.getCell('B15').value).toContain('Program ops');
    expect(basic?.getCell('B17').value).toContain('Program legacy');

    // Column G: fund sources, in enum order, with GF as the empty fallback.
    expect(basic?.getCell('G10').value).toBe('GF, SEF');
    expect(basic?.getCell('G13').value).toBe('LDRRMF, TF');
    expect(basic?.getCell('G18').value).toBe('GF');

    // TOTAL sits below the last section: 3 headers + 8 entry rows.
    expect(basic?.getCell('A19').value).toBe('TOTAL');

    // The Extended sheet must point at the entry rows, never at a header. Its
    // own rows stay contiguous while the Basic rows it references are not.
    const extended = workbook.getWorksheet('CMO - Extended AIP Form');
    expect((extended?.getCell('A8').value as { formula: string }).formula).toBe(
      "'CMO - Basic AIP Form'!A9",
    );
    expect(
      (extended?.getCell('A10').value as { formula: string }).formula,
    ).toBe("'CMO - Basic AIP Form'!A12");
    expect(
      (extended?.getCell('A12').value as { formula: string }).formula,
    ).toBe("'CMO - Basic AIP Form'!A15");

    // Untagged programs leave the SDG column empty rather than printing an
    // empty string.
    expect(extended?.getCell('C8').value).toBeNull();
  });
});

describe('AIPRegistryExportService — cluster authorization follows office scope', () => {
  const encoder = {
    sub: 'cpdo-encoder',
    role: 'STAFF',
    email: 'kim@example.com',
    firstName: 'Kim',
    lastName: 'L',
    identityType: 'LGU',
    officeId: 'office-cpdo',
    civilSocietyOrganizationId: null,
  } as unknown as JwtPayload;

  /**
   * The bug: the requested cluster was discarded for everyone but SUPER_ADMIN and
   * LFC, and replaced with the caller's *home office's* cluster. A CPDO encoder
   * scoped to the Economy offices picked "Economy" and received the Governance
   * workbook, because CPDO sits in Governance.
   */
  it('exports the cluster that was asked for, not the home office cluster', async () => {
    const prisma = buildPrismaMock();
    // Home office resolves to Governance; the request and the grants say Economy.
    (prisma.office.findUnique as jest.Mock).mockResolvedValue({
      clusterId: 'cluster-governance',
    });
    const service = new AIPRegistryExportService(
      prisma,
      buildScopeMock(['office-abe', 'office-cago']),
    );

    await service.exportCluster('cycle-2027', 'cluster-1', encoder);

    // cluster-1 is what the caller asked for; the home cluster is never looked up.
    expect(prisma.cluster.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cluster-1' } }),
    );
    expect(prisma.cluster.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cluster-governance' } }),
    );
  });

  it('refuses a cluster the caller holds no office in', async () => {
    const prisma = buildPrismaMock();
    (prisma.office.count as jest.Mock).mockResolvedValue(0);
    const service = new AIPRegistryExportService(
      prisma,
      buildScopeMock(['office-abe']),
    );

    await expect(
      service.exportCluster('cycle-2027', 'cluster-1', encoder),
    ).rejects.toThrow(/no offices in/i);
  });

  it('limits the workbook to offices inside the scope', async () => {
    // A cluster the caller only partly holds must not hand them the rest of it.
    const prisma = buildPrismaMock();
    const service = new AIPRegistryExportService(
      prisma,
      buildScopeMock(['office-1']),
    );

    await service.exportCluster('cycle-2027', 'cluster-1', encoder);

    const programWhere = (prisma.program.findMany as jest.Mock).mock.calls[0][0]
      .where;
    expect(programWhere.office).toEqual({
      clusterId: 'cluster-1',
      id: { in: ['office-1'] },
    });
  });

  it('leaves an ALL-scope caller seeing the whole cluster', async () => {
    const prisma = buildPrismaMock();
    const service = new AIPRegistryExportService(prisma, buildScopeMock('ALL'));

    await service.exportCluster('cycle-2027', 'cluster-1', encoder);

    const programWhere = (prisma.program.findMany as jest.Mock).mock.calls[0][0]
      .where;
    expect(programWhere.office).toEqual({ clusterId: 'cluster-1' });
  });
});
