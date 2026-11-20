import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExpenseClass, PPACostMode, Prisma } from '../generated/prisma/index';

type Tx = Prisma.TransactionClient;

/**
 * Maintains the denormalized `psTotal / mooeTotal / feTotal / coTotal / grandTotal` columns on
 * ProjectActivity and Program. Always called inside a transaction whenever a LineItem
 * is created/updated/deleted or a PA/Program is mutated. Exposed admin endpoint can
 * force-rebuild totals if drift is suspected.
 */
@Injectable()
export class BudgetRollupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recompute totals for a single PA from its current LineItems. */
  async recomputeProjectActivity(paId: string, tx: Tx) {
    const sums = await tx.lineItem.groupBy({
      by: ['expenseClass'],
      where: { projectActivityId: paId },
      _sum: { lineTotal: true },
    });

    const totals = {
      psTotal: new Prisma.Decimal(0),
      mooeTotal: new Prisma.Decimal(0),
      feTotal: new Prisma.Decimal(0),
      coTotal: new Prisma.Decimal(0),
    };
    for (const row of sums) {
      const v = row._sum.lineTotal ?? new Prisma.Decimal(0);
      if (row.expenseClass === ExpenseClass.PS) totals.psTotal = v;
      else if (row.expenseClass === ExpenseClass.MOOE) totals.mooeTotal = v;
      else if (row.expenseClass === ExpenseClass.FE) totals.feTotal = v;
      else if (row.expenseClass === ExpenseClass.CO) totals.coTotal = v;
    }
    const grandTotal = totals.psTotal
      .plus(totals.mooeTotal)
      .plus(totals.feTotal)
      .plus(totals.coTotal);

    const pa = await tx.projectActivity.update({
      where: { id: paId },
      data: { ...totals, grandTotal },
      select: { programId: true },
    });

    // Cascade up to the parent program.
    await this.recomputeProgram(pa.programId, tx);
  }

  /** Recompute totals for a Program from its current ProjectActivities' cached totals. */
  async recomputeProgram(programId: string, tx: Tx) {
    const [sums, proposedSums, program] = await Promise.all([
      tx.projectActivity.aggregate({
        where: { programId },
        _sum: {
          psTotal: true,
          mooeTotal: true,
          feTotal: true,
          coTotal: true,
          grandTotal: true,
        },
      }),
      tx.projectActivity.aggregate({
        where: { programId, parentProjectActivityId: null },
        _sum: { proposedBudget: true },
      }),
      tx.program.findUnique({
        where: { id: programId },
        select: { costMode: true },
      }),
    ]);

    // The line-item family is always Σ PAs. `proposedTotal` is not: a program
    // in DIRECT_COSTS owns that figure, and `EstimateRollupService` is the only
    // thing entitled to write it. Without this guard the next line-item edit
    // would quietly reset a program's own budget to the sum of the PAs it does
    // not have — zero.
    const ownsItsTotal = program?.costMode === PPACostMode.DIRECT_COSTS;

    await tx.program.update({
      where: { id: programId },
      data: {
        psTotal: sums._sum.psTotal ?? new Prisma.Decimal(0),
        mooeTotal: sums._sum.mooeTotal ?? new Prisma.Decimal(0),
        feTotal: sums._sum.feTotal ?? new Prisma.Decimal(0),
        coTotal: sums._sum.coTotal ?? new Prisma.Decimal(0),
        grandTotal: sums._sum.grandTotal ?? new Prisma.Decimal(0),
        ...(ownsItsTotal
          ? {}
          : {
              proposedTotal:
                proposedSums._sum.proposedBudget ?? new Prisma.Decimal(0),
            }),
      },
    });
  }

  /** Full force-rebuild for one program: recompute every PA, then the program. */
  async forceRecomputeProgram(programId: string) {
    return this.prisma.$transaction(async (tx) => {
      const pas = await tx.projectActivity.findMany({
        where: { programId },
        select: { id: true },
      });
      for (const pa of pas) {
        await this.recomputeProjectActivity(pa.id, tx);
      }
      // recomputeProjectActivity already cascades, but if there are zero PAs,
      // ensure the program totals reset to zero too.
      if (pas.length === 0) await this.recomputeProgram(programId, tx);
      return tx.program.findUnique({
        where: { id: programId },
        select: {
          id: true,
          psTotal: true,
          mooeTotal: true,
          feTotal: true,
          coTotal: true,
          grandTotal: true,
        },
      });
    });
  }
}
