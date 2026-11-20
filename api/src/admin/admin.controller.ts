import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  CommentStage,
  Role,
  RegistryFeedbackCategory,
} from '../generated/prisma/index';
import type { Prisma } from '../generated/prisma/index';
import { BudgetRollupService } from '../budget-rollup/budget-rollup.service.js';
import { EstimateRollupService } from '../budget-rollup/estimate-rollup.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { OfficeScopeService } from '../permissions/office-scope.service.js';
import {
  ITEM_FEEDBACK_SELECT,
  withFeedbackTarget,
} from '../comments/item-feedback.js';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly rollup: BudgetRollupService,
    private readonly estimates: EstimateRollupService,
    private readonly prisma: PrismaService,
    private readonly officeScope: OfficeScopeService,
  ) {}

  // ─── General registry feedback ──────────────────────────────────────────────

  @Get('registry-feedback')
  @RequirePermission('public_comments:view')
  @Roles(Role.HEAD, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List public registry feedback submissions' })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: RegistryFeedbackCategory,
  })
  @ApiQuery({ name: 'reviewed', required: false, type: Boolean })
  @ApiQuery({
    name: 'deleted',
    required: false,
    type: Boolean,
    description: 'true = show only soft-deleted; default = exclude deleted',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listRegistryFeedback(
    @CurrentUser() user: JwtPayload,
    @Query('category') category?: string,
    @Query('reviewed') reviewed?: string,
    @Query('deleted') deleted?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // The trash (soft-deleted) view is admin-only; STAFF may list live feedback
    // but must not retrieve removed content, even via a direct API call.
    if (
      deleted === 'true' &&
      user.role !== Role.HEAD &&
      user.role !== Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only admins can view deleted feedback');
    }
    const take = Math.min(limit !== undefined ? Number(limit) : 50, 100);
    const skip =
      (Math.max(page !== undefined ? Number(page) : 1, 1) - 1) * take;
    const where: Record<string, unknown> = {};
    if (category) where['category'] = category;
    if (reviewed === 'true') {
      where['reviewedAt'] = { not: null };
    } else if (reviewed === 'false') {
      where['reviewedAt'] = null;
    }
    where['deletedAt'] = deleted === 'true' ? { not: null } : null;
    const [items, total] = await Promise.all([
      this.prisma.publicRegistryFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.publicRegistryFeedback.count({ where }),
    ]);
    return {
      items,
      total,
      page: page !== undefined ? Number(page) : 1,
      limit: take,
    };
  }

  @Patch('registry-feedback/:id/review')
  @RequirePermission('public_comments:moderate')
  @Roles(Role.HEAD, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mark a registry feedback submission as reviewed' })
  @ApiBody({ schema: { properties: { internalNote: { type: 'string' } } } })
  async reviewRegistryFeedback(
    @Param('id') id: string,
    @Body() body: { internalNote?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    const record = await this.prisma.publicRegistryFeedback.findUnique({
      where: { id },
    });
    if (!record || record.deletedAt)
      throw new NotFoundException(`Feedback ${id} not found`);
    return this.prisma.publicRegistryFeedback.update({
      where: { id },
      data: {
        reviewedAt: new Date(),
        reviewedById: user.sub,
        internalNote: body.internalNote ?? null,
      },
      include: {
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  @Patch('registry-feedback/:id/unreview')
  @RequirePermission('public_comments:moderate')
  @Roles(Role.HEAD, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Undo review on a registry feedback submission' })
  async unreviewRegistryFeedback(@Param('id') id: string) {
    const record = await this.prisma.publicRegistryFeedback.findUnique({
      where: { id },
    });
    if (!record || record.deletedAt)
      throw new NotFoundException(`Feedback ${id} not found`);
    await this.prisma.publicRegistryFeedback.update({
      where: { id },
      data: { reviewedAt: null, reviewedById: null, internalNote: null },
    });
    return { id, reviewedAt: null, reviewedBy: null, internalNote: null };
  }

  @Delete('registry-feedback/:id')
  @RequirePermission('public_comments:moderate')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Soft-delete a public registry feedback submission (SUPER_ADMIN only); restorable',
  })
  async deleteRegistryFeedback(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const record = await this.prisma.publicRegistryFeedback.findUnique({
      where: { id },
    });
    if (!record || record.deletedAt)
      throw new NotFoundException(`Feedback ${id} not found`);
    await this.prisma.publicRegistryFeedback.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: user.sub },
    });
    console.log(
      `[admin] SUPER_ADMIN ${user.sub} soft-deleted registry feedback ${id}`,
    );
    return { message: 'Feedback deleted.' };
  }

  @Patch('registry-feedback/:id/restore')
  @RequirePermission('public_comments:moderate')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Restore a soft-deleted registry feedback submission (SUPER_ADMIN)',
  })
  async restoreRegistryFeedback(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const record = await this.prisma.publicRegistryFeedback.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException(`Feedback ${id} not found`);
    if (!record.deletedAt) return { message: 'Feedback is not deleted.' };
    await this.prisma.publicRegistryFeedback.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
    console.log(
      `[admin] SUPER_ADMIN ${user.sub} restored registry feedback ${id}`,
    );
    return { message: 'Feedback restored.' };
  }

  // ─── Program-level feedback ──────────────────────────────────────────────────

  @Get('program-feedback')
  @RequirePermission('public_comments:view')
  @Roles(Role.HEAD, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List PUBLIC_FEEDBACK ProgramComments with program name',
  })
  @ApiQuery({ name: 'reviewed', required: false, type: Boolean })
  @ApiQuery({
    name: 'deleted',
    required: false,
    type: Boolean,
    description: 'true = show only soft-deleted; default = exclude deleted',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listProgramFeedback(
    @CurrentUser() user: JwtPayload,
    @Query('reviewed') reviewed?: string,
    @Query('deleted') deleted?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(limit !== undefined ? Number(limit) : 50, 100);
    const skip =
      (Math.max(page !== undefined ? Number(page) : 1, 1) - 1) * take;
    const where: Prisma.ProgramCommentWhereInput = {
      stage: CommentStage.PUBLIC_FEEDBACK,
      parentCommentId: null,
      deletedAt: deleted === 'true' ? { not: null } : null,
    };
    // A HEAD sees feedback on their own offices only, as on /lgu/feedback.
    // Feedback sits on a program or on a budget-document item, never both.
    if (user.role !== Role.SUPER_ADMIN) {
      const scoped = await this.officeScope.officeScopeWhere(user);
      if (scoped.officeId) {
        where.OR = [{ program: scoped }, { budgetItem: scoped }];
      }
    }
    // Only constrain on review state when the caller asks for it; an absent
    // `reviewed` means "all" (reviewed + unreviewed), matching listRegistryFeedback.
    if (reviewed === 'true') where.resolvedAt = { not: null };
    else if (reviewed === 'false') where.resolvedAt = null;
    const [items, total] = await Promise.all([
      this.prisma.programComment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          program: { select: { id: true, name: true } },
          budgetItem: ITEM_FEEDBACK_SELECT,
        },
      }),
      this.prisma.programComment.count({ where }),
    ]);

    // ProgramComment has no Prisma relation to resolvedBy user — batch-fetch separately.
    const resolverIds = [
      ...new Set(
        items.map((i) => i.resolvedByUserId).filter(Boolean) as string[],
      ),
    ];
    const resolvers =
      resolverIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: resolverIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
    const resolverMap = Object.fromEntries(resolvers.map((u) => [u.id, u]));

    return {
      items: items.map((i) => ({
        ...withFeedbackTarget(i),
        resolvedBy: i.resolvedByUserId
          ? (resolverMap[i.resolvedByUserId] ?? null)
          : null,
      })),
      total,
      page: page !== undefined ? Number(page) : 1,
      limit: take,
    };
  }

  @Patch('program-feedback/:id/review')
  @RequirePermission('public_comments:moderate')
  @Roles(Role.HEAD, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mark a program feedback comment as reviewed' })
  @ApiBody({ schema: { properties: { internalNote: { type: 'string' } } } })
  async reviewProgramFeedback(
    @Param('id') id: string,
    @Body() body: { internalNote?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    const comment = await this.prisma.programComment.findUnique({
      where: { id },
      select: {
        id: true,
        stage: true,
        parentCommentId: true,
        deletedAt: true,
        program: { select: { officeId: true } },
        budgetItem: { select: { officeId: true } },
      },
    });
    if (!comment || comment.deletedAt)
      throw new NotFoundException(`Comment ${id} not found`);
    if (user.role !== Role.SUPER_ADMIN) {
      await this.officeScope.assertOfficeInScope(
        user,
        comment.program?.officeId ?? comment.budgetItem?.officeId ?? null,
      );
    }
    if (comment.stage !== CommentStage.PUBLIC_FEEDBACK) {
      throw new BadRequestException('Comment is not a public feedback entry');
    }
    if (comment.parentCommentId !== null) {
      throw new BadRequestException(
        'Only root feedback threads can be reviewed',
      );
    }
    const updated = await this.prisma.programComment.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
        resolvedByUserId: user.sub,
        resolveNote: body.internalNote ?? null,
      },
      include: { program: { select: { id: true, name: true } } },
    });
    const resolvedBy = updated.resolvedByUserId
      ? await this.prisma.user.findUnique({
          where: { id: updated.resolvedByUserId },
          select: { id: true, firstName: true, lastName: true },
        })
      : null;
    return { ...updated, resolvedBy };
  }

  // ─── Feedback counts ─────────────────────────────────────────────────────────

  @Get('feedback-count')
  @RequirePermission('public_comments:view')
  @Roles(Role.HEAD, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Unreviewed feedback counts for nav badge' })
  async getFeedbackCount() {
    const [general, program] = await Promise.all([
      this.prisma.publicRegistryFeedback.count({
        where: { reviewedAt: null, deletedAt: null },
      }),
      this.prisma.programComment.count({
        where: {
          stage: CommentStage.PUBLIC_FEEDBACK,
          parentCommentId: null,
          resolvedAt: null,
          deletedAt: null,
        },
      }),
    ]);
    return { general, program, total: general + program };
  }

  // ─── Rollup repair ───────────────────────────────────────────────────────────

  @Post('recompute-rollups/:programId')
  @RequirePermission('aip:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Force-rebuild the denormalized line-item rollups AND the Phase 1 cost-estimate rollups for a program. Drift-repair only.',
  })
  @ApiOkResponse({ description: 'Recomputed program totals.' })
  async recomputeRollups(@Param('programId') programId: string) {
    const program = await this.prisma.program.findFirst({
      where: { id: programId, deletedAt: null },
      select: { id: true },
    });
    if (!program) {
      throw new NotFoundException(`Program ${programId} not found`);
    }
    // Both families, so a drift repair does not leave the estimate rollups
    // stale while fixing the line-item ones (§4.3).
    await this.estimates.forceRecomputeProgram(programId);
    return this.rollup.forceRecomputeProgram(programId);
  }
}
