import type { Prisma, PrismaClient } from '../generated/prisma/index';

type Db =
  | Pick<PrismaClient, 'budgetCycle' | 'aIPCycle'>
  | Prisma.TransactionClient;

/**
 * The fiscal year's Budget Cycle, created if the year has none yet. Every AIP
 * cycle hangs off one (specs/012 P0), so anything that creates an AIP cycle —
 * the service and the seed scripts — goes through `createAipCycle` below.
 */
export async function ensureBudgetCycle(db: Db, fiscalYear: number) {
  return db.budgetCycle.upsert({
    where: { fiscalYear },
    update: {},
    create: { fiscalYear },
  });
}

/**
 * Create a year's AIP cycle under its Budget Cycle. The AIP cycle takes the
 * Budget Cycle's id when it is free, so public `cycleId`s stay one id space
 * (specs/012 D6); code still reaches one from the other through the relation.
 */
export async function createAipCycle(
  db: Db,
  data: Omit<Prisma.AIPCycleUncheckedCreateInput, 'budgetCycleId' | 'id'> & {
    fiscalYear: number;
  },
) {
  const budgetCycle = await ensureBudgetCycle(db, data.fiscalYear);
  const idTaken = await db.aIPCycle.findUnique({
    where: { id: budgetCycle.id },
    select: { id: true },
  });
  return db.aIPCycle.create({
    data: {
      ...data,
      ...(idTaken ? {} : { id: budgetCycle.id }),
      budgetCycleId: budgetCycle.id,
    },
  });
}
