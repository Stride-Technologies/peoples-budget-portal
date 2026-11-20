import { ConflictException } from '@nestjs/common';
import { AIPCycleStatus } from '../generated/prisma/index';
import { BudgetCyclesService } from './budget-cycles.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function setup(
  fiscalYear: number,
  status: AIPCycleStatus | null,
  enactedOrdinances = 0,
  publicPrograms = 1,
) {
  const prisma = {
    program: { count: jest.fn(() => Promise.resolve(publicPrograms)) },
    budgetDocument: {
      count: jest.fn(() => Promise.resolve(enactedOrdinances)),
    },
    budgetCycle: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'b1',
          fiscalYear,
          aipCycle: status ? { id: 'b1', status } : null,
        }),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'b1', ...data }),
      ),
    },
  };
  return {
    service: new BudgetCyclesService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('BudgetCyclesService.setStage', () => {
  it('sets a preparation stage and normalises the alongside list', async () => {
    const { service, prisma } = setup(2027, AIPCycleStatus.OPEN);
    await service.setStage('b1', {
      currentStage: 4,
      alongsideStages: [3, 4, 1, 3],
    });
    expect(prisma.budgetCycle.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { currentStage: 4, alongsideStages: [1, 3] },
    });
  });

  it('refuses execution without an enacted budget', async () => {
    const { service } = setup(2027, AIPCycleStatus.ADOPTED);
    await expect(
      service.setStage('b1', { currentStage: 8, alongsideStages: [] }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses execution reached only through an alongside stage', async () => {
    const { service } = setup(2027, AIPCycleStatus.OPEN);
    await expect(
      service.setStage('b1', { currentStage: 6, alongsideStages: [9] }),
    ).rejects.toThrow(ConflictException);
  });

  it('allows execution once the year has an enacted Ordinance', async () => {
    const { service } = setup(2027, AIPCycleStatus.ADOPTED, 1);
    await expect(
      service.setStage('b1', { currentStage: 8, alongsideStages: [] }),
    ).resolves.toMatchObject({ currentStage: 8 });
  });

  it('allows execution for the historical enacted year (interim)', async () => {
    const { service } = setup(2026, AIPCycleStatus.LOCKED);
    await expect(
      service.setStage('b1', { currentStage: 8, alongsideStages: [9] }),
    ).resolves.toMatchObject({ currentStage: 8 });
  });

  it('refuses execution for a historical year whose AIP stage is empty', async () => {
    const { service } = setup(2025, AIPCycleStatus.ADOPTED, 0, 0);
    await expect(
      service.setStage('b1', { currentStage: 8, alongsideStages: [] }),
    ).rejects.toThrow(ConflictException);
  });
});
