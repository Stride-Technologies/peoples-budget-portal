import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Prisma } from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { AipExtendedService } from './aip-extended.service.js';

const user = { sub: 'u1', role: 'SUPER_ADMIN' } as unknown as JwtPayload;

const program = (
  id: string,
  code: string,
  extra: { expectedOutput?: string; sdg?: string[] } = {},
) => ({
  id,
  aipReferenceCode: null,
  tentativeAipReferenceCode: code,
  name: `Program ${id}`,
  status: 'PUBLISHED',
  proposedTotal: new Prisma.Decimal('1000'),
  majorFinalOutput: null,
  expectedOutput: extra.expectedOutput ?? null,
  targetForBudgetYear: null,
  officeId: 'ias',
  office: { acronym: 'IAS' },
  sdgGoals: (extra.sdg ?? []).map((code) => ({ sdgGoal: { code } })),
});

function setup() {
  const tx = {
    program: { update: jest.fn() },
    programSDGGoal: { createMany: jest.fn() },
  };
  const prisma = {
    aIPCycle: {
      findUnique: jest.fn().mockResolvedValue({ fiscalYear: 2027 }),
    },
    program: {
      findMany: jest.fn().mockResolvedValue([
        program('a', '1000-2-03-22-002-001-000'),
        program('b', '1000-2-03-22-002-002-000', {
          expectedOutput: 'Already typed',
          sdg: ['SDG-16'],
        }),
      ]),
    },
    sDGGoal: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'g5', code: 'SDG-05' },
        { id: 'g16', code: 'SDG-16' },
      ]),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { record: jest.fn() };
  return {
    tx,
    audit,
    service: new AipExtendedService(prisma as unknown as PrismaService, audit),
  };
}

async function workbook(rows: string[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('IAS AIP-Extended');
  ws.getRow(6).values = [
    'AIP Reference Code',
    'Program/Project/Activity Description',
    'SDG / CDP Goal',
    'Indicator',
    '2027 Target',
  ];
  rows.forEach((r, i) => (ws.getRow(8 + i).values = r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('AipExtendedService', () => {
  it('matches the exact code, and suggests the entry that differs only in office type', async () => {
    const { service } = setup();
    const file = await workbook([
      ['1000-2-03-22-002-001-000', 'Exact', '5-Gender', 'PI a', 'T a'],
      ['1000-2-02-22-002-002-000', 'Typed 02', '', 'PI b', 'T b'],
      ['1000-2-02-22-009-009-000', 'Nowhere', '', 'PI c', 'T c'],
    ]);
    const p = await service.preview('c1', file, 'IAS.xlsx');
    expect(p.rows.map((r) => [r.match, r.matchIds, r.suggestionIds])).toEqual([
      ['exact', ['a'], []],
      ['none', [], ['b']],
      ['none', [], []],
    ]);
    expect(p.rows[0].sdgCodes).toEqual(['SDG-05']);
    expect(p.entries.map((e) => e.code)).toEqual([
      '1000-2-03-22-002-001-000',
      '1000-2-03-22-002-002-000',
    ]);
  });

  it('refuses a workbook with no AIP-Extended sheet', async () => {
    const { service } = setup();
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('PPMP');
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(service.preview('c1', file, 'x.xlsx')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('fills blanks, keeps an existing value as a conflict, and only adds SDG links', async () => {
    const { service, tx, audit } = setup();
    const res = await service.apply(
      'c1',
      {
        fileName: 'IAS.xlsx',
        rows: [
          {
            programId: 'b',
            sheetRow: 12,
            aipCode: '1000-2-02-22-002-002-000',
            indicator: 'Sheet PI',
            target: 'Sheet target',
            sdgCodes: ['SDG-05', 'SDG-16', 'SDG-99'],
          },
        ],
      },
      user,
    );
    expect(tx.program.update).toHaveBeenCalledWith({
      where: { id: 'b' },
      data: { targetForBudgetYear: 'Sheet target' },
    });
    expect(tx.programSDGGoal.createMany).toHaveBeenCalledWith({
      data: [{ programId: 'b', sdgGoalId: 'g5' }],
      skipDuplicates: true,
    });
    expect(res.conflicts).toEqual([
      expect.objectContaining({
        field: 'expectedOutput',
        portal: 'Already typed',
      }),
    ]);
    expect(res.filled[0].fields).toEqual(['targetForBudgetYear', 'sdgGoals']);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('refuses one entry chosen for two rows, and an entry outside the cycle', async () => {
    const { service } = setup();
    const row = {
      sheetRow: 1,
      aipCode: 'x',
      indicator: '',
      target: '',
      sdgCodes: [],
    };
    await expect(
      service.apply(
        'c1',
        {
          rows: [
            { ...row, programId: 'a' },
            { ...row, programId: 'a' },
          ],
        },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.apply('c1', { rows: [{ ...row, programId: 'zzz' }] }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
