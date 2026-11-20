import { Injectable, NotFoundException } from '@nestjs/common';
import { FundSource, Prisma } from '../generated/prisma/index';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  loadLbpSource,
  moneyOnFund,
  type SheetProgram,
} from '../aip-registry/lbp-figures.js';
import { programMoney } from '../aip-registry/office-sheet.js';
import { SPECIAL_FUNDS, isSpecialFund } from '../common/special-funds.js';

/**
 * Special funds' stated amounts (specs/008 US5; by fund since specs/016).
 *
 * A special fund (SPA, LDF, LDRRMF) prints on the General Fund's LBP Form 7 as
 * a lump sum. Its money is whatever any office's rows put on that fund; when
 * there is none, the stated amount stands in — the 2027 workbook once gave LDF
 * about ₱272M and no PPAs.
 *
 * Staff-only. No public or open-data path reads `FundStatedAmount` (FR-044),
 * and the flags below are derived on every read, never stored (invariant 20).
 */

// Re-exported for existing importers; the list lives where the export's sheet
// builder can read it without importing this service (no import cycle).
export { SPECIAL_FUNDS, isSpecialFund } from '../common/special-funds.js';

export type SpecialFundFlag = 'STATED_WITHOUT_PPAS' | 'STATED_DIFFERS';

export interface SpecialFundFigure {
  figure: Prisma.Decimal;
  flags: SpecialFundFlag[];
}

/** The program sum wins; the stated amount stands in only when there is none. */
export function specialFundFigure(
  programTotal: Prisma.Decimal,
  programCount: number,
  stated: Prisma.Decimal | null,
): SpecialFundFigure {
  if (programCount > 0)
    return {
      figure: programTotal,
      flags: stated && !stated.equals(programTotal) ? ['STATED_DIFFERS'] : [],
    };
  return {
    figure: stated ?? new Prisma.Decimal(0),
    flags: stated ? ['STATED_WITHOUT_PPAS'] : [],
  };
}

/**
 * What every office's rows put on `fund`, and how many programs put any.
 * Fund attribution is Form 4/7's own (`lbp-figures.ts`): an unsplit
 * multi-fund row is on no fund, so it counts nowhere here either.
 */
export function moneyOnSpecialFund(
  programs: SheetProgram[],
  fund: FundSource,
): { total: Prisma.Decimal; count: number } {
  let total = new Prisma.Decimal(0);
  let count = 0;
  for (const program of programs) {
    const own = programMoney(program, moneyOnFund(fund)).total;
    if (own.isZero()) continue;
    total = total.plus(own);
    count++;
  }
  return { total, count };
}

export interface SpecialFundRow {
  fund: FundSource;
  name: string;
  statedAmount: string | null;
  note: string | null;
  programTotal: string;
  programCount: number;
  figure: string;
  flags: SpecialFundFlag[];
}

@Injectable()
export class SpecialFundsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every special fund, with this cycle's stated amount and working program sum. */
  async list(cycleId: string): Promise<SpecialFundRow[]> {
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id: cycleId },
      select: { id: true },
    });
    if (!cycle) throw new NotFoundException('AIP cycle not found');

    const [stated, loaded] = await Promise.all([
      this.prisma.fundStatedAmount.findMany({ where: { aipCycleId: cycleId } }),
      loadLbpSource(this.prisma, { cycleId, figures: 'working' }, 'ALL'),
    ]);

    return SPECIAL_FUNDS.map(({ fund, name }) => {
      const { total, count } = moneyOnSpecialFund(loaded.programs, fund);
      const row = stated.find((s) => s.fundSource === fund) ?? null;
      const { figure, flags } = specialFundFigure(
        total,
        count,
        row?.statedAmount ?? null,
      );
      return {
        fund,
        name,
        statedAmount: row?.statedAmount.toFixed(2) ?? null,
        note: row?.note ?? null,
        programTotal: total.toFixed(2),
        programCount: count,
        figure: figure.toFixed(2),
        flags,
      };
    });
  }

  /** Set (or with `null`, clear) a special fund's stated amount for a cycle. */
  async setStated(
    cycleId: string,
    fund: string,
    statedAmount: string | null,
    note: string | undefined,
    userId: string,
  ) {
    if (!isSpecialFund(fund))
      throw new NotFoundException('Special fund not found');
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id: cycleId },
      select: { id: true },
    });
    if (!cycle) throw new NotFoundException('AIP cycle not found');

    if (statedAmount === null) {
      await this.prisma.fundStatedAmount.deleteMany({
        where: { fundSource: fund, aipCycleId: cycleId },
      });
    } else {
      const data = {
        statedAmount: new Prisma.Decimal(statedAmount),
        note: note ?? null,
        updatedByUserId: userId,
      };
      await this.prisma.fundStatedAmount.upsert({
        where: {
          fundSource_aipCycleId: { fundSource: fund, aipCycleId: cycleId },
        },
        create: { fundSource: fund, aipCycleId: cycleId, ...data },
        update: data,
      });
    }
    return (await this.list(cycleId)).find((r) => r.fund === fund);
  }
}
