import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { compareWithPrevious } from './compare-previous.js';
import { RegistryCacheService } from '../cache/registry-cache.service.js';
import {
  BudgetDocumentAuditAction,
  BudgetDocumentKind,
  BudgetDocumentStatus,
  Prisma,
} from '../generated/prisma/index';
import {
  ALL_OFFICES,
  OfficeScopeService,
} from '../permissions/office-scope.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { subtreeAmounts, type BudgetItemNode } from './budget-item-view.js';
import { randomUUID } from 'node:crypto';
import { isAdoptedStatus } from '../budget-cycles/cycle-sections.js';
import { toSheetProgram } from '../aip-registry/lbp-figures.js';
import { planCarryForward } from './lep-carry-forward.js';
import { sourceLink } from '../common/source-link.js';
import { LIVE_PROGRAM } from '../programs/program-filters.js';
import { isHistoricalCycle } from '../programs/import-data-warnings.js';

const SOURCE_DOC = { select: { name: true, url: true, sheetGids: true } };

/** A row's provenance as one link: file, page, table/sheet and row. */
const withSource = <
  T extends {
    sourceDocument: {
      name: string;
      url: string | null;
      sheetGids: Prisma.JsonValue;
    } | null;
    sourceRef: string | null;
    sourcePage: number | null;
  },
>({
  sourceDocument,
  ...row
}: T) => ({
  ...row,
  source: sourceLink(sourceDocument, row.sourceRef, row.sourcePage),
});

/**
 * Budget Documents — the LEP and the Ordinance (specs/012, docs/adr/0001).
 *
 *   DRAFT ──finalize──► SUBMITTED   (LEP: sent to the Sanggunian)
 *         ──finalize──► ENACTED     (Ordinance: approved by the Mayor)
 *                         └─ refused while any PPA still carries an import warning
 *
 * Anything but DRAFT is frozen. There is no reopen: a bad import is fixed by
 * reseeding while still DRAFT. Every action writes a BudgetDocumentAuditLog row.
 *
 * Money (docs/adr/0004): each PPA stores its own PS/MOOE/FE/CO; `total` is own +
 * Σ children's totals, kept here by `recomputeTotals` — never written by hand.
 */
type Db = PrismaService | Prisma.TransactionClient;

const FINAL_STATUS: Record<BudgetDocumentKind, BudgetDocumentStatus> = {
  LEP: BudgetDocumentStatus.SUBMITTED,
  ORDINANCE: BudgetDocumentStatus.ENACTED,
};

const ITEM_NODE_SELECT = {
  id: true,
  parentId: true,
  rootItemId: true,
  officeId: true,
  hostOfficeId: true,
  papClass: true,
  aipReferenceCode: true,
  name: true,
  majorFinalOutput: true,
  performanceIndicator: true,
  target: true,
  ps: true,
  mooe: true,
  fe: true,
  co: true,
  unsplit: true,
  total: true,
  fundSource: true,
  orderIndex: true,
} as const satisfies Prisma.BudgetItemSelect;

@Injectable()
export class BudgetDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly officeScope: OfficeScopeService,
    private readonly registryCache: RegistryCacheService,
  ) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  list(budgetCycleId?: string) {
    return this.prisma.budgetDocument.findMany({
      where: budgetCycleId ? { budgetCycleId } : undefined,
      orderBy: [{ budgetCycle: { fiscalYear: 'desc' } }, { kind: 'asc' }],
      include: {
        budgetCycle: { select: { fiscalYear: true } },
        lepDetail: true,
        ordinanceDetail: true,
        _count: { select: { items: true, objectLines: true } },
      },
    });
  }

  /** One document with its root total and how many PPAs still need review. */
  async findOne(id: string) {
    const doc = await this.prisma.budgetDocument.findUnique({
      where: { id },
      include: {
        budgetCycle: { select: { id: true, fiscalYear: true } },
        lepDetail: true,
        ordinanceDetail: true,
        _count: { select: { items: true, objectLines: true } },
        // specs/017: each office's header block as this book prints it.
        officeHeaders: {
          select: {
            officeId: true,
            mandateLegalBasis: true,
            vision: true,
            mission: true,
            organizationalOutcomes: true,
            sourceRef: true,
            sourcePage: true,
            sourceDocument: SOURCE_DOC,
          },
        },
      },
    });
    if (!doc) throw new NotFoundException('Budget document not found');
    const [total, flagged] = await Promise.all([
      this.prisma.budgetItem.aggregate({
        where: { documentId: id, parentId: null },
        _sum: { total: true },
      }),
      this.prisma.budgetItem.count({
        where: { documentId: id, NOT: { importWarnings: { isEmpty: true } } },
      }),
    ]);
    const sum = total._sum.total ?? new Prisma.Decimal(0);
    const allocable = doc.lepDetail?.allocableTotal ?? null;
    return {
      ...doc,
      officeHeaders: doc.officeHeaders.map(withSource),
      total: sum.toFixed(2),
      flaggedItemCount: flagged,
      // An LEP against what the city can appropriate: positive = over. A soft
      // check, shown as a warning; it blocks nothing.
      overAllocable: allocable ? sum.minus(allocable).toFixed(2) : null,
    };
  }

  /**
   * A document's PPAs within the caller's office scope (an item counts when its
   * office or host office is in scope). Empty scope reads `id: { in: [] }`,
   * never `OR: []` (ARCHITECTURE-ESSENTIALS).
   */
  async items(
    id: string,
    user: JwtPayload,
    filter: { officeId?: string; rootItemId?: string; flagged?: boolean } = {},
  ) {
    await this.assertExists(id);
    return this.prisma.budgetItem
      .findMany({
        where: {
          AND: [
            { documentId: id },
            await this.scopeWhere(user),
            filter.officeId
              ? {
                  OR: [
                    { officeId: filter.officeId },
                    { hostOfficeId: filter.officeId },
                  ],
                }
              : {},
            filter.rootItemId ? { rootItemId: filter.rootItemId } : {},
            filter.flagged
              ? { NOT: { importWarnings: { isEmpty: true } } }
              : {},
          ],
        },
        orderBy: [{ officeId: 'asc' }, { orderIndex: 'asc' }],
        include: {
          office: { select: { id: true, acronym: true, name: true } },
          thematicTags: { include: { tag: true } },
          sourceDocument: SOURCE_DOC,
        },
      })
      .then((rows) => rows.map(withSource));
  }

  async objectLines(id: string, user: JwtPayload, officeId?: string) {
    await this.assertExists(id);
    const scope = await this.officeScope.effectiveOfficeIds(user);
    const inScope = scope === ALL_OFFICES ? {} : { officeId: { in: scope } };
    return this.prisma.budgetObjectLine
      .findMany({
        where: {
          AND: [{ documentId: id }, inScope, officeId ? { officeId } : {}],
        },
        orderBy: [{ officeId: 'asc' }, { orderIndex: 'asc' }],
        include: {
          office: { select: { id: true, acronym: true, name: true } },
          sourceDocument: SOURCE_DOC,
        },
      })
      .then((rows) => rows.map(withSource));
  }

  /**
   * The year-before comparison (specs/017 FR-010), within the caller's office
   * scope: an office's lines only for its own staff. The General Fund's
   * receipts belong to no office and are shown to every reader.
   */
  async comparePrevious(id: string, user: JwtPayload) {
    const result = await compareWithPrevious(this.prisma, id);
    const scope = await this.officeScope.effectiveOfficeIds(user);
    if (scope === ALL_OFFICES) return result;
    const mine = new Set(
      (
        await this.prisma.office.findMany({
          where: { id: { in: scope } },
          select: { acronym: true },
        })
      ).map((o) => o.acronym),
    );
    return {
      ...result,
      rows: result.rows.filter((r) => r.scope === 'GF' || mine.has(r.scope)),
    };
  }

  async audit(id: string) {
    await this.assertExists(id);
    return this.prisma.budgetDocumentAuditLog.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  /**
   * Finalize: an LEP becomes SUBMITTED, an Ordinance ENACTED. Frozen after.
   * Refused while any PPA still carries an import warning when finalizing makes
   * the document public: always for an Ordinance (the legal record), and for a
   * historical year's LEP, which the Annual section then serves (specs/017
   * FR-002). Nothing unreviewed goes public.
   */
  async finalize(
    id: string,
    actorUserId: string | null,
    /**
     * Runs inside the same transaction, after the warnings gate and before the
     * status changes — the 2026 re-import moves its comments here, so they
     * switch to the enacted PPAs at exactly the moment the public site does.
     */
    inTransaction?: (tx: Prisma.TransactionClient) => Promise<void>,
    txOptions?: { timeout?: number; maxWait?: number },
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const doc = await this.assertDraft(id, tx);
      const goesPublic =
        doc.kind === BudgetDocumentKind.ORDINANCE ||
        isHistoricalCycle(
          (
            await tx.budgetCycle.findUniqueOrThrow({
              where: { id: doc.budgetCycleId },
              select: { fiscalYear: true },
            })
          ).fiscalYear,
        );
      if (goesPublic) {
        const flagged = await tx.budgetItem.findMany({
          where: { documentId: id, NOT: { importWarnings: { isEmpty: true } } },
          select: {
            id: true,
            aipReferenceCode: true,
            name: true,
            importWarnings: true,
          },
          orderBy: { orderIndex: 'asc' },
        });
        if (flagged.length > 0) {
          throw new ConflictException({
            code: 'DOCUMENT_HAS_IMPORT_WARNINGS',
            message: `${flagged.length} PPA(s) still carry an import warning. Review them before it goes public.`,
            items: flagged,
          });
        }
      }
      if (inTransaction) await inTransaction(tx);
      const status = FINAL_STATUS[doc.kind];
      const updated = await tx.budgetDocument.update({
        where: { id },
        data: {
          status,
          finalizedAt: new Date(),
          finalizedByUserId: actorUserId,
        },
      });
      await this.record(
        tx,
        id,
        BudgetDocumentAuditAction.FINALIZED,
        actorUserId,
        {
          status,
        },
      );
      return updated;
    }, txOptions);
    // An enacted Ordinance changes what the public site and open data serve.
    await this.registryCache.invalidatePublicRegistry();
    return result;
  }

  /** Clear one PPA's import warnings once someone has reviewed them (DRAFT only). */
  async acknowledgeImport(
    id: string,
    itemId: string,
    actorUserId: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertDraft(id, tx);
      const item = await tx.budgetItem.findFirst({
        where: { id: itemId, documentId: id },
        select: { importWarnings: true },
      });
      if (!item) throw new NotFoundException('PPA not found in this document');
      const updated = await tx.budgetItem.update({
        where: { id: itemId },
        data: { importWarnings: [] },
      });
      await this.record(
        tx,
        id,
        BudgetDocumentAuditAction.ACKNOWLEDGED,
        actorUserId,
        {
          cleared: item.importWarnings,
        },
        itemId,
      );
      return updated;
    });
  }

  /**
   * Recompute every PPA's `total` (own + Σ children) for a document, writing
   * only the rows that changed. Call inside the transaction of any write that
   * touches amounts or the tree. Also refuses a tree whose `rootItemId` is
   * inconsistent with its parents, which the DB CHECK cannot see across rows.
   */
  async recomputeTotals(documentId: string, tx: Db = this.prisma) {
    const items = (await tx.budgetItem.findMany({
      where: { documentId },
      select: ITEM_NODE_SELECT,
    })) as BudgetItemNode[];
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const i of items) {
      const parent = i.parentId ? byId.get(i.parentId) : undefined;
      const expectedRoot = parent ? parent.rootItemId : i.id;
      if (i.rootItemId !== expectedRoot) {
        throw new ConflictException(
          `PPA ${i.id} names root ${i.rootItemId}, but its tree's root is ${expectedRoot}`,
        );
      }
    }
    const amounts = subtreeAmounts(items);
    let changed = 0;
    for (const i of items) {
      const total = amounts.get(i.id)!.total;
      if (!total.equals(i.total)) {
        await tx.budgetItem.update({ where: { id: i.id }, data: { total } });
        changed++;
      }
    }
    return { items: items.length, changed };
  }

  /** The document, refusing anything but DRAFT. Every write calls this first. */
  async assertDraft(id: string, tx: Db = this.prisma) {
    const doc = await tx.budgetDocument.findUnique({
      where: { id },
      select: { id: true, kind: true, status: true, budgetCycleId: true },
    });
    if (!doc) throw new NotFoundException('Budget document not found');
    if (doc.status !== BudgetDocumentStatus.DRAFT) {
      throw new ConflictException({
        code: 'DOCUMENT_FROZEN',
        message: `This ${doc.kind === 'LEP' ? 'LEP' : 'Ordinance'} is ${doc.status.toLowerCase()} and can no longer be changed.`,
      });
    }
    return doc;
  }

  /**
   * Start the year's LEP from its adopted AIP (specs/012 D10): a DRAFT LEP
   * whose PPAs are the AIP's programs and PAs (`planCarryForward`), and whose
   * object lines are the approved PPMPs' lines summed by office × account ×
   * fund. Refused unless the AIP is adopted and the year has no LEP yet.
   */
  async carryForward(
    aipCycleId: string,
    actorUserId: string,
    allocableTotal: Prisma.Decimal,
  ) {
    if (!allocableTotal.greaterThan(0))
      throw new BadRequestException(
        'Declare the total allocable budget (more than zero) before starting the LEP.',
      );
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id: aipCycleId },
      select: { id: true, status: true, fiscalYear: true, budgetCycleId: true },
    });
    if (!cycle) throw new NotFoundException('AIP cycle not found');
    if (!isAdoptedStatus(cycle.status))
      throw new ConflictException({
        code: 'AIP_NOT_ADOPTED',
        message: 'The LEP is carried forward from an adopted AIP.',
      });
    const existing = await this.prisma.budgetDocument.findFirst({
      where: {
        budgetCycleId: cycle.budgetCycleId,
        kind: BudgetDocumentKind.LEP,
      },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException({
        code: 'LEP_EXISTS',
        message: 'This year already has an LEP.',
        documentId: existing.id,
      });

    const tagSelect = { select: { tagId: true, appliedByUserId: true } };
    const [rows, ppmpLines] = await Promise.all([
      this.prisma.program.findMany({
        where: { aipCycleId, ...LIVE_PROGRAM },
        include: {
          office: { select: { name: true, acronym: true } },
          fundAllocations: { orderBy: { orderIndex: 'asc' } },
          thematicTags: tagSelect,
          projectActivities: {
            orderBy: { orderIndex: 'asc' },
            include: {
              fundAllocations: { orderBy: { orderIndex: 'asc' } },
              thematicTags: tagSelect,
            },
          },
        },
        orderBy: [
          { papClass: { sort: 'asc', nulls: 'last' } },
          { orderIndex: 'asc' },
          { createdAt: 'asc' },
        ],
      }),
      this.prisma.pPMPLineItem.findMany({
        where: {
          ppmp: { aipCycleId, status: 'APPROVED', kind: 'INDICATIVE' },
        },
        select: {
          uacsObjectId: true,
          uacsCode: true,
          uacsDescription: true,
          expenseClass: true,
          fundSource: true,
          lineTotal: true,
          ppmp: { select: { officeId: true } },
        },
      }),
    ]);

    if (rows.length === 0)
      throw new ConflictException({
        code: 'AIP_EMPTY',
        message: 'This AIP has no programs to carry forward.',
      });
    const { items, listed } = planCarryForward(
      rows.map((r) => ({
        sheet: toSheetProgram(
          r as unknown as Record<string, unknown>,
          r.office,
        ),
        finishLineId: r.finishLineId,
        papSectorId: r.papSectorId,
        tagIds: r.thematicTags,
        activityTags: new Map(
          r.projectActivities.map((a) => [a.id, a.thematicTags]),
        ),
      })),
      randomUUID,
    );

    const lines = new Map<string, Prisma.BudgetObjectLineCreateManyInput>();
    for (const l of ppmpLines) {
      const key = [
        l.ppmp.officeId,
        l.uacsObjectId,
        l.fundSource,
        l.expenseClass,
      ].join('|');
      const line = lines.get(key);
      if (line)
        line.amount = new Prisma.Decimal(line.amount as Prisma.Decimal).plus(
          l.lineTotal,
        );
      else
        lines.set(key, {
          documentId: '',
          officeId: l.ppmp.officeId,
          uacsObjectId: l.uacsObjectId,
          uacsCode: l.uacsCode,
          accountTitle: l.uacsDescription,
          expenseClass: l.expenseClass,
          fundSource: l.fundSource,
          amount: l.lineTotal,
          orderIndex: lines.size,
          sourceRef: 'approved PPMP lines',
        });
    }

    const doc = await this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.budgetDocument.create({
          data: {
            budgetCycleId: cycle.budgetCycleId,
            kind: BudgetDocumentKind.LEP,
            sourceDocumentName: `Carried forward from the FY${cycle.fiscalYear} AIP`,
            lepDetail: { create: { allocableTotal } },
          },
        });
        // Each PPA cites the AIP row it came from: that row's file and cell.
        const sourceOf = new Map<
          string,
          { sourceDocumentId: string | null; sourceRef: string | null }
        >();
        for (const r of rows) {
          sourceOf.set(r.id, {
            sourceDocumentId: r.sourceDocumentId,
            sourceRef: r.sourceRef,
          });
          for (const a of r.projectActivities)
            sourceOf.set(a.id, {
              sourceDocumentId: a.sourceDocumentId,
              sourceRef: a.sourceRef,
            });
        }
        // A per-fund child of a split row cites its parent's row (parents
        // are planned first, so theirs is already known).
        const cited = new Map<
          string,
          { sourceDocumentId: string | null; sourceRef: string | null }
        >();
        for (const i of items) {
          const own = sourceOf.get(
            i.sourceProgramId ?? i.sourceProjectActivityId ?? '',
          );
          const c = own ?? (i.parentId ? cited.get(i.parentId) : undefined);
          if (c) cited.set(i.id, c);
        }
        await tx.budgetItem.createMany({
          data: items.map(({ tags: _t, ...i }) => ({
            ...i,
            ...(cited.get(i.id) ?? {}),
            documentId: doc.id,
          })),
        });
        const tags = items.flatMap((i) =>
          i.tags.map((t) => ({ budgetItemId: i.id, ...t })),
        );
        if (tags.length)
          await tx.budgetItemThematicTag.createMany({ data: tags });
        if (lines.size)
          await tx.budgetObjectLine.createMany({
            data: [...lines.values()].map((l) => ({
              ...l,
              documentId: doc.id,
            })),
          });
        await this.recomputeTotals(doc.id, tx);
        await this.record(
          tx,
          doc.id,
          BudgetDocumentAuditAction.IMPORTED,
          actorUserId,
          {
            source: 'carry-forward',
            allocableTotal: allocableTotal.toFixed(2),
            programs: rows.length,
            items: items.length,
            objectLines: lines.size,
            listed: listed.map((l) => l.name),
          },
        );
        return doc;
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
    return { document: await this.findOne(doc.id), listed };
  }

  /** Revise a draft LEP's total allocable budget (estimates change). */
  async setAllocableTotal(
    id: string,
    allocableTotal: Prisma.Decimal,
    actorUserId: string,
  ) {
    if (!allocableTotal.greaterThan(0))
      throw new BadRequestException(
        'The total allocable budget must be more than zero.',
      );
    await this.prisma.$transaction(async (tx) => {
      const doc = await this.assertDraft(id, tx);
      if (doc.kind !== BudgetDocumentKind.LEP)
        throw new BadRequestException('Only an LEP has an allocable total.');
      const before = await tx.lepDetail.findUnique({
        where: { documentId: id },
        select: { allocableTotal: true },
      });
      await tx.lepDetail.upsert({
        where: { documentId: id },
        create: { documentId: id, allocableTotal },
        update: { allocableTotal },
      });
      await this.record(tx, id, BudgetDocumentAuditAction.EDITED, actorUserId, {
        field: 'allocableTotal',
        from: before?.allocableTotal?.toFixed(2) ?? null,
        to: allocableTotal.toFixed(2),
      });
    });
    return this.findOne(id);
  }

  record(
    tx: Db,
    documentId: string,
    action: BudgetDocumentAuditAction,
    actorUserId: string | null,
    detail: Prisma.InputJsonValue = {},
    itemId?: string,
  ) {
    return tx.budgetDocumentAuditLog.create({
      data: { documentId, action, actorUserId, detail, itemId: itemId ?? null },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async assertExists(id: string) {
    const doc = await this.prisma.budgetDocument.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('Budget document not found');
  }

  private async scopeWhere(
    user: JwtPayload,
  ): Promise<Prisma.BudgetItemWhereInput> {
    const scope = await this.officeScope.effectiveOfficeIds(user);
    if (scope === ALL_OFFICES) return {};
    if (scope.length === 0) return { id: { in: [] } };
    return {
      OR: [{ officeId: { in: scope } }, { hostOfficeId: { in: scope } }],
    };
  }
}
