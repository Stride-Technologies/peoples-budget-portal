import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../cache/cache.service.js';
import { AIPCodesService } from '../aip-codes/aip-codes.service.js';
import {
  REFERENCE_KEY_PREFIX,
  REFERENCE_TTL_SECONDS,
} from '../cache/cache.constants.js';
import type { UpdateClusterDto } from './dto/update-cluster.dto.js';
import type { UpdateFinishLineDto } from './dto/update-finish-line.dto.js';
import type {
  CreateSubFinishLineDto,
  UpdateSubFinishLineDto,
} from './dto/create-sub-finish-line.dto.js';
import type {
  CreateOfficeDto,
  UpdateOfficeDto,
} from './dto/create-office.dto.js';
import type { CreateCsoDto, UpdateCsoDto } from './dto/create-cso.dto.js';
import type {
  CreatePapSectorDto,
  UpdatePapSectorDto,
} from './dto/create-pap-sector.dto.js';
import type {
  CreateUacsObjectDto,
  UpdateUacsObjectDto,
} from './dto/create-uacs-object.dto.js';
import type {
  CreateClimateTypologyCodeDto,
  UpdateClimateTypologyCodeDto,
} from './dto/create-climate-typology-code.dto.js';
import type {
  CreateSglgIndicatorDto,
  UpdateSglgIndicatorDto,
} from './dto/create-sglg-indicator.dto.js';
import type {
  CreateSdgGoalDto,
  UpdateSdgGoalDto,
} from './dto/create-sdg-goal.dto.js';
import { ClimatePillar, ExpenseClass, Prisma } from '../generated/prisma/index';
import { GOAL } from '../common/brand.js';

@Injectable()
export class ReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly codes: AIPCodesService,
  ) {}

  /**
   * Drop every cached reference entry. Reference data is tiny and cross-linked
   * (clusters embed offices and finish lines, offices embed clusters), so any
   * reference write wipes the whole `ref:` group rather than tracking per-key
   * dependencies.
   */
  private invalidate(): Promise<void> {
    return this.cache.delByPrefix(REFERENCE_KEY_PREFIX);
  }

  flushCache(): Promise<void> {
    return this.invalidate();
  }

  // ─── Clusters ────────────────────────────────────────────────────────────────

  findAllClusters() {
    return this.cache.getOrSet('ref:clusters', REFERENCE_TTL_SECONDS, () =>
      this.prisma.cluster.findMany({
        include: {
          offices: {
            where: { isActive: true },
            orderBy: { acronym: 'asc' },
          },
          finishLineClusters: {
            include: {
              finishLine: {
                select: { id: true, name: true, visionNumber: true },
              },
            },
            orderBy: { finishLine: { visionNumber: 'asc' } },
          },
        },
        orderBy: { name: 'asc' },
      }),
    );
  }

  findAllClustersAdmin() {
    return this.prisma.cluster.findMany({
      include: {
        offices: { orderBy: { acronym: 'asc' } },
        finishLineClusters: {
          include: {
            finishLine: {
              select: { id: true, name: true, visionNumber: true },
            },
          },
          orderBy: { finishLine: { visionNumber: 'asc' } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async updateCluster(id: string, dto: UpdateClusterDto) {
    await this.findClusterOrFail(id);
    const updated = await this.prisma.cluster.update({
      where: { id },
      data: dto,
    });
    await this.invalidate();
    return updated;
  }

  private async findClusterOrFail(id: string) {
    const cluster = await this.prisma.cluster.findUnique({ where: { id } });
    if (!cluster) throw new NotFoundException('Cluster not found');
    return cluster;
  }

  // ─── Offices ──────────────────────────────────────────────────────────────

  findAllOffices() {
    return this.cache.getOrSet('ref:offices', REFERENCE_TTL_SECONDS, () =>
      this.prisma.office.findMany({
        where: { isActive: true },
        include: {
          cluster: { select: { id: true, name: true, fullName: true } },
          papSector: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ cluster: { name: 'asc' } }, { acronym: 'asc' }],
      }),
    );
  }

  /**
   * The admin catalog view, ordered the way the city's coding sheet prints:
   * mandatory offices first, then optional, then others, by code within each.
   * Uncoded offices sort last rather than leading with a block of nulls.
   */
  findAllOfficesAll() {
    return this.prisma.office.findMany({
      include: {
        cluster: { select: { id: true, name: true, fullName: true } },
        papSector: { select: { id: true, code: true, name: true } },
      },
      orderBy: [
        { officeType: { sort: 'asc', nulls: 'last' } },
        { officeCode: { sort: 'asc', nulls: 'last' } },
        { acronym: 'asc' },
      ],
    });
  }

  async createOffice(dto: CreateOfficeDto) {
    const created = await this.prisma.office.create({ data: dto });
    await this.invalidate();
    return created;
  }

  /**
   * `officeCode` and `officeType` are AIP code segments (§7), so editing either
   * one invalidates the tentative code of every PPA under this office. The
   * update and the resync share a transaction — a half-applied rename would
   * leave codes pointing at a segment value that no longer exists.
   *
   * `papSectorId` is deliberately NOT in the check: it is the office's usual
   * sector, used only to pre-select a form field. The code's sector segment
   * comes from `Program.papSectorId`, so changing the office's never moves a
   * code — adding it here would resync thousands of rows for nothing.
   */
  async updateOffice(id: string, dto: UpdateOfficeDto) {
    const before = await this.findOfficeOrFail(id);
    const segmentChanged =
      (dto.officeCode !== undefined && dto.officeCode !== before.officeCode) ||
      (dto.officeType !== undefined && dto.officeType !== before.officeType);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.office.update({ where: { id }, data: dto });
      if (segmentChanged) await this.resyncCodesForOffice(id, tx);
      return row;
    });

    await this.invalidate();
    return updated;
  }

  async deactivateOffice(id: string): Promise<{ message: string }> {
    await this.findOfficeOrFail(id);
    await this.prisma.office.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidate();
    return { message: 'Office deactivated.' };
  }

  private async findOfficeOrFail(id: string) {
    const office = await this.prisma.office.findUnique({ where: { id } });
    if (!office) throw new NotFoundException('Office not found');
    return office;
  }

  /**
   * Rewrite the tentative AIP codes of every PPA under one office.
   *
   * Tentative codes embed the office's code and type, so they go stale the
   * moment either is edited. Resync is per code scope
   * (`aipCycleId` × `officeId` × `papSectorId`) because that is the unit
   * `AIPCodesService` ranks within. Final codes are immutable and untouched.
   */
  private async resyncCodesForOffice(
    officeId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const scopes = await tx.program.findMany({
      where: { officeId, deletedAt: null },
      select: { aipCycleId: true, papSectorId: true },
      distinct: ['aipCycleId', 'papSectorId'],
    });
    for (const scope of scopes) {
      await this.codes.resyncTentativeProgramCodes(
        {
          aipCycleId: scope.aipCycleId,
          officeId,
          papSectorId: scope.papSectorId,
        },
        tx,
      );
    }
  }

  // ─── Civil society organizations ──────────────────────────────────────────

  findAllCivilSocietyOrganizations() {
    return this.cache.getOrSet(
      'ref:civil-society-organizations',
      REFERENCE_TTL_SECONDS,
      () =>
        this.prisma.civilSocietyOrganization.findMany({
          where: { isActive: true },
          include: {
            cluster: { select: { id: true, name: true, fullName: true } },
          },
          orderBy: { name: 'asc' },
        }),
    );
  }

  findAllCsosAll() {
    return this.prisma.civilSocietyOrganization.findMany({
      include: {
        cluster: { select: { id: true, name: true, fullName: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCso(dto: CreateCsoDto) {
    const created = await this.prisma.civilSocietyOrganization.create({
      data: dto,
      include: {
        cluster: { select: { id: true, name: true, fullName: true } },
      },
    });
    await this.invalidate();
    return created;
  }

  async updateCso(id: string, dto: UpdateCsoDto) {
    await this.findCsoOrFail(id);
    const updated = await this.prisma.civilSocietyOrganization.update({
      where: { id },
      data: dto,
      include: {
        cluster: { select: { id: true, name: true, fullName: true } },
      },
    });
    await this.invalidate();
    return updated;
  }

  async deactivateCso(id: string): Promise<{ message: string }> {
    await this.findCsoOrFail(id);
    await this.prisma.civilSocietyOrganization.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidate();
    return { message: 'Civil society organization deactivated.' };
  }

  private async findCsoOrFail(id: string) {
    const cso = await this.prisma.civilSocietyOrganization.findUnique({
      where: { id },
    });
    if (!cso)
      throw new NotFoundException('Civil society organization not found');
    return cso;
  }

  // ─── Finish lines ─────────────────────────────────────────────────────────

  findAllFinishLines() {
    return this.cache.getOrSet('ref:finish-lines', REFERENCE_TTL_SECONDS, () =>
      this.prisma.finishLine.findMany({
        include: {
          finishLineClusters: {
            include: { cluster: { select: { id: true, name: true } } },
          },
          subFinishLines: {
            where: { isActive: true },
            orderBy: { code: 'asc' },
          },
        },
        orderBy: { visionNumber: 'asc' },
      }),
    );
  }

  async updateFinishLine(id: string, dto: UpdateFinishLineDto) {
    const existing = await this.prisma.finishLine.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`${GOAL} not found`);
    const updated = await this.prisma.finishLine.update({
      where: { id },
      data: dto,
    });
    await this.invalidate();
    return updated;
  }

  // ─── Sub-finish lines ─────────────────────────────────────────────────────

  findAllSubFinishLines() {
    return this.cache.getOrSet(
      'ref:sub-finish-lines',
      REFERENCE_TTL_SECONDS,
      () =>
        this.prisma.subFinishLine.findMany({
          where: { isActive: true },
          orderBy: [{ finishLineId: 'asc' }, { code: 'asc' }],
        }),
    );
  }

  findAllSubFinishLinesAll() {
    return this.prisma.subFinishLine.findMany({
      orderBy: [{ finishLineId: 'asc' }, { code: 'asc' }],
    });
  }

  async createSubFinishLine(dto: CreateSubFinishLineDto) {
    const fl = await this.prisma.finishLine.findUnique({
      where: { id: dto.finishLineId },
    });
    if (!fl) throw new NotFoundException(`${GOAL} not found`);
    const created = await this.prisma.subFinishLine.create({ data: dto });
    await this.invalidate();
    return created;
  }

  async updateSubFinishLine(id: string, dto: UpdateSubFinishLineDto) {
    await this.findSubFinishLineOrFail(id);
    const updated = await this.prisma.subFinishLine.update({
      where: { id },
      data: dto,
    });
    await this.invalidate();
    return updated;
  }

  async deactivateSubFinishLine(id: string): Promise<{ message: string }> {
    await this.findSubFinishLineOrFail(id);
    await this.prisma.subFinishLine.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidate();
    return { message: `Sub-${GOAL.toLowerCase()} deactivated.` };
  }

  private async findSubFinishLineOrFail(id: string) {
    const s = await this.prisma.subFinishLine.findUnique({ where: { id } });
    if (!s) throw new NotFoundException(`Sub-${GOAL.toLowerCase()} not found`);
    return s;
  }

  // ─── PAP sectors ──────────────────────────────────────────────────────────

  findAllPAPSectors() {
    return this.cache.getOrSet('ref:pap-sectors', REFERENCE_TTL_SECONDS, () =>
      this.prisma.pAPSector.findMany({
        where: { isActive: true },
        orderBy: { code: 'asc' },
      }),
    );
  }

  findAllPAPSectorsAll() {
    return this.prisma.pAPSector.findMany({ orderBy: { code: 'asc' } });
  }

  async createPapSector(dto: CreatePapSectorDto) {
    const created = await this.prisma.pAPSector.create({ data: dto });
    await this.invalidate();
    return created;
  }

  async updatePapSector(id: string, dto: UpdatePapSectorDto) {
    await this.findPapSectorOrFail(id);
    const updated = await this.prisma.pAPSector.update({
      where: { id },
      data: dto,
    });
    await this.invalidate();
    return updated;
  }

  async deactivatePapSector(id: string): Promise<{ message: string }> {
    await this.findPapSectorOrFail(id);
    await this.prisma.pAPSector.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidate();
    return { message: 'PAP sector deactivated.' };
  }

  private async findPapSectorOrFail(id: string) {
    const s = await this.prisma.pAPSector.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('PAP sector not found');
    return s;
  }

  // ─── UACS objects ─────────────────────────────────────────────────────────

  findAllUACSObjectsAll() {
    return this.prisma.uACSObject.findMany({
      orderBy: [{ expenseClass: 'asc' }, { code: 'asc' }],
    });
  }

  async createUacsObject(dto: CreateUacsObjectDto) {
    const created = await this.prisma.uACSObject.create({ data: dto });
    await this.invalidate();
    return created;
  }

  async updateUacsObject(id: string, dto: UpdateUacsObjectDto) {
    await this.findUacsObjectOrFail(id);
    const updated = await this.prisma.uACSObject.update({
      where: { id },
      data: dto,
    });
    await this.invalidate();
    return updated;
  }

  async deactivateUacsObject(id: string): Promise<{ message: string }> {
    await this.findUacsObjectOrFail(id);
    await this.prisma.uACSObject.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidate();
    return { message: 'UACS object deactivated.' };
  }

  private async findUacsObjectOrFail(id: string) {
    const o = await this.prisma.uACSObject.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('UACS object not found');
    return o;
  }

  findAllUACSObjects(opts: { search?: string; expenseClass?: ExpenseClass }) {
    const { search, expenseClass } = opts;
    const query = () =>
      this.prisma.uACSObject.findMany({
        where: {
          isActive: true,
          ...(expenseClass ? { expenseClass } : {}),
          ...(search
            ? {
                OR: [
                  { code: { contains: search, mode: 'insensitive' } },
                  { description: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: [{ expenseClass: 'asc' }, { code: 'asc' }],
        take: 200,
      });

    // Only the unfiltered call is cached — `search` is free text (unbounded
    // key space) and `expenseClass` filtering is cheap enough to skip.
    if (search || expenseClass) return query();
    return this.cache.getOrSet(
      'ref:uacs-objects',
      REFERENCE_TTL_SECONDS,
      query,
    );
  }

  // ─── SGLG indicators ──────────────────────────────────────────────────────

  findAllSGLGIndicatorsAll() {
    return this.prisma.sGLGIndicator.findMany({
      orderBy: [{ pillar: 'asc' }, { code: 'asc' }],
    });
  }

  async createSglgIndicator(dto: CreateSglgIndicatorDto) {
    const created = await this.prisma.sGLGIndicator.create({ data: dto });
    await this.invalidate();
    return created;
  }

  async updateSglgIndicator(id: string, dto: UpdateSglgIndicatorDto) {
    await this.findSglgIndicatorOrFail(id);
    const updated = await this.prisma.sGLGIndicator.update({
      where: { id },
      data: dto,
    });
    await this.invalidate();
    return updated;
  }

  async deactivateSglgIndicator(id: string): Promise<{ message: string }> {
    await this.findSglgIndicatorOrFail(id);
    await this.prisma.sGLGIndicator.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidate();
    return { message: 'SGLG indicator deactivated.' };
  }

  private async findSglgIndicatorOrFail(id: string) {
    const i = await this.prisma.sGLGIndicator.findUnique({ where: { id } });
    if (!i) throw new NotFoundException('SGLG indicator not found');
    return i;
  }

  findAllSGLGIndicators(opts: { year?: number; isActive?: boolean }) {
    const { year, isActive } = opts;
    const key = `ref:sglg-indicators:y=${year ?? '-'}:a=${
      isActive === undefined ? '-' : isActive
    }`;
    return this.cache.getOrSet(key, REFERENCE_TTL_SECONDS, () =>
      this.prisma.sGLGIndicator.findMany({
        where: {
          ...(year !== undefined ? { dilgYear: year } : {}),
          ...(isActive !== undefined ? { isActive } : { isActive: true }),
        },
        orderBy: [{ pillar: 'asc' }, { code: 'asc' }],
      }),
    );
  }

  // ─── SDG goals ────────────────────────────────────────────────────────────

  findAllSDGGoalsAll() {
    return this.prisma.sDGGoal.findMany({ orderBy: { code: 'asc' } });
  }

  async createSdgGoal(dto: CreateSdgGoalDto) {
    const created = await this.prisma.sDGGoal.create({ data: dto });
    await this.invalidate();
    return created;
  }

  async updateSdgGoal(id: string, dto: UpdateSdgGoalDto) {
    await this.findSdgGoalOrFail(id);
    const updated = await this.prisma.sDGGoal.update({
      where: { id },
      data: dto,
    });
    await this.invalidate();
    return updated;
  }

  async deactivateSdgGoal(id: string): Promise<{ message: string }> {
    await this.findSdgGoalOrFail(id);
    await this.prisma.sDGGoal.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidate();
    return { message: 'SDG goal deactivated.' };
  }

  private async findSdgGoalOrFail(id: string) {
    const g = await this.prisma.sDGGoal.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('SDG goal not found');
    return g;
  }

  findAllSDGGoals(opts: { isActive?: boolean }) {
    const { isActive } = opts;
    const key = `ref:sdg-goals:a=${isActive === undefined ? '-' : isActive}`;
    return this.cache.getOrSet(key, REFERENCE_TTL_SECONDS, () =>
      this.prisma.sDGGoal.findMany({
        where: isActive !== undefined ? { isActive } : { isActive: true },
        // Codes are zero-padded (SDG-01 … SDG-17), so lexical order is
        // numeric order.
        orderBy: { code: 'asc' },
      }),
    );
  }

  // ─── Climate typology codes ───────────────────────────────────────────────

  findAllClimateTypologyCodesAll() {
    return this.prisma.climateTypologyCode.findMany({
      orderBy: [{ pillar: 'asc' }, { code: 'asc' }],
    });
  }

  async createClimateTypologyCode(dto: CreateClimateTypologyCodeDto) {
    const created = await this.prisma.climateTypologyCode.create({ data: dto });
    await this.invalidate();
    return created;
  }

  async updateClimateTypologyCode(
    id: string,
    dto: UpdateClimateTypologyCodeDto,
  ) {
    await this.findClimateTypologyCodeOrFail(id);
    const updated = await this.prisma.climateTypologyCode.update({
      where: { id },
      data: dto,
    });
    await this.invalidate();
    return updated;
  }

  async deactivateClimateTypologyCode(
    id: string,
  ): Promise<{ message: string }> {
    await this.findClimateTypologyCodeOrFail(id);
    await this.prisma.climateTypologyCode.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidate();
    return { message: 'Climate typology code deactivated.' };
  }

  private async findClimateTypologyCodeOrFail(id: string) {
    const c = await this.prisma.climateTypologyCode.findUnique({
      where: { id },
    });
    if (!c) throw new NotFoundException('Climate typology code not found');
    return c;
  }

  findAllClimateTypologyCodes(opts: { pillar?: ClimatePillar }) {
    const { pillar } = opts;
    const key = `ref:climate-typology-codes:p=${pillar ?? '-'}`;
    return this.cache.getOrSet(key, REFERENCE_TTL_SECONDS, () =>
      this.prisma.climateTypologyCode.findMany({
        where: {
          isActive: true,
          ...(pillar ? { pillar } : {}),
        },
        orderBy: [{ pillar: 'asc' }, { code: 'asc' }],
      }),
    );
  }
}
