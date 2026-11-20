import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { FundSource, PPACostMode, Prisma } from '../generated/prisma/index';

type Tx = Prisma.TransactionClient;

/** Declared enum order — the display order for a derived parent's fund list. */
const FUND_SOURCE_ORDER = Object.values(FundSource);

/**
 * Maintains the Phase 1 cost-estimate arithmetic (D3, §4.2):
 *
 *   PA (DIRECT_COSTS)      proposedBudget = ps + mooe + fe + co
 *                          …unless all four are NULL, in which case the
 *                          manually-entered proposedBudget is preserved.
 *                          With fund allocations, ps/mooe/fe/co = Σ allocations
 *                          and fundSources = their funds.
 *   PA (ACTIVITY_CHILDREN) each estimate  = Σ children's estimate
 *                          proposedBudget = Σ children's proposedBudget
 *                          fundSources    = ∪ children's fundSources
 *   Program (DIRECT_COSTS) proposedTotal = ps + mooe + fe + co, the four columns
 *                          being the program's own stated figures (or Σ its
 *                          fund allocations, as for a PA)
 *   Program (ACTIVITY_…)   ps/mooe/fe/coProposedTotal = Σ root PAs' estimates
 *                          proposedTotal              = Σ root PAs' proposedBudget
 *
 * Deliberately a **separate service from `BudgetRollupService`** rather than a
 * few more fields on it. That one owns the line-item invariant, which D4 makes
 * a hard non-breaking requirement and which a later phase will build on; mixing
 * the two would put the Phase 1 estimates and the Phase 2 cost assumptions in
 * one place where a change to either could silently move the other.
 *
 * Transaction-aware in the same `(id, tx)` style: never opens its own.
 */
@Injectable()
export class EstimateRollupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recompute one PA's estimates and proposedBudget, then cascade to its parent
   * (if any) and the program.
   */
  async recomputeProjectActivity(paId: string, tx: Tx): Promise<void> {
    const pa = await tx.projectActivity.findUnique({
      where: { id: paId },
      select: {
        id: true,
        programId: true,
        parentProjectActivityId: true,
        costMode: true,
        psEstimate: true,
        mooeEstimate: true,
        feEstimate: true,
        coEstimate: true,
        proposedBudget: true,
        fundAllocations: true,
      },
    });
    if (!pa) return;

    if (pa.costMode === PPACostMode.ACTIVITY_CHILDREN) {
      // A parent's money is its children's; a split of its own would be a second figure.
      if (pa.fundAllocations.length)
        await tx.fundAllocation.deleteMany({
          where: { projectActivityId: paId },
        });
      const sums = await tx.projectActivity.aggregate({
        where: { parentProjectActivityId: paId },
        _sum: {
          psEstimate: true,
          mooeEstimate: true,
          feEstimate: true,
          coEstimate: true,
          proposedBudget: true,
        },
      });

      // Fund sources are derived the same way the amounts are — the parent draws
      // on whatever its children draw on — so the form does not ask for them.
      // A union, not a sum: `aggregate` cannot do arrays, hence the second read.
      const children = await tx.projectActivity.findMany({
        where: { parentProjectActivityId: paId },
        select: { fundSources: true },
      });
      const union = new Set(children.flatMap((child) => child.fundSources));
      // Enum order, so the list reads the same everywhere it is displayed.
      const fundSources = FUND_SOURCE_ORDER.filter((fund) => union.has(fund));

      await tx.projectActivity.update({
        where: { id: paId },
        data: {
          psEstimate: sums._sum.psEstimate ?? null,
          mooeEstimate: sums._sum.mooeEstimate ?? null,
          feEstimate: sums._sum.feEstimate ?? null,
          coEstimate: sums._sum.coEstimate ?? null,
          proposedBudget: sums._sum.proposedBudget ?? null,
          fundSources,
        },
      });
    } else if (pa.fundAllocations.length) {
      const split = sumAllocations(pa.fundAllocations);
      await tx.projectActivity.update({
        where: { id: paId },
        data: {
          psEstimate: split.ps,
          mooeEstimate: split.mooe,
          feEstimate: split.fe,
          coEstimate: split.co,
          proposedBudget: split.total,
          fundSources: split.fundSources,
        },
      });
    } else {
      const hasAnyEstimate =
        pa.psEstimate !== null ||
        pa.mooeEstimate !== null ||
        pa.feEstimate !== null ||
        pa.coEstimate !== null;

      // All four NULL means this row predates the estimate columns (imported
      // from the 2027 shortlist). Leave its manual figure alone — overwriting it
      // with zero would silently blank a published budget line.
      if (hasAnyEstimate) {
        const proposedBudget = zero()
          .plus(pa.psEstimate ?? 0)
          .plus(pa.mooeEstimate ?? 0)
          .plus(pa.feEstimate ?? 0)
          .plus(pa.coEstimate ?? 0);

        await tx.projectActivity.update({
          where: { id: paId },
          data: { proposedBudget },
        });
      }
    }

    if (pa.parentProjectActivityId) {
      await this.recomputeProjectActivity(pa.parentProjectActivityId, tx);
      return; // the parent's recursion cascades to the program
    }
    await this.recomputeProgram(pa.programId, tx);
  }

  /**
   * Recompute a program's proposed family.
   *
   * Mirrors `recomputeProjectActivity` one level up: a program in
   * `DIRECT_COSTS` states its own PS/MOOE/FE/CO and `proposedTotal` is their sum;
   * a program in `ACTIVITY_CHILDREN` — the default, and what every row did
   * before the column existed — derives all four from its root PAs.
   */
  async recomputeProgram(programId: string, tx: Tx): Promise<void> {
    const program = await tx.program.findUnique({
      where: { id: programId },
      select: {
        costMode: true,
        psProposedTotal: true,
        mooeProposedTotal: true,
        feProposedTotal: true,
        coProposedTotal: true,
        fundAllocations: true,
      },
    });
    if (!program) return;

    if (
      program.costMode === PPACostMode.DIRECT_COSTS &&
      program.fundAllocations.length
    ) {
      const split = sumAllocations(program.fundAllocations);
      await tx.program.update({
        where: { id: programId },
        data: {
          psProposedTotal: split.ps,
          mooeProposedTotal: split.mooe,
          feProposedTotal: split.fe,
          coProposedTotal: split.co,
          proposedTotal: split.total,
          fundSources: split.fundSources,
        },
      });
      return;
    }
    if (program.fundAllocations.length)
      await tx.fundAllocation.deleteMany({ where: { programId } });

    if (program.costMode === PPACostMode.DIRECT_COSTS) {
      // The four class columns are the input here, not the output. Only
      // `proposedTotal` is derived, exactly as a DIRECT_COSTS PA derives
      // `proposedBudget` from its own four estimates.
      await tx.program.update({
        where: { id: programId },
        data: {
          proposedTotal: zero()
            .plus(program.psProposedTotal)
            .plus(program.mooeProposedTotal)
            .plus(program.feProposedTotal)
            .plus(program.coProposedTotal),
        },
      });
      return;
    }

    const sums = await tx.projectActivity.aggregate({
      where: { programId, parentProjectActivityId: null },
      _sum: {
        psEstimate: true,
        mooeEstimate: true,
        feEstimate: true,
        coEstimate: true,
        proposedBudget: true,
      },
    });

    await tx.program.update({
      where: { id: programId },
      data: {
        psProposedTotal: sums._sum.psEstimate ?? zero(),
        mooeProposedTotal: sums._sum.mooeEstimate ?? zero(),
        feProposedTotal: sums._sum.feEstimate ?? zero(),
        coProposedTotal: sums._sum.coEstimate ?? zero(),
        // proposedTotal keeps exactly the meaning it has today (§4.2).
        proposedTotal: sums._sum.proposedBudget ?? zero(),
      },
    });
  }

  /** Force-rebuild for drift repair. Mirrors BudgetRollupService's equivalent. */
  async forceRecomputeProgram(programId: string, tx?: Tx): Promise<void> {
    const run = async (t: Tx) => {
      // Deepest-first, so a parent in ACTIVITY_CHILDREN mode sums children that
      // have already been recomputed.
      const pas = await t.projectActivity.findMany({
        where: { programId },
        select: { id: true, parentProjectActivityId: true },
      });
      const leaves = pas.filter(
        (pa) => !pas.some((c) => c.parentProjectActivityId === pa.id),
      );
      for (const leaf of leaves) {
        await this.recomputeProjectActivity(leaf.id, t);
      }
      if (pas.length === 0) await this.recomputeProgram(programId, t);
    };

    if (tx) return run(tx);
    await this.prisma.$transaction(run);
  }
}

const zero = () => new Prisma.Decimal(0);

/** One line of a row's per-fund split, as sent by a client or the seed. */
export interface FundAllocationInput {
  fundSource: FundSource;
  ps: Prisma.Decimal.Value;
  mooe: Prisma.Decimal.Value;
  /** Optional: callers that predate FE (seeds, older clients) mean 0. */
  fe?: Prisma.Decimal.Value;
  co: Prisma.Decimal.Value;
}

export function sumAllocations(lines: FundAllocationInput[]) {
  const ps = lines.reduce((s, l) => s.plus(l.ps), zero());
  const mooe = lines.reduce((s, l) => s.plus(l.mooe), zero());
  const fe = lines.reduce((s, l) => s.plus(l.fe ?? 0), zero());
  const co = lines.reduce((s, l) => s.plus(l.co), zero());
  const funds = new Set(lines.map((l) => l.fundSource));
  return {
    ps,
    mooe,
    fe,
    co,
    total: ps.plus(mooe).plus(fe).plus(co),
    fundSources: FUND_SOURCE_ORDER.filter((f) => funds.has(f)),
  };
}

/**
 * Replace a row's per-fund split. `[]` returns it to "declared as a total".
 * The caller then runs the rollup, which derives the row's PS/MOOE/FE/CO and
 * fund list from these lines.
 */
export async function replaceFundAllocations(
  owner: { programId: string } | { projectActivityId: string },
  lines: FundAllocationInput[],
  tx: Tx,
): Promise<void> {
  const funds = lines.map((l) => l.fundSource);
  if (new Set(funds).size !== funds.length)
    throw new BadRequestException(
      'Each fund source may appear once in a split',
    );
  await tx.fundAllocation.deleteMany({ where: owner });
  if (lines.length)
    await tx.fundAllocation.createMany({
      data: lines.map((l, orderIndex) => ({
        ...owner,
        fundSource: l.fundSource,
        ps: new Prisma.Decimal(l.ps),
        mooe: new Prisma.Decimal(l.mooe),
        fe: new Prisma.Decimal(l.fe ?? 0),
        co: new Prisma.Decimal(l.co),
        orderIndex,
      })),
    });
}
