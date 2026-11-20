import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/index';
import { annualBook, annualObjects } from './annual-book.js';

const D = (v: string) => new Prisma.Decimal(v);

function db(doc: { id: string; kind: string } | null) {
  return {
    budgetDocument: { findFirst: jest.fn().mockResolvedValue(doc) },
    budgetReceiptLine: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'r1',
          parentId: null,
          particulars: 'Real Property Tax',
          printedCode: '40102-040',
          accountCode: '4-01-02-040',
          incomeClass: null,
          pastYearActual: D('1.5'),
          currentFirstSemActual: null,
          currentSecondSemEstimate: null,
          currentYearTotal: D('2'),
          amount: D('3'),
          account: { title: 'Real Property Tax- Basic' },
          office: null,
        },
      ]),
    },
    budgetIndebtedness: { findMany: jest.fn().mockResolvedValue([]) },
    budgetStatutoryObligation: { findMany: jest.fn().mockResolvedValue([]) },
    budgetPrintedTotal: { findMany: jest.fn().mockResolvedValue([]) },
    budgetObjectLine: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'a',
          uacsCode: '5-01-01-010',
          accountCode: '5-01-01-010',
          accountTitle: 'Salaries',
          expenseClass: 'PS',
          amount: D('10.10'),
          pastYearActual: null,
          currentFirstSemActual: null,
          currentSecondSemEstimate: null,
          currentYearTotal: null,
          account: null,
          office: { acronym: 'CBO', name: 'Budget' },
        },
        {
          id: 'b',
          uacsCode: '5-02-01-010',
          accountCode: '5-02-01-010',
          accountTitle: 'Travel',
          expenseClass: 'MOOE',
          amount: D('0.20'),
          pastYearActual: D('5'),
          currentFirstSemActual: null,
          currentSecondSemEstimate: null,
          currentYearTotal: null,
          account: null,
          office: { acronym: 'CBO', name: 'Budget' },
        },
        {
          id: 'c',
          uacsCode: '5-01-01-010',
          accountCode: '5-01-01-010',
          accountTitle: 'Salaries',
          expenseClass: 'PS',
          amount: D('99'),
          pastYearActual: null,
          currentFirstSemActual: null,
          currentSecondSemEstimate: null,
          currentYearTotal: null,
          account: null,
          office: { acronym: 'CMO', name: 'Mayor' },
        },
      ]),
    },
  };
}

describe('annual book (specs/017)', () => {
  it('404s a year with no public Annual document', async () => {
    await expect(annualBook(db(null) as never, 2027)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('serves receipts as named columns, money as strings, no provenance', async () => {
    const book = await annualBook(
      db({ id: 'd', kind: 'ORDINANCE' }) as never,
      2026,
    );
    expect(book.receipts[0]).toEqual({
      id: 'r1',
      parentId: null,
      particulars: 'Real Property Tax',
      printedCode: '40102-040',
      accountCode: '4-01-02-040',
      accountTitle: 'Real Property Tax- Basic',
      incomeClass: null,
      officeAcronym: null,
      officeName: null,
      pastYearActual: '1.50',
      currentFirstSemActual: null,
      currentSecondSemEstimate: null,
      currentYearTotal: '2.00',
      amount: '3.00',
    });
  });

  it('ranks offices by their exact total and lists one office on request', async () => {
    const all = await annualObjects(
      db({ id: 'd', kind: 'LEP' }) as never,
      2025,
    );
    expect(all.offices).toEqual([
      { acronym: 'CMO', name: 'Mayor', lines: 1, total: '99.00' },
      { acronym: 'CBO', name: 'Budget', lines: 2, total: '10.30' },
    ]);
    expect(all.lines).toEqual([]);
    const cbo = await annualObjects(
      db({ id: 'd', kind: 'LEP' }) as never,
      2025,
      'CBO',
    );
    expect(cbo.lines.map((l) => [l.id, l.amount, l.pastYearActual])).toEqual([
      ['a', '10.10', null],
      ['b', '0.20', '5.00'],
    ]);
  });
});

describe('annual objects: a sheet printed again inside another', () => {
  it('drops an uncoded line equal to another sheet, so nothing counts twice', async () => {
    const line = (
      id: string,
      office: string,
      code: string,
      amount: string,
    ) => ({
      id,
      uacsCode: code,
      accountCode: code || null,
      accountTitle: id,
      expenseClass: 'MOOE',
      amount: D(amount),
      pastYearActual: null,
      currentFirstSemActual: null,
      currentSecondSemEstimate: null,
      currentYearTotal: null,
      account: null,
      office: { acronym: office, name: office },
    });
    const d = db({ id: 'd', kind: 'ORDINANCE' });
    d.budgetObjectLine.findMany.mockResolvedValue([
      line('spa', 'SPAF', '5-02-99-990', '10'),
      line('H. 20% LDF', 'SPAF', '', '7'),
      line('ldf1', 'LDF', '5-02-99-990', '7'),
    ]);
    const r = await annualObjects(d as never, 2026, 'SPAF');
    expect(r.offices.find((o) => o.acronym === 'SPAF')?.total).toBe('10.00');
    expect(r.lines.map((l) => l.id)).toEqual(['spa']);
  });
});
