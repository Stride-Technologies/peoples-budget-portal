import { ForbiddenException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { FundSource } from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  ALL_OFFICES,
  type OfficeScopeService,
} from '../permissions/office-scope.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { LbpForm4ExportService } from './lbp-form4-export.service.js';

const user = { sub: 'u1', role: 'STAFF' } as unknown as JwtPayload;

const CTO = {
  id: 'o-cto',
  name: 'Office of the City Treasurer',
  acronym: 'CTO',
  mandateLegalBasis: 'RA 7160',
  vision: null,
  mission: null,
  organizationalOutcomes: [],
};

/** A live program row; `snapshot` is what was last published. */
function liveProgram(over: Record<string, unknown> = {}) {
  const base = {
    id: 'p1',
    officeId: CTO.id,
    hostOfficeId: null,
    office: { id: CTO.id, name: CTO.name, acronym: CTO.acronym },
    papClass: 'OPERATIONS',
    tentativeAipReferenceCode: '1000-2-05-1-01-001-000',
    aipReferenceCode: null,
    name: 'Revenue Generation',
    costMode: 'DIRECT_COSTS',
    fundSources: ['GF'],
    fundAllocations: [],
    psProposedTotal: '100.00',
    mooeProposedTotal: '200.00',
    feProposedTotal: '2000.00',
    coProposedTotal: '0',
    proposedTotal: '2300.00',
    projectActivities: [],
    publishedVersionId: null,
    publishedVersion: null,
  };
  return { ...base, ...over };
}

function setup(programs: unknown[], scope: string[] | typeof ALL_OFFICES) {
  const prisma = {
    aIPCycle: {
      findUnique: jest.fn().mockResolvedValue({ id: 'c1', fiscalYear: 2027 }),
    },
    office: {
      findMany: jest.fn(({ where }: { where: { id?: { in: string[] } } }) =>
        Promise.resolve(!where.id || where.id.in.includes(CTO.id) ? [CTO] : []),
      ),
    },
    program: { findMany: jest.fn().mockResolvedValue(programs) },
    aIPExportLog: {
      create: jest.fn().mockResolvedValue({ id: 'log1' }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const officeScope = {
    effectiveOfficeIds: jest.fn().mockResolvedValue(scope),
  };
  const service = new LbpForm4ExportService(
    prisma as unknown as PrismaService,
    officeScope as unknown as OfficeScopeService,
  );
  return { service, prisma };
}

async function read(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  return workbook;
}

/** Column values on the row whose column A (or merged label) reads `label`. */
function rowValues(sheet: ExcelJS.Worksheet, label: string): unknown[] {
  let found: unknown[] = [];
  sheet.eachRow((row) => {
    if (row.getCell(1).value === label)
      found = [6, 7, 8, 9, 10].map((c) => row.getCell(c).value);
  });
  return found;
}

describe('LbpForm4ExportService', () => {
  it('prints PS / MOOE / FE / CO / Total and an office TOTAL equal to the figures', async () => {
    const { service } = setup([liveProgram()], [CTO.id]);
    const file = await service.export(
      {
        cycleId: 'c1',
        officeId: CTO.id,
        fund: FundSource.GF,
        figures: 'working',
      },
      user,
    );
    const wb = await read(file.buffer);
    const sheet = wb.getWorksheet('CTO')!;
    expect(rowValues(sheet, 'TOTAL')).toEqual([100, 200, 2000, 0, 2300]);
    expect(file.fileName).toBe('LBP4-2027-CTO-GF-DRAFT.xlsx');
  });

  it('protects every sheet and marks DRAFT only for working figures', async () => {
    const { service } = setup(
      [
        liveProgram({
          publishedVersionId: 'v1',
          publishedVersion: { snapshot: liveProgram() },
        }),
      ],
      [CTO.id],
    );
    for (const figures of ['working', 'published'] as const) {
      const wb = await read(
        (
          await service.export(
            { cycleId: 'c1', officeId: CTO.id, fund: FundSource.GF, figures },
            user,
          )
        ).buffer,
      );
      for (const sheet of wb.worksheets)
        expect(
          (sheet as unknown as { sheetProtection?: { sheet?: boolean } })
            .sheetProtection?.sheet,
        ).toBe(true);
      const first = wb.getWorksheet('CTO')!.getCell('A1').text;
      expect(first.startsWith('DRAFT')).toBe(figures === 'working');
    }
  });

  it('prints the published snapshot, not the live revision, for published figures', async () => {
    const { service } = setup(
      [
        liveProgram({
          status: 'PUBLISHED_REVISION',
          proposedTotal: '9999999.00',
          mooeProposedTotal: '9999999.00',
          publishedVersionId: 'v1',
          publishedVersion: {
            // A snapshot from before FE: no fe key.
            snapshot: {
              ...liveProgram(),
              feProposedTotal: undefined,
              mooeProposedTotal: '300.00',
              proposedTotal: '400.00',
            },
          },
        }),
      ],
      [CTO.id],
    );
    const wb = await read(
      (
        await service.export(
          {
            cycleId: 'c1',
            officeId: CTO.id,
            fund: FundSource.GF,
            figures: 'published',
          },
          user,
        )
      ).buffer,
    );
    expect(rowValues(wb.getWorksheet('CTO')!, 'TOTAL')).toEqual([
      100, 300, 0, 0, 400,
    ]);
  });

  it('prints nothing of another fund, and an empty office sheet with zero totals', async () => {
    const { service } = setup([liveProgram()], [CTO.id]);
    const wb = await read(
      (
        await service.export(
          {
            cycleId: 'c1',
            officeId: CTO.id,
            fund: FundSource.SEF,
            figures: 'working',
          },
          user,
        )
      ).buffer,
    );
    expect(rowValues(wb.getWorksheet('CTO')!, 'TOTAL')).toEqual([
      0, 0, 0, 0, 0,
    ]);
  });

  it('refuses an office outside the caller’s scope before logging anything', async () => {
    const { service, prisma } = setup([], ['o-other']);
    await expect(
      service.export(
        {
          cycleId: 'c1',
          officeId: CTO.id,
          fund: FundSource.GF,
          figures: 'working',
        },
        user,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.aIPExportLog.create).not.toHaveBeenCalled();
  });

  it('logs the export with its fund and figures', async () => {
    const { service, prisma } = setup([liveProgram()], ALL_OFFICES);
    await service.export(
      { cycleId: 'c1', fund: FundSource.GF, figures: 'published' },
      user,
    );
    expect(prisma.aIPExportLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'LBP4_BOOK',
          filters: {
            cycleId: 'c1',
            officeId: null,
            fund: 'GF',
            figures: 'published',
          },
        }),
      }),
    );
    expect(prisma.aIPExportLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'GENERATED' } }),
    );
  });
});
