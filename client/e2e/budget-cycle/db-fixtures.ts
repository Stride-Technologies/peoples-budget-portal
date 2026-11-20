import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../aip-cycle/db-helpers';

/**
 * A throwaway fiscal year for specs that write (specs/012 T059, T073): a far
 * year nothing real uses (each spec its own, so they can run in parallel),
 * created fresh and removed whole afterwards. These specs run only with
 * AIP_DESTRUCTIVE_E2E=1, like the aip-cycle suite. While one runs, its year is
 * visible on that database's public site.
 */
export const WRITES_ENABLED = process.env.AIP_DESTRUCTIVE_E2E === '1';
export const WRITES_SKIP_REASON = 'Writes a throwaway FY2099 cycle: set AIP_DESTRUCTIVE_E2E=1';

export type Prisma = ReturnType<typeof createPrismaClient>;
export { createPrismaClient };

export async function removeFy(prisma: Prisma, FY: number) {
  const cycle = await prisma.budgetCycle.findUnique({ where: { fiscalYear: FY } });
  if (!cycle) return;
  await prisma.pPMP.deleteMany({ where: { aipCycle: { fiscalYear: FY } } });
  await prisma.budgetDocument.deleteMany({ where: { budgetCycleId: cycle.id } });
  await prisma.program.deleteMany({ where: { aipCycle: { fiscalYear: FY } } });
  await prisma.aIPCycle.deleteMany({ where: { fiscalYear: FY } });
  await prisma.budgetCycle.delete({ where: { id: cycle.id } });
}

/** The year's budget cycle and AIP cycle (one id, as every cycle shares), and an office. */
export async function createFy(prisma: Prisma, FY: number) {
  await removeFy(prisma, FY);
  const id = randomUUID();
  await prisma.budgetCycle.create({ data: { id, fiscalYear: FY } });
  await prisma.aIPCycle.create({ data: { id, fiscalYear: FY, budgetCycleId: id } });
  const office = await prisma.office.findFirstOrThrow({
    where: { isActive: true, acronym: 'CHO' },
    select: { id: true },
  });
  return { cycleId: id, officeId: office.id };
}

/** A DRAFT Ordinance: a root PPA (own PS 500) over a child the import flagged (MOOE 1,000). */
export async function draftOrdinance(prisma: Prisma, cycleId: string, officeId: string, rootId = randomUUID()) {
  const doc = await prisma.budgetDocument.create({
    data: { budgetCycleId: cycleId, kind: 'ORDINANCE', status: 'DRAFT', sourceDocumentName: 'e2e fixture' },
  });
  const childId = randomUUID();
  await prisma.budgetItem.create({
    data: { id: rootId, rootItemId: rootId, documentId: doc.id, officeId, name: 'E2E root PPA', ps: '500.00', total: '1500.00', orderIndex: 1 },
  });
  await prisma.budgetItem.create({
    data: {
      id: childId, rootItemId: rootId, parentId: rootId, documentId: doc.id, officeId,
      name: 'E2E flagged PPA', mooe: '1000.00', total: '1000.00', orderIndex: 1,
      importWarnings: ['The row had no code; the import placed it under the heading above.'],
    },
  });
  return { documentId: doc.id, rootId, childId };
}

/** An AIP program of the office in that year (the fields a program requires, nothing more). */
export async function aipProgram(
  prisma: Prisma,
  cycleId: string,
  officeId: string,
  createdByUserId: string,
) {
  const [sector, finishLine] = await Promise.all([
    prisma.pAPSector.findFirstOrThrow({ select: { id: true } }),
    prisma.finishLine.findFirstOrThrow({ select: { id: true } }),
  ]);
  const id = randomUUID();
  await prisma.program.create({
    data: {
      id, aipCycleId: cycleId, officeId, papSectorId: sector.id, finishLineId: finishLine.id,
      name: 'E2E program', tentativeAipReferenceCode: `~e2e-${id}`, createdByUserId,
    },
  });
  return id;
}
