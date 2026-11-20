import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { loadCycleSections } from '../budget-cycles/cycle-sections.js';
import {
  annualDocumentOf,
  PUBLIC_ANNUAL_DOCUMENT,
  feedbackTargetOf,
  getOrdinancePA,
  getOrdinanceProgram,
  isPublicOrdinanceItem,
  loadOrdinanceRegistry,
} from './ordinance-registry.js';
import { CacheService } from '../cache/cache.service.js';
import { RegistryCacheService } from '../cache/registry-cache.service.js';
import { cacheKey } from '../cache/cache-key.js';
import {
  PUBLIC_REGISTRY_KEY_PREFIX,
  PUBLIC_REGISTRY_TTL_SECONDS,
  REFERENCE_KEY_PREFIX,
  REFERENCE_TTL_SECONDS,
} from '../cache/cache.constants.js';
import {
  BudgetDocumentKind,
  CommentStage,
  CommentTarget,
  FundSource,
  Prisma,
  ProgramStatus,
  type PapClass,
} from '../generated/prisma/index';
import {
  type FundSourceFilter,
  programFundSourceWhere,
  programPapClassWhere,
} from '../common/pap-class-fund-filters.js';
import type { PublicFeedbackDto } from './dto/public-feedback.dto.js';
import type { PublicRegistryFeedbackDto } from './dto/public-registry-feedback.dto.js';
import type { PublicPpmpFeedbackDto } from './dto/public-ppmp-feedback.dto.js';
import { buildPpmpHistory } from '../ppmp/ppmp-history.util.js';
import {
  PUBLICLY_READABLE,
  PUBLICLY_VISIBLE,
} from '../programs/program-filters.js';

/**
 * The public expense-class figure (D17).
 *
 * Two money families exist: the line-item rollups (`psTotal`…) and the proposed
 * estimates (`psProposedTotal` on Program, `psEstimate` on ProjectActivity).
 * Line-item entry is deferred, so the rollups are structurally zero — which is
 * why the PS/MOOE/FE/CO cards read ₱0.00 while the headline Proposed Budget was
 * already correct. The proposal is the public number, exactly as `proposedTotal`
 * is for the headline; the rollup is only a fallback for the later phase where
 * line items exist but estimates were never filled in.
 */
/**
 * Drops import provenance (`sourceRef`, `sourceDocumentId`) from a row the
 * public is served. It points into the city's internal workbook, so it stays
 * staff-only — and live rows and snapshots both carry it, so every spread of
 * one on a public route goes through here.
 */
export function stripProvenance<T extends Record<string, unknown>>(
  row: T,
): Omit<T, 'sourceRef' | 'sourceDocumentId'> {
  const { sourceRef: _ref, sourceDocumentId: _doc, ...rest } = row;
  return rest;
}

/** Identity and placement: read live (they are not draft content). */
const PUBLIC_PROGRAM_META = [
  'id',
  'aipCycleId',
  'officeId',
  'hostOfficeId',
  'papSectorId',
  'finishLineId',
  'subFinishLineId',
  'status',
  'orderIndex',
  'publishedAt',
  'createdAt',
  'updatedAt',
] as const;
/** Published content: read from the snapshot (see getProgram). */
const PUBLIC_PROGRAM_CONTENT = [
  'remarks',
  'majorFinalOutput',
  'targetForBudgetYear',
  'implementationStartMonth',
  'implementationStartYear',
  'implementationEndMonth',
  'implementationEndYear',
  'tentativeAipReferenceCode',
  'aipReferenceCode',
  'papSubsectorCode',
  'papClass',
  'costMode',
  'fundSources',
  'grandTotal',
] as const;

/** What the public PA detail serves of a snapshot PA — named, never spread. */
const PUBLIC_PA_FIELDS = [
  'id',
  'type',
  'name',
  'description',
  'remarks',
  'expectedOutput',
  'implementationStartMonth',
  'implementationStartYear',
  'implementationEndMonth',
  'implementationEndYear',
  'orderIndex',
  'parentProjectActivityId',
] as const;
const PUBLIC_PA_CHILD_FIELDS = [
  'id',
  'type',
  'name',
  'expectedOutput',
  'orderIndex',
  'parentProjectActivityId',
] as const;
const PUBLIC_LINE_ITEM_FIELDS = [
  'id',
  'expenseClass',
  'uacsCode',
  'uacsDescription',
  'quantity',
  'unit',
  'unitCost',
  'lineTotal',
  'remarks',
  'orderIndex',
] as const;

function pick(
  row: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));
}

function byOrderIndex(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): number {
  return Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0);
}

function snapshotMoney(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value as Prisma.Decimal.Value).toFixed(2);
}

/** A snapshot PA's public money, in the shape the live PA reads used to return. */
function publicPAMoney(pa: Record<string, unknown>) {
  const proposedBudget = snapshotMoney(pa.proposedBudget);
  return {
    proposedBudget,
    proposedAmount: proposedBudget ?? snapshotMoney(pa.grandTotal) ?? '0.00',
    psTotal: snapshotExpenseClassAmount(pa.psEstimate, pa.psTotal),
    mooeTotal: snapshotExpenseClassAmount(pa.mooeEstimate, pa.mooeTotal),
    feTotal: snapshotExpenseClassAmount(pa.feEstimate, pa.feTotal),
    coTotal: snapshotExpenseClassAmount(pa.coEstimate, pa.coTotal),
  };
}

const FUND_ALLOCATION_FIELDS = ['fundSource', 'ps', 'mooe', 'fe', 'co'];

function snapshotFundAllocations(value: unknown) {
  return ((value ?? []) as Array<Record<string, unknown>>)
    .slice()
    .sort(byOrderIndex)
    .map((row) => pick(row, FUND_ALLOCATION_FIELDS));
}

/** A registry row for a program mid-revision, re-read from its published snapshot. */
function listRowFromSnapshot<T extends Record<string, unknown>>(
  item: T,
  snapshot: Record<string, unknown>,
): T {
  const pas = (snapshot.projectActivities ?? []) as Array<
    Record<string, unknown>
  >;
  return {
    ...item,
    grandTotal: snapshotMoney(snapshot.grandTotal) ?? item.grandTotal,
    psTotal: snapshotExpenseClassAmount(
      snapshot.psProposedTotal,
      snapshot.psTotal,
    ),
    mooeTotal: snapshotExpenseClassAmount(
      snapshot.mooeProposedTotal,
      snapshot.mooeTotal,
    ),
    feTotal: snapshotExpenseClassAmount(
      snapshot.feProposedTotal,
      snapshot.feTotal,
    ),
    coTotal: snapshotExpenseClassAmount(
      snapshot.coProposedTotal,
      snapshot.coTotal,
    ),
    fundSources: snapshot.fundSources ?? item.fundSources,
    fundAllocations: snapshotFundAllocations(snapshot.fundAllocations),
    projectActivities: pas
      .slice()
      .sort(byOrderIndex)
      .map((pa) => ({
        ...pick(pa, [
          'id',
          'type',
          'name',
          'parentProjectActivityId',
          'orderIndex',
          'tentativeAipReferenceCode',
          'aipReferenceCode',
          'costMode',
          'fundSources',
        ]),
        fundAllocations: snapshotFundAllocations(pa.fundAllocations),
        ...publicPAMoney(pa),
        grandTotal: snapshotMoney(pa.grandTotal) ?? '0.00',
      })),
  };
}

export function publicExpenseClassAmount(
  proposed: Prisma.Decimal | null | undefined,
  rollup: Prisma.Decimal,
): string {
  return proposed && !proposed.isZero()
    ? proposed.toFixed(2)
    : rollup.toFixed(2);
}

/**
 * Same rule as `publicExpenseClassAmount`, for values read out of a published
 * `ProgramVersion.snapshot`. The snapshot is JSON, so decimals arrive as strings
 * — routed through `Prisma.Decimal` rather than `Number`, since these are
 * `Decimal(18,2)` money columns.
 */
export function snapshotExpenseClassAmount(
  proposed: unknown,
  rollup: unknown,
): string {
  const toDecimal = (value: unknown): Prisma.Decimal | null => {
    // Narrow before constructing: an object would stringify to
    // "[object Object]" and only fail inside the Decimal constructor.
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      !Prisma.Decimal.isDecimal(value)
    ) {
      return null;
    }
    try {
      return new Prisma.Decimal(value);
    } catch {
      return null;
    }
  };
  const proposedDecimal = toDecimal(proposed);
  if (proposedDecimal && !proposedDecimal.isZero()) {
    return proposedDecimal.toFixed(2);
  }
  return (toDecimal(rollup) ?? new Prisma.Decimal(0)).toFixed(2);
}

/** A per-fund split line as the public reads it — one figure per class. */
const FUND_ALLOCATION_SELECT = {
  fundSource: true,
  ps: true,
  mooe: true,
  fe: true,
  co: true,
} as const;

interface ListPublicRegistryQuery {
  cycleId: string;
  clusterId?: string;
  officeId?: string;
  finishLineIds?: string[];
  papSectorId?: string;
  /** A program must carry every given tag id (AND across tags) — matched
   * either on the Program's own direct tags or on any of its project/activities'
   * (OR across levels, per-tag). Supersedes FR-017's program-only scope. */
  thematicTagIds?: string[];
  /** Any of these PAP classes; Operations includes a program with none (#107). */
  papClasses?: PapClass[];
  /** Any of these funds on the program or a PPA; `NONE` for neither (#107). */
  fundSources?: FundSourceFilter[];
  search?: string;
  /**
   * Which document of the year to read: the AIP or the enacted Ordinance
   * (specs/012). Omitted, a year in both sections reads its AIP and a year in
   * the Annual Budget section only reads its Ordinance.
   */
  section?: 'aip' | 'annual';
  page?: number;
  limit?: number;
}

// The public visibility predicates live with the programs module (specs/013).
export { PUBLICLY_VISIBLE } from '../programs/program-filters.js';

function redactName(name: string | null | undefined): string {
  if (!name) return 'Anonymous';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly registryCache: RegistryCacheService,
  ) {}

  /**
   * Public cycles. `sections` says which public sections the year belongs to
   * (computed once, server-side — see `computeSections`); `status` is kept for
   * one release for clients that still read it, and equals `aipStatus`.
   */
  async listCycles() {
    const [cycles, sections] = await Promise.all([
      this.prisma.aIPCycle.findMany({
        select: {
          id: true,
          fiscalYear: true,
          status: true,
          publicComparisonEnabled: true,
          publicAipOverviewEnabled: true,
          publicAnnualOverviewEnabled: true,
          publicPpmpOverviewEnabled: true,
          budgetCycle: {
            select: {
              currentStage: true,
              alongsideStages: true,
              statedTotal: true,
              statedOfficeTotal: true,
              statedSpecialTotal: true,
              statedSource: true,
              documents: {
                where: PUBLIC_ANNUAL_DOCUMENT,
                select: {
                  kind: true,
                  _count: {
                    select: {
                      receiptLines: true,
                      objectLines: true,
                      indebtedness: true,
                      obligations: true,
                    },
                  },
                },
                take: 1,
              },
            },
          },
        },
        orderBy: { fiscalYear: 'desc' },
      }),
      loadCycleSections(this.prisma),
    ]);
    // "Last updated" = the newest publish among the programs the public can
    // list (specs/013 FR-007). `Program.publishedAt` is the *first* publish
    // only; the time a version went public is its `submittedAt`.
    const lastPublished = await Promise.all(
      cycles.map((c) =>
        this.prisma.programVersion.aggregate({
          _max: { submittedAt: true },
          where: {
            publishedFor: { some: { aipCycleId: c.id, ...PUBLICLY_VISIBLE } },
          },
        }),
      ),
    );
    return cycles.map(({ budgetCycle, ...c }, i) => ({
      ...c,
      aipStatus: c.status,
      sections: sections.get(c.id) ?? [],
      currentStage: budgetCycle.currentStage,
      alongsideStages: budgetCycle.alongsideStages,
      lastPublishedAt: lastPublished[i]._max.submittedAt,
      // A headline from the enacted ordinance — shown, never summed (FR-021).
      statedTotal: budgetCycle.statedTotal?.toFixed(2) ?? null,
      statedOfficeTotal: budgetCycle.statedOfficeTotal?.toFixed(2) ?? null,
      statedSpecialTotal: budgetCycle.statedSpecialTotal?.toFixed(2) ?? null,
      statedSource: budgetCycle.statedSource,
      // The Annual section's document (specs/017 FR-002): ORDINANCE once
      // enacted, LEP for a historical year that only has its proposal, else
      // null. Its rows hold every peso, special funds included (specs/016), so
      // their sum is the headline and a stated total is only a check.
      annualDocumentKind: budgetCycle.documents?.[0]?.kind ?? null,
      hasEnactedOrdinance:
        budgetCycle.documents?.[0]?.kind === BudgetDocumentKind.ORDINANCE,
      // Which parts of the rest of the book the Annual document carries
      // (specs/017): the section shows a tab only for what is there.
      annualBook: {
        receipts: (budgetCycle.documents?.[0]?._count?.receiptLines ?? 0) > 0,
        objects: (budgetCycle.documents?.[0]?._count?.objectLines ?? 0) > 0,
        debt:
          (budgetCycle.documents?.[0]?._count?.indebtedness ?? 0) +
            (budgetCycle.documents?.[0]?._count?.obligations ?? 0) >
          0,
      },
    }));
  }

  /**
   * The law behind a special fund as it stood in `fiscalYear`: the newest rule
   * effective on or before it (specs/016 FR-006). Public; the rule check it
   * implies is advisory and derived by the reader, never stored.
   */
  async getFundRule(fund: string, fiscalYear: number) {
    if (!(Object.values(FundSource) as string[]).includes(fund)) {
      throw new NotFoundException('No such fund');
    }
    const rule = await this.prisma.fundRule.findFirst({
      where: {
        fundSource: fund as FundSource,
        effectiveFrom: { lte: fiscalYear },
      },
      orderBy: { effectiveFrom: 'desc' },
      select: {
        fundSource: true,
        effectiveFrom: true,
        legalBasis: true,
        description: true,
        minimumPercent: true,
        minimumBase: true,
      },
    });
    if (!rule) throw new NotFoundException('No rule recorded for this fund');
    return { ...rule, minimumPercent: rule.minimumPercent?.toFixed(3) ?? null };
  }

  listClusters() {
    return this.prisma.cluster.findMany({
      select: {
        id: true,
        name: true,
        offices: {
          where: { isActive: true },
          select: { id: true, name: true, acronym: true },
          orderBy: { name: 'asc' },
        },
        finishLineClusters: {
          select: {
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

  /** Active tags only — populates the public registry's tag filter. */
  listThematicTags() {
    return this.prisma.thematicTag.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  /**
   * The public registry list. Anonymous and identical for every visitor, so the
   * whole response is cached under one key per filter combination — including
   * the homepage's `limit: 1` stat-tile call, which otherwise ran this entire
   * six-query transaction on every visit.
   *
   * Publishing and public feedback invalidate the group explicitly
   * (`invalidatePublicRegistry`); the TTL is only a safety net.
   */
  async listPrograms(opts: ListPublicRegistryQuery) {
    if (!opts.cycleId) {
      throw new BadRequestException('cycleId is required');
    }

    // Clamped before the key is built: `limit: 5000` and `limit: 1000` are the
    // same query, so they must not occupy two entries.
    //
    // The ceiling matches `AIPRegistryService.MAX_PAGE_SIZE` and exists for the
    // same reason: the registry groups by office, and grouping is only correct
    // over the complete result set, so the caller pulls a whole cycle in one
    // request rather than a page of it.
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(1000, Math.max(1, opts.limit ?? 25));

    const key = cacheKey(PUBLIC_REGISTRY_KEY_PREFIX, {
      cycleId: opts.cycleId,
      clusterId: opts.clusterId,
      officeId: opts.officeId,
      finishLineIds: opts.finishLineIds,
      papSectorId: opts.papSectorId,
      thematicTagIds: opts.thematicTagIds,
      papClasses: opts.papClasses,
      fundSources: opts.fundSources,
      // Matched with Prisma `mode: 'insensitive'`, so case must not split keys.
      search: opts.search?.toLowerCase(),
      section: opts.section,
      page,
      limit,
    });

    return this.cache.getOrSet(key, PUBLIC_REGISTRY_TTL_SECONDS, () =>
      this.loadPrograms(opts, page, limit),
    );
  }

  /**
   * The enacted Ordinance to read for a cycle and section, or null for the AIP
   * path. `annual` asks for the Ordinance; `aip` never gets it; no section
   * follows the year's public sections (computeSections).
   */
  private async ordinanceSource(cycleId: string, section?: 'aip' | 'annual') {
    if (section === 'aip') return null;
    const doc = await annualDocumentOf(this.prisma, cycleId);
    if (!doc || section === 'annual') return doc;
    const sections = (await loadCycleSections(this.prisma)).get(cycleId) ?? [];
    return sections.includes('aip') ? null : doc;
  }

  /** Uncached body of `listPrograms`. */
  private async loadPrograms(
    opts: ListPublicRegistryQuery,
    page: number,
    limit: number,
  ) {
    const ordinance = await this.ordinanceSource(opts.cycleId, opts.section);
    if (ordinance) {
      const officeCount = await this.cache.getOrSet(
        `${REFERENCE_KEY_PREFIX}active-office-count`,
        REFERENCE_TTL_SECONDS,
        () => this.prisma.office.count({ where: { isActive: true } }),
      );
      return loadOrdinanceRegistry(
        this.prisma,
        ordinance.id,
        ordinance.finalizedAt,
        opts,
        page,
        limit,
        officeCount,
      );
    }
    const conditions: Prisma.ProgramWhereInput[] = [
      PUBLICLY_VISIBLE,
      { aipCycleId: opts.cycleId },
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
        OR: [
          { officeId: opts.officeId },
          {
            supportingOffices: {
              some: { officeId: opts.officeId },
            },
          },
        ],
      });
    }

    if (opts.finishLineIds?.length) {
      conditions.push({ finishLineId: { in: opts.finishLineIds } });
    }

    if (opts.papSectorId) {
      conditions.push({ papSectorId: opts.papSectorId });
    }

    const papClass = programPapClassWhere(opts.papClasses);
    if (papClass) conditions.push(papClass);
    const fundSource = programFundSourceWhere(opts.fundSources);
    if (fundSource) conditions.push(fundSource);

    // One condition per tag id (AND across tags): a program matches a given
    // tag if it carries it directly, or any of its project/activities do
    // (OR across levels) — a visitor filtering by "Senior Citizens" should
    // find a program whose tag lives only on a child PA, not just programs
    // tagged at their own level.
    for (const tagId of opts.thematicTagIds ?? []) {
      conditions.push({
        OR: [
          { thematicTags: { some: { tagId } } },
          {
            projectActivities: { some: { thematicTags: { some: { tagId } } } },
          },
        ],
      });
    }

    if (opts.search) {
      conditions.push({
        OR: [
          // The published name: the live one may be an open revision's draft.
          { publishedName: { contains: opts.search, mode: 'insensitive' } },
          {
            publishedName: null,
            name: { contains: opts.search, mode: 'insensitive' },
          },
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
          {
            thematicTags: {
              some: {
                tag: { name: { contains: opts.search, mode: 'insensitive' } },
              },
            },
          },
          {
            projectActivities: {
              some: {
                thematicTags: {
                  some: {
                    tag: {
                      name: { contains: opts.search, mode: 'insensitive' },
                    },
                  },
                },
              },
            },
          },
        ],
      });
    }

    const where: Prisma.ProgramWhereInput = { AND: conditions };

    // Ordered the way the city reads its budget and the way the export prints
    // it: **office first**, then the three appropriation sections inside, then
    // the office's own ranking. Same ordering as `AIPRegistryService.list`, so
    // the public page and the staff registry render a cycle identically.
    //
    // `papClass` enum sort follows declaration order, which is already
    // GAS → STO → OPERATIONS. `nulls: 'last'` puts unclassified rows immediately
    // after OPERATIONS, where the client folds them in.
    //
    // Not user-sortable, and deliberately so: `client/src/lib/aip-grouping.ts`
    // groups by walking this order run-length rather than re-sorting, so a
    // "highest budget" ordering would shred the office bands. The old five-way
    // `sortBy` switch was dropped with the sort dropdown.
    const orderBy: Prisma.ProgramOrderByWithRelationInput[] = [
      { office: { acronym: 'asc' } },
      { papClass: { sort: 'asc', nulls: 'last' } },
      { orderIndex: 'asc' },
      { createdAt: 'asc' },
    ];

    // Pure reference data, and the same for every filter combination — so it
    // rides the `ref:` group rather than this response's key, and is already
    // invalidated for free by ReferenceService on any office mutation.
    const totalOfficeCount = await this.cache.getOrSet(
      `${REFERENCE_KEY_PREFIX}active-office-count`,
      REFERENCE_TTL_SECONDS,
      () => this.prisma.office.count({ where: { isActive: true } }),
    );

    const [total, aggregate, rows, submittedOffices] =
      await this.prisma.$transaction([
        this.prisma.program.count({ where }),
        // The published mirror, as each row below reads: summing the live
        // `proposedTotal` leaked an open revision's unpublished money into the
        // public headline while its row still showed the published figure.
        this.prisma.program.aggregate({
          where,
          _sum: { publishedProposedTotal: true },
        }),
        this.prisma.program.findMany({
          where,
          select: {
            id: true,
            name: true,
            status: true,
            tentativeAipReferenceCode: true,
            aipReferenceCode: true,
            grandTotal: true,
            psTotal: true,
            mooeTotal: true,
            feTotal: true,
            coTotal: true,
            psProposedTotal: true,
            mooeProposedTotal: true,
            feProposedTotal: true,
            coProposedTotal: true,
            // The only figure a program that states its own costs has: it holds
            // no PAs, so the client's root-PA fallback would read zero.
            proposedTotal: true,
            // Same reason: such a program is itself the funding entry, so the
            // Overview's fund breakdown has to read the funds from here. A
            // program that rolls up from PAs carries them on the PAs instead.
            fundSources: true,
            // A per-fund split, so the Overview can attribute it exactly.
            fundAllocations: {
              orderBy: { orderIndex: 'asc' },
              select: FUND_ALLOCATION_SELECT,
            },
            // Published mirrors (D13): the list stays on live rows for its joins
            // and sorts, but every figure the public sees comes from these.
            publishedName: true,
            publishedProposedTotal: true,
            publishedAt: true,
            // Which of the three appropriation sections the row prints under.
            // The client groups on it, so it has to survive the select.
            papClass: true,
            office: {
              select: {
                id: true,
                name: true,
                acronym: true,
                cluster: { select: { id: true, name: true } },
              },
            },
            // Set only on a component program — the office whose printed sheet
            // this program appears under. It decides the row's office band; the
            // program keeps its own office everywhere else, including its code.
            hostOffice: { select: { id: true, name: true, acronym: true } },
            finishLine: {
              select: { id: true, name: true, visionNumber: true },
            },
            papSector: { select: { id: true, code: true, name: true } },
            thematicTags: {
              select: { tag: { select: { id: true, name: true } } },
            },
            projectActivities: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                type: true,
                name: true,
                parentProjectActivityId: true,
                orderIndex: true,
                tentativeAipReferenceCode: true,
                aipReferenceCode: true,
                costMode: true,
                psTotal: true,
                mooeTotal: true,
                feTotal: true,
                coTotal: true,
                psEstimate: true,
                mooeEstimate: true,
                feEstimate: true,
                coEstimate: true,
                grandTotal: true,
                proposedBudget: true,
                fundSources: true,
                fundAllocations: {
                  orderBy: { orderIndex: 'asc' },
                  select: FUND_ALLOCATION_SELECT,
                },
              },
            },
            _count: {
              select: {
                comments: {
                  where: {
                    stage: CommentStage.PUBLIC_FEEDBACK,
                    deletedAt: null,
                  },
                },
              },
            },
            updatedAt: true,
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: { submittedAt: true },
            },
          },
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.program.findMany({
          where: { AND: conditions, officeId: { not: null } },
          select: { officeId: true },
          distinct: ['officeId'],
        }),
      ]);

    // A program mid-revision is public at its published version: its PPAs and
    // per-class figures come from the published snapshot, not the live draft.
    const revisionIds = rows
      .filter((row) => row.status === ProgramStatus.PUBLISHED_REVISION)
      .map((row) => row.id);
    const snapshots = new Map<string, Record<string, unknown>>(
      revisionIds.length
        ? (
            await this.prisma.program.findMany({
              where: { id: { in: revisionIds } },
              select: {
                id: true,
                publishedVersion: { select: { snapshot: true } },
              },
            })
          ).map((row) => [
            row.id,
            (row.publishedVersion?.snapshot ?? {}) as Record<string, unknown>,
          ])
        : [],
    );

    const liveItems = rows.map(
      ({
        versions,
        _count,
        grandTotal,
        psTotal,
        mooeTotal,
        feTotal,
        coTotal,
        psProposedTotal,
        mooeProposedTotal,
        feProposedTotal,
        coProposedTotal,
        projectActivities,
        publishedName,
        publishedProposedTotal,
        thematicTags,
        ...program
      }) => ({
        ...program,
        thematicTags: thematicTags.map((t) => t.tag),
        // Mirror wins over the live row, so a program mid-revision shows the
        // published name and figure rather than the encoder's draft.
        name: publishedName ?? program.name,
        proposedTotal: publishedProposedTotal?.toFixed(2) ?? '0.00',
        grandTotal: grandTotal.toFixed(2),
        // Live figures equal the published ones except mid-revision, where
        // listRowFromSnapshot below replaces them.
        psTotal: publicExpenseClassAmount(psProposedTotal, psTotal),
        mooeTotal: publicExpenseClassAmount(mooeProposedTotal, mooeTotal),
        feTotal: publicExpenseClassAmount(feProposedTotal, feTotal),
        coTotal: publicExpenseClassAmount(coProposedTotal, coTotal),
        feedbackCount: _count.comments,
        lastUpdatedAt: versions[0]?.submittedAt ?? program.updatedAt,
        projectActivities: projectActivities.map(
          ({
            proposedBudget,
            grandTotal: paGrandTotal,
            psTotal: paPs,
            mooeTotal: paMooe,
            feTotal: paFe,
            coTotal: paCo,
            psEstimate,
            mooeEstimate,
            feEstimate,
            coEstimate,
            ...pa
          }) => ({
            ...pa,
            psTotal: publicExpenseClassAmount(psEstimate, paPs),
            mooeTotal: publicExpenseClassAmount(mooeEstimate, paMooe),
            feTotal: publicExpenseClassAmount(feEstimate, paFe),
            coTotal: publicExpenseClassAmount(coEstimate, paCo),
            grandTotal: paGrandTotal.toFixed(2),
            proposedBudget: proposedBudget?.toFixed(2) ?? null,
          }),
        ),
      }),
    );
    const items = liveItems.map((item) => {
      const snapshot = snapshots.get(item.id);
      return snapshot ? listRowFromSnapshot(item, snapshot) : item;
    });

    // D17: the public headline figure is the proposed total — proposedBudget is
    // the public-view money field, and grandTotal is 0 while line items are hidden.
    //
    // `totalBudget` and `totalProposedBudget` are deliberately the same number,
    // under two names the clients already read. This used to sum root PAs
    // instead, which sees ₱0 for every DIRECT_COSTS program — the ones holding
    // no PAs and stating their cost on the program row. That was 396 of the 492
    // published 2027 programs and ₱2.54B, so the home hero and both browse
    // footers said ₱3.53B where the registry said ₱6.07B. `proposedTotal` is
    // the column: for a program that does have PAs it already equals their sum,
    // so nothing is double-counted.
    const totalBudget =
      aggregate._sum.publishedProposedTotal?.toFixed(2) ?? '0.00';
    const totalProposedBudget = totalBudget;
    const submittedOfficeCount = submittedOffices.length;

    return {
      total,
      page,
      limit,
      totalBudget,
      totalProposedBudget,
      submittedOfficeCount,
      totalOfficeCount,
      items,
    };
  }

  async listFinishLines(cycleId?: string, section?: 'aip' | 'annual') {
    const ordinance = cycleId
      ? await this.ordinanceSource(cycleId, section)
      : null;
    if (ordinance) {
      const rows = await this.prisma.finishLine.findMany({
        select: {
          id: true,
          name: true,
          visionNumber: true,
          shortName: true,
          color: true,
          _count: {
            select: {
              budgetItems: {
                where: { documentId: ordinance.id, parentId: null },
              },
            },
          },
        },
        orderBy: { visionNumber: 'asc' },
      });
      return rows.map(({ _count, ...rest }) => ({
        ...rest,
        programCount: _count.budgetItems,
      }));
    }
    const rows = await this.prisma.finishLine.findMany({
      select: {
        id: true,
        name: true,
        visionNumber: true,
        shortName: true,
        color: true,
        _count: {
          select: {
            programs: {
              where: {
                ...PUBLICLY_VISIBLE,
                ...(cycleId ? { aipCycleId: cycleId } : {}),
              },
            },
          },
        },
      },
      orderBy: { visionNumber: 'asc' },
    });
    return rows.map(({ _count, ...rest }) => ({
      ...rest,
      programCount: _count.programs,
    }));
  }

  async listPAPSectors(cycleId?: string, section?: 'aip' | 'annual') {
    const ordinance = cycleId
      ? await this.ordinanceSource(cycleId, section)
      : null;
    if (ordinance) {
      return this.prisma.pAPSector.findMany({
        where: {
          isActive: true,
          budgetItems: { some: { documentId: ordinance.id, parentId: null } },
        },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      });
    }
    return this.prisma.pAPSector.findMany({
      where: {
        isActive: true,
        programs: {
          some: {
            ...PUBLICLY_VISIBLE,
            ...(cycleId ? { aipCycleId: cycleId } : {}),
          },
        },
      },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Public program detail renders the **published snapshot**, not live rows
   * (D13). While a revision is open the encoder's working copy sits in the live
   * tree; citizens keep seeing exactly what was published until someone
   * republishes.
   *
   * The list query stays on live rows for its joins, sorts and aggregates, with
   * money read from the published mirrors — see PUBLICLY_VISIBLE above.
   */
  async getProgram(programId: string) {
    // An enacted Ordinance's PPA first (specs/012 6A): while the old 2026
    // Program rows still exist beside it under the same id, the id resolves the
    // way it will once they are retired.
    const ordinance = await getOrdinanceProgram(this.prisma, programId);
    if (ordinance) return ordinance;
    const program = await this.prisma.program.findFirst({
      // Readable, not visible: an archived program's link still opens, marked
      // archived (specs/013 FR-016).
      where: { id: programId, ...PUBLICLY_READABLE },
      include: {
        office: { select: { id: true, name: true, acronym: true } },
        finishLine: { select: { id: true, name: true } },
        subFinishLine: { select: { id: true, name: true } },
        papSector: { select: { id: true, name: true, code: true } },
        aipCycle: { select: { id: true, fiscalYear: true } },
        supportingOffices: {
          select: {
            office: { select: { id: true, name: true, acronym: true } },
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
        publishedVersion: {
          select: {
            id: true,
            version: true,
            snapshot: true,
            submittedAt: true,
          },
        },
      },
    });

    if (!program) {
      throw new NotFoundException('Program not found or not publicly visible');
    }

    const { publishedVersion, thematicTags, archivedAt, archivedReason } =
      program;

    // Read live rather than from the version snapshot (unlike name/money):
    // tags are cycle-wide metadata, not versioned content, and the editable
    // window already keys off the same program-status gate (FR-011/FR-012).
    // The one gap this leaves, same shape as every other snapshot mirror in
    // this file: on a PUBLISHED_REVISION, a tag change made mid-draft is
    // visible here before the next republish, instead of staying frozen on
    // the last published state. Worth a snapshot-and-restore pass (mirroring
    // `ProgramVersionsService`/`restoreFromSnapshot`) if that drift matters in
    // practice — tracked as a follow-up, not done in this change.
    const publicThematicTags = thematicTags.map((t) => t.tag);

    const snapshot = (publishedVersion?.snapshot ?? {}) as Record<
      string,
      unknown
    >;

    const snapshotPAs = (snapshot.projectActivities ?? []) as Array<
      Record<string, unknown>
    >;

    // Named fields only, never a spread of the row: a spread served the live
    // draft's remarks, importWarnings and publishedByUserId, and would serve any
    // column added later. Content is the snapshot's (what was published); only
    // where an old snapshot lacks a key does the live value stand in.
    const rest = program;
    const published = (key: string): unknown =>
      key in snapshot
        ? snapshot[key]
        : (program as Record<string, unknown>)[key];

    return {
      ...pick(program, PUBLIC_PROGRAM_META),
      ...Object.fromEntries(
        PUBLIC_PROGRAM_CONTENT.map((key) => [key, published(key) ?? null]),
      ),
      office: program.office,
      finishLine: program.finishLine,
      subFinishLine: program.subFinishLine,
      papSector: program.papSector,
      aipCycle: program.aipCycle,
      supportingOffices: program.supportingOffices,
      climateChangeTag: published('climateChangeTag') ?? null,
      fundAllocations: published('fundAllocations') ?? [],
      // Snapshot wins over the live row for everything the public sees.
      name: (snapshot.name as string) ?? rest.publishedName ?? rest.name,
      description: snapshot.description ?? rest.description,
      expectedOutput: snapshot.expectedOutput ?? rest.expectedOutput,
      proposedTotal: snapshot.proposedTotal ?? rest.publishedProposedTotal,
      // D17 again: `...rest` carries the live line-item rollups, which are
      // structurally zero. Prefer the snapshot's proposed figures, then the
      // live proposed ones.
      psTotal: snapshotExpenseClassAmount(
        snapshot.psProposedTotal ?? rest.psProposedTotal,
        rest.psTotal,
      ),
      mooeTotal: snapshotExpenseClassAmount(
        snapshot.mooeProposedTotal ?? rest.mooeProposedTotal,
        rest.mooeTotal,
      ),
      // Snapshot only, no live fallback: a snapshot from before FE existed
      // was published with no FE, and the live row may hold an unpublished one.
      feTotal: snapshotExpenseClassAmount(
        snapshot.feProposedTotal,
        snapshot.feTotal,
      ),
      coTotal: snapshotExpenseClassAmount(
        snapshot.coProposedTotal ?? rest.coProposedTotal,
        rest.coTotal,
      ),
      thematicTags: publicThematicTags,
      projectActivities: await this.attachPAThematicTags(
        snapshotPAs,
        publicThematicTags,
      ),
      version: publishedVersion?.version ?? null,
      publishedAt: rest.publishedAt,
      lastUpdatedAt: publishedVersion?.submittedAt ?? rest.updatedAt,
      archived: archivedAt ? { at: archivedAt, reason: archivedReason } : null,
    };
  }

  /** Splices each snapshot PA's own + inherited thematic tags in, read live
   * (see the comment in `getProgram` on why tags aren't versioned). */
  private async attachPAThematicTags(
    snapshotPAs: Array<Record<string, unknown>>,
    inherited: Array<{ id: string; name: string }>,
  ) {
    const ids = snapshotPAs
      .map((pa) => pa.id as string)
      .filter((id): id is string => !!id);
    const rows = ids.length
      ? await this.prisma.projectActivityThematicTag.findMany({
          where: { projectActivityId: { in: ids } },
          select: {
            projectActivityId: true,
            tag: { select: { id: true, name: true } },
          },
        })
      : [];
    const byPA = new Map<string, Array<{ id: string; name: string }>>();
    for (const row of rows) {
      const list = byPA.get(row.projectActivityId) ?? [];
      list.push({ id: row.tag.id, name: row.tag.name });
      byPA.set(row.projectActivityId, list);
    }
    return snapshotPAs.map((pa) => ({
      ...stripProvenance(pa),
      psTotal: snapshotExpenseClassAmount(pa.psEstimate, pa.psTotal),
      mooeTotal: snapshotExpenseClassAmount(pa.mooeEstimate, pa.mooeTotal),
      feTotal: snapshotExpenseClassAmount(pa.feEstimate, pa.feTotal),
      coTotal: snapshotExpenseClassAmount(pa.coEstimate, pa.coTotal),
      thematicTags: byPA.get(pa.id as string) ?? [],
      inheritedThematicTags: inherited,
    }));
  }

  async listVersions(programId: string) {
    // An Ordinance PPA has no versions: the enacted document is the record.
    if (await isPublicOrdinanceItem(this.prisma, programId)) return [];
    await this.assertPubliclyVisible(programId, { readable: true });

    const versions = await this.prisma.programVersion.findMany({
      where: { programId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        submittedAt: true,
        submittedByUserId: true,
      },
    });

    // D21: office + role, never a personal name.
    const userIds = [...new Set(versions.map((v) => v.submittedByUserId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        role: true,
        lguusers: {
          take: 1,
          select: { office: { select: { name: true, acronym: true } } },
        },
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return versions.map(({ submittedByUserId, ...v }) => {
      const user = userMap.get(submittedByUserId);
      const office = user?.lguusers[0]?.office ?? null;
      return {
        ...v,
        publishedBy: user
          ? {
              office: office?.name ?? null,
              officeAcronym: office?.acronym ?? null,
              role: user.role,
            }
          : null,
      };
    });
  }

  async getVersion(programId: string, versionId: string) {
    await this.assertPubliclyVisible(programId, { readable: true });

    const version = await this.prisma.programVersion.findFirst({
      where: { id: versionId, programId },
    });
    if (!version) throw new NotFoundException('Version not found');

    // D21: the public sees the accountable office and role, never a personal
    // name. Individual encoders are not the accountable party for a published
    // budget document; the office is.
    const user = await this.prisma.user.findUnique({
      where: { id: version.submittedByUserId },
      select: {
        role: true,
        lguusers: {
          take: 1,
          select: { office: { select: { name: true, acronym: true } } },
        },
      },
    });
    const office = user?.lguusers[0]?.office ?? null;

    // D17 again: the raw snapshot carries both money families, and the
    // line-item rollups it stores are structurally zero. Normalize here, the
    // same way `getDetail` does, so the version drawer and the detail view
    // never disagree on what a program cost.
    const snapshot = (version.snapshot ?? {}) as Record<string, unknown>;
    const snapshotPAs = (snapshot.projectActivities ?? []) as Array<
      Record<string, unknown>
    >;

    return {
      id: version.id,
      version: version.version,
      submittedAt: version.submittedAt,
      publishedBy: user
        ? {
            office: office ? office.name : null,
            officeAcronym: office ? office.acronym : null,
            role: user.role,
          }
        : null,
      snapshot: {
        ...stripProvenance(snapshot),
        psTotal: snapshotExpenseClassAmount(
          snapshot.psProposedTotal,
          snapshot.psTotal,
        ),
        mooeTotal: snapshotExpenseClassAmount(
          snapshot.mooeProposedTotal,
          snapshot.mooeTotal,
        ),
        feTotal: snapshotExpenseClassAmount(
          snapshot.feProposedTotal,
          snapshot.feTotal,
        ),
        coTotal: snapshotExpenseClassAmount(
          snapshot.coProposedTotal,
          snapshot.coTotal,
        ),
        grandTotal: snapshotExpenseClassAmount(
          snapshot.proposedTotal,
          snapshot.grandTotal,
        ),
        projectActivities: snapshotPAs.map((pa) => ({
          ...stripProvenance(pa),
          psTotal: snapshotExpenseClassAmount(pa.psEstimate, pa.psTotal),
          mooeTotal: snapshotExpenseClassAmount(pa.mooeEstimate, pa.mooeTotal),
          feTotal: snapshotExpenseClassAmount(pa.feEstimate, pa.feTotal),
          coTotal: snapshotExpenseClassAmount(pa.coEstimate, pa.coTotal),
          grandTotal: snapshotExpenseClassAmount(
            pa.proposedBudget,
            pa.grandTotal,
          ),
        })),
      },
    };
  }

  async submitFeedback(programId: string, dto: PublicFeedbackDto) {
    const itemId = await feedbackTargetOf(this.prisma, programId);
    if (!itemId) await this.assertPubliclyVisible(programId);

    await this.prisma.programComment.create({
      data: {
        ...(itemId ? { budgetItemId: itemId } : { programId }),
        stage: CommentStage.PUBLIC_FEEDBACK,
        targetType: CommentTarget.PROGRAM,
        content: dto.message,
        submitterName: dto.submitterName ?? null,
        submitterEmail: dto.submitterEmail ?? null,
        category: dto.category ?? null,
        sentiment: dto.sentiment ?? null,
        // authorUserId intentionally omitted — anonymous
      },
    });

    // `feedbackCount` is part of the cached list payload, and `most_feedback`
    // sorts on it.
    await this.registryCache.invalidatePublicRegistry();

    return { success: true };
  }

  async listPublicFeedback(programId: string) {
    const itemId = await feedbackTargetOf(this.prisma, programId);
    if (!itemId)
      await this.assertPubliclyVisible(programId, { readable: true });

    const rows = await this.prisma.programComment.findMany({
      where: {
        // A root PPA's feedback is the feedback on any PPA of its tree, as a
        // program's covers its PAs.
        ...(itemId ? { budgetItem: { rootItemId: itemId } } : { programId }),
        stage: CommentStage.PUBLIC_FEEDBACK,
        parentCommentId: null,
        deletedAt: null,
      },
      select: {
        id: true,
        content: true,
        submitterName: true,
        category: true,
        sentiment: true,
        createdAt: true,
        officialReply: true,
        officialRepliedAt: true,
        officialReplyEditedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(({ submitterName, ...row }) => ({
      ...row,
      submitterName: redactName(submitterName),
    }));
  }

  async getProjectActivity(programId: string, paId: string) {
    const ordinance = await getOrdinancePA(this.prisma, programId, paId);
    if (ordinance) return ordinance;

    // The published snapshot, never the live tree: while a revision is open the
    // live rows are the encoder's draft (D13), and a PA that exists only in the
    // draft must answer 404 here, exactly as it is absent from getProgram.
    const pas = await this.publishedPAs(programId, { readable: true });
    const pa = pas.find((row) => row.id === paId);
    if (!pa) throw new NotFoundException('Project/Activity not found');

    const parentId =
      typeof pa.parentProjectActivityId === 'string'
        ? pa.parentProjectActivityId
        : null;
    const parent = parentId ? pas.find((row) => row.id === parentId) : null;

    // Tags are read live by design (see getProgram).
    const [ownTags, programTags] = await Promise.all([
      this.prisma.projectActivityThematicTag.findMany({
        where: { projectActivityId: paId },
        select: { tag: { select: { id: true, name: true } } },
      }),
      this.prisma.programThematicTag.findMany({
        where: { programId },
        select: { tag: { select: { id: true, name: true } } },
        orderBy: { tag: { name: 'asc' } },
      }),
    ]);

    const lineItems = ((pa.lineItems ?? []) as Array<Record<string, unknown>>)
      .slice()
      .sort(byOrderIndex)
      .map((li) => pick(li, PUBLIC_LINE_ITEM_FIELDS));

    return {
      ...pick(pa, PUBLIC_PA_FIELDS),
      ...publicPAMoney(pa),
      lineItems,
      parent: parent ? pick(parent, ['id', 'name', 'type']) : null,
      thematicTags: ownTags.map((t) => t.tag),
      inheritedThematicTags: programTags.map((t) => t.tag),
      children: pas
        .filter((row) => row.parentProjectActivityId === paId)
        .sort(byOrderIndex)
        .map((child) => ({
          ...pick(child, PUBLIC_PA_CHILD_FIELDS),
          ...publicPAMoney(child),
        })),
    };
  }

  /**
   * A program's published PAs, read from its published snapshot. Throws 404
   * when the program is not public. `readable` admits archived programs.
   */
  private async publishedPAs(
    programId: string,
    { readable = false } = {},
  ): Promise<Array<Record<string, unknown>>> {
    const program = await this.prisma.program.findFirst({
      where: {
        id: programId,
        ...(readable ? PUBLICLY_READABLE : PUBLICLY_VISIBLE),
      },
      select: { publishedVersion: { select: { snapshot: true } } },
    });
    if (!program) {
      throw new NotFoundException('Program not found or not publicly visible');
    }
    const snapshot = (program.publishedVersion?.snapshot ?? {}) as Record<
      string,
      unknown
    >;
    return (snapshot.projectActivities ?? []) as Array<Record<string, unknown>>;
  }

  async submitPAFeedback(
    programId: string,
    paId: string,
    dto: PublicFeedbackDto,
  ) {
    const itemId = await feedbackTargetOf(this.prisma, programId, paId);
    if (itemId) {
      await this.prisma.programComment.create({
        data: {
          budgetItemId: itemId,
          stage: CommentStage.PUBLIC_FEEDBACK,
          targetType: CommentTarget.PROJECT_ACTIVITY,
          targetId: paId,
          content: dto.message,
          submitterName: dto.submitterName ?? null,
          submitterEmail: dto.submitterEmail ?? null,
          category: dto.category ?? null,
          sentiment: dto.sentiment ?? null,
        },
      });
      return { success: true };
    }
    const published = await this.publishedPAs(programId);
    if (!published.some((row) => row.id === paId)) {
      throw new NotFoundException('Project/Activity not found');
    }

    await this.prisma.programComment.create({
      data: {
        programId,
        stage: CommentStage.PUBLIC_FEEDBACK,
        targetType: CommentTarget.PROJECT_ACTIVITY,
        targetId: paId,
        content: dto.message,
        submitterName: dto.submitterName ?? null,
        submitterEmail: dto.submitterEmail ?? null,
        category: dto.category ?? null,
        sentiment: dto.sentiment ?? null,
      },
    });

    return { success: true };
  }

  async listPAFeedback(programId: string, paId: string) {
    const itemId = await feedbackTargetOf(this.prisma, programId, paId);
    if (itemId) {
      return this.prisma.programComment.findMany({
        where: {
          budgetItemId: itemId,
          stage: CommentStage.PUBLIC_FEEDBACK,
          parentCommentId: null,
          deletedAt: null,
        },
        select: { id: true, content: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    const published = await this.publishedPAs(programId, { readable: true });
    if (!published.some((row) => row.id === paId)) {
      throw new NotFoundException('Project/Activity not found');
    }

    return this.prisma.programComment.findMany({
      where: {
        programId,
        stage: CommentStage.PUBLIC_FEEDBACK,
        targetType: CommentTarget.PROJECT_ACTIVITY,
        targetId: paId,
        parentCommentId: null,
        deletedAt: null,
      },
      select: { id: true, content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async submitRegistryFeedback(dto: PublicRegistryFeedbackDto) {
    await this.prisma.publicRegistryFeedback.create({
      data: {
        submitterName: dto.submitterName ?? null,
        submitterEmail: dto.submitterEmail ?? null,
        category: dto.category ?? 'GENERAL',
        message: dto.message,
      },
    });
    return { success: true };
  }

  /**
   * `readable` lets an archived program's versions, activities and existing
   * feedback through (they are still shown on its page); writes never pass it,
   * so an archived program takes no new feedback (specs/013 FR-016).
   */
  private async assertPubliclyVisible(
    programId: string,
    { readable = false } = {},
  ): Promise<void> {
    const program = await this.prisma.program.findFirst({
      where: {
        id: programId,
        ...(readable ? PUBLICLY_READABLE : PUBLICLY_VISIBLE),
      },
      select: { id: true },
    });
    if (!program) {
      throw new NotFoundException('Program not found or not publicly visible');
    }
  }

  // ─── PPMP ───────────────────────────────────────────────────────────────
  // No snapshot/version to read from — a PPMP has no draft/revision split, so
  // `isPublished: true` on the live row is the whole visibility rule, and the
  // live row is exactly what the public sees (see docs/modules/ppmp.md).
  // Uncached: PPMP's row count is a small
  // fraction of Program's, so this doesn't carry the same traffic weight
  // that motivated `listPrograms`'s cache-by-filter-key.

  async listPpmp(cycleId: string, officeId?: string) {
    if (!cycleId) {
      throw new BadRequestException('cycleId is required');
    }

    const ppmps = await this.prisma.pPMP.findMany({
      where: {
        aipCycleId: cycleId,
        isPublished: true,
        ...(officeId ? { officeId } : {}),
      },
      include: {
        office: { select: { id: true, name: true, acronym: true } },
        lineItems: { select: { lineTotal: true } },
        _count: { select: { feedback: true } },
      },
      orderBy: [{ office: { acronym: 'asc' } }, { name: 'asc' }],
    });

    return ppmps.map(({ lineItems, _count, ...rest }) => ({
      ...rest,
      grandTotal: lineItems
        .reduce((acc, li) => acc.plus(li.lineTotal), new Prisma.Decimal(0))
        .toFixed(2),
      lineItemCount: lineItems.length,
      // Enables the "Most Feedback" sort revived in specs/005 — dropped in
      // specs/004 for lack of a per-project count; there is one now.
      feedbackCount: _count.feedback,
    }));
  }

  async getPpmp(id: string) {
    const ppmp = await this.prisma.pPMP.findFirst({
      where: { id, isPublished: true },
      include: {
        office: { select: { id: true, name: true, acronym: true } },
        aipCycle: { select: { id: true, fiscalYear: true } },
        lineItems: { orderBy: { orderIndex: 'asc' } },
      },
    });

    if (!ppmp) {
      throw new NotFoundException('PPMP not found or not publicly visible');
    }

    const { lineItems, ...rest } = ppmp;
    return {
      ...rest,
      lineItems,
      grandTotal: lineItems
        .reduce((acc, li) => acc.plus(li.lineTotal), new Prisma.Decimal(0))
        .toFixed(2),
    };
  }

  /** Public-safe activity timeline for a published Project — same synthesis
   * as the authenticated `PpmpService.getHistory`, gated on publish instead
   * of office scope. */
  async getPpmpHistory(id: string) {
    const ppmp = await this.prisma.pPMP.findFirst({
      where: { id, isPublished: true },
      include: {
        lineItems: {
          select: {
            id: true,
            lineItemName: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!ppmp) {
      throw new NotFoundException('PPMP not found or not publicly visible');
    }
    return buildPpmpHistory(ppmp);
  }

  /** Public feedback list for a published Project — mirrors
   * `listPublicFeedback`'s redact-the-submitter-name pattern. */
  async listPublicPpmpFeedback(id: string) {
    const ppmp = await this.prisma.pPMP.findFirst({
      where: { id, isPublished: true },
      select: { id: true },
    });
    if (!ppmp) {
      throw new NotFoundException('PPMP not found or not publicly visible');
    }

    const rows = await this.prisma.ppmpFeedback.findMany({
      where: { ppmpId: id },
      select: {
        id: true,
        message: true,
        submitterName: true,
        category: true,
        sentiment: true,
        createdAt: true,
        officialReply: true,
        officialRepliedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(({ submitterName, ...row }) => ({
      ...row,
      submitterName: redactName(submitterName),
    }));
  }

  /**
   * Feedback scoped to one specific published Project — distinct from
   * `submitRegistryFeedback`'s general, unscoped inbox (specs/005
   * research.md; reverses specs/004's "keep PPMP feedback general" call now
   * that a per-project mechanism is wanted on purpose).
   */
  async submitPpmpFeedback(ppmpId: string, dto: PublicPpmpFeedbackDto) {
    const ppmp = await this.prisma.pPMP.findFirst({
      where: { id: ppmpId, isPublished: true },
      select: { id: true },
    });
    if (!ppmp) {
      throw new NotFoundException('PPMP not found or not publicly visible');
    }

    await this.prisma.ppmpFeedback.create({
      data: {
        ppmpId,
        submitterName: dto.submitterName ?? null,
        submitterEmail: dto.submitterEmail ?? null,
        message: dto.message,
        category: dto.category ?? null,
        sentiment: dto.sentiment ?? null,
      },
    });

    return { success: true };
  }
}
