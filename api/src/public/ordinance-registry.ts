import {
  BudgetDocumentKind,
  BudgetDocumentStatus,
  CommentStage,
  Prisma,
  type PapClass,
} from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  budgetItemFundSourceWhere,
  budgetItemPapClassWhere,
  type FundSourceFilter,
} from '../common/pap-class-fund-filters.js';
import {
  asProgramView,
  itemIdOf,
  type BudgetItemNode,
} from '../budget-documents/budget-item-view.js';
import { LAST_HISTORICAL_FISCAL_YEAR } from '../programs/import-data-warnings.js';

/**
 * The public read path for an enacted Ordinance (specs/012 P2,
 * contracts/public-registry-documents.md). It answers the same URLs, in the
 * same shapes, as the AIP path in `PublicService`, so the client renders an
 * Annual Budget year with no fork. Every figure comes from `asProgramView`,
 * the same adapter open data and the LBP forms read.
 *
 *   GET /public/registry?cycleId&section=annual   → loadOrdinanceRegistry
 *   GET /public/registry/:id                       → getOrdinanceProgram
 *   GET /public/registry/:id/project-activities/:p → getOrdinancePA
 *
 * Only an ENACTED Ordinance is ever public. An LEP never is (specs/012 D11).
 */

type Db = Pick<
  PrismaService,
  'budgetDocument' | 'budgetItem' | 'programComment' | 'projectActivity'
>;

const NODE_SELECT = {
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

const TAG_SELECT = { select: { tag: { select: { id: true, name: true } } } };

const ENACTED_ORDINANCE = {
  kind: BudgetDocumentKind.ORDINANCE,
  status: BudgetDocumentStatus.ENACTED,
} satisfies Prisma.BudgetDocumentWhereInput;

/**
 * The document a year's Annual Budget section serves (specs/017 FR-002): its
 * enacted Ordinance, or — for a historical year with none — the LEP the Mayor
 * submitted, which is all the city portal posts for FY2023–2025. The one
 * predicate every public read of the Annual section uses, so the list, the
 * detail pages, the sections and the cycle record cannot disagree.
 */
export const PUBLIC_ANNUAL_DOCUMENT: Prisma.BudgetDocumentWhereInput = {
  OR: [
    ENACTED_ORDINANCE,
    {
      kind: BudgetDocumentKind.LEP,
      status: BudgetDocumentStatus.SUBMITTED,
      budgetCycle: {
        fiscalYear: { lte: LAST_HISTORICAL_FISCAL_YEAR },
        documents: { none: ENACTED_ORDINANCE },
      },
    },
  ],
};

/** The Annual section's document for the budget cycle an AIP cycle belongs to. */
export async function annualDocumentOf(
  prisma: Pick<PrismaService, 'budgetDocument'>,
  aipCycleId: string,
) {
  return prisma.budgetDocument.findFirst({
    where: {
      AND: [
        PUBLIC_ANNUAL_DOCUMENT,
        { budgetCycle: { aipCycle: { id: aipCycleId } } },
      ],
    },
    select: {
      id: true,
      kind: true,
      finalizedAt: true,
      budgetCycle: {
        select: { fiscalYear: true, aipCycle: { select: { id: true } } },
      },
    },
  });
}

/** A PPA of a public Annual document, or null — the public visibility rule. */
async function visibleItem(prisma: Db, itemId: string) {
  return prisma.budgetItem.findFirst({
    where: { id: itemId, document: PUBLIC_ANNUAL_DOCUMENT },
    select: {
      ...NODE_SELECT,
      documentId: true,
      createdAt: true,
      updatedAt: true,
      document: {
        select: {
          finalizedAt: true,
          budgetCycle: {
            select: { fiscalYear: true, aipCycle: { select: { id: true } } },
          },
        },
      },
    },
  });
}

/** True when the id is a PPA of an enacted Ordinance (checked before the AIP path). */
export async function isPublicOrdinanceItem(prisma: Db, itemId: string) {
  return (await visibleItem(prisma, itemId)) !== null;
}

export interface OrdinanceListQuery {
  clusterId?: string;
  officeId?: string;
  finishLineIds?: string[];
  papSectorId?: string;
  thematicTagIds?: string[];
  papClasses?: PapClass[];
  fundSources?: FundSourceFilter[];
  search?: string;
}

export async function loadOrdinanceRegistry(
  prisma: Db,
  documentId: string,
  finalizedAt: Date | null,
  opts: OrdinanceListQuery,
  page: number,
  limit: number,
  totalOfficeCount: number,
) {
  const conditions: Prisma.BudgetItemWhereInput[] = [
    { documentId, parentId: null },
  ];
  if (opts.clusterId) {
    conditions.push({
      finishLine: {
        finishLineClusters: { some: { clusterId: opts.clusterId } },
      },
    });
  }
  if (opts.officeId) {
    conditions.push({
      OR: [{ officeId: opts.officeId }, { hostOfficeId: opts.officeId }],
    });
  }
  if (opts.finishLineIds?.length) {
    conditions.push({ finishLineId: { in: opts.finishLineIds } });
  }
  if (opts.papSectorId) conditions.push({ papSectorId: opts.papSectorId });
  // Same semantics as the AIP path (common/pap-class-fund-filters.ts).
  const papClass = budgetItemPapClassWhere(opts.papClasses);
  if (papClass) conditions.push(papClass);
  const fundSource = budgetItemFundSourceWhere(opts.fundSources);
  if (fundSource) conditions.push(fundSource);
  // Same semantics as the AIP path: AND across tags, each matched on the root
  // or any PPA of its tree (`treeItems` includes the root itself).
  for (const tagId of opts.thematicTagIds ?? []) {
    conditions.push({
      treeItems: { some: { thematicTags: { some: { tagId } } } },
    });
  }
  if (opts.search) {
    const contains = { contains: opts.search, mode: 'insensitive' as const };
    conditions.push({
      OR: [
        { name: contains },
        { aipReferenceCode: contains },
        {
          treeItems: {
            some: { thematicTags: { some: { tag: { name: contains } } } },
          },
        },
      ],
    });
  }
  const where: Prisma.BudgetItemWhereInput = { AND: conditions };

  const [total, aggregate, roots, offices] = await Promise.all([
    prisma.budgetItem.count({ where }),
    prisma.budgetItem.aggregate({ where, _sum: { total: true } }),
    prisma.budgetItem.findMany({
      where,
      select: {
        ...NODE_SELECT,
        updatedAt: true,
        office: {
          select: {
            id: true,
            name: true,
            acronym: true,
            cluster: { select: { id: true, name: true } },
          },
        },
        hostOffice: { select: { id: true, name: true, acronym: true } },
        finishLine: { select: { id: true, name: true, visionNumber: true } },
        papSector: { select: { id: true, code: true, name: true } },
        thematicTags: TAG_SELECT,
      },
      orderBy: [
        { office: { acronym: 'asc' } },
        { papClass: { sort: 'asc', nulls: 'last' } },
        { orderIndex: 'asc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.budgetItem.findMany({
      where,
      select: { officeId: true },
      distinct: ['officeId'],
    }),
  ]);

  const rootIds = roots.map((r) => r.id);
  const [trees, feedback] = await Promise.all([
    prisma.budgetItem.findMany({
      where: { documentId, rootItemId: { in: rootIds } },
      select: NODE_SELECT,
    }),
    prisma.programComment.groupBy({
      by: ['budgetItemId'],
      where: {
        budgetItem: { rootItemId: { in: rootIds } },
        stage: CommentStage.PUBLIC_FEEDBACK,
        deletedAt: null,
      },
      _count: { _all: true },
    }),
  ]);
  const treeOf = new Map<string, BudgetItemNode[]>();
  for (const n of trees as BudgetItemNode[]) {
    treeOf.set(n.rootItemId, [...(treeOf.get(n.rootItemId) ?? []), n]);
  }
  const rootOfItem = new Map(trees.map((t) => [t.id, t.rootItemId]));
  const feedbackByRoot = new Map<string, number>();
  for (const f of feedback) {
    const root = rootOfItem.get(f.budgetItemId ?? '');
    if (root)
      feedbackByRoot.set(root, (feedbackByRoot.get(root) ?? 0) + f._count._all);
  }

  const items = roots.map((root) => {
    const { snapshot } = asProgramView(root, treeOf.get(root.id) ?? [root]);
    const pas = snapshot.projectActivities as Record<string, unknown>[];
    return {
      id: root.id,
      name: root.name,
      status: 'PUBLISHED',
      tentativeAipReferenceCode: root.aipReferenceCode,
      aipReferenceCode: root.aipReferenceCode,
      grandTotal: '0.00',
      psTotal: snapshot.psProposedTotal as string,
      mooeTotal: snapshot.mooeProposedTotal as string,
      feTotal: snapshot.feProposedTotal as string,
      coTotal: snapshot.coProposedTotal as string,
      proposedTotal: snapshot.proposedTotal as string,
      fundSources: snapshot.fundSources as string[],
      fundAllocations: [],
      publishedAt: finalizedAt,
      papClass: root.papClass,
      office: root.office,
      hostOffice: root.hostOffice,
      finishLine: root.finishLine,
      papSector: root.papSector,
      thematicTags: root.thematicTags.map((t) => t.tag),
      feedbackCount: feedbackByRoot.get(root.id) ?? 0,
      lastUpdatedAt: finalizedAt ?? root.updatedAt,
      updatedAt: root.updatedAt,
      projectActivities: pas.map((pa) => ({
        id: pa.id,
        type: pa.type,
        name: pa.name,
        parentProjectActivityId: pa.parentProjectActivityId,
        orderIndex: pa.orderIndex,
        tentativeAipReferenceCode: pa.aipReferenceCode,
        aipReferenceCode: pa.aipReferenceCode,
        costMode: pa.costMode,
        psTotal: pa.psEstimate,
        mooeTotal: pa.mooeEstimate,
        feTotal: pa.feEstimate,
        coTotal: pa.coEstimate,
        grandTotal: pa.proposedBudget,
        proposedBudget: pa.proposedBudget,
        fundSources: pa.fundSources,
        fundAllocations: [],
      })),
    };
  });

  const totalBudget = (aggregate._sum.total ?? new Prisma.Decimal(0)).toFixed(
    2,
  );
  return {
    total,
    page,
    limit,
    totalBudget,
    totalProposedBudget: totalBudget,
    submittedOfficeCount: offices.length,
    totalOfficeCount,
    items,
  };
}

/** One enacted Ordinance root PPA, in the AIP program-detail shape. Null if not public. */
export async function getOrdinanceProgram(prisma: Db, itemId: string) {
  const root = await visibleItem(prisma, itemId);
  if (!root || root.parentId !== null) return null;
  const full = await prisma.budgetItem.findUniqueOrThrow({
    where: { id: itemId },
    select: {
      office: { select: { id: true, name: true, acronym: true } },
      finishLine: { select: { id: true, name: true } },
      papSector: { select: { id: true, name: true, code: true } },
      thematicTags: TAG_SELECT,
    },
  });
  const tree = (await prisma.budgetItem.findMany({
    where: { rootItemId: itemId },
    select: NODE_SELECT,
  })) as BudgetItemNode[];
  const { snapshot } = asProgramView(root, tree);
  const tagsByItem = await tagsOf(
    prisma,
    tree.map((t) => t.id),
  );
  const rootTags = full.thematicTags.map((t) => t.tag);
  const fy = root.document.budgetCycle.fiscalYear;
  const aipCycleId = root.document.budgetCycle.aipCycle?.id ?? null;
  const period = periodOf(fy);
  return {
    id: root.id,
    name: root.name,
    tentativeAipReferenceCode: root.aipReferenceCode ?? '',
    aipReferenceCode: root.aipReferenceCode,
    status: 'PUBLISHED',
    aipCycleId,
    aipCycle: { id: aipCycleId, fiscalYear: fy },
    officeId: root.officeId,
    office: full.office,
    hostOfficeId: root.hostOfficeId,
    proposedTotal: snapshot.proposedTotal,
    publishedName: root.name,
    publishedProposedTotal: snapshot.proposedTotal,
    psProposedTotal: snapshot.psProposedTotal,
    mooeProposedTotal: snapshot.mooeProposedTotal,
    feProposedTotal: snapshot.feProposedTotal,
    coProposedTotal: snapshot.coProposedTotal,
    costMode: snapshot.costMode,
    finishLineId: full.finishLine?.id ?? null,
    papSectorId: full.papSector?.id ?? null,
    orderIndex: root.orderIndex,
    civilSocietyOrganizationId: null,
    civilSocietyOrganization: null,
    finishLine: full.finishLine,
    subFinishLine: null,
    papSector: full.papSector,
    papSubsectorCode: '000',
    papClass: root.papClass,
    supportingOffices: [],
    climateChangeTag: null,
    fundAllocations: [],
    fundSources: snapshot.fundSources,
    description: null,
    remarks: null,
    majorFinalOutput: root.majorFinalOutput,
    expectedOutput: root.performanceIndicator,
    targetForBudgetYear: root.target,
    ...period,
    psTotal: snapshot.psProposedTotal,
    mooeTotal: snapshot.mooeProposedTotal,
    feTotal: snapshot.feProposedTotal,
    coTotal: snapshot.coProposedTotal,
    grandTotal: '0.00',
    thematicTags: rootTags,
    projectActivities: (
      snapshot.projectActivities as Record<string, unknown>[]
    ).map((pa) => ({
      ...pa,
      ...period,
      description: null,
      remarks: null,
      lineItems: [],
      psTotal: pa.psEstimate,
      mooeTotal: pa.mooeEstimate,
      feTotal: pa.feEstimate,
      coTotal: pa.coEstimate,
      grandTotal: pa.proposedBudget,
      thematicTags: tagsByItem.get(itemIdOf(String(pa.id))) ?? [],
      inheritedThematicTags: rootTags,
    })),
    version: null,
    publishedAt: root.document.finalizedAt,
    lastUpdatedAt: root.document.finalizedAt ?? root.updatedAt,
    createdAt: root.createdAt,
    updatedAt: root.updatedAt,
  };
}

/**
 * One PPA under an enacted root, in the AIP project/activity-detail shape.
 * `paId` may be a real PPA, a synthetic own-money leaf (`<id>~own`), or the id
 * of the old "mirror" PA the 2026 Program rows carried — which now *is* the
 * root's own money, so an old link to it still lands somewhere true.
 */
export async function getOrdinancePA(prisma: Db, rootId: string, paId: string) {
  const root = await visibleItem(prisma, rootId);
  if (!root || root.parentId !== null) return null;
  const tree = (await prisma.budgetItem.findMany({
    where: { rootItemId: rootId },
    select: NODE_SELECT,
  })) as BudgetItemNode[];
  const { snapshot } = asProgramView(root, tree);
  const pas = snapshot.projectActivities as Record<string, unknown>[];
  let target = pas.find((p) => p.id === paId);
  if (!target && !tree.some((t) => t.id === paId)) {
    // The old mirror PA: a soft-deleted program's first PA, now the root's own money.
    const old = await prisma.projectActivity.findFirst({
      where: { id: paId, programId: rootId },
      select: { id: true },
    });
    if (old) {
      // The root's own money: its synthetic leaf when it has children, else the
      // root itself (a single-row program, which is all the old mirror ever was).
      target = pas.find((p) => p.id === `${rootId}~own`) ?? {
        id: `${rootId}~own`,
        type: 'ACTIVITY',
        name: snapshot.name,
        expectedOutput: snapshot.expectedOutput,
        proposedBudget: snapshot.proposedTotal,
        psEstimate: snapshot.psProposedTotal,
        mooeEstimate: snapshot.mooeProposedTotal,
        feEstimate: snapshot.feProposedTotal,
        coEstimate: snapshot.coProposedTotal,
        orderIndex: -1,
        parentProjectActivityId: null,
      };
    }
  }
  if (!target) return null;
  const tags = await tagsOf(prisma, [itemIdOf(String(target.id))]);
  const rootTags = (
    await prisma.budgetItem.findUniqueOrThrow({
      where: { id: rootId },
      select: { thematicTags: TAG_SELECT },
    })
  ).thematicTags.map((t) => t.tag);
  const parentId = target.parentProjectActivityId as string | null;
  const parent = parentId ? pas.find((p) => p.id === parentId) : null;
  const children = pas.filter((p) => p.parentProjectActivityId === target.id);
  const period = periodOf(root.document.budgetCycle.fiscalYear);
  const shape = (p: Record<string, unknown>) => ({
    id: p.id,
    type: p.type,
    name: p.name,
    expectedOutput: p.expectedOutput,
    proposedBudget: p.proposedBudget,
    proposedAmount: p.proposedBudget,
    psTotal: p.psEstimate,
    mooeTotal: p.mooeEstimate,
    feTotal: p.feEstimate,
    coTotal: p.coEstimate,
    grandTotal: p.proposedBudget,
    orderIndex: p.orderIndex,
    parentProjectActivityId: p.parentProjectActivityId,
  });
  return {
    ...shape(target),
    description: null,
    remarks: null,
    ...period,
    lineItems: [],
    thematicTags: tags.get(itemIdOf(String(target.id))) ?? [],
    inheritedThematicTags: rootTags,
    children: children.map(shape),
    parent: parent
      ? { id: parent.id, name: parent.name, type: parent.type }
      : null,
  };
}

/** The budget year is an appropriation's period (Jan–Dec), as the AIP rows carried it. */
const periodOf = (fy: number) => ({
  implementationStartMonth: 1,
  implementationStartYear: fy,
  implementationEndMonth: 12,
  implementationEndYear: fy,
});

async function tagsOf(prisma: Db, itemIds: string[]) {
  const rows = await prisma.budgetItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, thematicTags: TAG_SELECT },
  });
  return new Map(rows.map((r) => [r.id, r.thematicTags.map((t) => t.tag)]));
}

/**
 * The PPA a public feedback POST/GET names: the root itself, or a PPA under it
 * (a synthetic own-money leaf counts as the PPA that owns it). Null when either
 * is not part of an enacted Ordinance.
 */
export async function feedbackTargetOf(
  prisma: Db,
  rootId: string,
  paId?: string,
) {
  const root = await visibleItem(prisma, rootId);
  if (!root || root.parentId !== null) return null;
  if (!paId) return rootId;
  const id = itemIdOf(paId);
  const pa = await prisma.budgetItem.findFirst({
    where: { id, rootItemId: rootId },
    select: { id: true },
  });
  return pa?.id ?? null;
}

/**
 * Every root PPA of a document as an AIP program view, in registry order, with
 * the relations open data prints (office + cluster, finish line, sector). Two
 * queries for the whole document. Every row runs for the fiscal year, as on the
 * public detail.
 */
export async function loadOrdinanceViews(
  prisma: Pick<PrismaService, 'budgetItem'>,
  documentId: string,
  fiscalYear: number,
) {
  const [roots, items] = await Promise.all([
    prisma.budgetItem.findMany({
      where: { documentId, parentId: null },
      select: {
        ...NODE_SELECT,
        office: {
          select: {
            acronym: true,
            name: true,
            cluster: { select: { name: true } },
          },
        },
        finishLine: { select: { name: true, visionNumber: true } },
        papSector: { select: { code: true, name: true } },
      },
      orderBy: [
        { office: { acronym: 'asc' } },
        { papClass: { sort: 'asc', nulls: 'last' } },
        { orderIndex: 'asc' },
      ],
    }),
    prisma.budgetItem.findMany({ where: { documentId }, select: NODE_SELECT }),
  ]);
  const treeOf = new Map<string, BudgetItemNode[]>();
  for (const n of items as BudgetItemNode[]) {
    treeOf.set(n.rootItemId, [...(treeOf.get(n.rootItemId) ?? []), n]);
  }
  const period = periodOf(fiscalYear);
  return roots.map(({ office, finishLine, papSector, ...root }) => {
    const view = asProgramView(root, treeOf.get(root.id) ?? [root], {
      office,
      finishLine,
      papSector,
    });
    const pas = view.snapshot.projectActivities as Record<string, unknown>[];
    view.snapshot = {
      ...view.snapshot,
      ...period,
      projectActivities: pas.map((pa) => ({ ...pa, ...period })),
    };
    return view;
  });
}
