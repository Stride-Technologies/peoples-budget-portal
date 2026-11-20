import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { isAdoptedStatus } from '../budget-cycles/cycle-sections.js';
import { CacheService } from '../cache/cache.service.js';
import {
  AIP_CYCLE_LIST_KEY,
  aipCycleKey,
} from '../aip-cycles/aip-cycles.cache-keys.js';
import { AIPCycleStatus, Prisma } from '../generated/prisma/index';
import type { CreateBudgetCeilingDto } from './dto/create-budget-ceiling.dto.js';
import type { UpdateBudgetCeilingDto } from './dto/update-budget-ceiling.dto.js';
import { GOAL } from '../common/brand.js';

/**
 * SUPER_ADMIN-managed finish-line budget ceilings (per cycle). Each finish line
 * carries one `totalCeiling` — the single cap the approval check enforces. (The
 * legacy LGU/CSO partition was removed with the NCPC proponent track.)
 * Mid-cycle edits accepted, but every update writes a row to FinishLineBudgetCeilingHistory.
 */
@Injectable()
export class BudgetCeilingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * A ceiling write changes the owning cycle's embedded `ceilings` (in
   * `AIPCyclesService.findOne`) and its `_count.ceilings` (in the list), so the
   * cycle cache must be invalidated here too.
   */
  private async invalidateCycle(cycleId: string): Promise<void> {
    await Promise.all([
      this.cache.del(AIP_CYCLE_LIST_KEY),
      this.cache.del(aipCycleKey(cycleId)),
    ]);
  }

  /**
   * Throws if the total ceiling is negative. Zero passes on purpose — a ₱0
   * ceiling is a real cap ("nothing goes here this cycle"), distinct from the
   * absence of a ceiling row.
   */
  private validateTotal(total: Prisma.Decimal) {
    if (total.isNegative()) {
      throw new BadRequestException('totalCeiling must be non-negative');
    }
  }

  async create(dto: CreateBudgetCeilingDto, createdByUserId: string) {
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id: dto.aipCycleId },
    });
    if (!cycle) throw new NotFoundException('AIP cycle not found');
    if (
      isAdoptedStatus(cycle.status) ||
      cycle.status === AIPCycleStatus.CLOSED
    ) {
      throw new BadRequestException(
        `Cannot create ceilings on a ${cycle.status} cycle`,
      );
    }

    const finishLine = await this.prisma.finishLine.findUnique({
      where: { id: dto.finishLineId },
    });
    if (!finishLine) throw new NotFoundException(`${GOAL} not found`);

    const totalCeiling = new Prisma.Decimal(dto.totalCeiling);
    this.validateTotal(totalCeiling);

    try {
      const ceiling = await this.prisma.finishLineBudgetCeiling.create({
        data: {
          aipCycleId: dto.aipCycleId,
          finishLineId: dto.finishLineId,
          totalCeiling,
          createdByUserId,
        },
      });
      await this.invalidateCycle(dto.aipCycleId);
      return ceiling;
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `A ceiling for this ${GOAL.toLowerCase()} already exists in this cycle`,
        );
      }
      throw err;
    }
  }

  async findAll(opts: { cycleId?: string }) {
    return this.prisma.finishLineBudgetCeiling.findMany({
      where: { ...(opts.cycleId ? { aipCycleId: opts.cycleId } : {}) },
      include: {
        finishLine: { select: { id: true, name: true, visionNumber: true } },
        aipCycle: { select: { id: true, fiscalYear: true, status: true } },
      },
      orderBy: [
        { aipCycle: { fiscalYear: 'desc' } },
        { finishLine: { visionNumber: 'asc' } },
      ],
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.finishLineBudgetCeiling.findUnique({
      where: { id },
      include: {
        finishLine: { select: { id: true, name: true, visionNumber: true } },
        aipCycle: { select: { id: true, fiscalYear: true, status: true } },
        history: { orderBy: { changedAt: 'desc' }, take: 50 },
      },
    });
    if (!row) throw new NotFoundException('Budget ceiling not found');
    const changedByUserIds = [
      ...new Set(row.history.map((entry) => entry.changedByUserId)),
    ];
    const users =
      changedByUserIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: changedByUserIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    return {
      ...row,
      history: row.history.map((entry) => ({
        ...entry,
        changedByUser: userById.get(entry.changedByUserId) ?? null,
      })),
    };
  }

  async update(
    id: string,
    dto: UpdateBudgetCeilingDto,
    changedByUserId: string,
  ) {
    const existing = await this.prisma.finishLineBudgetCeiling.findUnique({
      where: { id },
      include: { aipCycle: { select: { status: true } } },
    });
    if (!existing) throw new NotFoundException('Budget ceiling not found');
    if (
      existing.aipCycle.status === AIPCycleStatus.CLOSED ||
      isAdoptedStatus(existing.aipCycle.status)
    ) {
      throw new BadRequestException(
        `Cannot edit ceilings on a ${existing.aipCycle.status} cycle`,
      );
    }

    const next = {
      totalCeiling:
        dto.totalCeiling !== undefined
          ? new Prisma.Decimal(dto.totalCeiling)
          : existing.totalCeiling,
    };
    this.validateTotal(next.totalCeiling);

    // Snapshot prior state into history; then apply the update. Transactional.
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.finishLineBudgetCeilingHistory.create({
        data: {
          ceilingId: id,
          totalCeiling: existing.totalCeiling,
          changedByUserId,
        },
      });
      return tx.finishLineBudgetCeiling.update({
        where: { id },
        data: next,
      });
    });
    await this.invalidateCycle(existing.aipCycleId);
    return updated;
  }

  async remove(id: string) {
    const existing = await this.prisma.finishLineBudgetCeiling.findUnique({
      where: { id },
      include: { aipCycle: { select: { status: true } } },
    });
    if (!existing) throw new NotFoundException('Budget ceiling not found');
    if (existing.aipCycle.status !== AIPCycleStatus.PLANNING) {
      throw new BadRequestException(
        'Ceilings can only be deleted while the cycle is in PLANNING',
      );
    }
    // Any program referencing this finish line in this cycle blocks the delete.
    const programs = await this.prisma.program.count({
      where: {
        aipCycleId: existing.aipCycleId,
        finishLineId: existing.finishLineId,
        deletedAt: null,
      },
    });
    if (programs > 0) {
      throw new ConflictException(
        `Cannot delete: ${programs} program(s) already reference this ${GOAL.toLowerCase()} in this cycle`,
      );
    }
    await this.prisma.finishLineBudgetCeiling.delete({ where: { id } });
    await this.invalidateCycle(existing.aipCycleId);
    return { message: 'Ceiling deleted.' };
  }
}
