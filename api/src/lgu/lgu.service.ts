import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CommentStage, Prisma } from '../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type {
  LguAnalyticsQueryDto,
  LguFeedbackQueryDto,
} from './dto/lgu-feedback-query.dto.js';
import {
  ITEM_FEEDBACK_SELECT,
  officeFeedbackWhere,
  withFeedbackTarget,
} from '../comments/item-feedback.js';

type TopProgramRow = {
  id: string;
  name: string;
  aip_reference_code: string | null;
  count: number;
};
type ByMonthRow = { month: string; count: number };
type ByStatusRow = { status: string; count: number };

@Injectable()
export class LguService {
  constructor(private readonly prisma: PrismaService) {}

  async listFeedback(user: JwtPayload, dto: LguFeedbackQueryDto) {
    this.assertLguAccess(user);

    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, Math.max(1, dto.limit ?? 25));
    const filter = dto.filter ?? 'all';

    const resolvedFilter: Prisma.ProgramCommentWhereInput['resolvedAt'] =
      filter === 'pending'
        ? null
        : filter === 'reviewed'
          ? { not: null }
          : undefined;

    const where: Prisma.ProgramCommentWhereInput = {
      stage: CommentStage.PUBLIC_FEEDBACK,
      parentCommentId: null,
      deletedAt: null,
      ...(resolvedFilter !== undefined ? { resolvedAt: resolvedFilter } : {}),
      ...officeFeedbackWhere(user.officeId!, dto.cycleId),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.programComment.count({ where }),
      this.prisma.programComment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        select: {
          id: true,
          content: true,
          targetType: true,
          targetId: true,
          createdAt: true,
          resolvedAt: true,
          resolvedByUserId: true,
          resolveNote: true,
          officialReply: true,
          officialRepliedAt: true,
          officialReplyEditedAt: true,
          program: {
            select: {
              id: true,
              name: true,
              status: true,
              aipReferenceCode: true,
              tentativeAipReferenceCode: true,
            },
          },
          budgetItem: ITEM_FEEDBACK_SELECT,
        },
      }),
    ]);

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
      page,
      limit,
    };
  }

  async reviewFeedback(user: JwtPayload, id: string, note?: string) {
    this.assertLguAccess(user);

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
      throw new NotFoundException(`Feedback ${id} not found`);
    if (comment.stage !== CommentStage.PUBLIC_FEEDBACK)
      throw new BadRequestException('Not a public feedback entry');
    if (comment.parentCommentId !== null)
      throw new BadRequestException(
        'Only root feedback threads can be reviewed',
      );
    // A comment is on an AIP program or a document PPA (specs/012); either
    // way it belongs to that row's office.
    if ((comment.program ?? comment.budgetItem)?.officeId !== user.officeId)
      throw new ForbiddenException('Feedback does not belong to your office');

    const updated = await this.prisma.programComment.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
        resolvedByUserId: user.sub,
        resolveNote: note ?? null,
      },
      select: {
        id: true,
        resolvedAt: true,
        resolvedByUserId: true,
        resolveNote: true,
      },
    });

    const resolvedBy = updated.resolvedByUserId
      ? await this.prisma.user.findUnique({
          where: { id: updated.resolvedByUserId },
          select: { id: true, firstName: true, lastName: true },
        })
      : null;

    return { ...updated, resolvedBy };
  }

  async unreviewFeedback(user: JwtPayload, id: string) {
    this.assertLguAccess(user);

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
      throw new NotFoundException(`Feedback ${id} not found`);
    if (comment.stage !== CommentStage.PUBLIC_FEEDBACK)
      throw new BadRequestException('Not a public feedback entry');
    // A comment is on an AIP program or a document PPA (specs/012); either
    // way it belongs to that row's office.
    if ((comment.program ?? comment.budgetItem)?.officeId !== user.officeId)
      throw new ForbiddenException('Feedback does not belong to your office');

    await this.prisma.programComment.update({
      where: { id },
      data: { resolvedAt: null, resolvedByUserId: null, resolveNote: null },
    });

    return { id, resolvedAt: null, resolvedBy: null, resolveNote: null };
  }

  async getAnalytics(user: JwtPayload, dto: LguAnalyticsQueryDto) {
    this.assertLguAccess(user);

    const officeId = user.officeId!;
    const { cycleId } = dto;

    const baseWhere: Prisma.ProgramCommentWhereInput = {
      stage: CommentStage.PUBLIC_FEEDBACK,
      parentCommentId: null,
      deletedAt: null,
      ...officeFeedbackWhere(officeId, cycleId),
    };

    const [totalCount, unreviewedCount] = await Promise.all([
      this.prisma.programComment.count({ where: baseWhere }),
      this.prisma.programComment.count({
        where: { ...baseWhere, resolvedAt: null },
      }),
    ]);

    // Feedback on the office's programs and on its PPAs of a budget document
    // (specs/012), one row per comment, with the program or root PPA it is on.
    const programCycle = cycleId
      ? Prisma.sql`AND p.aip_cycle_id = ${cycleId}`
      : Prisma.sql``;
    const itemCycle = cycleId
      ? Prisma.sql`AND d.budget_cycle_id = (SELECT budget_cycle_id FROM aip_cycles WHERE id = ${cycleId})`
      : Prisma.sql``;
    const feedback = Prisma.sql`
      WITH fb AS (
        SELECT pc.id, pc.created_at, p.id AS target_id, p.name,
               p.aip_reference_code, p.status::text AS status
        FROM program_comments pc
        JOIN programs p ON pc.program_id = p.id
        WHERE pc.stage = 'PUBLIC_FEEDBACK'
          AND pc.parent_comment_id IS NULL
          AND pc.deleted_at IS NULL
          AND p.office_id = ${officeId}
          AND p.deleted_at IS NULL
          ${programCycle}
        UNION ALL
        SELECT pc.id, pc.created_at, r.id, r.name, r.aip_reference_code,
               'ENACTED'
        FROM program_comments pc
        JOIN budget_items i ON pc.budget_item_id = i.id
        JOIN budget_items r ON r.id = i.root_item_id
        JOIN budget_documents d ON d.id = i.document_id
        WHERE pc.stage = 'PUBLIC_FEEDBACK'
          AND pc.parent_comment_id IS NULL
          AND pc.deleted_at IS NULL
          AND i.office_id = ${officeId}
          ${itemCycle}
      )`;

    const [topPrograms, byMonth, byStatus] = await Promise.all([
      this.prisma.$queryRaw<TopProgramRow[]>`
        ${feedback}
        SELECT target_id AS id, name, aip_reference_code, COUNT(id)::int AS count
        FROM fb
        GROUP BY target_id, name, aip_reference_code
        ORDER BY COUNT(id) DESC
        LIMIT 10
      `,
      this.prisma.$queryRaw<ByMonthRow[]>`
        ${feedback}
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
               COUNT(id)::int AS count
        FROM fb
        GROUP BY date_trunc('month', created_at)
        ORDER BY date_trunc('month', created_at) ASC
      `,
      this.prisma.$queryRaw<ByStatusRow[]>`
        ${feedback}
        SELECT status, COUNT(id)::int AS count
        FROM fb
        GROUP BY status
        ORDER BY COUNT(id) DESC
      `,
    ]);

    return {
      totalCount,
      unreviewedCount,
      topPrograms: topPrograms.map((r) => ({
        id: r.id,
        name: r.name,
        aipReferenceCode: r.aip_reference_code,
        count: r.count,
      })),
      byMonth,
      byStatus,
    };
  }

  async setReply(user: JwtPayload, id: string, content: string) {
    this.assertLguAccess(user);

    const comment = await this.prisma.programComment.findUnique({
      where: { id },
      select: {
        id: true,
        stage: true,
        parentCommentId: true,
        deletedAt: true,
        officialRepliedAt: true,
        program: { select: { officeId: true } },
        budgetItem: { select: { officeId: true } },
      },
    });
    if (!comment || comment.deletedAt)
      throw new NotFoundException(`Feedback ${id} not found`);
    if (comment.stage !== CommentStage.PUBLIC_FEEDBACK)
      throw new BadRequestException('Not a public feedback entry');
    if (comment.parentCommentId !== null)
      throw new BadRequestException(
        'Only root feedback threads can have a reply',
      );
    // A comment is on an AIP program or a document PPA (specs/012); either
    // way it belongs to that row's office.
    if ((comment.program ?? comment.budgetItem)?.officeId !== user.officeId)
      throw new ForbiddenException('Feedback does not belong to your office');

    const isEdit = comment.officialRepliedAt !== null;
    const updated = await this.prisma.programComment.update({
      where: { id },
      data: {
        officialReply: content,
        officialRepliedAt: isEdit ? undefined : new Date(),
        officialRepliedByUserId: isEdit ? undefined : user.sub,
        officialReplyEditedAt: isEdit ? new Date() : undefined,
      },
      select: {
        id: true,
        officialReply: true,
        officialRepliedAt: true,
        officialReplyEditedAt: true,
      },
    });

    return updated;
  }

  async deleteReply(user: JwtPayload, id: string) {
    this.assertLguAccess(user);

    const comment = await this.prisma.programComment.findUnique({
      where: { id },
      select: {
        id: true,
        stage: true,
        parentCommentId: true,
        deletedAt: true,
        officialReply: true,
        program: { select: { officeId: true } },
        budgetItem: { select: { officeId: true } },
      },
    });
    if (!comment || comment.deletedAt)
      throw new NotFoundException(`Feedback ${id} not found`);
    if (comment.stage !== CommentStage.PUBLIC_FEEDBACK)
      throw new BadRequestException('Not a public feedback entry');
    if (comment.parentCommentId !== null)
      throw new BadRequestException(
        'Only root feedback threads can have a reply',
      );
    // A comment is on an AIP program or a document PPA (specs/012); either
    // way it belongs to that row's office.
    if ((comment.program ?? comment.budgetItem)?.officeId !== user.officeId)
      throw new ForbiddenException('Feedback does not belong to your office');
    if (!comment.officialReply)
      throw new BadRequestException('No reply to delete');

    await this.prisma.programComment.update({
      where: { id },
      data: {
        officialReply: null,
        officialRepliedAt: null,
        officialRepliedByUserId: null,
        officialReplyEditedAt: null,
      },
    });

    return {
      id,
      officialReply: null,
      officialRepliedAt: null,
      officialReplyEditedAt: null,
    };
  }

  private assertLguAccess(user: JwtPayload): void {
    if (!user.officeId) {
      throw new ForbiddenException(
        'LGU office access required — user has no assigned city office',
      );
    }
  }
}
