import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ESTIMATE_AUDIT_FIELDS,
  PROGRAM_AUDIT_FIELDS,
  PROJECT_ACTIVITY_AUDIT_FIELDS,
  diffFields,
  type FieldDiff,
} from './audit-fields.js';
import { Prisma } from '../generated/prisma/index';

export interface PaDiff {
  paId: string;
  name: string;
  status: 'added' | 'removed' | 'changed';
  fields: FieldDiff | null;
}

export interface ProgramDiff {
  hasChanges: boolean;
  programChanges: FieldDiff | null;
  paChanges: PaDiff[];
  publishedTotal: string | null;
  draftTotal: string;
}

/**
 * Diffs the live working copy against the published snapshot (D15).
 *
 * One implementation, three consumers: the compare view, the changed-row
 * highlighting on the program page, and `discard-draft`'s log entry. It walks
 * the **same field allow-list the audit log uses**, so "what counts as a change"
 * has exactly one definition and the compare screen can never disagree with the
 * history.
 *
 * Deliberately **not** used by the registry list: that would be N programs × a
 * full tree per page render. The list's "N unpublished changes" badge counts
 * ProgramAuditLog rows since the last REVISION_OPENED instead, which the
 * existing [programId, createdAt] index already serves.
 */
@Injectable()
export class ProgramDiffService {
  constructor(private readonly prisma: PrismaService) {}

  async diffAgainstPublished(programId: string): Promise<ProgramDiff> {
    const program = await this.prisma.program.findFirst({
      where: { id: programId, deletedAt: null },
      include: {
        publishedVersion: { select: { snapshot: true } },
        projectActivities: { orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!program) throw new NotFoundException('Program not found');

    const draftTotal = program.proposedTotal.toFixed(2);

    if (!program.publishedVersion) {
      // Never published: everything is new, and there is nothing to compare to.
      return {
        hasChanges: program.projectActivities.length > 0,
        programChanges: null,
        paChanges: program.projectActivities.map((pa) => ({
          paId: pa.id,
          name: pa.name,
          status: 'added' as const,
          fields: null,
        })),
        publishedTotal: null,
        draftTotal,
      };
    }

    const snapshot = program.publishedVersion.snapshot as unknown as {
      projectActivities?: Record<string, unknown>[];
      proposedTotal?: string;
    } & Record<string, unknown>;

    const programChanges = diffFields(snapshot, program, PROGRAM_AUDIT_FIELDS);

    const publishedPAs = new Map(
      (snapshot.projectActivities ?? []).map((pa) => [pa.id as string, pa]),
    );
    const paChanges: PaDiff[] = [];

    for (const live of program.projectActivities) {
      const published = publishedPAs.get(live.id);
      if (!published) {
        paChanges.push({
          paId: live.id,
          name: live.name,
          status: 'added',
          fields: null,
        });
        continue;
      }
      publishedPAs.delete(live.id);

      const liveRecord = live as unknown as Record<string, unknown>;
      const fields = {
        ...(diffFields(published, liveRecord, PROJECT_ACTIVITY_AUDIT_FIELDS) ??
          {}),
        ...(diffFields(published, liveRecord, ESTIMATE_AUDIT_FIELDS) ?? {}),
      };
      if (Object.keys(fields).length > 0) {
        paChanges.push({
          paId: live.id,
          name: live.name,
          status: 'changed',
          fields,
        });
      }
    }

    // Anything left in the map was published but is gone from the working copy.
    for (const [paId, published] of publishedPAs) {
      paChanges.push({
        paId,
        name: (published.name as string) ?? '(removed)',
        status: 'removed',
        fields: null,
      });
    }

    return {
      hasChanges: programChanges !== null || paChanges.length > 0,
      programChanges,
      paChanges,
      publishedTotal: snapshot.proposedTotal
        ? new Prisma.Decimal(snapshot.proposedTotal).toFixed(2)
        : null,
      draftTotal,
    };
  }
}
