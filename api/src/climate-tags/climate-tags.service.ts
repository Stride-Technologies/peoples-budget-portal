import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramsService } from '../programs/programs.service.js';
import { Prisma } from '../generated/prisma/index';
import { isEditableStatus } from '../programs/program-status.constants.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { UpsertClimateTagDto } from './dto/upsert-climate-tag.dto.js';

type Owner = { projectActivityId: string } | { programId: string };

/**
 * What a tag's CCA + CCM may not exceed: the row's proposed budget, or the sum
 * of its line items where it has no proposed budget of its own. Imported rows
 * carry a proposed budget and no line items, so checking line items alone made
 * every imported tag uneditable.
 */
export function climateBudgetBasis(
  proposed: Prisma.Decimal | null,
  lineItemTotals: Prisma.Decimal[],
): Prisma.Decimal {
  return (
    proposed ??
    lineItemTotals.reduce((acc, t) => acc.plus(t), new Prisma.Decimal(0))
  );
}

@Injectable()
export class ClimateTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly programs: ProgramsService,
  ) {}

  private async loadPAOrFail(paId: string) {
    const pa = await this.prisma.projectActivity.findUnique({
      where: { id: paId },
      include: { program: true, lineItems: true },
    });
    if (!pa || pa.program.deletedAt) {
      throw new NotFoundException('Project/Activity not found');
    }
    return pa;
  }

  private async loadProgramOrFail(programId: string) {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
    });
    if (!program || program.deletedAt) {
      throw new NotFoundException('Program not found');
    }
    return program;
  }

  async upsert(paId: string, dto: UpsertClimateTagDto, user: JwtPayload) {
    const pa = await this.loadPAOrFail(paId);
    await this.programs.assertOwner(pa.program, user);
    this.assertEditable(pa.program.status);
    const basis = climateBudgetBasis(
      pa.proposedBudget,
      pa.lineItems.map((li) => li.lineTotal),
    );
    return this.write({ projectActivityId: paId }, dto, basis, 'PA');
  }

  async upsertForProgram(
    programId: string,
    dto: UpsertClimateTagDto,
    user: JwtPayload,
  ) {
    const program = await this.loadProgramOrFail(programId);
    await this.programs.assertOwner(program, user);
    this.assertEditable(program.status);
    return this.write({ programId }, dto, program.proposedTotal, 'program');
  }

  async remove(paId: string, user: JwtPayload) {
    const pa = await this.loadPAOrFail(paId);
    await this.programs.assertOwner(pa.program, user);
    this.assertEditable(pa.program.status);
    return this.delete({ projectActivityId: paId });
  }

  async removeForProgram(programId: string, user: JwtPayload) {
    const program = await this.loadProgramOrFail(programId);
    await this.programs.assertOwner(program, user);
    this.assertEditable(program.status);
    return this.delete({ programId });
  }

  private assertEditable(status: Parameters<typeof isEditableStatus>[0]) {
    if (!isEditableStatus(status)) {
      throw new BadRequestException(
        'Climate tag can only be modified while the parent program is editable (DRAFT or FOR_REVISION)',
      );
    }
  }

  private async write(
    owner: Owner,
    dto: UpsertClimateTagDto,
    basis: Prisma.Decimal,
    label: 'PA' | 'program',
  ) {
    const ids = [...new Set(dto.ccetCodeIds ?? [])];
    if (ids.length) {
      const found = await this.prisma.climateTypologyCode.count({
        where: { id: { in: ids } },
      });
      if (found !== ids.length) {
        throw new NotFoundException('Climate typology code not found');
      }
    }

    const ccaAmount = new Prisma.Decimal(dto.ccaAmount ?? '0');
    const ccmAmount = new Prisma.Decimal(dto.ccmAmount ?? '0');
    if (ccaAmount.plus(ccmAmount).greaterThan(basis)) {
      throw new BadRequestException(
        `CCA + CCM (${ccaAmount.plus(ccmAmount).toFixed(2)}) exceeds ${label} total (${basis.toFixed(2)})`,
      );
    }

    const where =
      'programId' in owner
        ? { programId: owner.programId }
        : { projectActivityId: owner.projectActivityId };
    const codes = { create: ids.map((ccetCodeId) => ({ ccetCodeId })) };
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.climateChangeTag.findUnique({ where });
      const data = { ccaAmount, ccmAmount, remarks: dto.remarks ?? null };
      if (existing) {
        await tx.climateChangeTagCode.deleteMany({
          where: { tagId: existing.id },
        });
        return tx.climateChangeTag.update({
          where: { id: existing.id },
          data: { ...data, codes },
          include: { codes: { include: { ccetCode: true } } },
        });
      }
      return tx.climateChangeTag.create({
        data: { ...owner, ...data, codes },
        include: { codes: { include: { ccetCode: true } } },
      });
    });
  }

  private async delete(owner: Owner) {
    const where =
      'programId' in owner
        ? { programId: owner.programId }
        : { projectActivityId: owner.projectActivityId };
    const existing = await this.prisma.climateChangeTag.findUnique({ where });
    if (!existing) return { message: 'No climate tag to remove.' };
    await this.prisma.climateChangeTag.delete({ where: { id: existing.id } });
    return { message: 'Climate tag removed.' };
  }
}
