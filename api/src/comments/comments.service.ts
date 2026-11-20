import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramsService } from '../programs/programs.service.js';
import {
  AuditTargetType,
  BudgetDocumentAuditAction,
  CommentStage,
  CommentTarget,
  Prisma,
  ProgramAuditAction,
  ProgramStatus,
  Role,
} from '../generated/prisma/index';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { CreateCommentDto } from './dto/create-comment.dto.js';
import { EventsService } from '../events/events.service.js';
import { loadCommentActors, OMIT_SUBMITTER } from './comment-author.util.js';
import { ProgramAuditLogService } from '../program-audit/program-audit-log.service.js';
import { userHasPermission } from '../permissions/user-has-permission.js';
import type { FieldDiff } from '../program-audit/audit-fields.js';

/**
 * What a comment hangs off: an AIP program, or a PPA in an LEP or Ordinance
 * (specs/012 D3; a DB CHECK keeps exactly one set).
 */
export type CommentSubject = { programId: string } | { budgetItemId: string };

export const subjectOf = (c: {
  programId: string | null;
  budgetItemId: string | null;
}): CommentSubject =>
  c.programId ? { programId: c.programId } : { budgetItemId: c.budgetItemId! };

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly programs: ProgramsService,
    private readonly events: EventsService,
    private readonly audit: ProgramAuditLogService,
  ) {}

  /**
   * Who may post a staff comment: anyone who can read the program and holds
   * `comments:write` (#102). Commenting is review, not editing, so it follows
   * read access rather than the office scope that gates writes — an NCPC
   * representative reads their cluster's programs with no office of their own,
   * and an office-scope check made `comments:write` unusable for them. The guard
   * already checks the verb on POST; `canComment` has no guard for it, so it is
   * checked here for both.
   *
   * Every staff comment is `GENERAL`. HEAD_REVIEW / ENDORSEMENT / APPROVAL
   * belonged to the archived approval workflow and survive only on old rows;
   * PUBLIC_FEEDBACK comes from the public feedback path, never from here.
   */
  private async assertCanWrite(programId: string, user: JwtPayload) {
    await this.programs.assertCanRead(programId, user);
    if (!(await userHasPermission(this.prisma, user, 'comments:write'))) {
      throw new ForbiddenException('Insufficient permission');
    }
    // Archived programs are read-only, their comment thread included (specs/013).
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
      select: { status: true },
    });
    if (program?.status === ProgramStatus.ARCHIVED) {
      throw new ConflictException('Archived programs are read-only.');
    }
  }

  /**
   * The one read check for a comment's subject. A program uses the program
   * rule; a document PPA uses the same rule on its office, or on its host
   * office for a component program (ProgramsService.canReadOffice). Every path
   * that touches an existing comment goes through here.
   */
  async assertCanReadTarget(subject: CommentSubject, user: JwtPayload) {
    if ('programId' in subject) {
      await this.programs.assertCanRead(subject.programId, user);
      return;
    }
    const item = await this.prisma.budgetItem.findUnique({
      where: { id: subject.budgetItemId },
      select: {
        office: { select: { id: true, clusterId: true } },
        hostOffice: { select: { id: true, clusterId: true } },
      },
    });
    if (!item) throw new NotFoundException('PPA not found');
    for (const office of [item.office, item.hostOffice]) {
      if (
        office &&
        (await this.programs.canReadOffice(office.id, office.clusterId, user))
      ) {
        return;
      }
    }
    throw new ForbiddenException('You do not have access to this PPA');
  }

  /** The office a comment's subject belongs to (for ownership and audit). */
  private async subjectOfficeId(
    subject: CommentSubject,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string | null> {
    if ('programId' in subject) {
      return this.proponentOfficeId(subject.programId, tx);
    }
    const item = await tx.budgetItem.findUnique({
      where: { id: subject.budgetItemId },
      select: { officeId: true },
    });
    return item?.officeId ?? null;
  }

  /**
   * Audit a change to an existing comment: the program audit trail for a
   * program comment, the document's history for a document-PPA comment.
   */
  private async recordCommentChange(
    tx: Prisma.TransactionClient,
    comment: {
      id: string;
      programId: string | null;
      budgetItemId: string | null;
      programVersionId?: string | null;
    },
    entry: {
      action: ProgramAuditAction;
      summary: string;
      user: JwtPayload;
      changes?: FieldDiff | null;
      targetId?: string;
    },
  ) {
    const subject = subjectOf(comment);
    if ('programId' in subject) {
      await this.audit.record(
        {
          programId: subject.programId,
          action: entry.action,
          actor: entry.user,
          onBehalfOfOfficeId: await this.proponentOfficeId(
            subject.programId,
            tx,
          ),
          targetType: AuditTargetType.COMMENT,
          targetId: entry.targetId ?? comment.id,
          summary: entry.summary,
          changes: entry.changes ?? null,
        },
        tx,
      );
      return;
    }
    const item = await tx.budgetItem.findUnique({
      where: { id: subject.budgetItemId },
      select: { documentId: true },
    });
    if (!item) return;
    await tx.budgetDocumentAuditLog.create({
      data: {
        documentId: item.documentId,
        itemId: subject.budgetItemId,
        action: BudgetDocumentAuditAction.COMMENT,
        actorUserId: entry.user.sub,
        detail: {
          event: entry.action,
          commentId: comment.id,
          summary: entry.summary,
          ...(entry.changes
            ? { changes: entry.changes as Prisma.InputJsonValue }
            : {}),
        },
      },
    });
  }

  /** Program comments nudge the registry over SSE; document PPAs have no feed yet. */
  private emitIfProgram(
    type: 'comment.resolved',
    subject: CommentSubject,
    user: JwtPayload,
  ) {
    if ('programId' in subject) {
      this.events.emitProgramEvent({
        type,
        programId: subject.programId,
        actorUserId: user.sub,
      });
    }
  }

  /**
   * Non-throwing check: can this user post a (root) comment on this program?
   * Same gate as `create`, so the UI hides the composer for read-only users
   * instead of letting them submit and hit a 403.
   */
  async canComment(programId: string, user: JwtPayload): Promise<boolean> {
    try {
      await this.assertCanWrite(programId, user);
      return true;
    } catch {
      return false;
    }
  }

  async create(programId: string, dto: CreateCommentDto, user: JwtPayload) {
    await this.assertCanWrite(programId, user);

    if (
      dto.targetType &&
      dto.targetType !== CommentTarget.PROGRAM &&
      !dto.targetId
    ) {
      throw new BadRequestException(
        'targetId required when targetType is not PROGRAM',
      );
    }
    if (dto.targetType === CommentTarget.LINE_ITEM) {
      throw new BadRequestException(
        'LINE_ITEM comment targets are not yet supported',
      );
    }
    if (dto.targetType === CommentTarget.PROJECT_ACTIVITY && dto.targetId) {
      const pa = await this.prisma.projectActivity.findFirst({
        where: { id: dto.targetId, programId },
        select: { id: true },
      });
      if (!pa) {
        throw new BadRequestException(
          'targetId does not reference a project activity on this program',
        );
      }
    }

    // Resolve programVersionId (default to current version row, if any).
    let programVersionId: string | null = dto.programVersionId ?? null;
    if (!dto.programVersionId) {
      const program = await this.prisma.program.findUnique({
        where: { id: programId },
        select: { currentVersion: true },
      });
      if (program && program.currentVersion > 0) {
        const ver = await this.prisma.programVersion.findUnique({
          where: {
            programId_version: { programId, version: program.currentVersion },
          },
          select: { id: true },
        });
        programVersionId = ver?.id ?? null;
      }
    }

    if (dto.parentCommentId) {
      const parent = await this.prisma.programComment.findUnique({
        where: { id: dto.parentCommentId },
      });
      if (!parent || parent.programId !== programId || parent.deletedAt) {
        throw new BadRequestException(
          'parentCommentId must reference a comment on the same program',
        );
      }
      if (parent.parentCommentId) {
        throw new BadRequestException(
          'Replies cannot be nested beyond one level',
        );
      }
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.programComment.create({
        data: {
          programId,
          programVersionId,
          authorUserId: user.sub,
          stage: CommentStage.GENERAL,
          targetType: dto.targetType ?? CommentTarget.PROGRAM,
          targetId: dto.targetId ?? null,
          parentCommentId: dto.parentCommentId ?? null,
          content: dto.content,
        },
      });

      await this.audit.record(
        {
          programId,
          action: created.parentCommentId
            ? ProgramAuditAction.COMMENT_REPLIED
            : ProgramAuditAction.COMMENT_POSTED,
          actor: user,
          onBehalfOfOfficeId: await this.proponentOfficeId(programId, tx),
          targetType: AuditTargetType.COMMENT,
          targetId: created.id,
          summary: created.parentCommentId
            ? 'Replied in a comment thread'
            : 'Posted a comment',
          programVersionId,
        },
        tx,
      );

      return created;
    });

    this.events.emitProgramEvent({
      type: 'comment.posted',
      programId,
      actorUserId: user.sub,
    });

    return comment;
  }

  /**
   * The office the actor is acting FOR. For comment activity that is the
   * program's proponent office, not the commenter's home office — the audit
   * trail is organised by whose AIP was touched.
   */
  private async proponentOfficeId(
    programId: string,
    tx: Prisma.TransactionClient | PrismaService,
  ): Promise<string | null> {
    const program = await tx.program.findUnique({
      where: { id: programId },
      select: { officeId: true },
    });
    return program?.officeId ?? null;
  }

  async list(
    programId: string,
    opts: { versionId?: string; stage?: CommentStage; targetId?: string },
    user: JwtPayload,
  ) {
    await this.programs.assertCanRead(programId, user);
    const comments = await this.prisma.programComment.findMany({
      where: {
        programId,
        deletedAt: null,
        ...(opts.versionId ? { programVersionId: opts.versionId } : {}),
        ...(opts.stage ? { stage: opts.stage } : {}),
        ...(opts.targetId ? { targetId: opts.targetId } : {}),
      },
      omit: OMIT_SUBMITTER,
      orderBy: { createdAt: 'asc' },
    });
    const actors = await loadCommentActors(
      this.prisma,
      comments.flatMap((c) => [c.authorUserId, c.resolvedByUserId]),
    );
    return comments.map((c) => ({
      ...c,
      author: c.authorUserId ? (actors.get(c.authorUserId) ?? null) : null,
      resolvedBy: c.resolvedByUserId
        ? (actors.get(c.resolvedByUserId) ?? null)
        : null,
    }));
  }

  /**
   * Resolve or unresolve a comment thread. Resolution is per-thread, so the
   * target must be a root comment.
   *
   * Allowed resolvers:
   * - SUPER_ADMIN: always.
   * - Internal comments: proponent office (STAFF/HEAD) or the original commenter.
   * - PUBLIC_FEEDBACK comments: any authenticated user who can read the program
   *   (the submitter is anonymous and can never return to close the thread).
   */
  /**
   * Resolve or reopen a thread.
   *
   * On resolve, an optional `reply` is posted as a real child comment (D10).
   * An encoder addressing a concern does two things at once — they change the
   * PPA and they answer the commenter — and those belong in one gesture, so the
   * commenter sees *what was done* rather than just that someone closed the
   * thread. The pre-existing `note` stays what it was: metadata on the root,
   * not part of the conversation.
   */
  async setResolved(
    id: string,
    resolved: boolean,
    note: string | undefined,
    user: JwtPayload,
    reply?: string,
  ) {
    const comment = await this.prisma.programComment.findUnique({
      where: { id },
    });
    if (!comment || comment.deletedAt)
      throw new NotFoundException('Comment not found');
    if (comment.parentCommentId) {
      throw new BadRequestException(
        'Only root comments (threads) can be resolved',
      );
    }

    const subject = subjectOf(comment);
    if (user.role !== Role.SUPER_ADMIN) {
      if (comment.stage === CommentStage.PUBLIC_FEEDBACK) {
        // Any reader may resolve public feedback (submitter is anonymous).
        await this.assertCanReadTarget(subject, user);
      } else {
        const officeId = await this.subjectOfficeId(subject);
        const isOwner = !!officeId && officeId === user.officeId;
        const isAuthor = comment.authorUserId === user.sub;
        if (!isOwner && !isAuthor) {
          throw new ForbiddenException(
            'Only the proponent office, the original commenter, or SUPER_ADMIN can resolve a thread',
          );
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.programComment.update({
        where: { id },
        omit: OMIT_SUBMITTER,
        data: {
          resolvedAt: resolved ? new Date() : null,
          resolvedByUserId: resolved ? user.sub : null,
          resolveNote: resolved ? (note ?? null) : null,
        },
      });

      // The reply is an ordinary comment: it renders in the thread like any
      // other, and is editable/deletable under the normal rules.
      if (resolved && reply) {
        await tx.programComment.create({
          data: {
            programId: comment.programId,
            budgetItemId: comment.budgetItemId,
            programVersionId: comment.programVersionId,
            authorUserId: user.sub,
            stage: comment.stage,
            targetType: comment.targetType,
            targetId: comment.targetId,
            parentCommentId: comment.id,
            content: reply,
          },
        });
        await this.recordCommentChange(tx, comment, {
          action: ProgramAuditAction.COMMENT_REPLIED,
          summary: 'Replied while resolving a thread',
          user,
        });
      }

      await this.recordCommentChange(tx, comment, {
        action: resolved
          ? ProgramAuditAction.COMMENT_RESOLVED
          : ProgramAuditAction.COMMENT_UNRESOLVED,
        summary: resolved
          ? 'Resolved a comment thread'
          : 'Reopened a comment thread',
        user,
        changes: reply ? { reply: { from: null, to: reply } } : null,
      });

      return row;
    });

    this.emitIfProgram('comment.resolved', subject, user);

    return updated;
  }

  /**
   * Soft delete a comment. The row is kept (deletedAt is stamped) so an admin
   * can restore it. Deletion cascades to the comment's direct replies — replies
   * are capped at one level (see create()), so a single updateMany covers the
   * whole subtree.
   */
  async remove(id: string, user: JwtPayload) {
    const comment = await this.prisma.programComment.findUnique({
      where: { id },
    });
    if (!comment || comment.deletedAt)
      throw new NotFoundException('Comment not found');
    if (user.role !== Role.SUPER_ADMIN && comment.authorUserId !== user.sub) {
      throw new ForbiddenException(
        'Only the author or SUPER_ADMIN can delete a comment',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.programComment.updateMany({
        where: { OR: [{ id }, { parentCommentId: id }], deletedAt: null },
        data: { deletedAt: new Date(), deletedByUserId: user.sub },
      });

      // The log row outlives the comment it describes — that is the point of an
      // append-only trail (§3.6 Retention).
      await this.recordCommentChange(tx, comment, {
        action: ProgramAuditAction.COMMENT_DELETED,
        summary: 'Deleted a comment',
        user,
      });
    });
    return { message: 'Comment deleted.' };
  }

  /**
   * Restore a soft-deleted comment and its reply subtree. SUPER_ADMIN only.
   */
  async restore(id: string, user: JwtPayload) {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN can restore a comment');
    }
    const comment = await this.prisma.programComment.findUnique({
      where: { id },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (!comment.deletedAt) return { message: 'Comment is not deleted.' };
    await this.prisma.$transaction(async (tx) => {
      await tx.programComment.updateMany({
        where: { OR: [{ id }, { parentCommentId: id }] },
        data: { deletedAt: null, deletedByUserId: null },
      });

      await this.recordCommentChange(tx, comment, {
        action: ProgramAuditAction.COMMENT_RESTORED,
        summary: 'Restored a deleted comment',
        user,
      });
    });
    return { message: 'Comment restored.' };
  }
}
