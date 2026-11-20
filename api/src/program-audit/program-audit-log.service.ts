import { Injectable } from '@nestjs/common';
import {
  AuditTargetType,
  Prisma,
  ProgramAuditAction,
} from '../generated/prisma/index';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { FieldDiff } from './audit-fields.js';

type Tx = Prisma.TransactionClient;

export interface AuditEntry {
  programId: string;
  action: ProgramAuditAction;
  actor: JwtPayload;
  /** The proponent office the actor acted FOR — not the actor's home office. */
  onBehalfOfOfficeId: string | null;
  summary: string;
  targetType?: AuditTargetType;
  targetId?: string | null;
  changes?: FieldDiff | null;
  programVersionId?: string | null;
}

/**
 * Writes the append-only edit history (D9).
 *
 * Transaction-aware in the same style as `BudgetRollupService`: it takes the
 * caller's `tx` and never opens its own, so a mutation and its log row commit
 * together or not at all. A failed edit must not leave a trail claiming it
 * happened.
 *
 * There is no update or delete method, for anyone, including SUPER_ADMIN — the
 * append-only property is enforced by the absence of the code paths, not by a
 * runtime check that a later refactor could soften.
 */
@Injectable()
export class ProgramAuditLogService {
  /**
   * Record one action. Returns the created row, or `null` when `changes` was
   * explicitly passed as `null` for a diff-bearing action — a no-op edit writes
   * nothing (D22), which is what keeps a PATCH that sets a field to its current
   * value out of the history.
   */
  async record(entry: AuditEntry, tx: Tx) {
    if (DIFF_BEARING.has(entry.action) && entry.changes === null) return null;

    return tx.programAuditLog.create({
      data: {
        programId: entry.programId,
        targetType: entry.targetType ?? AuditTargetType.PROGRAM,
        targetId: entry.targetId ?? null,
        action: entry.action,
        actorUserId: entry.actor.sub,
        actorRole: entry.actor.role,
        onBehalfOfOfficeId: entry.onBehalfOfOfficeId,
        summary: entry.summary,
        changes: (entry.changes ?? undefined) as Prisma.InputJsonValue,
        programVersionId: entry.programVersionId ?? null,
      },
    });
  }
}

/**
 * Actions whose whole purpose is to carry a field delta. For these, "no delta"
 * means "nothing happened" and the row is skipped. Actions outside this set
 * (PUBLISHED, REVISION_OPENED, COMMENT_POSTED…) are events worth recording even
 * with no field-level change.
 */
const DIFF_BEARING = new Set<ProgramAuditAction>([
  ProgramAuditAction.PROGRAM_UPDATED,
  ProgramAuditAction.PA_UPDATED,
  ProgramAuditAction.ESTIMATE_UPDATED,
]);
