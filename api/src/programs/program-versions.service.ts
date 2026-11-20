import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/index';

type Tx = Prisma.TransactionClient;

/**
 * Owns JSON-snapshot versioning of Programs. A new ProgramVersion is written on
 * every publish (Phase 1) and, in the archived approval workflow, on every
 * DRAFT → SUBMITTED transition. The snapshot contains the full tree — program
 * header, PAs, line items, climate tag — at that moment.
 */
@Injectable()
export class ProgramVersionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the JSON snapshot from current DB state and persist a new version.
   *
   * Renamed from `snapshotOnSubmit`: it was already status-agnostic and
   * transaction-aware, and Phase 1 calls it from publish rather than submit.
   */
  async snapshot(programId: string, submittedByUserId: string, tx: Tx) {
    const program = await tx.program.findUnique({
      where: { id: programId },
      include: {
        finishLine: true,
        papSector: true,
        sglgIndicator: true,
        office: { include: { cluster: true } },
        climateChangeTag: {
          include: { codes: { include: { ccetCode: true } } },
        },
        fundAllocations: { orderBy: { orderIndex: 'asc' } },
        projectActivities: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lineItems: { orderBy: { orderIndex: 'asc' } },
            climateChangeTag: {
              include: { codes: { include: { ccetCode: true } } },
            },
            fundAllocations: { orderBy: { orderIndex: 'asc' } },
          },
        },
      },
    });
    if (!program) throw new NotFoundException('Program not found');

    const nextVersion = (program.currentVersion ?? 0) + 1;
    const snapshot = program as unknown as Prisma.InputJsonValue;

    const created = await tx.programVersion.create({
      data: {
        programId,
        version: nextVersion,
        snapshot,
        submittedByUserId,
      },
    });

    await tx.program.update({
      where: { id: programId },
      data: { currentVersion: nextVersion },
    });

    return created;
  }

  async listVersions(programId: string) {
    return this.prisma.programVersion.findMany({
      where: { programId },
      orderBy: { version: 'asc' },
      select: {
        id: true,
        version: true,
        submittedAt: true,
        submittedByUserId: true,
      },
    });
  }

  /**
   * Side-by-side compare. `from` and `to` are version numbers; `to=current` returns
   * the live tree (not from snapshot).
   */
  async compare(
    programId: string,
    fromVersion: number,
    to: number | 'current',
  ) {
    const fromRow = await this.prisma.programVersion.findUnique({
      where: { programId_version: { programId, version: fromVersion } },
    });
    if (!fromRow) {
      throw new NotFoundException(`Version ${fromVersion} not found`);
    }

    let toPayload: unknown;
    if (to === 'current') {
      const live = await this.prisma.program.findUnique({
        where: { id: programId },
        include: {
          finishLine: true,
          papSector: true,
          climateChangeTag: {
            include: { codes: { include: { ccetCode: true } } },
          },
          fundAllocations: { orderBy: { orderIndex: 'asc' } },
          projectActivities: {
            orderBy: { orderIndex: 'asc' },
            include: {
              lineItems: { orderBy: { orderIndex: 'asc' } },
              climateChangeTag: {
                include: { codes: { include: { ccetCode: true } } },
              },
              fundAllocations: { orderBy: { orderIndex: 'asc' } },
            },
          },
        },
      });
      if (!live) throw new NotFoundException('Program not found');
      toPayload = live;
    } else {
      const row = await this.prisma.programVersion.findUnique({
        where: { programId_version: { programId, version: to } },
      });
      if (!row) throw new NotFoundException(`Version ${to} not found`);
      toPayload = row.snapshot;
    }

    if (fromVersion === 1 && to === 'current') {
      // Frontend-friendly hint
    }
    if (to !== 'current' && Number(to) <= fromVersion) {
      throw new BadRequestException('`to` must be greater than `from`');
    }

    return {
      programId,
      from: { version: fromVersion, snapshot: fromRow.snapshot },
      to:
        to === 'current'
          ? { version: 'current', live: toPayload }
          : { version: to, snapshot: toPayload },
    };
  }
}
