import { BadRequestException } from '@nestjs/common';
import { BudgetCeilingsService } from './budget-ceilings.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CacheService } from '../cache/cache.service.js';
import { AIPCycleStatus, Prisma } from '../generated/prisma/index';

function makeService(prisma: object) {
  return new BudgetCeilingsService(
    prisma as unknown as PrismaService,
    { del: jest.fn().mockResolvedValue(undefined) } as unknown as CacheService,
  );
}

describe('BudgetCeilingsService', () => {
  describe('create', () => {
    const dto = {
      aipCycleId: 'cycle-1',
      finishLineId: 'fl-1',
      totalCeiling: '100000.00',
    };

    it('allows missing ceilings to be created while the cycle is OPEN', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'ceiling-1' });
      const prisma = {
        aIPCycle: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'cycle-1', status: AIPCycleStatus.OPEN }),
        },
        finishLine: {
          findUnique: jest.fn().mockResolvedValue({ id: 'fl-1' }),
        },
        finishLineBudgetCeiling: { create },
      };

      await expect(makeService(prisma).create(dto, 'admin-1')).resolves.toEqual(
        { id: 'ceiling-1' },
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            aipCycleId: 'cycle-1',
            finishLineId: 'fl-1',
          }),
        }),
      );
    });

    it('blocks new ceilings once the cycle is CLOSED', async () => {
      const prisma = {
        aIPCycle: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'cycle-1',
            status: AIPCycleStatus.CLOSED,
          }),
        },
      };

      await expect(makeService(prisma).create(dto, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    // CRITICAL (specs/012): ADOPTED is the new name for LOCKED — both freeze ceilings.
    it.each([AIPCycleStatus.LOCKED, AIPCycleStatus.ADOPTED])(
      'blocks new ceilings on a %s cycle',
      async (status) => {
        const prisma = {
          aIPCycle: {
            findUnique: jest.fn().mockResolvedValue({ id: 'cycle-1', status }),
          },
        };
        await expect(
          makeService(prisma).create(dto, 'admin-1'),
        ).rejects.toThrow(BadRequestException);
      },
    );
  });

  describe('update', () => {
    const existing = {
      id: 'ceiling-1',
      aipCycleId: 'cycle-1',
      finishLineId: 'fl-1',
      totalCeiling: new Prisma.Decimal('100000.00'),
    };

    it('allows OPEN-cycle edits and writes prior values to history', async () => {
      const historyCreate = jest.fn().mockResolvedValue({ id: 'history-1' });
      const update = jest.fn().mockResolvedValue({ id: 'ceiling-1' });
      const prisma = {
        finishLineBudgetCeiling: {
          findUnique: jest.fn().mockResolvedValue({
            ...existing,
            aipCycle: { status: AIPCycleStatus.OPEN },
          }),
        },
        $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
          cb({
            finishLineBudgetCeilingHistory: { create: historyCreate },
            finishLineBudgetCeiling: { update },
          }),
        ),
      };

      await expect(
        makeService(prisma).update(
          'ceiling-1',
          { totalCeiling: '125000.00' },
          'admin-1',
        ),
      ).resolves.toEqual({ id: 'ceiling-1' });
      expect(historyCreate).toHaveBeenCalledWith({
        data: {
          ceilingId: 'ceiling-1',
          totalCeiling: existing.totalCeiling,
          changedByUserId: 'admin-1',
        },
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'ceiling-1' },
        data: {
          totalCeiling: new Prisma.Decimal('125000.00'),
        },
      });
    });

    it('blocks edits once the cycle is CLOSED', async () => {
      const prisma = {
        finishLineBudgetCeiling: {
          findUnique: jest.fn().mockResolvedValue({
            ...existing,
            aipCycle: { status: AIPCycleStatus.CLOSED },
          }),
        },
      };

      await expect(
        makeService(prisma).update(
          'ceiling-1',
          { totalCeiling: '125000.00' },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('attaches changer names to history entries', async () => {
      const prisma = {
        finishLineBudgetCeiling: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ceiling-1',
            history: [
              {
                id: 'history-1',
                changedByUserId: 'admin-1',
                totalCeiling: new Prisma.Decimal('100000.00'),
              },
            ],
          }),
        },
        user: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'admin-1',
              firstName: 'Ada',
              lastName: 'Admin',
              email: 'ada@example.test',
            },
          ]),
        },
      };

      const result = await makeService(prisma).findOne('ceiling-1');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['admin-1'] } },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      expect(result.history[0].changedByUser).toEqual({
        id: 'admin-1',
        firstName: 'Ada',
        lastName: 'Admin',
        email: 'ada@example.test',
      });
    });
  });
});
