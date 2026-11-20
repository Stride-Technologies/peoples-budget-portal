import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramsService } from '../programs/programs.service.js';
import { AIPCodesService } from '../aip-codes/aip-codes.service.js';
import { BudgetRollupService } from '../budget-rollup/budget-rollup.service.js';
import {
  EstimateRollupService,
  replaceFundAllocations,
} from '../budget-rollup/estimate-rollup.service.js';
import {
  AuditTargetType,
  Prisma,
  CommentTarget,
  PPACostMode,
  ProgramAuditAction,
  ProgramStatus,
  type Program,
} from '../generated/prisma/index';
import {
  loadCommentActors,
  OMIT_SUBMITTER,
} from '../comments/comment-author.util.js';
import { isEditableStatus } from '../programs/program-status.constants.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { CreateProjectActivityDto } from './dto/create-project-activity.dto.js';
import type { UpdateProjectActivityDto } from './dto/update-project-activity.dto.js';
import type { ReorderProjectActivitiesDto } from './dto/reorder-project-activities.dto.js';
import { ProgramAuditLogService } from '../program-audit/program-audit-log.service.js';
import {
  ESTIMATE_AUDIT_FIELDS,
  PROJECT_ACTIVITY_AUDIT_FIELDS,
  diffFields,
  summarizeFieldChanges,
} from '../program-audit/audit-fields.js';

@Injectable()
export class ProjectActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly programs: ProgramsService,
    private readonly codes: AIPCodesService,
    private readonly rollup: BudgetRollupService,
    private readonly estimates: EstimateRollupService,
    private readonly audit: ProgramAuditLogService,
  ) {}

  private assertParentProgramDraft(program: Program) {
    if (program.status !== ProgramStatus.DRAFT) {
      throw new ForbiddenException(
        'Project/Activities can only be mutated while the parent program is in DRAFT',
      );
    }
  }

  private validateImplementationPeriod(period: {
    implementationStartMonth: number | null | undefined;
    implementationStartYear: number | null | undefined;
    implementationEndMonth: number | null | undefined;
    implementationEndYear: number | null | undefined;
  }) {
    const hasStartMonth = period.implementationStartMonth != null;
    const hasStartYear = period.implementationStartYear != null;
    const hasEndMonth = period.implementationEndMonth != null;
    const hasEndYear = period.implementationEndYear != null;

    if (hasStartMonth !== hasStartYear) {
      throw new BadRequestException(
        'implementationStartMonth and implementationStartYear must both be provided',
      );
    }
    if (hasEndMonth !== hasEndYear) {
      throw new BadRequestException(
        'implementationEndMonth and implementationEndYear must both be provided',
      );
    }
    if (!(hasStartMonth && hasStartYear && hasEndMonth && hasEndYear)) {
      return;
    }

    const startKey =
      Number(period.implementationStartYear) * 100 +
      Number(period.implementationStartMonth);
    const endKey =
      Number(period.implementationEndYear) * 100 +
      Number(period.implementationEndMonth);
    if (startKey > endKey) {
      throw new BadRequestException(
        'Implementation period start must be earlier than or equal to end',
      );
    }
  }

  private assertPeriodWithinProgram(
    program: Program,
    childPeriod: {
      implementationStartMonth: number | null | undefined;
      implementationStartYear: number | null | undefined;
      implementationEndMonth: number | null | undefined;
      implementationEndYear: number | null | undefined;
    },
  ) {
    const programHasAnyPeriod =
      program.implementationStartMonth != null ||
      program.implementationStartYear != null ||
      program.implementationEndMonth != null ||
      program.implementationEndYear != null;
    if (!programHasAnyPeriod) {
      return;
    }

    const programHasFullPeriod =
      program.implementationStartMonth != null &&
      program.implementationStartYear != null &&
      program.implementationEndMonth != null &&
      program.implementationEndYear != null;
    if (!programHasFullPeriod) {
      throw new BadRequestException(
        'Program implementation period must be complete before setting Project/Activity periods',
      );
    }

    const childHasFullPeriod =
      childPeriod.implementationStartMonth != null &&
      childPeriod.implementationStartYear != null &&
      childPeriod.implementationEndMonth != null &&
      childPeriod.implementationEndYear != null;
    if (!childHasFullPeriod) {
      throw new BadRequestException(
        'Project/Activity implementation period is required when parent Program has an implementation period',
      );
    }

    const programStart =
      Number(program.implementationStartYear) * 100 +
      Number(program.implementationStartMonth);
    const programEnd =
      Number(program.implementationEndYear) * 100 +
      Number(program.implementationEndMonth);
    const childStart =
      Number(childPeriod.implementationStartYear) * 100 +
      Number(childPeriod.implementationStartMonth);
    const childEnd =
      Number(childPeriod.implementationEndYear) * 100 +
      Number(childPeriod.implementationEndMonth);
    if (childStart < programStart || childEnd > programEnd) {
      throw new BadRequestException(
        'Project/Activity implementation period must be within the parent Program implementation period',
      );
    }
  }

  private async collectDescendantIds(
    rootId: string,
    tx: Prisma.TransactionClient,
  ) {
    const allIds = new Set<string>([rootId]);
    let frontier: string[] = [rootId];
    while (frontier.length > 0) {
      const children: Array<{ id: string }> = await tx.projectActivity.findMany(
        {
          where: { parentProjectActivityId: { in: frontier } },
          select: { id: true },
        },
      );
      frontier = children
        .map((child) => child.id)
        .filter((id) => !allIds.has(id));
      for (const id of frontier) allIds.add(id);
    }
    return [...allIds];
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

  private async loadPAOrFail(id: string) {
    const pa = await this.prisma.projectActivity.findUnique({
      where: { id },
      include: { program: true },
    });
    if (!pa || pa.program.deletedAt) {
      throw new NotFoundException('Project/Activity not found');
    }
    return pa;
  }

  async create(
    programId: string,
    dto: CreateProjectActivityDto,
    user: JwtPayload,
  ) {
    const program = await this.loadProgramOrFail(programId);
    await this.programs.assertOwner(program, user);
    // A program either states its own costs or derives them from its PPAs —
    // the same exclusivity a PA has between DIRECT_COSTS and ACTIVITY_CHILDREN.
    // Allowing both would make the program's total stop equalling what is
    // visible underneath it, which is exactly the double-counting the source
    // workbooks keep getting wrong.
    if (program.costMode === PPACostMode.DIRECT_COSTS) {
      throw new ConflictException(
        'This program states its own costs, so it cannot also hold project/activities. Clear its own costs first.',
      );
    }
    if (!isEditableStatus(program.status)) {
      throw new BadRequestException(
        'Project/Activities can only be added while the parent program is editable (DRAFT, FOR_REVISION, or PUBLISHED_REVISION)',
      );
    }
    this.validateImplementationPeriod({
      implementationStartMonth: dto.implementationStartMonth,
      implementationStartYear: dto.implementationStartYear,
      implementationEndMonth: dto.implementationEndMonth,
      implementationEndYear: dto.implementationEndYear,
    });
    this.assertPeriodWithinProgram(program, {
      implementationStartMonth: dto.implementationStartMonth,
      implementationStartYear: dto.implementationStartYear,
      implementationEndMonth: dto.implementationEndMonth,
      implementationEndYear: dto.implementationEndYear,
    });

    if (dto.parentProjectActivityId) {
      const parent = await this.prisma.projectActivity.findUnique({
        where: { id: dto.parentProjectActivityId },
      });
      if (!parent || parent.programId !== programId) {
        throw new BadRequestException(
          'parentProjectActivityId must reference a PA in the same program',
        );
      }
    }

    // Fund sources follow the estimates: an ACTIVITY_CHILDREN parent draws on
    // whatever its children draw on, so the union is computed by the rollup and
    // the request may not carry one. Everything else needs at least one fund.
    // (Not `@ArrayMinSize(1)` on the DTO: the rule depends on costMode, and a
    // `ValidateIf` there would switch off the enum check with it.)
    const split = !!dto.fundAllocations?.length;
    if (dto.costMode === PPACostMode.ACTIVITY_CHILDREN) {
      if (dto.fundSources.length > 0 || split) {
        throw new BadRequestException(
          'Fund sources are taken from the child activities when costMode is ACTIVITY_CHILDREN',
        );
      }
    } else if (dto.fundSources.length === 0 && !split) {
      throw new BadRequestException(
        'fundSources must contain at least one fund',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // The code is a rank among live siblings, so it can only be computed once
      // the row exists. Create on a collision-proof placeholder and let the
      // resync below write the real code.
      const tentativeCode = `~${randomUUID()}`;
      const created = await tx.projectActivity.create({
        data: {
          programId,
          parentProjectActivityId: dto.parentProjectActivityId ?? null,
          type: dto.type,
          name: dto.name,
          description: dto.description ?? null,
          remarks: dto.remarks ?? null,
          expectedOutput: dto.expectedOutput ?? null,
          proposedBudget: dto.proposedBudget
            ? new Prisma.Decimal(dto.proposedBudget)
            : null,
          fundSources: dto.fundSources,
          psEstimate: decimalOrNull(dto.psEstimate),
          mooeEstimate: decimalOrNull(dto.mooeEstimate),
          feEstimate: decimalOrNull(dto.feEstimate),
          coEstimate: decimalOrNull(dto.coEstimate),
          costMode: dto.costMode ?? PPACostMode.DIRECT_COSTS,
          implementationStartMonth: dto.implementationStartMonth ?? null,
          implementationStartYear: dto.implementationStartYear ?? null,
          implementationEndMonth: dto.implementationEndMonth ?? null,
          implementationEndYear: dto.implementationEndYear ?? null,
          tentativeAipReferenceCode: tentativeCode,
          orderIndex: dto.orderIndex ?? 0,
          createdByUserId: user.sub,
        },
      });

      if (split)
        await replaceFundAllocations(
          { projectActivityId: created.id },
          dto.fundAllocations!,
          tx,
        );
      await this.estimates.recomputeProjectActivity(created.id, tx);

      await this.audit.record(
        {
          programId,
          action: ProgramAuditAction.PA_ADDED,
          actor: user,
          onBehalfOfOfficeId: program.officeId,
          targetType: AuditTargetType.PROJECT_ACTIVITY,
          targetId: created.id,
          summary: `Added "${created.name}"`,
        },
        tx,
      );

      await this.codes.resyncTentativePACodes(programId, tx);

      // Re-read so the caller gets the resolved code, not the placeholder.
      return tx.projectActivity.findUniqueOrThrow({
        where: { id: created.id },
      });
    });
  }

  async findOne(id: string, user: JwtPayload) {
    const pa = await this.loadPAOrFail(id);
    await this.programs.assertCanRead(pa.programId, user);
    const found = await this.prisma.projectActivity.findUnique({
      where: { id },
      include: {
        lineItems: { orderBy: { orderIndex: 'asc' } },
        climateChangeTag: {
          include: { codes: { include: { ccetCode: true } } },
        },
        fundAllocations: { orderBy: { orderIndex: 'asc' } },
        children: true,
        thematicTags: {
          select: { tag: { select: { id: true, name: true } } },
        },
        // The parent program's own current thematic tags (Decision 6 —
        // computed on every read, never stored): FR-008's "effective PA
        // tags" union adds this on top of the PA's own direct applications.
        program: {
          select: {
            thematicTags: {
              select: { tag: { select: { id: true, name: true } } },
              orderBy: { tag: { name: 'asc' } },
            },
          },
        },
      },
    });
    if (!found) return found;
    const { program, ...rest } = found;
    return {
      ...rest,
      thematicTags: found.thematicTags.map((t) => ({
        id: t.tag.id,
        name: t.tag.name,
      })),
      inheritedThematicTags: program.thematicTags.map((t) => ({
        id: t.tag.id,
        name: t.tag.name,
      })),
    };
  }

  /** Shared load+RBAC+editable-status gate for both tag endpoints below. */
  private async loadForTagging(paId: string, user: JwtPayload) {
    const pa = await this.loadPAOrFail(paId);
    await this.programs.assertCanTag(pa.program, user);
    if (!isEditableStatus(pa.program.status)) {
      throw new BadRequestException(
        'Thematic tags can only be changed while the parent program is editable (DRAFT, FOR_REVISION, or PUBLISHED_REVISION)',
      );
    }
    return pa;
  }

  /** Apply a thematic tag directly to a PA (FR-002). Idempotent. */
  async applyThematicTag(paId: string, tagId: string, user: JwtPayload) {
    const pa = await this.loadForTagging(paId, user);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.projectActivityThematicTag.findUnique({
        where: { projectActivityId_tagId: { projectActivityId: paId, tagId } },
      });
      if (!existing) {
        const tag = await tx.thematicTag.findUnique({ where: { id: tagId } });
        if (!tag) throw new NotFoundException('Thematic tag not found');
        await tx.projectActivityThematicTag.create({
          data: { projectActivityId: paId, tagId, appliedByUserId: user.sub },
        });
        await this.audit.record(
          {
            programId: pa.programId,
            action: ProgramAuditAction.TAG_ADDED,
            actor: user,
            onBehalfOfOfficeId: pa.program.officeId,
            summary: `Tagged "${tag.name}"`,
            targetType: AuditTargetType.PROJECT_ACTIVITY,
            targetId: paId,
          },
          tx,
        );
      }
    });
    return this.getDirectTags(paId);
  }

  /**
   * Remove a thematic tag directly applied to a PA. Only ever removes a
   * direct application — a tag showing up purely through inheritance has no
   * row here to delete, and that is exactly FR-009's guarantee: there is no
   * code path that strips an inherited tag from a PA.
   */
  async removeThematicTag(paId: string, tagId: string, user: JwtPayload) {
    const pa = await this.loadForTagging(paId, user);
    // Check-then-delete runs inside one transaction so a concurrent remove
    // (or a tag re-added on the program in between) can't slip through the
    // gap between the lookup and the delete.
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.projectActivityThematicTag.findUnique({
        where: { projectActivityId_tagId: { projectActivityId: paId, tagId } },
        select: { tag: { select: { name: true } } },
      });
      if (!existing) {
        const onProgram = await tx.programThematicTag.findUnique({
          where: { programId_tagId: { programId: pa.programId, tagId } },
        });
        if (onProgram) {
          throw new BadRequestException(
            "This tag is inherited from the program and can't be removed here",
          );
        }
        return;
      }
      await tx.projectActivityThematicTag.delete({
        where: { projectActivityId_tagId: { projectActivityId: paId, tagId } },
      });
      await this.audit.record(
        {
          programId: pa.programId,
          action: ProgramAuditAction.TAG_REMOVED,
          actor: user,
          onBehalfOfOfficeId: pa.program.officeId,
          summary: `Removed tag "${existing.tag.name}"`,
          targetType: AuditTargetType.PROJECT_ACTIVITY,
          targetId: paId,
        },
        tx,
      );
    });
    return this.getDirectTags(paId);
  }

  private async getDirectTags(paId: string) {
    const tags = await this.prisma.projectActivityThematicTag.findMany({
      where: { projectActivityId: paId },
      select: { tag: { select: { id: true, name: true } } },
      orderBy: { tag: { name: 'asc' } },
    });
    return tags.map((t) => ({ id: t.tag.id, name: t.tag.name }));
  }

  async update(id: string, dto: UpdateProjectActivityDto, user: JwtPayload) {
    const pa = await this.loadPAOrFail(id);
    await this.programs.assertOwner(pa.program, user);
    if (!isEditableStatus(pa.program.status)) {
      throw new BadRequestException(
        'Project/Activities can only be edited while the parent program is editable (DRAFT, FOR_REVISION, or PUBLISHED_REVISION)',
      );
    }
    if (dto.costMode !== undefined && dto.costMode !== pa.costMode) {
      throw new BadRequestException(
        'costMode cannot be changed after Project/Activity creation',
      );
    }

    const nextPeriod = {
      implementationStartMonth:
        dto.implementationStartMonth !== undefined
          ? dto.implementationStartMonth
          : pa.implementationStartMonth,
      implementationStartYear:
        dto.implementationStartYear !== undefined
          ? dto.implementationStartYear
          : pa.implementationStartYear,
      implementationEndMonth:
        dto.implementationEndMonth !== undefined
          ? dto.implementationEndMonth
          : pa.implementationEndMonth,
      implementationEndYear:
        dto.implementationEndYear !== undefined
          ? dto.implementationEndYear
          : pa.implementationEndYear,
    };
    this.validateImplementationPeriod(nextPeriod);
    this.assertPeriodWithinProgram(pa.program, nextPeriod);

    if (
      dto.costMode === PPACostMode.ACTIVITY_CHILDREN ||
      pa.costMode === PPACostMode.ACTIVITY_CHILDREN
    ) {
      if (
        dto.psEstimate !== undefined ||
        dto.mooeEstimate !== undefined ||
        dto.feEstimate !== undefined ||
        dto.coEstimate !== undefined
      ) {
        throw new BadRequestException(
          'Cost estimates are summed from child activities when costMode is ACTIVITY_CHILDREN',
        );
      }
      // Same reason: the union belongs to the rollup, and accepting a list here
      // would blank or contradict it until the next child change.
      if (dto.fundSources !== undefined || dto.fundAllocations?.length) {
        throw new BadRequestException(
          'Fund sources are taken from the child activities when costMode is ACTIVITY_CHILDREN',
        );
      }
    } else if (dto.fundSources !== undefined && dto.fundSources.length === 0) {
      throw new BadRequestException(
        'fundSources must contain at least one fund',
      );
    }

    const changes = diffFields(
      pa,
      dto as unknown as Record<string, unknown>,
      PROJECT_ACTIVITY_AUDIT_FIELDS,
    );
    // Logged separately from PA_UPDATED: "who moved MOOE from 200k to 250k" is
    // the question the edit history exists to answer, and burying it inside a
    // generic field change would make it unfilterable (§3.6).
    const estimateChanges = diffFields(
      pa,
      dto as unknown as Record<string, unknown>,
      ESTIMATE_AUDIT_FIELDS,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.projectActivity.update({
        where: { id },
        data: {
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
          ...(dto.expectedOutput !== undefined
            ? { expectedOutput: dto.expectedOutput }
            : {}),
          ...(dto.proposedBudget !== undefined
            ? {
                proposedBudget: dto.proposedBudget
                  ? new Prisma.Decimal(dto.proposedBudget)
                  : null,
              }
            : {}),
          ...(dto.fundSources !== undefined
            ? { fundSources: dto.fundSources }
            : {}),
          // The four cost estimates. `create` has always written these; the
          // update path never did, so edits to PS/MOOE/CO were accepted, audited
          // as ESTIMATE_UPDATED, and silently discarded. Guarded above: when
          // costMode is ACTIVITY_CHILDREN the totals come from children and the
          // request is rejected before reaching here.
          ...(dto.psEstimate !== undefined
            ? { psEstimate: decimalOrNull(dto.psEstimate) }
            : {}),
          ...(dto.mooeEstimate !== undefined
            ? { mooeEstimate: decimalOrNull(dto.mooeEstimate) }
            : {}),
          ...(dto.feEstimate !== undefined
            ? { feEstimate: decimalOrNull(dto.feEstimate) }
            : {}),
          ...(dto.coEstimate !== undefined
            ? { coEstimate: decimalOrNull(dto.coEstimate) }
            : {}),
          ...(dto.orderIndex !== undefined
            ? { orderIndex: dto.orderIndex }
            : {}),
          ...(dto.costMode !== undefined ? { costMode: dto.costMode } : {}),
          ...(dto.implementationStartMonth !== undefined
            ? { implementationStartMonth: dto.implementationStartMonth }
            : {}),
          ...(dto.implementationStartYear !== undefined
            ? { implementationStartYear: dto.implementationStartYear }
            : {}),
          ...(dto.implementationEndMonth !== undefined
            ? { implementationEndMonth: dto.implementationEndMonth }
            : {}),
          ...(dto.implementationEndYear !== undefined
            ? { implementationEndYear: dto.implementationEndYear }
            : {}),
        },
      });

      if (dto.fundAllocations !== undefined)
        await replaceFundAllocations(
          { projectActivityId: id },
          dto.fundAllocations,
          tx,
        );
      // A child's fund sources feed its parent's union, so they trigger the same
      // rollup as an estimate edit — only the audit row below is estimate-only.
      if (
        estimateChanges ||
        dto.fundSources !== undefined ||
        dto.fundAllocations !== undefined
      ) {
        await this.estimates.recomputeProjectActivity(id, tx);
      }
      if (estimateChanges || dto.fundAllocations !== undefined) {
        await this.audit.record(
          {
            programId: pa.programId,
            action: ProgramAuditAction.ESTIMATE_UPDATED,
            actor: user,
            onBehalfOfOfficeId: pa.program.officeId,
            targetType: AuditTargetType.PROJECT_ACTIVITY,
            targetId: id,
            summary: `${updated.name}: ${
              dto.fundAllocations === undefined
                ? 'cost estimate changed'
                : dto.fundAllocations.length
                  ? `split by fund (${dto.fundAllocations.map((l) => l.fundSource).join(', ')})`
                  : 'fund split removed; one total'
            }`,
            changes: estimateChanges,
          },
          tx,
        );
      }

      await this.audit.record(
        {
          programId: pa.programId,
          action: ProgramAuditAction.PA_UPDATED,
          actor: user,
          onBehalfOfOfficeId: pa.program.officeId,
          targetType: AuditTargetType.PROJECT_ACTIVITY,
          targetId: id,
          summary: `${updated.name}: ${summarizeFieldChanges(changes).toLowerCase()}`,
          changes,
        },
        tx,
      );

      return updated;
    });
  }

  async paActivityStream(paId: string, user: JwtPayload) {
    const pa = await this.loadPAOrFail(paId);
    await this.programs.assertCanRead(pa.programId, user);

    const roots = await this.prisma.programComment.findMany({
      where: {
        programId: pa.programId,
        targetType: CommentTarget.PROJECT_ACTIVITY,
        targetId: paId,
        parentCommentId: null,
        deletedAt: null,
      },
      omit: OMIT_SUBMITTER,
      include: {
        replies: {
          where: { deletedAt: null },
          omit: OMIT_SUBMITTER,
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

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

    return roots.map((c) => ({
      kind: 'comment' as const,
      at: c.createdAt,
      payload: {
        ...withActor(c),
        resolvedBy: c.resolvedByUserId
          ? (actors.get(c.resolvedByUserId) ?? null)
          : null,
        replies: c.replies.map(withActor),
      },
    }));
  }

  async history(id: string, user: JwtPayload) {
    const pa = await this.loadPAOrFail(id);
    await this.programs.assertCanRead(pa.programId, user);

    const versions = await this.prisma.programVersion.findMany({
      where: { programId: pa.programId },
      orderBy: { version: 'asc' },
      select: {
        version: true,
        submittedAt: true,
        submittedByUserId: true,
        snapshot: true,
      },
    });

    return versions.flatMap((v) => {
      const snap = v.snapshot as { projectActivities?: Array<{ id: string }> };
      const paSnapshot = snap.projectActivities?.find((p) => p.id === id);
      if (!paSnapshot) return [];
      return [
        {
          version: v.version,
          submittedAt: v.submittedAt,
          submittedByUserId: v.submittedByUserId,
          paSnapshot,
        },
      ];
    });
  }

  /**
   * Rank a sibling group by hand.
   *
   * `orderIndex` is what the trailing AIP code segment is derived from, so a
   * reorder is a code change — the resync at the end rewrites every affected
   * code in the same transaction.
   */
  async reorder(
    programId: string,
    dto: ReorderProjectActivitiesDto,
    user: JwtPayload,
  ) {
    const program = await this.loadProgramOrFail(programId);
    await this.programs.assertOwner(program, user);
    if (!isEditableStatus(program.status)) {
      throw new BadRequestException(
        'Project/Activities can only be reordered while the parent program is editable (DRAFT, FOR_REVISION, or PUBLISHED_REVISION)',
      );
    }

    const parentId = dto.parentProjectActivityId ?? null;
    const siblings = await this.prisma.projectActivity.findMany({
      where: { programId, parentProjectActivityId: parentId },
      select: { id: true },
    });

    // A partial list would leave the omitted siblings ranked arbitrarily, and
    // their codes would shuffle on the next resync for no reason the user did.
    const given = new Set(dto.ids);
    if (given.size !== dto.ids.length) {
      throw new BadRequestException('Duplicate ids in reorder payload');
    }
    if (
      siblings.length !== dto.ids.length ||
      siblings.some((s) => !given.has(s.id))
    ) {
      throw new BadRequestException(
        'Reorder payload must list every sibling under this parent exactly once',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const [index, id] of dto.ids.entries()) {
        await tx.projectActivity.update({
          where: { id },
          data: { orderIndex: index + 1 },
        });
      }
      await this.codes.resyncTentativePACodes(programId, tx);
      return tx.projectActivity.findMany({
        where: { programId, parentProjectActivityId: parentId },
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, orderIndex: true, tentativeAipReferenceCode: true },
      });
    });
  }

  async remove(id: string, user: JwtPayload) {
    const pa = await this.loadPAOrFail(id);
    await this.programs.assertOwner(pa.program, user);
    if (!isEditableStatus(pa.program.status)) {
      throw new BadRequestException(
        'Project/Activities can only be deleted while the parent program is editable (DRAFT, FOR_REVISION, or PUBLISHED_REVISION)',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const deleteIds = await this.collectDescendantIds(pa.id, tx);
      await tx.projectActivity.deleteMany({ where: { id: { in: deleteIds } } });
      // Recompute program rollups (PA contributed psTotal etc.).
      await this.rollup.recomputeProgram(pa.programId, tx);
      if (pa.parentProjectActivityId) {
        await this.estimates.recomputeProjectActivity(
          pa.parentProjectActivityId,
          tx,
        );
      } else {
        await this.estimates.recomputeProgram(pa.programId, tx);
      }

      await this.audit.record(
        {
          programId: pa.programId,
          action: ProgramAuditAction.PA_REMOVED,
          actor: user,
          onBehalfOfOfficeId: pa.program.officeId,
          targetType: AuditTargetType.PROJECT_ACTIVITY,
          targetId: pa.id,
          summary:
            deleteIds.length > 1
              ? `Removed "${pa.name}" and ${deleteIds.length - 1} child activity(ies)`
              : `Removed "${pa.name}"`,
        },
        tx,
      );

      // Close the gap this leaves in the program's PA numbering.
      await this.codes.resyncTentativePACodes(pa.programId, tx);

      return { message: 'Project/Activity deleted.' };
    });
  }
}

/** DTO decimal strings are optional and nullable; keep the three shapes distinct. */
function decimalOrNull(
  value: string | null | undefined,
): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value);
}
