import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  SpecialFundsService,
  specialFundFigure,
} from './special-funds.service.js';

const D = (v: string) => new Prisma.Decimal(v);

describe('specialFundFigure', () => {
  it('uses the stated amount and flags it when the fund lists no PPAs', () => {
    const r = specialFundFigure(D('0'), 0, D('272000000'));
    expect(r.figure.toFixed(2)).toBe('272000000.00');
    expect(r.flags).toEqual(['STATED_WITHOUT_PPAS']);
  });

  it('lets the program sum win, flagging a stated amount that differs', () => {
    const r = specialFundFigure(D('100'), 2, D('150'));
    expect(r.figure.toFixed(2)).toBe('100.00');
    expect(r.flags).toEqual(['STATED_DIFFERS']);
  });

  it('flags nothing when they agree, or when nothing is stated', () => {
    expect(specialFundFigure(D('100'), 1, D('100')).flags).toEqual([]);
    expect(specialFundFigure(D('0'), 0, null)).toEqual({
      figure: D('0'),
      flags: [],
    });
  });
});

describe('SpecialFundsService.setStated', () => {
  it('refuses a fund that is not a special fund', async () => {
    const prisma = {
      aIPCycle: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
      fundStatedAmount: { upsert: jest.fn(), deleteMany: jest.fn() },
    };
    const service = new SpecialFundsService(prisma as unknown as PrismaService);
    for (const fund of ['GF', 'SEF', 'SPAF'])
      await expect(
        service.setStated('c1', fund, '1.00', undefined, 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.fundStatedAmount.upsert).not.toHaveBeenCalled();
  });
});
