import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  EstimateRollupService,
  replaceFundAllocations,
} from '../budget-rollup/estimate-rollup.service.js';
import {
  ALL_OFFICES,
  OfficeScopeService,
} from '../permissions/office-scope.service.js';
import { ProgramAuditLogService } from '../program-audit/program-audit-log.service.js';
import {
  PROGRAM_AUDIT_FIELDS,
  diffFields,
  summarizeFieldChanges,
} from '../program-audit/audit-fields.js';
import { AIPCodesService } from '../aip-codes/aip-codes.service.js';
import { RegistryCacheService } from '../cache/registry-cache.service.js';
import {
  AIPCycleStatus,
  IdentityType,
  PPACostMode,
  Prisma,
  ProgramAuditAction,
  ProgramStatus,
  Role,
} from '../generated/prisma/index';
import {
  isDeletableStatus,
  isEditableStatus,
} from './program-status.constants.js';
import {
  isCitywideEndorser,
  resolveEndorserIdentity,
} from '../common/endorser-identity.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { CreateProgramDto } from './dto/create-program.dto.js';
import type { UpdateProgramDto } from './dto/update-program.dto.js';
import type { ListProgramsDto } from './dto/list-programs.dto.js';
import type { ReorderProgramsDto } from './dto/reorder-programs.dto.js';
import { LIVE_PROGRAM } from './program-filters.js';
import { GOAL } from '../common/brand.js';

/**
 * Core CRUD + RBAC for Programs. Status transitions live in ProgramWorkflowService.
 *
 * Visibility rules:
 *  - SUPER_ADMIN: full read.
 *  - Owner (STAFF/HEAD of proponent org): full read of own program.
 *  - Same-cluster peer: read-only on programs whose proponent org shares the
 *    user's cluster.
 *  - Citywide endorser HEAD (canEndorse LGU office or NCPC umbrella): read all
 *    programs to discharge the endorsement duty.
 *  - CSO representative endorser: same-cluster read only.
 */
@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: AIPCodesService,
    private readonly officeScope: OfficeScopeService,
    private readonly audit: ProgramAuditLogService,
    private readonly registryCache: RegistryCacheService,
    private readonly estimates: EstimateRollupService,
  ) {}

  /**
   * Reject unknown SDG goal ids before the write. Compared against the *unique*
   * count so a payload repeating one id doesn't pass by accident — and then hit
   * a composite-PK violation inside the transaction.
   */
  private async assertSdgGoalsExist(ids: string[] | undefined) {
    if (!ids?.length) return;
    const unique = new Set(ids);
    const found = await this.prisma.sDGGoal.findMany({
      where: { id: { in: [...unique] } },
      select: { id: true },
    });
    if (found.length !== unique.size) {
      throw new NotFoundException('One or more SDG goals not found');
    }
  }

  /**
   * The host must be a real, active office. It **may** be the program's own.
   *
   * Self-hosting is not a mistake — it is the city's `004` bucket, where an
   * office lists a program in its own sheet's COMPONENT PROGRAMS band rather
   * than under GAS/STO/Operations. CSWDO does it for Paskohan sa Barangay and
   * four others, SP for the Councilors' League, Lingkod Barangay for Bantay
   * Kataid. Nothing prints twice: `hostOfficeId` decides the band, so a
   * self-hosted program appears there instead of in a papClass section, not as
   * well as.
   */
  private async assertHostOfficeValid(
    hostOfficeId: string | null | undefined,
    _officeId: string | null | undefined,
  ) {
    if (!hostOfficeId) return;
    const host = await this.prisma.office.findFirst({
      where: { id: hostOfficeId, isActive: true },
      select: { id: true },
    });
    if (!host) throw new NotFoundException('Host office not found');
  }

  private validateImplementationPeriod(
    period: {
      implementationStartMonth: number | null | undefined;
      implementationStartYear: number | null | undefined;
      implementationEndMonth: number | null | undefined;
      implementationEndYear: number | null | undefined;
    },
    cycleFiscalYear?: number | null,
  ) {
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

    if (cycleFiscalYear != null) {
      if (Number(period.implementationStartYear) < cycleFiscalYear) {
        throw new BadRequestException(
          `Implementation start year must be ${cycleFiscalYear} or later`,
        );
      }
      if (Number(period.implementationEndYear) < cycleFiscalYear) {
        throw new BadRequestException(
          `Implementation end year must be ${cycleFiscalYear} or later`,
        );
      }
    }
  }

  // ─── User context helpers ─────────────────────────────────────────────────

  /** Resolve the user's cluster (LGU via office, NCPC via CSO). Null for SUPER_ADMIN with no org. */
  async getUserClusterId(user: JwtPayload): Promise<string | null> {
    if (user.officeId) {
      const office = await this.prisma.office.findUnique({
        where: { id: user.officeId },
        select: { clusterId: true },
      });
      return office?.clusterId ?? null;
    }
    if (user.civilSocietyOrganizationId) {
      const cso = await this.prisma.civilSocietyOrganization.findUnique({
        where: { id: user.civilSocietyOrganizationId },
        select: { clusterId: true },
      });
      return cso?.clusterId ?? null;
    }
    return null;
  }

  /**
   * Asserts the caller may act on this program's office.
   *
   * Phase 1 (D2): "owning office" widened to "office within the caller's
   * effective scope". `OfficeScopeService` unions explicit grants with the
   * user's home office, so a user with no grants behaves exactly as before —
   * this is what lets CPDO encoders act for ~50 offices without loosening
   * anything for anyone else.
   */
  async assertOwner(
    program: { officeId: string | null },
    user: JwtPayload,
  ): Promise<void> {
    if (user.role === Role.SUPER_ADMIN) return;
    try {
      await this.officeScope.assertOfficeInScope(user, program.officeId);
    } catch {
      throw new ForbiddenException(
        'Only the owning office can perform this action',
      );
    }
  }

  /** Asserts caller is the program's owning-office HEAD (or SUPER_ADMIN). */
  async assertOwningHead(
    program: { officeId: string | null },
    user: JwtPayload,
  ): Promise<void> {
    if (user.role === Role.SUPER_ADMIN) return;
    if (user.role !== Role.HEAD) {
      throw new ForbiddenException('HEAD role required');
    }
    await this.assertOwner(program, user);
  }

  /**
   * Asserts caller may tag a program (or, by extension, one of its PAs):
   * the owning office (via `assertOwner`), or any NCPC user regardless of
   * office (spec.md FR-013 — NCPC's `aip:tag` grant is deliberately not
   * office-scoped, unlike `aip:write`). SUPER_ADMIN passes via `assertOwner`.
   */
  async assertCanTag(
    program: { officeId: string | null },
    user: JwtPayload,
  ): Promise<void> {
    if (user.identityType === IdentityType.NCPC) return;
    await this.assertOwner(program, user);
  }

  // ─── Visibility (read RBAC) ───────────────────────────────────────────────

  /** Apply visibility filters to a Prisma `where` clause for list queries. */
  async buildVisibilityWhere(
    user: JwtPayload,
  ): Promise<Prisma.ProgramWhereInput> {
    if (user.role === Role.SUPER_ADMIN) return { deletedAt: null };
    // LFC users (the standing approving body) see every program — STAFF as
    // committee analysts, HEAD to cast their office's approval vote.
    if (user.identityType === IdentityType.LFC) return { deletedAt: null };

    // Office scope (D2) is the widest LGU-side signal: ALL short-circuits, and
    // the explicit list already includes the home office.
    const scope = await this.officeScope.effectiveOfficeIds(user);
    if (scope === ALL_OFFICES) return { deletedAt: null };

    const orFilters: Prisma.ProgramWhereInput[] = [];

    if (scope.length > 0) {
      orFilters.push({ officeId: { in: scope } });
    }

    /**
     * The same-cluster peer rule applies only to users with **no** explicit
     * grants.
     *
     * An admin who hands someone a specific office list is stating that user's
     * scope; unioning the home office's whole cluster on top of it contradicts
     * that. It bit a CPDO encoder granted the eight Economy offices: CPDO sits in
     * Governance, so the cluster branch added all 23 Governance offices and they
     * could read 101 programs instead of their 48.
     *
     * Users without grants are unaffected — they still get cluster-wide read, so
     * `assertOwner` (grants + home office, never the cluster) stays the narrower
     * write rule it always was.
     */
    const hasExplicitGrants = await this.officeScope.hasExplicitGrants(user);
    if (!hasExplicitGrants) {
      const clusterId = await this.getUserClusterId(user);
      if (clusterId) {
        orFilters.push({ office: { clusterId } });
      }
    }
    // Citywide endorsers can see all programs to discharge the endorsement duty.
    // CSO representative endorsers stay within the same-cluster rule above.
    const endorserIdentity = await resolveEndorserIdentity(this.prisma, user);
    if (endorserIdentity && isCitywideEndorser(endorserIdentity)) {
      return { deletedAt: null };
    }
    // No branch matched: match nothing. `OR: undefined` dropped the filter, so a
    // user with no scope, cluster or endorser role — an NCPC or Developer
    // account before anyone grants it offices — listed every program, then got
    // a 403 opening each one (#102). Not `OR: []` either: Prisma reads an empty
    // OR as false at the top level but as *true* once nested in an `AND`, which
    // is exactly how the registry composes this.
    if (orFilters.length === 0) return { deletedAt: null, id: { in: [] } };
    return { deletedAt: null, OR: orFilters };
  }

  /** Throws if user can't read the program. */
  async assertCanRead(programId: string, user: JwtPayload) {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
      select: {
        id: true,
        deletedAt: true,
        officeId: true,
        office: { select: { clusterId: true } },
      },
    });
    if (!program || program.deletedAt)
      throw new NotFoundException('Program not found');
    if (
      await this.canReadOffice(
        program.officeId,
        program.office?.clusterId ?? null,
        user,
      )
    ) {
      return program;
    }
    throw new ForbiddenException('You do not have access to this program');
  }

  /**
   * The read rule for anything owned by an office — a program, or a PPA in an
   * LEP or Ordinance (specs/012, CommentsService.assertCanReadTarget): super
   * admin and LFC; any office in the caller's effective scope (D2, which
   * includes the home office); a same-cluster peer; a citywide endorser.
   */
  async canReadOffice(
    officeId: string | null,
    clusterId: string | null,
    user: JwtPayload,
  ): Promise<boolean> {
    if (user.role === Role.SUPER_ADMIN) return true;
    if (user.identityType === IdentityType.LFC) return true;

    const scope = await this.officeScope.effectiveOfficeIds(user);
    if (scope === ALL_OFFICES || (officeId && scope.includes(officeId))) {
      return true;
    }

    // Same-cluster peer — only for users with no explicit grants, exactly as in
    // buildVisibilityWhere: a stated office list is the user's whole scope.
    if (!(await this.officeScope.hasExplicitGrants(user))) {
      const userCluster = await this.getUserClusterId(user);
      if (userCluster && clusterId && userCluster === clusterId) return true;
    }

    // Citywide endorsers can read all programs; CSO reps stay cluster-scoped.
    const endorserIdentity = await resolveEndorserIdentity(this.prisma, user);
    return !!endorserIdentity && isCitywideEndorser(endorserIdentity);
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(dto: CreateProgramDto, user: JwtPayload) {
    // Programs are LGU-only: the implementing city office is the proponent.
    if (!dto.officeId) {
      throw new BadRequestException('officeId required');
    }
    if (user.role !== Role.SUPER_ADMIN) {
      try {
        await this.officeScope.assertOfficeInScope(user, dto.officeId);
      } catch {
        throw new ForbiddenException(
          'You can only create programs for an office in your assigned scope',
        );
      }
    }

    // Basic implementation-period validation (pure input — runs before any DB
    // lookups so callers get a 400 even on a bad cycle/proponent shape).
    this.validateImplementationPeriod({
      implementationStartMonth: dto.implementationStartMonth,
      implementationStartYear: dto.implementationStartYear,
      implementationEndMonth: dto.implementationEndMonth,
      implementationEndYear: dto.implementationEndYear,
    });

    // Cycle must be OPEN.
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id: dto.aipCycleId },
    });
    if (!cycle) throw new NotFoundException('AIP cycle not found');
    if (cycle.status !== AIPCycleStatus.OPEN) {
      throw new BadRequestException(
        `Cannot create programs while cycle is ${cycle.status}; cycle must be OPEN`,
      );
    }

    // Re-validate with the cycle's fiscal year for the cross-field check.
    this.validateImplementationPeriod(
      {
        implementationStartMonth: dto.implementationStartMonth,
        implementationStartYear: dto.implementationStartYear,
        implementationEndMonth: dto.implementationEndMonth,
        implementationEndYear: dto.implementationEndYear,
      },
      cycle.fiscalYear,
    );

    // Validate FK targets exist.
    const [pap, finishLine] = await Promise.all([
      this.prisma.pAPSector.findUnique({ where: { id: dto.papSectorId } }),
      this.prisma.finishLine.findUnique({ where: { id: dto.finishLineId } }),
    ]);
    if (!pap) throw new NotFoundException('PAP sector not found');
    if (!finishLine) throw new NotFoundException(`${GOAL} not found`);
    if (dto.sglgIndicatorId) {
      const sglg = await this.prisma.sGLGIndicator.findUnique({
        where: { id: dto.sglgIndicatorId },
      });
      if (!sglg) throw new NotFoundException('SGLG indicator not found');
    }
    await this.assertHostOfficeValid(dto.hostOfficeId, dto.officeId);
    await this.assertSdgGoalsExist(dto.sdgGoalIds);

    // Create the program and derive its tentative code in a single transaction.
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // The code is a rank among live siblings, so it can only be computed
        // once the row exists. Create it on a collision-proof placeholder and
        // let the resync below write the real code.
        const tentativeCode = `~${randomUUID()}`;
        // Append at the end of the scope. Existing rows carry a backfilled
        // orderIndex of 1..N, so a new row must not default to 0.
        const last = await tx.program.aggregate({
          where: {
            aipCycleId: dto.aipCycleId,
            officeId: dto.officeId,
            papSectorId: dto.papSectorId,
            deletedAt: null,
          },
          _max: { orderIndex: true },
        });
        const program = await tx.program.create({
          data: {
            aipCycleId: dto.aipCycleId,
            officeId: dto.officeId,
            hostOfficeId: dto.hostOfficeId ?? null,
            papSectorId: dto.papSectorId,
            papSubsectorCode: dto.papSubsectorCode ?? '000',
            papClass: dto.papClass,
            finishLineId: dto.finishLineId,
            subFinishLineId: dto.subFinishLineId ?? null,
            sglgIndicatorId: dto.sglgIndicatorId ?? null,
            name: dto.name,
            description: dto.description ?? null,
            remarks: dto.remarks ?? null,
            expectedOutput: dto.expectedOutput ?? null,
            targetForBudgetYear: dto.targetForBudgetYear ?? null,
            implementationStartMonth: dto.implementationStartMonth,
            implementationStartYear: dto.implementationStartYear,
            implementationEndMonth: dto.implementationEndMonth,
            implementationEndYear: dto.implementationEndYear,
            tentativeAipReferenceCode: tentativeCode,
            orderIndex: (last._max.orderIndex ?? 0) + 1,
            status: ProgramStatus.DRAFT,
            createdByUserId: user.sub,
            // Optional programme-level costs. Absent means the default —
            // derive from the PPAs that will be added next — which is what
            // almost every program does.
            ...(dto.costMode !== undefined ? { costMode: dto.costMode } : {}),
            ...(dto.fundSources !== undefined
              ? { fundSources: dto.fundSources }
              : {}),
            ...(dto.psProposedTotal
              ? { psProposedTotal: new Prisma.Decimal(dto.psProposedTotal) }
              : {}),
            ...(dto.mooeProposedTotal
              ? { mooeProposedTotal: new Prisma.Decimal(dto.mooeProposedTotal) }
              : {}),
            ...(dto.feProposedTotal
              ? { feProposedTotal: new Prisma.Decimal(dto.feProposedTotal) }
              : {}),
            ...(dto.coProposedTotal
              ? { coProposedTotal: new Prisma.Decimal(dto.coProposedTotal) }
              : {}),
          },
        });

        // A direct-cost program's `proposedTotal` is the sum of the three
        // figures it was just given. Same transaction, so the row is never
        // briefly wrong.
        if (dto.costMode === PPACostMode.DIRECT_COSTS) {
          if (dto.fundAllocations?.length)
            await replaceFundAllocations(
              { programId: program.id },
              dto.fundAllocations,
              tx,
            );
          await this.estimates.recomputeProgram(program.id, tx);
        } else if (dto.fundAllocations?.length) {
          throw new BadRequestException(
            'Only a program that states its own costs can split them by fund',
          );
        }

        if (dto.supportingOfficeIds?.includes(dto.officeId)) {
          throw new BadRequestException(
            'Supporting offices must not include the implementing office',
          );
        }

        if (dto.supportingOfficeIds?.length) {
          await tx.programSupportingOffice.createMany({
            data: dto.supportingOfficeIds.map((officeId) => ({
              programId: program.id,
              officeId,
            })),
          });
        }

        if (dto.sdgGoalIds?.length) {
          await tx.programSDGGoal.createMany({
            data: [...new Set(dto.sdgGoalIds)].map((sdgGoalId) => ({
              programId: program.id,
              sdgGoalId,
            })),
          });
        }

        await this.audit.record(
          {
            programId: program.id,
            action: ProgramAuditAction.PROGRAM_CREATED,
            actor: user,
            onBehalfOfOfficeId: program.officeId,
            summary: `Created "${program.name}"`,
          },
          tx,
        );

        await this.codes.resyncTentativeProgramCodes(
          {
            aipCycleId: dto.aipCycleId,
            officeId: dto.officeId,
            papSectorId: dto.papSectorId,
          },
          tx,
        );

        // Re-read so the caller gets the resolved code, not the placeholder.
        return tx.program.findUniqueOrThrow({ where: { id: program.id } });
      });

      // A new DRAFT moves the tab counts.
      await this.registryCache.invalidateRegistryCounts();
      return created;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta?.target as string[] | undefined)?.includes(
          'tentative_aip_reference_code',
        )
      ) {
        throw new ConflictException(
          'AIP reference code conflict — please retry.',
        );
      }
      throw err;
    }
  }

  async findAll(opts: ListProgramsDto, user: JwtPayload) {
    const visibility = await this.buildVisibilityWhere(user);

    // Conjuncts, not a spread: `visibility` carries the user's office scope as an
    // `OR`, and so does the search filter. Spreading them let search overwrite
    // the scope entirely — see the same fix and its regression test in
    // AIPRegistryService.list.
    const filters: Prisma.ProgramWhereInput[] = [visibility];

    if (opts.cycleId) filters.push({ aipCycleId: opts.cycleId });
    // Archived programs only when asked for by status (specs/013).
    filters.push(
      opts.status
        ? { status: opts.status }
        : { status: { not: ProgramStatus.ARCHIVED } },
    );
    if (opts.finishLineId) filters.push({ finishLineId: opts.finishLineId });
    if (opts.officeId) filters.push({ officeId: opts.officeId });
    if (opts.clusterId) filters.push({ office: { clusterId: opts.clusterId } });
    if (opts.search) {
      filters.push({
        OR: [
          { name: { contains: opts.search, mode: 'insensitive' } },
          {
            tentativeAipReferenceCode: {
              contains: opts.search,
              mode: 'insensitive',
            },
          },
          {
            aipReferenceCode: {
              contains: opts.search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    const where: Prisma.ProgramWhereInput = { AND: filters };

    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 25;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.program.count({ where }),
      this.prisma.program.findMany({
        where,
        include: {
          finishLine: { select: { id: true, name: true, visionNumber: true } },
          subFinishLine: { select: { id: true, code: true, name: true } },
          papSector: { select: { id: true, code: true, name: true } },
          office: {
            select: { id: true, acronym: true, name: true, clusterId: true },
          },
          sglgIndicator: {
            select: { id: true, code: true, name: true, pillar: true },
          },
          sdgGoals: {
            include: {
              sdgGoal: { select: { id: true, code: true, name: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async findOne(id: string, user: JwtPayload) {
    await this.assertCanRead(id, user);
    const program = await this.prisma.program.findUnique({
      where: { id },
      include: {
        finishLine: true,
        subFinishLine: true,
        papSector: true,
        sglgIndicator: true,
        office: { include: { cluster: true } },
        aipCycle: { select: { id: true, fiscalYear: true, status: true } },
        sdgGoals: {
          include: {
            sdgGoal: { select: { id: true, code: true, name: true } },
          },
        },
        supportingOffices: {
          include: {
            office: {
              select: { id: true, acronym: true, name: true },
            },
          },
        },
        climateChangeTag: {
          include: { codes: { include: { ccetCode: true } } },
        },
        fundAllocations: { orderBy: { orderIndex: 'asc' } },
        thematicTags: {
          select: { tag: { select: { id: true, name: true } } },
        },
        projectActivities: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lineItems: { orderBy: { orderIndex: 'asc' } },
            climateChangeTag: {
              include: { codes: { include: { ccetCode: true } } },
            },
            fundAllocations: { orderBy: { orderIndex: 'asc' } },
            thematicTags: {
              select: { tag: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!program) return program;
    return {
      ...program,
      thematicTags: program.thematicTags.map((t) => ({
        id: t.tag.id,
        name: t.tag.name,
      })),
      projectActivities: program.projectActivities.map((pa) => ({
        ...pa,
        thematicTags: pa.thematicTags.map((t) => ({
          id: t.tag.id,
          name: t.tag.name,
        })),
      })),
    };
  }

  /** Shared load+RBAC+editable-status gate for both tag endpoints below. */
  private async loadForTagging(id: string, user: JwtPayload) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program || program.deletedAt) {
      throw new NotFoundException('Program not found');
    }
    await this.assertCanTag(program, user);
    if (!isEditableStatus(program.status)) {
      throw new BadRequestException(
        'Thematic tags can only be changed while the program is editable (DRAFT, FOR_REVISION, or PUBLISHED_REVISION)',
      );
    }
    return program;
  }

  /** Apply a thematic tag directly to a Program (FR-001). Idempotent. */
  async applyThematicTag(programId: string, tagId: string, user: JwtPayload) {
    const program = await this.loadForTagging(programId, user);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.programThematicTag.findUnique({
        where: { programId_tagId: { programId, tagId } },
      });
      if (!existing) {
        const tag = await tx.thematicTag.findUnique({ where: { id: tagId } });
        if (!tag) throw new NotFoundException('Thematic tag not found');
        await tx.programThematicTag.create({
          data: { programId, tagId, appliedByUserId: user.sub },
        });
        await this.audit.record(
          {
            programId,
            action: ProgramAuditAction.TAG_ADDED,
            actor: user,
            onBehalfOfOfficeId: program.officeId,
            summary: `Tagged "${tag.name}"`,
          },
          tx,
        );
      }
    });
    return this.getProgramThematicTags(programId);
  }

  /** Remove a thematic tag directly applied to a Program. Idempotent. */
  async removeThematicTag(programId: string, tagId: string, user: JwtPayload) {
    const program = await this.loadForTagging(programId, user);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.programThematicTag.findUnique({
        where: { programId_tagId: { programId, tagId } },
        select: { tag: { select: { name: true } } },
      });
      if (existing) {
        await tx.programThematicTag.delete({
          where: { programId_tagId: { programId, tagId } },
        });
        await this.audit.record(
          {
            programId,
            action: ProgramAuditAction.TAG_REMOVED,
            actor: user,
            onBehalfOfOfficeId: program.officeId,
            summary: `Removed tag "${existing.tag.name}"`,
          },
          tx,
        );
      }
    });
    return this.getProgramThematicTags(programId);
  }

  private async getProgramThematicTags(programId: string) {
    const tags = await this.prisma.programThematicTag.findMany({
      where: { programId },
      select: { tag: { select: { id: true, name: true } } },
      orderBy: { tag: { name: 'asc' } },
    });
    return tags.map((t) => ({ id: t.tag.id, name: t.tag.name }));
  }

  async update(id: string, dto: UpdateProgramDto, user: JwtPayload) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program || program.deletedAt)
      throw new NotFoundException('Program not found');
    if (!isEditableStatus(program.status)) {
      throw new BadRequestException(
        program.status === ProgramStatus.PUBLISHED
          ? 'This AIP is published. Open a revision (POST /programs/:id/revise) before editing — the public keeps seeing the published version until you republish.'
          : `Programs can only be edited while in DRAFT, FOR_REVISION, or PUBLISHED_REVISION (current: ${program.status})`,
      );
    }
    // Owners (STAFF or HEAD) can edit drafts they own.
    await this.assertOwner(program, user);

    // These fields feed directly into the AIP reference code and ceiling pool.
    // Once the program has been submitted (currentVersion > 0), they are immutable.
    if (program.currentVersion > 0) {
      if (
        dto.papSectorId !== undefined &&
        dto.papSectorId !== program.papSectorId
      ) {
        throw new BadRequestException(
          'PAP sector cannot be changed after a program has been submitted',
        );
      }
      if (
        dto.papSubsectorCode !== undefined &&
        dto.papSubsectorCode !== program.papSubsectorCode
      ) {
        throw new BadRequestException(
          'PAP subsector code cannot be changed after a program has been submitted',
        );
      }
      if (
        dto.finishLineId !== undefined &&
        dto.finishLineId !== program.finishLineId
      ) {
        throw new BadRequestException(
          `${GOAL} cannot be changed after a program has been submitted`,
        );
      }
    }

    // The other half of the exclusivity rule enforced in
    // `ProjectActivitiesService.create`: a program cannot start stating its own
    // costs while PPAs still hang off it, or its total would stop equalling
    // what is visible underneath.
    if (dto.costMode === PPACostMode.DIRECT_COSTS) {
      const paCount = await this.prisma.projectActivity.count({
        where: { programId: id },
      });
      if (paCount > 0) {
        throw new ConflictException(
          `This program has ${paCount} project/activity row(s), so it cannot also state its own costs. Remove them first.`,
        );
      }
    }

    const mergedPeriod = {
      implementationStartMonth:
        dto.implementationStartMonth !== undefined
          ? dto.implementationStartMonth
          : program.implementationStartMonth,
      implementationStartYear:
        dto.implementationStartYear !== undefined
          ? dto.implementationStartYear
          : program.implementationStartYear,
      implementationEndMonth:
        dto.implementationEndMonth !== undefined
          ? dto.implementationEndMonth
          : program.implementationEndMonth,
      implementationEndYear:
        dto.implementationEndYear !== undefined
          ? dto.implementationEndYear
          : program.implementationEndYear,
    };

    // Basic period validation first (pure input — no DB needed).
    this.validateImplementationPeriod(mergedPeriod);

    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id: program.aipCycleId },
      select: { fiscalYear: true },
    });
    this.validateImplementationPeriod(mergedPeriod, cycle?.fiscalYear);

    // Validate referenced FKs if changed.
    if (dto.finishLineId && dto.finishLineId !== program.finishLineId) {
      const fl = await this.prisma.finishLine.findUnique({
        where: { id: dto.finishLineId },
      });
      if (!fl) throw new NotFoundException(`${GOAL} not found`);
    }
    if (dto.papSectorId && dto.papSectorId !== program.papSectorId) {
      const pap = await this.prisma.pAPSector.findUnique({
        where: { id: dto.papSectorId },
      });
      if (!pap) throw new NotFoundException('PAP sector not found');
    }
    if (dto.sglgIndicatorId) {
      const sglg = await this.prisma.sGLGIndicator.findUnique({
        where: { id: dto.sglgIndicatorId },
      });
      if (!sglg) throw new NotFoundException('SGLG indicator not found');
    }
    if (
      dto.subFinishLineId !== undefined &&
      dto.subFinishLineId !== null &&
      dto.subFinishLineId !== program.subFinishLineId
    ) {
      const sub = await this.prisma.subFinishLine.findUnique({
        where: { id: dto.subFinishLineId },
      });
      if (!sub)
        throw new NotFoundException(`Sub-${GOAL.toLowerCase()} not found`);
    }
    // Reassigning the implementing office. The office supplies two segments of
    // the AIP reference code, so the tentative code is re-issued below inside
    // the same transaction.
    const officeChanged =
      dto.officeId !== undefined && dto.officeId !== program.officeId;
    if (officeChanged) {
      const office = await this.prisma.office.findUnique({
        where: { id: dto.officeId! },
        select: { id: true },
      });
      if (!office) throw new NotFoundException('Office not found');
      // assertOwner (above) already covered the *current* office. The target
      // office needs its own check, or a scoped user could move a program out
      // of their own scope and immediately lose access to it.
      if (user.role !== Role.SUPER_ADMIN) {
        try {
          await this.officeScope.assertOfficeInScope(user, dto.officeId!);
        } catch {
          throw new ForbiddenException(
            'You can only reassign a program to an office in your assigned scope',
          );
        }
      }
    }

    // The office the program will have *after* this update — supporting offices
    // are validated against the incoming office, not the one being replaced.
    const effectiveOfficeId = officeChanged ? dto.officeId! : program.officeId;

    // The sector is the code's first segment and part of the ordinal's scope.
    // It was previously ignored on update, so a program moved between sectors
    // kept a code that named the old one.
    const sectorChanged =
      dto.papSectorId !== undefined && dto.papSectorId !== program.papSectorId;
    // The AIP form section is code segment 5 *and* the bucket the ordinal
    // restarts in, so moving a program between sections both restates its own
    // code and renumbers the sections it leaves and joins.
    //
    // `papSubsectorCode` is deliberately absent: the code-format realignment
    // replaced that segment with papClass, so editing it restates nothing.
    // (It stays immutable after submit for classification reasons, above.)
    const papClassChanged =
      dto.papClass !== undefined && dto.papClass !== program.papClass;
    const codeInputsChanged = officeChanged || sectorChanged || papClassChanged;

    // Validate against the office the program will *have*, and re-check even
    // when only the office moved: a program already hosted by X that is
    // reassigned to X would otherwise end up hosting itself.
    const effectiveHostOfficeId =
      dto.hostOfficeId !== undefined ? dto.hostOfficeId : program.hostOfficeId;
    await this.assertHostOfficeValid(effectiveHostOfficeId, effectiveOfficeId);

    if (dto.supportingOfficeIds !== undefined) {
      if (
        effectiveOfficeId &&
        dto.supportingOfficeIds.includes(effectiveOfficeId)
      ) {
        throw new BadRequestException(
          'Supporting offices must not include the implementing office',
        );
      }
      if (dto.supportingOfficeIds.length > 0) {
        const found = await this.prisma.office.findMany({
          where: { id: { in: dto.supportingOfficeIds } },
          select: { id: true },
        });
        if (found.length !== new Set(dto.supportingOfficeIds).size) {
          throw new NotFoundException(
            'One or more supporting offices not found',
          );
        }
      }
    }

    await this.assertSdgGoalsExist(dto.sdgGoalIds);

    // Diffed against the loaded row *before* the write, restricted to the shared
    // allow-list. A no-op PATCH produces no row (D22).
    const changes = diffFields(
      program,
      dto as unknown as Record<string, unknown>,
      PROGRAM_AUDIT_FIELDS,
    );

    return this.prisma.$transaction(async (tx) => {
      if (dto.supportingOfficeIds !== undefined) {
        await tx.programSupportingOffice.deleteMany({
          where: { programId: id },
        });
        if (dto.supportingOfficeIds.length > 0) {
          await tx.programSupportingOffice.createMany({
            data: dto.supportingOfficeIds.map((officeId) => ({
              programId: id,
              officeId,
            })),
          });
        }
      }

      // Replace the whole set, same as supporting offices above.
      //
      // ponytail: like `supportingOfficeIds`, SDG tags are outside
      // PROGRAM_AUDIT_FIELDS (a scalar allow-list) and outside the version
      // snapshot, so an SDG edit is not logged in the History tab and survives
      // a discarded revision untouched. Bringing relation arrays into both is
      // one change covering every junction field, not an SDG-only fix.
      if (dto.sdgGoalIds !== undefined) {
        await tx.programSDGGoal.deleteMany({ where: { programId: id } });
        if (dto.sdgGoalIds.length > 0) {
          await tx.programSDGGoal.createMany({
            data: [...new Set(dto.sdgGoalIds)].map((sdgGoalId) => ({
              programId: id,
              sdgGoalId,
            })),
          });
        }
      }

      // The office supplies two segments of the code and the sector supplies a
      // third, and the ordinal is ranked per (cycle, office, sector) — so any
      // of these moves the program to a different scope. The code itself is not
      // written here; the resync after the update derives it.
      //
      // ponytail: only tentative codes resync. `aipReferenceCode` (the final
      // code, issued at publish) is deliberately left as-is; reconciling it —
      // and the child PA codes derived from it — belongs to the final-code
      // phase. See docs/design/tentative-aip-code-rework.md §2 "Parked".
      const scopeChanged = officeChanged || sectorChanged;
      const nextOrderIndex = scopeChanged
        ? ((
            await tx.program.aggregate({
              where: {
                aipCycleId: program.aipCycleId,
                officeId: effectiveOfficeId,
                papSectorId: dto.papSectorId ?? program.papSectorId,
                deletedAt: null,
              },
              _max: { orderIndex: true },
            })
          )._max.orderIndex ?? 0) + 1
        : null;

      const updated = await tx.program.update({
        where: { id },
        data: {
          ...(scopeChanged ? { orderIndex: nextOrderIndex! } : {}),
          ...(officeChanged ? { officeId: dto.officeId } : {}),
          ...(dto.hostOfficeId !== undefined
            ? { hostOfficeId: dto.hostOfficeId }
            : {}),
          ...(dto.papSectorId !== undefined
            ? { papSectorId: dto.papSectorId }
            : {}),
          ...(dto.papSubsectorCode !== undefined
            ? { papSubsectorCode: dto.papSubsectorCode }
            : {}),
          ...(dto.papClass !== undefined ? { papClass: dto.papClass } : {}),
          ...(dto.finishLineId !== undefined
            ? { finishLineId: dto.finishLineId }
            : {}),
          ...(dto.subFinishLineId !== undefined
            ? { subFinishLineId: dto.subFinishLineId }
            : {}),
          ...(dto.sglgIndicatorId !== undefined
            ? { sglgIndicatorId: dto.sglgIndicatorId }
            : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
          ...(dto.expectedOutput !== undefined
            ? { expectedOutput: dto.expectedOutput }
            : {}),
          ...(dto.targetForBudgetYear !== undefined
            ? { targetForBudgetYear: dto.targetForBudgetYear }
            : {}),
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
          ...(dto.costMode !== undefined ? { costMode: dto.costMode } : {}),
          ...(dto.fundSources !== undefined
            ? { fundSources: dto.fundSources }
            : {}),
          // Decimal strings on the wire, Prisma.Decimal at the boundary — money
          // never touches Number. Only meaningful in DIRECT_COSTS, where these
          // are the office's own figures rather than a rollup.
          ...(dto.psProposedTotal !== undefined
            ? {
                psProposedTotal:
                  dto.psProposedTotal === null
                    ? new Prisma.Decimal(0)
                    : new Prisma.Decimal(dto.psProposedTotal),
              }
            : {}),
          ...(dto.mooeProposedTotal !== undefined
            ? {
                mooeProposedTotal:
                  dto.mooeProposedTotal === null
                    ? new Prisma.Decimal(0)
                    : new Prisma.Decimal(dto.mooeProposedTotal),
              }
            : {}),
          ...(dto.feProposedTotal !== undefined
            ? {
                feProposedTotal:
                  dto.feProposedTotal === null
                    ? new Prisma.Decimal(0)
                    : new Prisma.Decimal(dto.feProposedTotal),
              }
            : {}),
          ...(dto.coProposedTotal !== undefined
            ? {
                coProposedTotal:
                  dto.coProposedTotal === null
                    ? new Prisma.Decimal(0)
                    : new Prisma.Decimal(dto.coProposedTotal),
              }
            : {}),
        },
      });

      if (dto.fundAllocations !== undefined) {
        if (
          dto.fundAllocations.length &&
          updated.costMode !== PPACostMode.DIRECT_COSTS
        )
          throw new BadRequestException(
            'Only a program that states its own costs can split them by fund',
          );
        await replaceFundAllocations(
          { programId: id },
          dto.fundAllocations,
          tx,
        );
      }
      // Whenever the mode or any of its four figures moves, `proposedTotal`
      // has to follow. Same transaction, so the row is never briefly wrong.
      if (
        dto.fundAllocations !== undefined ||
        dto.costMode !== undefined ||
        dto.psProposedTotal !== undefined ||
        dto.mooeProposedTotal !== undefined ||
        dto.feProposedTotal !== undefined ||
        dto.coProposedTotal !== undefined
      ) {
        await this.estimates.recomputeProgram(id, tx);
      }

      await this.audit.record(
        {
          programId: id,
          action: ProgramAuditAction.PROGRAM_UPDATED,
          actor: user,
          onBehalfOfOfficeId: program.officeId,
          summary: summarizeFieldChanges(changes),
          changes,
        },
        tx,
      );

      if (codeInputsChanged) {
        // Old scope first: it frees the vacated ordinal before the new scope
        // can claim it, which keeps the unique constraint satisfied.
        if (scopeChanged && program.officeId) {
          await this.codes.resyncTentativeProgramCodes(
            {
              aipCycleId: program.aipCycleId,
              officeId: program.officeId,
              papSectorId: program.papSectorId,
            },
            tx,
          );
        }
        if (effectiveOfficeId) {
          await this.codes.resyncTentativeProgramCodes(
            {
              aipCycleId: program.aipCycleId,
              officeId: effectiveOfficeId,
              papSectorId: dto.papSectorId ?? program.papSectorId,
            },
            tx,
          );
        }
        return tx.program.findUniqueOrThrow({ where: { id } });
      }

      return updated;
    });
  }

  /**
   * Rank programs within one code scope by hand.
   *
   * The ordinal is scoped to (cycle, implementing office, PAP sector), so a
   * payload spanning more than one scope is rejected rather than silently
   * reordering rows whose codes could not follow the drag.
   */
  async reorder(dto: ReorderProgramsDto, user: JwtPayload) {
    const given = new Set(dto.ids);
    if (given.size !== dto.ids.length) {
      throw new BadRequestException('Duplicate ids in reorder payload');
    }

    const programs = await this.prisma.program.findMany({
      where: { id: { in: dto.ids }, ...LIVE_PROGRAM },
      select: {
        id: true,
        aipCycleId: true,
        officeId: true,
        papSectorId: true,
        status: true,
      },
    });
    if (programs.length !== dto.ids.length) {
      throw new NotFoundException('One or more programs not found');
    }

    const first = programs[0];
    if (!first.officeId) {
      throw new BadRequestException(
        'Programs without an implementing office have no code scope to reorder within',
      );
    }
    const sameScope = programs.every(
      (p) =>
        p.aipCycleId === first.aipCycleId &&
        p.officeId === first.officeId &&
        p.papSectorId === first.papSectorId,
    );
    if (!sameScope) {
      throw new BadRequestException(
        'All programs in a reorder must share one cycle, implementing office and PAP sector — numbering restarts per scope',
      );
    }

    await this.assertOwner(first, user);

    // The payload must be the complete scope: a partial list would leave the
    // omitted programs ranked arbitrarily against the ones just moved.
    const scopeCount = await this.prisma.program.count({
      where: {
        aipCycleId: first.aipCycleId,
        officeId: first.officeId,
        papSectorId: first.papSectorId,
        ...LIVE_PROGRAM,
      },
    });
    if (scopeCount !== dto.ids.length) {
      throw new BadRequestException(
        'Reorder payload must list every program in the scope exactly once',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const [index, id] of dto.ids.entries()) {
        await tx.program.update({
          where: { id },
          data: { orderIndex: index + 1 },
        });
      }
      await this.codes.resyncTentativeProgramCodes(
        {
          aipCycleId: first.aipCycleId,
          officeId: first.officeId!,
          papSectorId: first.papSectorId,
        },
        tx,
      );
      return tx.program.findMany({
        where: {
          aipCycleId: first.aipCycleId,
          officeId: first.officeId,
          papSectorId: first.papSectorId,
          ...LIVE_PROGRAM,
        },
        // Same order the codes were just ranked in
        // (AIPCodesService.resyncTentativeProgramCodes) and the same order the
        // registry renders, so the caller can apply these codes to the list it
        // is already showing.
        orderBy: [
          { papClass: { sort: 'asc', nulls: 'last' } },
          { orderIndex: 'asc' },
          { createdAt: 'asc' },
        ],
        select: { id: true, orderIndex: true, tentativeAipReferenceCode: true },
      });
    });
  }

  async softDelete(id: string, user: JwtPayload) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program || program.deletedAt)
      throw new NotFoundException('Program not found');
    await this.assertOwner(program, user);
    // An archived program is kept for its history — not even SUPER_ADMIN may
    // delete it (specs/013); unarchive it first.
    if (program.status === ProgramStatus.ARCHIVED) {
      throw new BadRequestException(
        'Archived programs cannot be deleted; unarchive first',
      );
    }
    // Carve-out (§3.1): deletion uses the narrower set, so a published AIP is
    // never deletable — not even while a revision is open.
    if (!isDeletableStatus(program.status) && user.role !== Role.SUPER_ADMIN) {
      throw new BadRequestException(
        'Programs can only be deleted while in DRAFT or FOR_REVISION; SUPER_ADMIN may override',
      );
    }

    /**
     * Cascade soft-delete to child project activities and line items.
     *
     * Design note: Only DRAFT programs can be deleted. Because ProgramVersions,
     * ProgramVerdicts, ProgramEndorsements, etc. are only created on DRAFT → SUBMITTED
     * transition, a DRAFT program should never have these records. We therefore cascade
     * only to ProjectActivities and LineItems. Should a non-DRAFT program be deleted
     * (SUPER_ADMIN override), any orphaned ProgramVersion/Verdict/Endorsement rows will
     * be left in the database but logically isolated (their program is deleted). This is
     * acceptable because they cannot be queried via the public API once the program is
     * soft-deleted. Hard-delete of all cascades can be added as a future admin endpoint
     * if audit-trail pruning becomes necessary.
     */
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Hard-delete all child project activities (LineItem and ClimateChangeTag
      // cascade via Postgres onDelete: Cascade on projectActivityId FK).
      await tx.projectActivity.deleteMany({ where: { programId: id } });

      // Soft-delete the program, and hand its tentative code back to the scope.
      //
      // `tentative_aip_reference_code` is unique across the whole table — the
      // index does not care about `deleted_at`. A dead row that keeps its code
      // therefore keeps that code permanently taken, so the resync below (and
      // every later create/reorder in the scope) renumbers a live sibling
      // straight into it and aborts the transaction. Park the dead row on the
      // same `~<id>` sentinel `create` and `writeCodesWithoutCollision` use.
      await tx.program.update({
        where: { id },
        data: { deletedAt: now, tentativeAipReferenceCode: `~${id}` },
      });

      // Close the gap this leaves in the scope's numbering.
      if (program.officeId) {
        await this.codes.resyncTentativeProgramCodes(
          {
            aipCycleId: program.aipCycleId,
            officeId: program.officeId,
            papSectorId: program.papSectorId,
          },
          tx,
        );
      }
    });

    // Removing a row moves the tab counts, and a published program disappearing
    // changes the public list too.
    await this.registryCache.invalidateAll();

    return { message: 'Program deleted.' };
  }

  // ─── Read state (unread dot) ──────────────────────────────────────────────

  /**
   * Mark a program as seen by the current user — bumps `lastSeenAt` to now.
   * Called when the user opens the program drawer; clears the unread dot.
   */
  async markSeen(programId: string, user: JwtPayload) {
    await this.assertCanRead(programId, user);
    const now = new Date();
    await this.prisma.programReadState.upsert({
      where: { userId_programId: { userId: user.sub, programId } },
      create: { userId: user.sub, programId, lastSeenAt: now },
      update: { lastSeenAt: now },
    });
    return { lastSeenAt: now };
  }

  // ─── Endorsement status ───────────────────────────────────────────────────

  /**
   * Per-endorser-office endorsement status for the program's current version.
   * Powers the drawer's endorsement panel.
   */
  async listEndorsements(programId: string, user: JwtPayload) {
    await this.assertCanRead(programId, user);
    const full = await this.prisma.program.findUnique({
      where: { id: programId },
      select: { currentVersion: true },
    });
    if (!full || full.currentVersion === 0) {
      return { version: 0, endorsements: [] };
    }
    const versionRow = await this.prisma.programVersion.findUnique({
      where: {
        programId_version: { programId, version: full.currentVersion },
      },
      select: { id: true },
    });
    if (!versionRow) return { version: full.currentVersion, endorsements: [] };

    const endorsements = await this.prisma.programEndorsement.findMany({
      where: { programVersionId: versionRow.id },
      include: {
        // Polymorphic endorser (§3.3): an LGU office, a CSO representative, or
        // the NCPC umbrella head (both endorser FKs null). The client labels the
        // row from endorserType + whichever relation is populated.
        endorserOffice: {
          select: { id: true, name: true, acronym: true },
        },
        endorserCso: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: [{ endorserType: 'asc' }, { createdAt: 'asc' }],
    });
    return { version: full.currentVersion, endorsements };
  }
}
