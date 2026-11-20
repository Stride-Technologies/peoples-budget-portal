import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BudgetDocumentKind,
  BudgetDocumentStatus,
} from '../generated/prisma/index';
import { hasEnactedBudget } from './cycle-sections.js';
import type { SetStageDto } from './dto/set-stage.dto.js';
import { PUBLICLY_VISIBLE } from '../programs/program-filters.js';

/** 8 = Execution in client/src/lib/budget-cycle.ts. */
export const EXECUTION_STAGE = 8;

/**
 * Budget Cycles (specs/012): one per fiscal year, the AIP being one stage of
 * it. Staff set the stage by hand — consultations and budget preparation leave
 * no document to derive it from — and the guard below refuses a stage the
 * documents contradict.
 */
@Injectable()
export class BudgetCyclesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.budgetCycle.findMany({
      orderBy: { fiscalYear: 'desc' },
      include: { aipCycle: { select: { id: true, status: true } } },
    });
  }

  async findOne(id: string) {
    const cycle = await this.prisma.budgetCycle.findUnique({
      where: { id },
      include: { aipCycle: { select: { id: true, status: true } } },
    });
    if (!cycle) throw new NotFoundException('Budget cycle not found');
    return cycle;
  }

  /**
   * Execution (stage 8) and later need an enacted budget to execute: an
   * ENACTED Ordinance, or (interim) FY2026 held as an adopted AIP cycle —
   * `hasEnactedBudget`, the rule `computeSections` uses for `annual`.
   */
  async setStage(id: string, dto: SetStageDto) {
    const cycle = await this.findOne(id);
    const reached = Math.max(dto.currentStage, ...dto.alongsideStages);
    if (reached >= EXECUTION_STAGE) {
      const enacted = hasEnactedBudget({
        fiscalYear: cycle.fiscalYear,
        aipStatus: cycle.aipCycle?.status ?? null,
        hasPublicAip:
          !!cycle.aipCycle &&
          (await this.prisma.program.count({
            where: {
              aipCycleId: cycle.aipCycle.id,
              ...PUBLICLY_VISIBLE,
            },
          })) > 0,
        hasEnactedOrdinance:
          (await this.prisma.budgetDocument.count({
            where: {
              budgetCycleId: id,
              kind: BudgetDocumentKind.ORDINANCE,
              status: BudgetDocumentStatus.ENACTED,
            },
          })) > 0,
      });
      if (!enacted) {
        throw new ConflictException({
          code: 'STAGE_REQUIRES_ENACTED_ORDINANCE',
          message: `FY${cycle.fiscalYear} has no enacted budget yet, so it cannot be in execution or accountability.`,
        });
      }
    }
    return this.prisma.budgetCycle.update({
      where: { id },
      data: {
        currentStage: dto.currentStage,
        // A set, stored ascending; the current stage is never also alongside.
        alongsideStages: [...new Set(dto.alongsideStages)]
          .filter((s) => s !== dto.currentStage)
          .sort((a, b) => a - b),
      },
    });
  }
}
