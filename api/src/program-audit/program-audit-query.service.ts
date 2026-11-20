import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OfficeScopeService } from '../permissions/office-scope.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import {
  AuditTargetType,
  Prisma,
  ProgramAuditAction,
} from '../generated/prisma/index';

interface HistoryFilters {
  action?: string;
  actorUserId?: string;
  targetId?: string;
  since?: string;
  cursor?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Read side of the edit history.
 *
 * Readable by anyone holding `aip:audit`, **bounded by office scope** (D22): an
 * office head reviewing a figure CPDO entered on their behalf is precisely who
 * needs the trail, and scope already contains the blast radius.
 *
 * Actor names are resolved here rather than stored on the row, but the row's
 * `summary` is written at log time so a deleted user or PPA never breaks
 * rendering.
 */
@Injectable()
export class ProgramAuditQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly officeScope: OfficeScopeService,
  ) {}

  async forProgram(
    programId: string,
    filters: HistoryFilters,
    user: JwtPayload,
  ) {
    await this.assertInScope(programId, user);

    const where: Prisma.ProgramAuditLogWhereInput = {
      programId,
      ...(filters.action
        ? { action: filters.action as ProgramAuditAction }
        : {}),
      ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
      ...(filters.targetId ? { targetId: filters.targetId } : {}),
      ...(filters.since ? { createdAt: { gte: new Date(filters.since) } } : {}),
    };

    return this.page(where, filters);
  }

  /**
   * The cross-program stream (publish-scope §3.6) — every program the caller
   * can audit, newest first. Bounded by office scope like the per-program view,
   * so an all-offices user sees the whole city and an office head their own.
   */
  async forAll(
    filters: HistoryFilters & { officeId?: string; programId?: string },
    user: JwtPayload,
  ) {
    const scope = await this.officeScope.officeScopeWhere(user);
    // Asking for an office outside the caller's scope matches nothing; it
    // never widens the scope.
    const officeId: string | { in: string[] } | undefined = filters.officeId
      ? scope.officeId && !scope.officeId.in.includes(filters.officeId)
        ? { in: [] }
        : filters.officeId
      : scope.officeId;
    const where: Prisma.ProgramAuditLogWhereInput = {
      ...(officeId ? { program: { officeId } } : {}),
      ...(filters.programId ? { programId: filters.programId } : {}),
      ...(filters.action
        ? { action: filters.action as ProgramAuditAction }
        : {}),
      ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
      ...(filters.since ? { createdAt: { gte: new Date(filters.since) } } : {}),
    };
    return this.page(where, filters);
  }

  async forProjectActivity(
    paId: string,
    filters: HistoryFilters,
    user: JwtPayload,
  ) {
    const pa = await this.prisma.projectActivity.findUnique({
      where: { id: paId },
      select: { programId: true },
    });
    if (!pa) throw new NotFoundException('Project/Activity not found');
    await this.assertInScope(pa.programId, user);

    return this.page(
      {
        programId: pa.programId,
        targetType: AuditTargetType.PROJECT_ACTIVITY,
        targetId: paId,
      },
      filters,
    );
  }

  /**
   * Count of actions since the revision was opened — the registry list's
   * "N unpublished changes" badge (D15). Counting rows rather than diffing keeps
   * the list query cheap; it reports *actions taken*, which on a work queue is
   * the more useful number anyway.
   */
  async changesSinceRevisionOpened(programId: string): Promise<number> {
    const opened = await this.prisma.programAuditLog.findFirst({
      where: { programId, action: ProgramAuditAction.REVISION_OPENED },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!opened) return 0;

    return this.prisma.programAuditLog.count({
      where: { programId, createdAt: { gt: opened.createdAt } },
    });
  }

  private async page(
    where: Prisma.ProgramAuditLogWhereInput,
    filters: HistoryFilters,
  ) {
    const take = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const rows = await this.prisma.programAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      include: {
        actor: { select: { id: true, firstName: true, lastName: true } },
        onBehalfOfOffice: { select: { id: true, acronym: true, name: true } },
        programVersion: { select: { id: true, version: true } },
        program: {
          select: {
            id: true,
            name: true,
            tentativeAipReferenceCode: true,
            office: { select: { id: true, acronym: true } },
          },
        },
      },
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;

    return {
      items: items.map((row) => ({
        id: row.id,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        summary: row.summary,
        changes: row.changes,
        createdAt: row.createdAt,
        actor: {
          id: row.actor.id,
          name: `${row.actor.firstName} ${row.actor.lastName}`,
          role: row.actorRole,
        },
        onBehalfOf: row.onBehalfOfOffice,
        version: row.programVersion?.version ?? null,
        program: {
          id: row.program.id,
          name: row.program.name,
          code: row.program.tentativeAipReferenceCode,
          office: row.program.office,
        },
      })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  private async assertInScope(programId: string, user: JwtPayload) {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
      select: { officeId: true },
    });
    if (!program) throw new NotFoundException('Program not found');
    await this.officeScope.assertOfficeInScope(user, program.officeId);
  }
}
