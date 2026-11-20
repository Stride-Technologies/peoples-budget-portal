import { Prisma } from '../generated/prisma/index';
import { compareWithPrevious } from './compare-previous.js';

const D = (v: string) => new Prisma.Decimal(v);
const obj = (
  office: string,
  accountCode: string,
  amount: string,
  current: string | null,
) => ({
  uacsCode: accountCode,
  accountCode,
  subCode: null,
  accountTitle: accountCode,
  amount: D(amount),
  currentYearTotal: current === null ? null : D(current),
  currentFirstSemActual: null,
  currentSecondSemEstimate: null,
  office: { acronym: office },
});

function db() {
  const lines: Record<string, unknown[]> = {
    d26: [
      obj('CBO', '5-01-01-010', '100', '90'),
      obj('CBO', '5-02-01-010', '5', '7'),
      obj('CMO', '5-02-01-010', '1', '1'),
    ],
    d25: [
      obj('CBO', '5-01-01-010', '80', null),
      obj('CBO', '5-02-01-010', '7', null),
    ],
  };
  return {
    budgetDocument: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'd26', budgetCycle: { fiscalYear: 2026 } }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'lep', kind: 'LEP', status: 'SUBMITTED' },
        { id: 'd25', kind: 'ORDINANCE', status: 'ENACTED' },
      ]),
    },
    budgetObjectLine: {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(lines[where.documentId] ?? []),
      ),
    },
    budgetReceiptLine: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('compareWithPrevious (specs/017 FR-010)', () => {
  it("prefers the year before's enacted Ordinance and lists only the lines that differ", async () => {
    const r = await compareWithPrevious(db() as never, 'd26');
    expect(r.previous).toEqual({
      id: 'd25',
      kind: 'ORDINANCE',
      fiscalYear: 2025,
    });
    expect(r.counts).toEqual({
      here: 3,
      there: 2,
      matched: 2,
      equal: 1,
      differ: 1,
    });
    expect(r.rows).toEqual([
      {
        kind: 'object',
        scope: 'CBO',
        code: '5-01-01-010',
        title: '5-01-01-010',
        thisCurrentYear: '90.00',
        previousBudgetYear: '80.00',
        delta: '10.00',
      },
    ]);
  });
});
