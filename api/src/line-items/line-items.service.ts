import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { climateBudgetBasis } from '../climate-tags/climate-tags.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramsService } from '../programs/programs.service.js';
import { BudgetRollupService } from '../budget-rollup/budget-rollup.service.js';
import { ExpenseClass, Prisma } from '../generated/prisma/index';
import { isEditableStatus } from '../programs/program-status.constants.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { CreateLineItemDto } from './dto/create-line-item.dto.js';
import type { UpdateLineItemDto } from './dto/update-line-item.dto.js';

@Injectable()
export class LineItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly programs: ProgramsService,
    private readonly rollup: BudgetRollupService,
  ) {}

  private async loadPAOrFail(paId: string) {
    const pa = await this.prisma.projectActivity.findUnique({
      where: { id: paId },
      include: { program: true },
    });
    if (!pa || pa.program.deletedAt) {
      throw new NotFoundException('Project/Activity not found');
    }
    return pa;
  }

  private async loadLineItemOrFail(id: string) {
    const li = await this.prisma.lineItem.findUnique({
      where: { id },
      include: { projectActivity: { include: { program: true } } },
    });
    if (!li || li.projectActivity.program.deletedAt) {
      throw new NotFoundException('Line item not found');
    }
    return li;
  }

  /** Validate UACS exists, matches the line's expense class; snapshot fields. */
  private async resolveUACS(
    uacsObjectId: string,
    expectedClass: ExpenseClass,
  ): Promise<{ code: string; description: string }> {
    const uacs = await this.prisma.uACSObject.findUnique({
      where: { id: uacsObjectId },
    });
    if (!uacs) throw new NotFoundException('UACS object not found');
    if (uacs.expenseClass !== expectedClass) {
      throw new BadRequestException(
        `UACS object expense class is ${uacs.expenseClass}, but line item is ${expectedClass}`,
      );
    }
    return { code: uacs.code, description: uacs.description };
  }

  private async assertClimateTagWithinBudget(
    paId: string,
    tx: Prisma.TransactionClient,
  ) {
    const tag = await tx.climateChangeTag.findUnique({
      where: { projectActivityId: paId },
    });
    if (!tag) return;
    const [pa, items] = await Promise.all([
      tx.projectActivity.findUnique({
        where: { id: paId },
        select: { proposedBudget: true },
      }),
      tx.lineItem.findMany({
        where: { projectActivityId: paId },
        select: { lineTotal: true },
      }),
    ]);
    const paGrand = climateBudgetBasis(
      pa?.proposedBudget ?? null,
      items.map((i) => i.lineTotal),
    );
    const cc = tag.ccaAmount.plus(tag.ccmAmount);
    if (cc.greaterThan(paGrand)) {
      throw new BadRequestException(
        `Climate tag (CCA+CCM=${cc.toFixed(2)}) exceeds new PA total (${paGrand.toFixed(2)}); remove or adjust the climate tag first`,
      );
    }
  }

  async create(paId: string, dto: CreateLineItemDto, user: JwtPayload) {
    const pa = await this.loadPAOrFail(paId);
    await this.programs.assertOwner(pa.program, user);
    if (!isEditableStatus(pa.program.status)) {
      throw new BadRequestException(
        'Line items can only be added while the parent program is editable (DRAFT or FOR_REVISION)',
      );
    }

    const snapshot = await this.resolveUACS(dto.uacsObjectId, dto.expenseClass);
    const quantity = new Prisma.Decimal(dto.quantity);
    const unitCost = new Prisma.Decimal(dto.unitCost);
    const lineTotal = quantity.mul(unitCost);

    return this.prisma.$transaction(async (tx) => {
      const li = await tx.lineItem.create({
        data: {
          projectActivityId: paId,
          expenseClass: dto.expenseClass,
          uacsObjectId: dto.uacsObjectId,
          uacsCode: snapshot.code,
          uacsDescription: snapshot.description,
          quantity,
          unit: dto.unit,
          unitCost,
          lineTotal,
          remarks: dto.remarks ?? null,
          orderIndex: dto.orderIndex ?? 0,
        },
      });
      await this.rollup.recomputeProjectActivity(paId, tx);
      await this.assertClimateTagWithinBudget(paId, tx);
      return li;
    });
  }

  async update(id: string, dto: UpdateLineItemDto, user: JwtPayload) {
    const existing = await this.loadLineItemOrFail(id);
    await this.programs.assertOwner(existing.projectActivity.program, user);
    if (!isEditableStatus(existing.projectActivity.program.status)) {
      throw new BadRequestException(
        'Line items can only be edited while the parent program is editable (DRAFT or FOR_REVISION)',
      );
    }

    // Resolve UACS if expense class or uacsObjectId changed.
    const nextExpenseClass = dto.expenseClass ?? existing.expenseClass;
    let snapshot: { code: string; description: string } | null = null;
    if (
      (dto.uacsObjectId && dto.uacsObjectId !== existing.uacsObjectId) ||
      (dto.expenseClass && dto.expenseClass !== existing.expenseClass)
    ) {
      snapshot = await this.resolveUACS(
        dto.uacsObjectId ?? existing.uacsObjectId,
        nextExpenseClass,
      );
    }

    const quantity =
      dto.quantity !== undefined
        ? new Prisma.Decimal(dto.quantity)
        : existing.quantity;
    const unitCost =
      dto.unitCost !== undefined
        ? new Prisma.Decimal(dto.unitCost)
        : existing.unitCost;
    const lineTotal = quantity.mul(unitCost);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lineItem.update({
        where: { id },
        data: {
          ...(dto.expenseClass !== undefined
            ? { expenseClass: dto.expenseClass }
            : {}),
          ...(dto.uacsObjectId !== undefined
            ? { uacsObjectId: dto.uacsObjectId }
            : {}),
          ...(snapshot
            ? { uacsCode: snapshot.code, uacsDescription: snapshot.description }
            : {}),
          ...(dto.quantity !== undefined ? { quantity } : {}),
          ...(dto.unitCost !== undefined ? { unitCost } : {}),
          lineTotal,
          ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
          ...(dto.orderIndex !== undefined
            ? { orderIndex: dto.orderIndex }
            : {}),
        },
      });
      await this.rollup.recomputeProjectActivity(
        existing.projectActivityId,
        tx,
      );
      await this.assertClimateTagWithinBudget(existing.projectActivityId, tx);
      return updated;
    });
  }

  async remove(id: string, user: JwtPayload) {
    const existing = await this.loadLineItemOrFail(id);
    await this.programs.assertOwner(existing.projectActivity.program, user);
    if (!isEditableStatus(existing.projectActivity.program.status)) {
      throw new BadRequestException(
        'Line items can only be deleted while the parent program is editable (DRAFT or FOR_REVISION)',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.lineItem.delete({ where: { id } });
      await this.rollup.recomputeProjectActivity(
        existing.projectActivityId,
        tx,
      );
      await this.assertClimateTagWithinBudget(existing.projectActivityId, tx);
      return { message: 'Line item deleted.' };
    });
  }

  /** List all line items for a PA (lazy-load path for endorser and reviewer views). */
  async listByPA(paId: string, user: JwtPayload) {
    const pa = await this.loadPAOrFail(paId);
    await this.programs.assertCanRead(pa.program.id, user);
    return this.prisma.lineItem.findMany({
      where: { projectActivityId: paId },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });
  }
}
