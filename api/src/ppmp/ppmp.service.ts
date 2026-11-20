import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OfficeScopeService } from '../permissions/office-scope.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { StoredFile } from '../storage/storage-adapter.interface.js';
import {
  BudgetDocumentKind,
  BudgetDocumentStatus,
  Prisma,
} from '../generated/prisma/index';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { CreatePpmpDto } from './dto/create-ppmp.dto.js';
import type { UpdatePpmpDto } from './dto/update-ppmp.dto.js';
import type { ListPpmpDto } from './dto/list-ppmp.dto.js';
import type { CreatePpmpLineItemDto } from './dto/create-ppmp-line-item.dto.js';
import type { UpdatePpmpLineItemDto } from './dto/update-ppmp-line-item.dto.js';
import type { ReorderPpmpLineItemsDto } from './dto/reorder-ppmp-line-items.dto.js';
import type { CreatePpmpCommentDto } from './dto/create-ppmp-comment.dto.js';
import type { ReplyPpmpFeedbackDto } from './dto/reply-ppmp-feedback.dto.js';
import { buildPpmpHistory } from './ppmp-history.util.js';
import type { SetPpmpLineLinkDto } from './dto/set-ppmp-line-link.dto.js';
import { relinkTo } from './ppmp-relink.js';
import { budgetOverruns, type BudgetNode } from './ppmp-budget-warnings.js';

/** The budget row a line is linked to, named for display (specs/012 D8). */
const LINE_LINKS = {
  program: {
    select: {
      id: true,
      name: true,
      aipReferenceCode: true,
      tentativeAipReferenceCode: true,
    },
  },
  projectActivity: {
    select: {
      id: true,
      name: true,
      aipReferenceCode: true,
      tentativeAipReferenceCode: true,
    },
  },
  budgetItem: { select: { id: true, name: true, aipReferenceCode: true } },
} satisfies Prisma.PPMPLineItemInclude;

const LINE_ITEMS_ORDERED = {
  orderBy: { orderIndex: 'asc' as const },
  include: LINE_LINKS,
};

const ENACTED_ORDINANCE = {
  kind: BudgetDocumentKind.ORDINANCE,
  status: BudgetDocumentStatus.ENACTED,
};

const SOURCE_SELECT = {
  id: true,
  sourceProgramId: true,
  sourceProjectActivityId: true,
  sourceItemId: true,
} satisfies Prisma.BudgetItemSelect;

@Injectable()
export class PpmpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly officeScope: OfficeScopeService,
    private readonly storage: StorageService,
  ) {}

  /** Decimal sum of `lineTotal` across a PPMP's line items — never cached. */
  private grandTotal(
    lineItems: { lineTotal: Prisma.Decimal }[],
  ): Prisma.Decimal {
    return lineItems.reduce(
      (acc, li) => acc.plus(li.lineTotal),
      new Prisma.Decimal(0),
    );
  }

  private async loadPpmpOrFail(id: string) {
    const ppmp = await this.prisma.pPMP.findUnique({
      where: { id },
      include: { lineItems: LINE_ITEMS_ORDERED },
    });
    if (!ppmp) throw new NotFoundException('PPMP not found');
    return ppmp;
  }

  private async loadLineItemOrFail(ppmpId: string, lineItemId: string) {
    const li = await this.prisma.pPMPLineItem.findUnique({
      where: { id: lineItemId },
    });
    if (!li || li.ppmpId !== ppmpId) {
      throw new NotFoundException('PPMP line item not found');
    }
    return li;
  }

  private async resolveUACS(uacsObjectId: string) {
    const uacs = await this.prisma.uACSObject.findUnique({
      where: { id: uacsObjectId },
    });
    if (!uacs) throw new NotFoundException('UACS object not found');
    return { code: uacs.code, description: uacs.description };
  }

  private toResponse(ppmp: { lineItems: { lineTotal: Prisma.Decimal }[] }) {
    return { ...ppmp, grandTotal: this.grandTotal(ppmp.lineItems) };
  }

  /**
   * Any content edit on an APPROVED Project reverts it — it must be
   * re-approved before it can be (re)published. A Project that was never
   * published reverts to plain DRAFT, same as before. A Project that *was*
   * published reverts to REVISION and is unpublished in the same patch —
   * the edit is saved, but the public site stops showing it until someone
   * re-approves and explicitly republishes it (see PpmpService.publish,
   * unchanged: it already requires APPROVED + !isPublished). A DRAFT or
   * REVISION Project already needs approval, so this is a no-op for either.
   * Spread into the same `pPMP.update` each mutating method already issues
   * (for `updatedAt`), rather than a separate query.
   */
  private draftRevertPatch(ppmp: { status: string; isPublished: boolean }) {
    if (ppmp.status !== 'APPROVED') return {};
    return ppmp.isPublished
      ? { status: 'REVISION' as const, isPublished: false }
      : { status: 'DRAFT' as const };
  }

  // ─── PPMP CRUD ──────────────────────────────────────────────────────────

  async create(dto: CreatePpmpDto, user: JwtPayload) {
    await this.officeScope.assertOfficeInScope(user, dto.officeId);

    const [office, cycle] = await Promise.all([
      this.prisma.office.findUnique({ where: { id: dto.officeId } }),
      this.prisma.aIPCycle.findUnique({ where: { id: dto.aipCycleId } }),
    ]);
    if (!office) throw new BadRequestException('officeId not found');
    if (!cycle) throw new BadRequestException('aipCycleId not found');

    const ppmp = await this.prisma.pPMP.create({
      data: {
        officeId: dto.officeId,
        aipCycleId: dto.aipCycleId,
        name: dto.name,
        fundingProgram: dto.fundingProgram,
        classification: dto.classification,
      },
      include: { lineItems: LINE_ITEMS_ORDERED },
    });
    return this.toResponse(ppmp);
  }

  async findAll(opts: ListPpmpDto, user: JwtPayload) {
    const scopeWhere = await this.officeScope.officeScopeWhere(user);
    const ppmps = await this.prisma.pPMP.findMany({
      where: {
        AND: [scopeWhere, opts.officeId ? { officeId: opts.officeId } : {}],
        ...(opts.aipCycleId ? { aipCycleId: opts.aipCycleId } : {}),
        ...(opts.isPublished !== undefined
          ? { isPublished: opts.isPublished }
          : {}),
      },
      include: { lineItems: { select: { lineTotal: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return ppmps.map(({ lineItems, ...rest }) => ({
      ...rest,
      grandTotal: this.grandTotal(lineItems),
      lineItemCount: lineItems.length,
    }));
  }

  async findOne(id: string, user: JwtPayload) {
    const ppmp = await this.loadPpmpOrFail(id);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);
    return this.toResponse(ppmp);
  }

  async update(id: string, dto: UpdatePpmpDto, user: JwtPayload) {
    const ppmp = await this.loadPpmpOrFail(id);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);

    if (dto.officeId !== undefined && dto.officeId !== ppmp.officeId) {
      // Moving offices needs the same two checks create() runs: the target
      // office exists, and the caller is allowed to act there too — scope
      // only checked at the *source* office would let a Project move into
      // an office outside the caller's permitted list.
      await this.officeScope.assertOfficeInScope(user, dto.officeId);
      const office = await this.prisma.office.findUnique({
        where: { id: dto.officeId },
      });
      if (!office) throw new BadRequestException('officeId not found');
    }

    const updated = await this.prisma.pPMP.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.fundingProgram !== undefined
          ? { fundingProgram: dto.fundingProgram }
          : {}),
        ...(dto.officeId !== undefined ? { officeId: dto.officeId } : {}),
        ...(dto.classification !== undefined
          ? { classification: dto.classification }
          : {}),
        ...this.draftRevertPatch(ppmp),
      },
      include: { lineItems: LINE_ITEMS_ORDERED },
    });
    return this.toResponse(updated);
  }

  async remove(id: string, user: JwtPayload) {
    const ppmp = await this.loadPpmpOrFail(id);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);
    await this.prisma.pPMP.delete({ where: { id } }); // cascades to line items
  }

  // ─── Line items ─────────────────────────────────────────────────────────

  async addLineItem(
    ppmpId: string,
    dto: CreatePpmpLineItemDto,
    user: JwtPayload,
  ) {
    const ppmp = await this.loadPpmpOrFail(ppmpId);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);

    const uacsSnapshot = await this.resolveUACS(dto.uacsObjectId);
    const quantity = new Prisma.Decimal(dto.quantity);
    const unitCost = new Prisma.Decimal(dto.unitCost);
    const lineTotal = quantity.mul(unitCost);

    await this.prisma.$transaction([
      this.prisma.pPMPLineItem.create({
        data: {
          ppmpId,
          lineItemName: dto.lineItemName,
          typeOfProject: dto.typeOfProject ?? null,
          modeOfProcurement: dto.modeOfProcurement ?? null,
          uacsObjectId: dto.uacsObjectId,
          uacsCode: uacsSnapshot.code,
          uacsDescription: uacsSnapshot.description,
          quantity,
          unit: dto.unit,
          unitCost,
          lineTotal,
          fundSource: dto.fundSource,
          expenseClass: dto.expenseClass,
          preProcurementConferenceRequired:
            dto.preProcurementConferenceRequired,
          procurementStartMonth: dto.procurementStartMonth,
          procurementStartYear: dto.procurementStartYear,
          procurementEndMonth: dto.procurementEndMonth,
          procurementEndYear: dto.procurementEndYear,
          deliveryPeriod: dto.deliveryPeriod ?? null,
          remarks: dto.remarks ?? null,
          orderIndex: dto.orderIndex ?? ppmp.lineItems.length,
        },
      }),
      // The public list sorts by PPMP.updatedAt, not the line item's own —
      // touch the parent so "Recently Updated" reflects line-item activity,
      // not just PPMP-level renames/publishes.
      this.prisma.pPMP.update({
        where: { id: ppmpId },
        data: { updatedAt: new Date(), ...this.draftRevertPatch(ppmp) },
      }),
    ]);

    return this.findOne(ppmpId, user);
  }

  async updateLineItem(
    ppmpId: string,
    lineItemId: string,
    dto: UpdatePpmpLineItemDto,
    user: JwtPayload,
  ) {
    const ppmp = await this.loadPpmpOrFail(ppmpId);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);
    const existing = await this.loadLineItemOrFail(ppmpId, lineItemId);

    const quantity =
      dto.quantity !== undefined
        ? new Prisma.Decimal(dto.quantity)
        : existing.quantity;
    const unitCost =
      dto.unitCost !== undefined
        ? new Prisma.Decimal(dto.unitCost)
        : existing.unitCost;
    const recompute = dto.quantity !== undefined || dto.unitCost !== undefined;

    let uacsSnapshot: { code: string; description: string } | null = null;
    if (dto.uacsObjectId !== undefined) {
      uacsSnapshot = await this.resolveUACS(dto.uacsObjectId);
    }

    await this.prisma.$transaction([
      this.prisma.pPMPLineItem.update({
        where: { id: lineItemId },
        data: {
          ...(dto.lineItemName !== undefined
            ? { lineItemName: dto.lineItemName }
            : {}),
          ...(dto.typeOfProject !== undefined
            ? { typeOfProject: dto.typeOfProject }
            : {}),
          ...(dto.modeOfProcurement !== undefined
            ? { modeOfProcurement: dto.modeOfProcurement }
            : {}),
          ...(uacsSnapshot
            ? {
                uacsObjectId: dto.uacsObjectId,
                uacsCode: uacsSnapshot.code,
                uacsDescription: uacsSnapshot.description,
              }
            : {}),
          quantity,
          unitCost,
          ...(recompute ? { lineTotal: quantity.mul(unitCost) } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
          ...(dto.fundSource !== undefined
            ? { fundSource: dto.fundSource }
            : {}),
          ...(dto.expenseClass !== undefined
            ? { expenseClass: dto.expenseClass }
            : {}),
          ...(dto.preProcurementConferenceRequired !== undefined
            ? {
                preProcurementConferenceRequired:
                  dto.preProcurementConferenceRequired,
              }
            : {}),
          ...(dto.procurementStartMonth !== undefined
            ? { procurementStartMonth: dto.procurementStartMonth }
            : {}),
          ...(dto.procurementStartYear !== undefined
            ? { procurementStartYear: dto.procurementStartYear }
            : {}),
          ...(dto.procurementEndMonth !== undefined
            ? { procurementEndMonth: dto.procurementEndMonth }
            : {}),
          ...(dto.procurementEndYear !== undefined
            ? { procurementEndYear: dto.procurementEndYear }
            : {}),
          ...(dto.deliveryPeriod !== undefined
            ? { deliveryPeriod: dto.deliveryPeriod }
            : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
          ...(dto.orderIndex !== undefined
            ? { orderIndex: dto.orderIndex }
            : {}),
        },
      }),
      this.prisma.pPMP.update({
        where: { id: ppmpId },
        data: { updatedAt: new Date(), ...this.draftRevertPatch(ppmp) },
      }),
    ]);

    return this.findOne(ppmpId, user);
  }

  /**
   * Replaces (or sets) a line item's supporting document. No delete-first
   * step required — the newest upload simply becomes current (specs/003-
   * ppmp-procurement-fields/research.md Decision 3). The previous file, if
   * any, is left orphaned in storage — cleanup is an explicit scope cut.
   */
  async attachDocument(
    ppmpId: string,
    lineItemId: string,
    file: StoredFile,
    user: JwtPayload,
  ) {
    const ppmp = await this.loadPpmpOrFail(ppmpId);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);
    await this.loadLineItemOrFail(ppmpId, lineItemId);

    const stored = await this.storage.save(file);

    await this.prisma.$transaction([
      this.prisma.pPMPLineItem.update({
        where: { id: lineItemId },
        data: {
          supportingDocumentUrl: stored.url,
          supportingDocumentName: file.originalname,
        },
      }),
      this.prisma.pPMP.update({
        where: { id: ppmpId },
        data: { updatedAt: new Date(), ...this.draftRevertPatch(ppmp) },
      }),
    ]);

    return {
      supportingDocumentUrl: stored.url,
      supportingDocumentName: file.originalname,
    };
  }

  async deleteLineItem(ppmpId: string, lineItemId: string, user: JwtPayload) {
    const ppmp = await this.loadPpmpOrFail(ppmpId);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);
    await this.loadLineItemOrFail(ppmpId, lineItemId);

    const [, , remaining] = await this.prisma.$transaction([
      this.prisma.pPMPLineItem.delete({ where: { id: lineItemId } }),
      this.prisma.pPMP.update({
        where: { id: ppmpId },
        data: { updatedAt: new Date(), ...this.draftRevertPatch(ppmp) },
      }),
      this.prisma.pPMPLineItem.findMany({
        where: { ppmpId },
        select: { lineTotal: true },
      }),
    ]);
    return { grandTotal: this.grandTotal(remaining) };
  }

  async reorderLineItems(
    ppmpId: string,
    dto: ReorderPpmpLineItemsDto,
    user: JwtPayload,
  ) {
    const ppmp = await this.loadPpmpOrFail(ppmpId);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);

    const currentIds = ppmp.lineItems.map((li) => li.id).sort();
    const submittedIds = [...dto.lineItemIds].sort();
    const matches =
      currentIds.length === submittedIds.length &&
      currentIds.every((id, i) => id === submittedIds[i]);
    if (!matches) {
      throw new BadRequestException(
        'lineItemIds must exactly match this PPMP’s current line items',
      );
    }

    await this.prisma.$transaction([
      ...dto.lineItemIds.map((id, index) =>
        this.prisma.pPMPLineItem.update({
          where: { id },
          data: { orderIndex: index },
        }),
      ),
      this.prisma.pPMP.update({
        where: { id: ppmpId },
        data: { updatedAt: new Date() },
      }),
    ]);

    const updated = await this.loadPpmpOrFail(ppmpId);
    return updated.lineItems;
  }

  // ─── Approval (simple two-state gate — see PpmpStatus) ─────────────────

  // ─── Budget links and the Final PPMP (specs/012 P5) ──────────────────────

  /**
   * Link a line to the budget row it is bought for, or clear the link. The row
   * must be its office's, in its year: an AIP program or PA while the PPMP is
   * Indicative, an enacted Ordinance PPA once it is Final. Planning metadata,
   * not public content, so it does not revert an APPROVED PPMP.
   */
  async setLineLink(
    ppmpId: string,
    lineItemId: string,
    dto: SetPpmpLineLinkDto,
    user: JwtPayload,
  ) {
    const ppmp = await this.loadPpmpOrFail(ppmpId);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);
    await this.loadLineItemOrFail(ppmpId, lineItemId);

    const { programId, projectActivityId, budgetItemId } = dto;
    if ([programId, projectActivityId, budgetItemId].filter(Boolean).length > 1)
      throw new BadRequestException('Link a line to one budget row at most.');
    const final = ppmp.kind === 'FINAL';
    if (!final && budgetItemId)
      throw new BadRequestException(
        "An Indicative PPMP links to the AIP. Link the Ordinance's PPAs on its Final PPMP.",
      );
    if (final && (programId || projectActivityId))
      throw new BadRequestException(
        "A Final PPMP links to the enacted Ordinance's PPAs.",
      );

    const found = programId
      ? await this.prisma.program.findFirst({
          where: {
            id: programId,
            aipCycleId: ppmp.aipCycleId,
            officeId: ppmp.officeId,
            deletedAt: null,
          },
          select: { id: true },
        })
      : projectActivityId
        ? await this.prisma.projectActivity.findFirst({
            where: {
              id: projectActivityId,
              program: {
                aipCycleId: ppmp.aipCycleId,
                officeId: ppmp.officeId,
                deletedAt: null,
              },
            },
            select: { id: true },
          })
        : budgetItemId
          ? await this.prisma.budgetItem.findFirst({
              where: {
                id: budgetItemId,
                document: {
                  ...ENACTED_ORDINANCE,
                  budgetCycle: { aipCycle: { id: ppmp.aipCycleId } },
                },
                OR: [
                  { officeId: ppmp.officeId },
                  { hostOfficeId: ppmp.officeId },
                ],
              },
              select: { id: true },
            })
          : true;
    if (!found)
      throw new BadRequestException(
        "That budget row is not this office's, in this PPMP's year.",
      );

    return this.prisma.pPMPLineItem.update({
      where: { id: lineItemId },
      data: {
        programId: programId || null,
        projectActivityId: projectActivityId || null,
        budgetItemId: budgetItemId || null,
      },
      include: LINE_LINKS,
    });
  }

  /**
   * Soft warnings: budget rows this PPMP's lines are linked to whose linked
   * total, over every PPMP of the year and kind, is above the row's amount
   * (`budgetOverruns`). Never blocks anything.
   */
  async budgetWarnings(id: string, user: JwtPayload) {
    const ppmp = await this.loadPpmpOrFail(id);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);
    const final = ppmp.kind === 'FINAL';
    const lines = await this.prisma.pPMPLineItem.findMany({
      where: {
        ppmp: { aipCycleId: ppmp.aipCycleId, kind: ppmp.kind },
        OR: final
          ? [{ budgetItemId: { not: null } }]
          : [
              { programId: { not: null } },
              { projectActivityId: { not: null } },
            ],
      },
      select: {
        id: true,
        ppmpId: true,
        lineTotal: true,
        programId: true,
        projectActivityId: true,
        budgetItemId: true,
      },
    });
    if (!lines.some((l) => l.ppmpId === id)) return [];

    const nodes: BudgetNode[] = [];
    if (final) {
      const linked = await this.prisma.budgetItem.findMany({
        where: { id: { in: lines.map((l) => l.budgetItemId!) } },
        select: { rootItemId: true },
      });
      const items = await this.prisma.budgetItem.findMany({
        where: {
          rootItemId: { in: [...new Set(linked.map((i) => i.rootItemId))] },
        },
        select: {
          id: true,
          parentId: true,
          name: true,
          aipReferenceCode: true,
          total: true,
        },
      });
      for (const i of items)
        nodes.push({
          key: `i:${i.id}`,
          parentKey: i.parentId ? `i:${i.parentId}` : null,
          field: 'budgetItemId',
          id: i.id,
          name: i.name,
          code: i.aipReferenceCode,
          budget: i.total,
        });
    } else {
      const viaPa = await this.prisma.projectActivity.findMany({
        where: { id: { in: lines.flatMap((l) => l.projectActivityId ?? []) } },
        select: { programId: true },
      });
      const programs = await this.prisma.program.findMany({
        where: {
          id: {
            in: [
              ...new Set([
                ...lines.flatMap((l) => l.programId ?? []),
                ...viaPa.map((a) => a.programId),
              ]),
            ],
          },
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          aipReferenceCode: true,
          tentativeAipReferenceCode: true,
          proposedTotal: true,
          projectActivities: {
            select: {
              id: true,
              parentProjectActivityId: true,
              name: true,
              aipReferenceCode: true,
              tentativeAipReferenceCode: true,
              proposedBudget: true,
            },
          },
        },
      });
      for (const p of programs) {
        nodes.push({
          key: `p:${p.id}`,
          parentKey: null,
          field: 'programId',
          id: p.id,
          name: p.name,
          code: p.aipReferenceCode ?? p.tentativeAipReferenceCode,
          budget: p.proposedTotal,
        });
        for (const a of p.projectActivities)
          nodes.push({
            key: `a:${a.id}`,
            parentKey: a.parentProjectActivityId
              ? `a:${a.parentProjectActivityId}`
              : `p:${p.id}`,
            field: 'projectActivityId',
            id: a.id,
            name: a.name,
            code: a.aipReferenceCode ?? a.tentativeAipReferenceCode,
            budget: a.proposedBudget,
          });
      }
    }
    return budgetOverruns(
      nodes,
      lines.map((l) => ({
        id: l.id,
        ppmpId: l.ppmpId,
        lineTotal: l.lineTotal,
        key: l.budgetItemId
          ? `i:${l.budgetItemId}`
          : l.projectActivityId
            ? `a:${l.projectActivityId}`
            : `p:${l.programId}`,
      })),
      id,
    );
  }

  /**
   * The budget rows a line of this PPMP may link to, in reading order, with
   * their depth for indenting: the office's AIP programs and their PAs while
   * Indicative, its enacted Ordinance PPAs once Final (`setLineLink`'s rule).
   */
  async linkOptions(id: string, user: JwtPayload) {
    const ppmp = await this.loadPpmpOrFail(id);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);
    type Option = {
      field: 'programId' | 'projectActivityId' | 'budgetItemId';
      id: string;
      name: string;
      code: string | null;
      depth: number;
    };
    const tree = <T extends { id: string; orderIndex: number }>(
      rows: T[],
      parentOf: (r: T) => string | null,
      emit: (r: T, depth: number) => void,
      depth0 = 0,
    ) => {
      const ids = new Set(rows.map((r) => r.id));
      const kids = new Map<string | null, T[]>();
      for (const r of rows) {
        const p = parentOf(r);
        const key = p && ids.has(p) ? p : null;
        kids.set(key, [...(kids.get(key) ?? []), r]);
      }
      const walk = (key: string | null, depth: number) => {
        for (const r of (kids.get(key) ?? []).sort(
          (a, b) => a.orderIndex - b.orderIndex,
        )) {
          emit(r, depth);
          walk(r.id, depth + 1);
        }
      };
      walk(null, depth0);
    };
    const out: Option[] = [];

    if (ppmp.kind === 'FINAL') {
      const items = await this.prisma.budgetItem.findMany({
        where: {
          document: {
            ...ENACTED_ORDINANCE,
            budgetCycle: { aipCycle: { id: ppmp.aipCycleId } },
          },
          OR: [{ officeId: ppmp.officeId }, { hostOfficeId: ppmp.officeId }],
        },
        select: {
          id: true,
          parentId: true,
          name: true,
          aipReferenceCode: true,
          orderIndex: true,
        },
      });
      tree(
        items,
        (i) => i.parentId,
        (i, depth) =>
          out.push({
            field: 'budgetItemId',
            id: i.id,
            name: i.name,
            code: i.aipReferenceCode,
            depth,
          }),
      );
      return out;
    }

    const programs = await this.prisma.program.findMany({
      where: {
        aipCycleId: ppmp.aipCycleId,
        officeId: ppmp.officeId,
        deletedAt: null,
      },
      orderBy: [
        { papClass: { sort: 'asc', nulls: 'last' } },
        { orderIndex: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        aipReferenceCode: true,
        tentativeAipReferenceCode: true,
        projectActivities: {
          select: {
            id: true,
            parentProjectActivityId: true,
            name: true,
            aipReferenceCode: true,
            tentativeAipReferenceCode: true,
            orderIndex: true,
          },
        },
      },
    });
    for (const p of programs) {
      out.push({
        field: 'programId',
        id: p.id,
        name: p.name,
        code: p.aipReferenceCode ?? p.tentativeAipReferenceCode,
        depth: 0,
      });
      tree(
        p.projectActivities,
        (a) => a.parentProjectActivityId,
        (a, depth) =>
          out.push({
            field: 'projectActivityId',
            id: a.id,
            name: a.name,
            code: a.aipReferenceCode ?? a.tentativeAipReferenceCode,
            depth,
          }),
        1,
      );
    }
    return out;
  }

  /**
   * Make the Final PPMP from an Indicative one once the year's Ordinance is
   * enacted: a DRAFT copy, every line carried over, each AIP link relinked to
   * the Ordinance PPA that funds it (`relinkTo`). Lines that could not be
   * relinked come back in `unmatched` for the office to link by hand.
   */
  async createFinal(id: string, user: JwtPayload) {
    const source = await this.loadPpmpOrFail(id);
    await this.officeScope.assertOfficeInScope(user, source.officeId);
    if (source.kind !== 'INDICATIVE')
      throw new BadRequestException('Only an Indicative PPMP has a Final.');
    const existing = await this.prisma.pPMP.findUnique({
      where: { sourcePpmpId: id },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException({
        code: 'FINAL_EXISTS',
        message: 'This PPMP already has a Final PPMP.',
        finalPpmpId: existing.id,
      });
    const cycle = { aipCycle: { id: source.aipCycleId } };
    const ordinance = await this.prisma.budgetDocument.findFirst({
      where: { ...ENACTED_ORDINANCE, budgetCycle: cycle },
      select: { id: true },
    });
    if (!ordinance)
      throw new ConflictException({
        code: 'ORDINANCE_NOT_ENACTED',
        message:
          "The Final PPMP is made once the year's Appropriation Ordinance is enacted.",
      });
    const [ordinanceItems, lepItems] = await Promise.all([
      this.prisma.budgetItem.findMany({
        where: { documentId: ordinance.id },
        select: SOURCE_SELECT,
      }),
      this.prisma.budgetItem.findMany({
        where: {
          document: { kind: BudgetDocumentKind.LEP, budgetCycle: cycle },
        },
        select: SOURCE_SELECT,
      }),
    ]);

    const unmatched: {
      lineItemId: string;
      lineItemName: string;
      reason: 'none' | 'several';
    }[] = [];
    const lines = source.lineItems.map((li) => {
      const {
        id: lineItemId,
        ppmpId: _ppmp,
        createdAt: _c,
        updatedAt: _u,
        programId,
        projectActivityId,
        budgetItemId: _b,
        program: _p,
        projectActivity: _pa,
        budgetItem: _bi,
        ...fields
      } = li;
      const link = projectActivityId
        ? { projectActivityId }
        : programId
          ? { programId }
          : null;
      const relinked = link
        ? relinkTo(link, ordinanceItems, lepItems)
        : { budgetItemId: null, reason: 'none' as const };
      if (link && relinked.budgetItemId === null)
        unmatched.push({
          lineItemId,
          lineItemName: li.lineItemName,
          reason: 'reason' in relinked ? relinked.reason : 'none',
        });
      return { ...fields, budgetItemId: relinked.budgetItemId };
    });

    const final = await this.prisma.pPMP.create({
      data: {
        officeId: source.officeId,
        aipCycleId: source.aipCycleId,
        name: source.name,
        fundingProgram: source.fundingProgram,
        classification: source.classification,
        kind: 'FINAL',
        sourcePpmpId: source.id,
        lineItems: { create: lines },
      },
      include: { lineItems: LINE_ITEMS_ORDERED },
    });
    return { ppmp: this.toResponse(final), unmatched };
  }

  async approve(id: string, user: JwtPayload) {
    const ppmp = await this.loadPpmpOrFail(id);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);

    if (ppmp.status === 'APPROVED') return this.toResponse(ppmp);

    const updated = await this.prisma.pPMP.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date() },
      include: { lineItems: LINE_ITEMS_ORDERED },
    });
    return this.toResponse(updated);
  }

  // ─── Publish ────────────────────────────────────────────────────────────

  async publish(id: string, user: JwtPayload) {
    const ppmp = await this.loadPpmpOrFail(id);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);

    if (ppmp.lineItems.length === 0) {
      throw new BadRequestException(
        'Add at least one line item before publishing',
      );
    }
    if (ppmp.isPublished) return this.toResponse(ppmp);
    if (ppmp.status !== 'APPROVED') {
      throw new BadRequestException(
        'This Project must be approved before it can be published',
      );
    }

    const updated = await this.prisma.pPMP.update({
      where: { id },
      data: { isPublished: true, publishedAt: new Date() },
      include: { lineItems: LINE_ITEMS_ORDERED },
    });
    return this.toResponse(updated);
  }

  async unpublish(id: string, user: JwtPayload) {
    const ppmp = await this.loadPpmpOrFail(id);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);

    const updated = await this.prisma.pPMP.update({
      where: { id },
      data: { isPublished: false },
      include: { lineItems: LINE_ITEMS_ORDERED },
    });
    return this.toResponse(updated);
  }

  /**
   * Publishes every ready (approved, non-empty, not-yet-published) PPMP
   * within the caller's office scope and the given filters. Not-yet-approved
   * or empty PPMPs are skipped, not failed — mirrors the cluster
   * batch-publish's "blocked entries are skipped" contract, minus the
   * multi-step readiness preview.
   */
  async publishAll(opts: ListPpmpDto, user: JwtPayload) {
    const scopeWhere = await this.officeScope.officeScopeWhere(user);
    const candidates = await this.prisma.pPMP.findMany({
      where: {
        AND: [scopeWhere, opts.officeId ? { officeId: opts.officeId } : {}],
        ...(opts.aipCycleId ? { aipCycleId: opts.aipCycleId } : {}),
        isPublished: false,
      },
      include: { lineItems: { select: { id: true } } },
    });

    const ready = candidates.filter(
      (p) => p.lineItems.length > 0 && p.status === 'APPROVED',
    );
    const skippedNames = candidates
      .filter((p) => p.lineItems.length === 0 || p.status !== 'APPROVED')
      .map((p) => p.name);

    if (ready.length > 0) {
      await this.prisma.pPMP.updateMany({
        where: { id: { in: ready.map((p) => p.id) } },
        data: { isPublished: true, publishedAt: new Date() },
      });
    }

    return {
      published: ready.length,
      skipped: skippedNames.length,
      skippedNames,
    };
  }

  // ─── Comments ───────────────────────────────────────────────────────────
  // Flat, internal, workflow-free — no stage-gating like ProgramComment,
  // since a Project has no approval workflow to gate on (specs/005
  // research.md Decision 3).

  private static readonly COMMENT_AUTHOR_SELECT = {
    id: true,
    firstName: true,
    lastName: true,
    role: true,
  } as const;

  async listComments(ppmpId: string, user: JwtPayload) {
    const ppmp = await this.loadPpmpOrFail(ppmpId);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);

    return this.prisma.ppmpComment.findMany({
      where: { ppmpId, parentCommentId: null },
      include: {
        author: { select: PpmpService.COMMENT_AUTHOR_SELECT },
        replies: {
          include: { author: { select: PpmpService.COMMENT_AUTHOR_SELECT } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addComment(
    ppmpId: string,
    dto: CreatePpmpCommentDto,
    user: JwtPayload,
  ) {
    const ppmp = await this.loadPpmpOrFail(ppmpId);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);

    if (dto.parentCommentId) {
      const parent = await this.prisma.ppmpComment.findUnique({
        where: { id: dto.parentCommentId },
      });
      if (!parent || parent.ppmpId !== ppmpId) {
        throw new NotFoundException('Comment not found');
      }
      if (parent.parentCommentId) {
        throw new BadRequestException(
          'Replies cannot themselves be replied to — one level of nesting only',
        );
      }
    }

    return this.prisma.ppmpComment.create({
      data: {
        ppmpId,
        authorUserId: user.sub,
        parentCommentId: dto.parentCommentId ?? null,
        content: dto.content,
      },
      include: { author: { select: PpmpService.COMMENT_AUTHOR_SELECT } },
    });
  }

  // ─── Public feedback (staff side) ──────────────────────────────────────

  async listFeedback(ppmpId: string, user: JwtPayload) {
    const ppmp = await this.loadPpmpOrFail(ppmpId);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);
    // The resident's email is never shown to staff here (as on /lgu/feedback).
    return this.prisma.ppmpFeedback.findMany({
      where: { ppmpId },
      omit: { submitterEmail: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async replyToFeedback(
    ppmpId: string,
    feedbackId: string,
    dto: ReplyPpmpFeedbackDto,
    user: JwtPayload,
  ) {
    const ppmp = await this.loadPpmpOrFail(ppmpId);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);

    const feedback = await this.prisma.ppmpFeedback.findUnique({
      where: { id: feedbackId },
    });
    if (!feedback || feedback.ppmpId !== ppmpId) {
      throw new NotFoundException('Feedback not found');
    }
    if (feedback.officialReply) {
      throw new ConflictException('This feedback already has a reply');
    }

    return this.prisma.ppmpFeedback.update({
      where: { id: feedbackId },
      omit: { submitterEmail: true },
      data: {
        officialReply: dto.reply,
        officialRepliedAt: new Date(),
        officialRepliedByUserId: user.sub,
      },
    });
  }

  // ─── History (synthesized, read-only — specs/005 research.md Decision 5) ──

  async getHistory(ppmpId: string, user: JwtPayload) {
    const ppmp = await this.loadPpmpOrFail(ppmpId);
    await this.officeScope.assertOfficeInScope(user, ppmp.officeId);
    return buildPpmpHistory(ppmp);
  }
}
