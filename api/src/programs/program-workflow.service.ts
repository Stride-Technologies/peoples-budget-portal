import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramsService } from './programs.service.js';
import { CommentStage } from '../generated/prisma/index';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import {
  loadCommentActors,
  OMIT_SUBMITTER,
} from '../comments/comment-author.util.js';

/**
 * Read-only surface of the archived approval workflow.
 *
 * The write side — submit, head-review, endorse, LFC decisions, batch
 * submit-for-approval — is preserved on `archive/full-approval-workflow` as
 * reference; it will be replaced by a redesigned review flow, not restored
 * (PLAN.md). The read siblings stay live here and return whatever rows exist,
 * which is what the client already expects.
 *
 * See docs/design/phase-1-publish-scope.md §3.5.
 */
@Injectable()
export class ProgramWorkflowService {
  private readonly logger = new Logger(ProgramWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly programs: ProgramsService,
  ) {}

  /**
   * Count unresolved internal comment threads (root comments with no
   * `resolvedAt`) on a program. Public feedback is civic input and never blocks
   * workflow gates.
   */
  private async countUnresolvedInternalThreads(
    programId: string,
  ): Promise<number> {
    return this.prisma.programComment.count({
      where: {
        programId,
        parentCommentId: null,
        resolvedAt: null,
        deletedAt: null,
        stage: { not: CommentStage.PUBLIC_FEEDBACK },
      },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async loadProgram(id: string) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program || program.deletedAt) {
      throw new NotFoundException('Program not found');
    }
    return program;
  }

  private async loadProgramWithCycle(id: string) {
    const program = await this.prisma.program.findUnique({
      where: { id },
      include: { aipCycle: true },
    });
    if (!program || program.deletedAt) {
      throw new NotFoundException('Program not found');
    }
    return program;
  }

  // ─── DRAFT → SUBMITTED ────────────────────────────────────────────────────
  // ─── SUBMITTED → HEAD_REVIEWED ────────────────────────────────────────────
  // ─── Endorsement (advisory, affirmative-only, non-gating) ─────────────────
  // ─── Ceiling check ────────────────────────────────────────────────────────
  // ─── LFC committee approval ───────────────────────────────────────────────
  // ─── HEAD_REVIEWED → PENDING_APPROVAL (batch) ────────────────────────────
  // ─── LFC sequential decision ──────────────────────────────────────────────

  /**
   * Topologically order project/activities so a parent always precedes its
   * children — required when issuing final codes, since a nested activity's
   * code is derived from its parent's already-issued code.
   */
  private orderParentsFirst<
    T extends { id: string; parentProjectActivityId: string | null },
  >(pas: T[]): T[] {
    const ordered: T[] = [];
    const issued = new Set<string>();
    let remaining = [...pas];
    while (remaining.length > 0) {
      const ready = remaining.filter(
        (pa) =>
          !pa.parentProjectActivityId || issued.has(pa.parentProjectActivityId),
      );
      // Safety: if a cycle or orphaned parent leaves nothing ready, append the
      // rest as-is rather than looping forever.
      const batch = ready.length > 0 ? ready : remaining;
      for (const pa of batch) {
        ordered.push(pa);
        issued.add(pa.id);
      }
      remaining = remaining.filter((pa) => !issued.has(pa.id));
    }
    return ordered;
  }
  /**
   * List the LFC approval status of a program for its current version.
   * Mirrors `ProgramsService.listEndorsements`.
   */
  async listApprovals(programId: string, user: JwtPayload) {
    await this.programs.assertCanRead(programId, user);
    const full = await this.prisma.program.findUnique({
      where: { id: programId },
      select: { currentVersion: true },
    });
    if (!full || full.currentVersion === 0) {
      return { version: 0, approvals: [] };
    }
    const versionRow = await this.prisma.programVersion.findUnique({
      where: {
        programId_version: { programId, version: full.currentVersion },
      },
      select: { id: true },
    });
    if (!versionRow) return { version: full.currentVersion, approvals: [] };

    const approvals = await this.prisma.programApproval.findMany({
      where: { programVersionId: versionRow.id },
      include: {
        office: { select: { id: true, name: true, acronym: true } },
        committee: { select: { id: true, code: true, name: true } },
      },
      orderBy: { office: { acronym: 'asc' } },
    });
    return { version: full.currentVersion, approvals };
  }

  // ─── Activity stream (comments ∪ endorsements ∪ verdicts ∪ approvals) ────

  async activityStream(programId: string) {
    // Comments are threaded: only root comments become stream events; replies
    // are nested in the payload. Each comment carries its author + resolver
    // display identity (name / office / position).
    const [roots, endorsements, verdicts, approvals] =
      await this.prisma.$transaction([
        this.prisma.programComment.findMany({
          where: { programId, parentCommentId: null, deletedAt: null },
          omit: OMIT_SUBMITTER,
          include: {
            replies: {
              where: { deletedAt: null },
              omit: OMIT_SUBMITTER,
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.programEndorsement.findMany({
          where: { programId },
          include: {
            endorserOffice: {
              select: { id: true, acronym: true, name: true },
            },
            endorserCso: { select: { id: true, name: true, code: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.programVerdict.findMany({
          where: { programId },
          orderBy: { decidedAt: 'asc' },
        }),
        this.prisma.programApproval.findMany({
          where: { programId },
          include: {
            office: { select: { id: true, acronym: true, name: true } },
            committee: { select: { id: true, code: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    const actors = await loadCommentActors(
      this.prisma,
      roots.flatMap((r) => [
        r.authorUserId,
        r.resolvedByUserId,
        ...r.replies.map((rep) => rep.authorUserId),
      ]),
    );
    const withActor = <T extends { authorUserId: string | null }>(c: T) => ({
      ...c,
      author: c.authorUserId ? (actors.get(c.authorUserId) ?? null) : null,
    });

    type Event = {
      kind: 'comment' | 'endorsement' | 'verdict' | 'approval';
      at: Date;
      payload: unknown;
    };
    const events: Event[] = [
      ...roots.map((c) => ({
        kind: 'comment' as const,
        at: c.createdAt,
        payload: {
          ...withActor(c),
          resolvedBy: c.resolvedByUserId
            ? (actors.get(c.resolvedByUserId) ?? null)
            : null,
          replies: c.replies.map(withActor),
        },
      })),
      ...endorsements.map((e) => ({
        kind: 'endorsement' as const,
        at: e.endorsedAt ?? e.createdAt,
        payload: e,
      })),
      ...verdicts.map((v) => ({
        kind: 'verdict' as const,
        at: v.decidedAt,
        payload: v,
      })),
      ...approvals.map((a) => ({
        kind: 'approval' as const,
        at: a.decidedAt ?? a.createdAt,
        payload: a,
      })),
    ];
    events.sort((a, b) => a.at.getTime() - b.at.getTime());
    return events;
  }
}
