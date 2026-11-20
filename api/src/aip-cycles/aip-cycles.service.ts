import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../cache/cache.service.js';
import { RegistryCacheService } from '../cache/registry-cache.service.js';
import { AIP_CYCLE_TTL_SECONDS } from '../cache/cache.constants.js';
import { AIPCycleStatus, ProgramStatus } from '../generated/prisma/index';
import { createAipCycle } from '../budget-cycles/ensure-budget-cycle.js';
import { loadCycleSections } from '../budget-cycles/cycle-sections.js';
import type { PublicOverviewSection } from './dto/update-public-overview.dto.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { CreateAIPCycleDto } from './dto/create-aip-cycle.dto.js';
import { AIP_CYCLE_LIST_KEY, aipCycleKey } from './aip-cycles.cache-keys.js';
import { ENDORSABLE_PROGRAM_STATUSES } from '../programs/program-status.constants.js';
import {
  endorserOwnRowWhere,
  isCitywideEndorser,
  resolveEndorserIdentity,
  type EndorserIdentity,
} from '../common/endorser-identity.js';

/**
 * AIPCycle lifecycle — the AIP stage of a Budget Cycle (specs/012):
 *   PLANNING ─set ceilings─► OPEN ─freeze new submits─► CLOSED ─nothing unfinished─► ADOPTED
 * "Nothing unfinished": every live program is PUBLISHED (or, for the archived
 * approval workflow, APPROVED / REJECTED). LOCKED is the pre-012 name for
 * ADOPTED; a request for LOCKED adopts, and LOCKED rows read as adopted.
 * Adopting the AIP does not make the year an Annual Budget — an enacted
 * Ordinance does (budget-cycles/cycle-sections.ts).
 * Only SUPER_ADMIN may transition. Transitions are guarded by service-layer checks.
 */
/** Program states that count as finished when adopting an AIP. */
const ADOPTABLE_PROGRAM_STATUSES: ProgramStatus[] = [
  ProgramStatus.PUBLISHED,
  ProgramStatus.APPROVED,
  ProgramStatus.REJECTED,
  // Superseded and counted nowhere (specs/013) — never a reason to hold the
  // AIP open.
  ProgramStatus.ARCHIVED,
];

@Injectable()
export class AIPCyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly registryCache: RegistryCacheService,
  ) {}

  async create(dto: CreateAIPCycleDto) {
    const existing = await this.prisma.aIPCycle.findUnique({
      where: { fiscalYear: dto.fiscalYear },
    });
    if (existing) {
      throw new ConflictException(
        `AIP cycle for fiscal year ${dto.fiscalYear} already exists`,
      );
    }
    const created = await this.prisma.$transaction((tx) =>
      createAipCycle(tx, { fiscalYear: dto.fiscalYear }),
    );
    await this.cache.del(AIP_CYCLE_LIST_KEY);
    return created;
  }

  findAll() {
    return this.cache.getOrSet(AIP_CYCLE_LIST_KEY, AIP_CYCLE_TTL_SECONDS, () =>
      this.prisma.aIPCycle.findMany({
        orderBy: { fiscalYear: 'desc' },
        // Live programs only: a retired year (specs/012 P3) reads 0, not its old rows.
        include: {
          _count: {
            select: {
              ceilings: true,
              programs: { where: { deletedAt: null } },
            },
          },
        },
      }),
    );
  }

  async findOne(id: string) {
    const cycle = await this.cache.getOrSet(
      aipCycleKey(id),
      AIP_CYCLE_TTL_SECONDS,
      () =>
        this.prisma.aIPCycle.findUnique({
          where: { id },
          include: {
            ceilings: {
              include: {
                finishLine: {
                  select: { id: true, name: true, visionNumber: true },
                },
              },
              orderBy: { finishLine: { visionNumber: 'asc' } },
            },
            _count: { select: { programs: { where: { deletedAt: null } } } },
            budgetCycle: {
              select: { id: true, currentStage: true, alongsideStages: true },
            },
          },
        }),
    );
    if (!cycle) throw new NotFoundException('AIP cycle not found');
    // Which public sections the year is in — the same rule the public site
    // uses, so the control panel can't disagree with it (specs/012).
    const sections = (await loadCycleSections(this.prisma)).get(cycle.id) ?? [];
    return { ...cycle, sections };
  }

  /** Invalidate the list and a single cycle's entry after a write. */
  private async invalidate(id: string): Promise<void> {
    await Promise.all([
      this.cache.del(AIP_CYCLE_LIST_KEY),
      this.cache.del(aipCycleKey(id)),
    ]);
  }

  /**
   * Turn the public year-on-year comparison on or off for a cycle.
   *
   * Deliberately a human decision rather than a coverage threshold. The AIP fills
   * up office by office, and a "+6% versus last year" derived from a third of the
   * offices is not an approximation — it is a different number that looks like an
   * answer. No rule knows when the budget office considers the proposal
   * comparable, so the switch is theirs.
   */
  async setPublicComparison(id: string, enabled: boolean) {
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!cycle) throw new NotFoundException('AIP cycle not found');

    const updated = await this.prisma.aIPCycle.update({
      where: { id },
      data: { publicComparisonEnabled: enabled },
    });
    await this.invalidate(id);
    return updated;
  }

  /** Show or hide one public section's Overview tab for this year. */
  async setPublicOverview(
    id: string,
    section: PublicOverviewSection,
    enabled: boolean,
  ) {
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!cycle) throw new NotFoundException('AIP cycle not found');

    const column = {
      AIP: 'publicAipOverviewEnabled',
      ANNUAL: 'publicAnnualOverviewEnabled',
      PPMP: 'publicPpmpOverviewEnabled',
    } as const;
    const updated = await this.prisma.aIPCycle.update({
      where: { id },
      data: { [column[section]]: enabled },
    });
    await this.invalidate(id);
    return updated;
  }

  /**
   * Open or close a cycle's open data (specs/007): the yearly download and the
   * `/api/v1/open-data` routes for that year. Off by default, so nothing is
   * shared until a super admin decides to. Drops the public registry cache, which
   * holds the open-data bundle, so a closed year cannot be served from cache.
   */
  async setOpenData(id: string, enabled: boolean) {
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!cycle) throw new NotFoundException('AIP cycle not found');

    const updated = await this.prisma.aIPCycle.update({
      where: { id },
      data: { openDataEnabled: enabled },
    });
    await Promise.all([
      this.invalidate(id),
      this.registryCache.invalidatePublicRegistry(),
    ]);
    return updated;
  }

  async transitionStatus(id: string, target: AIPCycleStatus) {
    const cycle = await this.prisma.aIPCycle.findUnique({ where: { id } });
    if (!cycle) throw new NotFoundException('AIP cycle not found');

    if (cycle.status === target) {
      throw new BadRequestException(`Cycle is already ${target}`);
    }

    const now = new Date();

    switch (target) {
      case AIPCycleStatus.OPEN: {
        if (cycle.status !== AIPCycleStatus.PLANNING) {
          throw new BadRequestException(
            `Cannot transition from ${cycle.status} to OPEN`,
          );
        }
        const ceilingCount = await this.prisma.finishLineBudgetCeiling.count({
          where: { aipCycleId: id },
        });
        if (ceilingCount === 0) {
          throw new BadRequestException(
            'Configure at least one finish-line budget ceiling before opening the cycle',
          );
        }
        const opened = await this.prisma.aIPCycle.update({
          where: { id },
          data: { status: AIPCycleStatus.OPEN, openedAt: now },
        });
        await this.invalidate(id);
        return opened;
      }
      case AIPCycleStatus.CLOSED: {
        if (cycle.status !== AIPCycleStatus.OPEN) {
          throw new BadRequestException(
            `Cannot transition from ${cycle.status} to CLOSED`,
          );
        }
        const closed = await this.prisma.aIPCycle.update({
          where: { id },
          data: { status: AIPCycleStatus.CLOSED, closedAt: now },
        });
        await this.invalidate(id);
        return closed;
      }
      case AIPCycleStatus.LOCKED:
      case AIPCycleStatus.ADOPTED: {
        if (cycle.status !== AIPCycleStatus.CLOSED) {
          throw new BadRequestException(
            `Cannot transition from ${cycle.status} to ADOPTED`,
          );
        }
        // An AIP is final when nothing in it is still being worked on. Published
        // programs count as final (they could never lock before: #81); drafts and
        // unpublished revisions, and anything mid-way through the archived
        // approval chain, block it.
        const unfinished = await this.prisma.program.count({
          where: {
            aipCycleId: id,
            deletedAt: null,
            status: { notIn: ADOPTABLE_PROGRAM_STATUSES },
          },
        });
        if (unfinished > 0) {
          throw new ConflictException(
            `Cannot adopt the AIP: ${unfinished} program(s) are still drafts or unpublished revisions`,
          );
        }
        const adopted = await this.prisma.aIPCycle.update({
          where: { id },
          data: { status: AIPCycleStatus.ADOPTED, lockedAt: now },
        });
        await this.invalidate(id);
        return adopted;
      }
      case AIPCycleStatus.PLANNING:
        throw new BadRequestException(
          'Cannot revert a cycle to PLANNING; create a new cycle instead',
        );
      default:
        throw new BadRequestException(
          `Unknown target status: ${String(target)}`,
        );
    }
  }

  // ─── Endorser view ────────────────────────────────────────────────────────

  /**
   * Authorize an endorser (LGU office HEAD, NCPC umbrella head, or CSO rep) and
   * return their identity. LGU and NCPC umbrella endorsers are citywide; CSO
   * representatives are scoped to their CSO's cluster.
   */
  private async assertEndorser(user: JwtPayload): Promise<EndorserIdentity> {
    const identity = await resolveEndorserIdentity(this.prisma, user);
    if (!identity) {
      throw new ForbiddenException(
        'Only an endorser (office HEAD, NCPC head, or CSO representative) may access this resource',
      );
    }
    return identity;
  }

  /**
   * Proponent city offices that have ≥1 endorsable program (under active review,
   * SUBMITTED…PENDING_APPROVAL) in the given cycle. Endorsement is advisory and
   * at-will, so the whole review window is shown (not a PENDING_ENDORSEMENT gate).
   * CSO representatives only see proponent offices in their own cluster.
   */
  async getEndorserOffices(cycleId: string, user: JwtPayload) {
    const identity = await this.assertEndorser(user);
    const csoClusterId = await this.getCsoClusterId(identity);
    return this.prisma.office.findMany({
      where: {
        ...(csoClusterId ? { clusterId: csoClusterId } : {}),
        programs: {
          some: {
            aipCycleId: cycleId,
            status: { in: ENDORSABLE_PROGRAM_STATUSES },
            deletedAt: null,
          },
        },
      },
      select: { id: true, name: true, acronym: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Endorsable programs (SUBMITTED…PENDING_APPROVAL) for a given proponent office
   * in a cycle, with PAs (no line items). Each program carries the caller office's
   * own endorsement rows so the client can show whether the current version is
   * already endorsed by this office. CSO representatives may only open offices
   * in their own cluster.
   */
  async getProgramsForEndorserView(
    cycleId: string,
    officeId: string,
    user: JwtPayload,
  ) {
    const identity = await this.assertEndorser(user);
    const csoClusterId = await this.getCsoClusterId(identity);
    if (csoClusterId) {
      const office = await this.prisma.office.findUnique({
        where: { id: officeId },
        select: { clusterId: true },
      });
      if (!office || office.clusterId !== csoClusterId) {
        throw new ForbiddenException(
          'CSO endorsers may only view proponent offices in their cluster',
        );
      }
    }
    return this.prisma.program.findMany({
      where: {
        aipCycleId: cycleId,
        officeId: officeId,
        status: { in: ENDORSABLE_PROGRAM_STATUSES },
        deletedAt: null,
      },
      include: {
        projectActivities: {
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
        },
        papSector: { select: { id: true, code: true, name: true } },
        finishLine: { select: { id: true, name: true, visionNumber: true } },
        endorsements: {
          where: endorserOwnRowWhere(identity),
          select: {
            notes: true,
            endorsedAt: true,
            programVersion: { select: { version: true } },
          },
        },
      },
      orderBy: { tentativeAipReferenceCode: 'asc' },
    });
  }

  private async getCsoClusterId(
    identity: EndorserIdentity,
  ): Promise<string | null> {
    if (isCitywideEndorser(identity) || !identity.csoId) {
      return null;
    }
    const cso = await this.prisma.civilSocietyOrganization.findUnique({
      where: { id: identity.csoId },
      select: { clusterId: true },
    });
    return cso?.clusterId ?? null;
  }
}
