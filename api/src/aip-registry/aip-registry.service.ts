import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramsService } from '../programs/programs.service.js';
import {
  deriveDataWarnings,
  leavesOf,
} from '../programs/import-data-warnings.js';
import { CacheService } from '../cache/cache.service.js';
import { cacheKey } from '../cache/cache-key.js';
import {
  REGISTRY_COUNTS_KEY_PREFIX,
  REGISTRY_COUNTS_TTL_SECONDS,
} from '../cache/cache.constants.js';
import {
  PPACostMode,
  Prisma,
  ProgramStatus,
  type PapClass,
} from '../generated/prisma/index';
import {
  type FundSourceFilter,
  programFundSourceWhere,
  programPapClassWhere,
} from '../common/pap-class-fund-filters.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { sourceLink } from '../common/source-link.js';

/**
 * Workflow-axis tabs for the AIP registry. `NEEDS_ACTION` is role-adaptive;
 * the rest are role-independent status groupings. (All programs are LGU
 * submissions — the NCPC proponent track was retired.)
 */
/**
 * Phase 1 D16: a flat status partition, replacing the role-adaptive workflow
 * tabs. The old NEEDS_ACTION / IN_PROGRESS / COMPLETED set was built around the
 * gate chain, whose HEAD and LFC-member branches are dead this phase.
 *
 * REVISIONS is labelled "Needs publishing" in the UI for holders of
 * `aip:publish` — the same rows either way, since an encoder needs to see their
 * own open revisions just as much as a publisher does.
 */
export type RegistryTab =
  | 'ALL'
  | 'DRAFTS'
  | 'REVISIONS'
  | 'PUBLISHED'
  | 'ARCHIVED';

/** What `sourceLink` needs to turn a row's `sourceRef` into a URL. */
const SOURCE_DOCUMENT_SELECT = {
  select: { name: true, url: true, sheetGids: true },
} as const;

const DEFAULT_PAGE_SIZE = 25;
/**
 * Raised from 100 so the staff registry can fetch a whole cycle in one request
 * and group it by office client-side (2027: 242 programs). Still a ceiling, and
 * still clamped — the reason the clamp exists is that `?pageSize=100000` once
 * pulled every program with all of its project activities inside one
 * transaction. The client shows a "showing the first N" banner if a cycle ever
 * exceeds this.
 */
const MAX_PAGE_SIZE = 1000;

/** Floor to an integer inside [min, max], falling back for NaN / Infinity / undefined. */
function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

interface RegistryQuery {
  tab: RegistryTab;
  cycleId?: string;
  clusterId?: string;
  finishLineIds?: string[];
  officeId?: string;
  search?: string;
  /** Narrows to programs that carry one of these tags directly, or whose
   * project/activities do. Composed as one more AND'd entry, same as
   * `finishLineIds` — never an empty `OR`. */
  thematicTagIds?: string[];
  /** Any of these PAP classes; Operations includes a program with none (#107). */
  papClasses?: PapClass[];
  /** Any of these funds on the program or a PPA; `NONE` for neither (#107). */
  fundSources?: FundSourceFilter[];
  page?: number;
  pageSize?: number;
}

const THEMATIC_TAG_SELECT = {
  select: { tag: { select: { id: true, name: true } } },
} as const;

@Injectable()
export class AIPRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly programs: ProgramsService,
    private readonly cache: CacheService,
  ) {}

  async list(opts: RegistryQuery, user: JwtPayload) {
    const visibility = await this.programs.buildVisibilityWhere(user);

    // Filters that apply regardless of the active tab. Tab counts are computed
    // within this same base so the counts match what each tab would show.
    //
    // Composed as a list of conjuncts, never by spreading into one object.
    // `visibility` carries its own `OR` — the user's office scope — and so do the
    // office and search filters. Under a spread the last `OR` key wins, so the
    // scope was deleted the moment a scoped user typed in the search box or
    // picked an office: the query degraded to `deletedAt: null` and returned
    // every office's programs, drafts included. It also meant the office filter
    // was silently ignored whenever search was non-empty. As separate conjuncts
    // no filter can overwrite another.
    const filters: Prisma.ProgramWhereInput[] = [visibility];

    if (opts.cycleId) filters.push({ aipCycleId: opts.cycleId });
    if (opts.finishLineIds?.length) {
      filters.push({ finishLineId: { in: opts.finishLineIds } });
    }
    // Owner-only, deliberately. This used to match owner *or* supporting office,
    // and the client then stripped the supporting matches back out — but only for
    // HEAD and SUPER_ADMIN, so the same query returned different rows per role.
    // Owner-only is what "this office's AIP" means, it matches the export's
    // one-sheet-per-proponent grouping, and it makes each office's on-screen
    // total the money that office actually proposes rather than money it merely
    // helps deliver.
    if (opts.officeId) filters.push({ officeId: opts.officeId });
    if (opts.clusterId) filters.push({ office: { clusterId: opts.clusterId } });
    if (opts.thematicTagIds?.length) {
      filters.push({
        OR: [
          { thematicTags: { some: { tagId: { in: opts.thematicTagIds } } } },
          {
            projectActivities: {
              some: {
                thematicTags: { some: { tagId: { in: opts.thematicTagIds } } },
              },
            },
          },
        ],
      });
    }
    const papClass = programPapClassWhere(opts.papClasses);
    if (papClass) filters.push(papClass);
    const fundSource = programFundSourceWhere(opts.fundSources);
    if (fundSource) filters.push(fundSource);
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
          { expectedOutput: { contains: opts.search, mode: 'insensitive' } },
          {
            finishLine: {
              name: { contains: opts.search, mode: 'insensitive' },
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

    const baseWhere: Prisma.ProgramWhereInput = { AND: filters };

    const tabWhereOf = (tab: RegistryTab): Prisma.ProgramWhereInput => ({
      AND: [baseWhere, tabFilter(tab)],
    });

    const where = tabWhereOf(opts.tab);
    // Clamped here rather than in the controller so every caller is covered.
    // `pageSize` was previously unbounded: `?pageSize=100000` pulled every
    // program with all of its project activities inside one transaction. The
    // controller parses with a bare `Number()`, so non-finite has to be handled.
    const page = clampInt(opts.page, 1, Number.MAX_SAFE_INTEGER, 1);
    const pageSize = clampInt(
      opts.pageSize,
      1,
      MAX_PAGE_SIZE,
      DEFAULT_PAGE_SIZE,
    );

    // The counts and the aggregate are filter-scoped, not page-scoped: paging
    // through the list recomputed all five on every flip. They are cached as one
    // entry while the rows below stay live on every request — the rows carry a
    // per-user `hasUnread` flag, and the person reading the registry is usually
    // the person editing it.
    //
    // `tab` is part of the key because the aggregate is scoped to the active
    // tab's `where`, not to ALL. Four entries per filter set is the price of
    // keeping that correct.
    const summaryKey = cacheKey(REGISTRY_COUNTS_KEY_PREFIX, {
      visibility,
      tab: opts.tab,
      cycleId: opts.cycleId,
      clusterId: opts.clusterId,
      officeId: opts.officeId,
      finishLineIds: opts.finishLineIds,
      thematicTagIds: opts.thematicTagIds,
      papClasses: opts.papClasses,
      fundSources: opts.fundSources,
      // Matched with Prisma `mode: 'insensitive'`, so case must not split keys.
      search: opts.search?.toLowerCase(),
    });

    const [summary, rows] = await Promise.all([
      this.cache.getOrSet(summaryKey, REGISTRY_COUNTS_TTL_SECONDS, async () => {
        const [
          draftsCount,
          revisionsCount,
          publishedCount,
          archivedCount,
          allCount,
          aggregated,
        ] = await this.prisma.$transaction([
          this.prisma.program.count({ where: tabWhereOf('DRAFTS') }),
          this.prisma.program.count({ where: tabWhereOf('REVISIONS') }),
          this.prisma.program.count({ where: tabWhereOf('PUBLISHED') }),
          this.prisma.program.count({ where: tabWhereOf('ARCHIVED') }),
          this.prisma.program.count({ where: tabWhereOf('ALL') }),
          this.prisma.program.aggregate({
            // Phase 1 D17: the line-item family is structurally 0 while line
            // items are hidden, so the registry reads the proposed family.
            _sum: {
              psProposedTotal: true,
              mooeProposedTotal: true,
              feProposedTotal: true,
              coProposedTotal: true,
              proposedTotal: true,
            },
            where,
          }),
        ]);

        const tabCounts: Record<RegistryTab, number> = {
          DRAFTS: draftsCount,
          REVISIONS: revisionsCount,
          PUBLISHED: publishedCount,
          ARCHIVED: archivedCount,
          ALL: allCount,
        };

        // Stringified here, inside the loader, so a cache hit and a cache miss
        // return byte-identical shapes — the entry round-trips through JSON,
        // which would otherwise turn Decimals into strings on the hit path only.
        return {
          tabCounts,
          aggregateTotals: {
            ps: (
              aggregated._sum.psProposedTotal ?? new Prisma.Decimal(0)
            ).toString(),
            mooe: (
              aggregated._sum.mooeProposedTotal ?? new Prisma.Decimal(0)
            ).toString(),
            fe: (
              aggregated._sum.feProposedTotal ?? new Prisma.Decimal(0)
            ).toString(),
            co: (
              aggregated._sum.coProposedTotal ?? new Prisma.Decimal(0)
            ).toString(),
            total: (
              aggregated._sum.proposedTotal ?? new Prisma.Decimal(0)
            ).toString(),
          },
        };
      }),
      this.prisma.program.findMany({
        where,
        include: {
          finishLine: { select: { id: true, name: true, visionNumber: true } },
          subFinishLine: { select: { id: true, code: true, name: true } },
          papSector: { select: { id: true, code: true, name: true } },
          office: {
            select: { id: true, acronym: true, name: true, clusterId: true },
          },
          // Set only on component programs — the office whose printed AB sheet
          // this program appears under. The registry groups it there so the
          // screen reads the way the book does.
          hostOffice: { select: { id: true, acronym: true, name: true } },
          aipCycle: { select: { id: true, fiscalYear: true, status: true } },
          supportingOffices: {
            select: {
              office: { select: { id: true, name: true, acronym: true } },
            },
          },
          sourceDocument: SOURCE_DOCUMENT_SELECT,
          thematicTags: THEMATIC_TAG_SELECT,
          // Full PA rows (with denormalized rollups) so the client builds the
          // registry tree without a detail fetch per program / per activity.
          projectActivities: {
            select: {
              thematicTags: THEMATIC_TAG_SELECT,
              id: true,
              type: true,
              name: true,
              parentProjectActivityId: true,
              tentativeAipReferenceCode: true,
              aipReferenceCode: true,
              orderIndex: true,
              expectedOutput: true,
              costMode: true,
              psTotal: true,
              mooeTotal: true,
              feTotal: true,
              coTotal: true,
              grandTotal: true,
              proposedBudget: true,
              // Phase 1 D17: same reason as the aggregate below — the line-item
              // family is structurally 0, so the rows carry the estimates too.
              psEstimate: true,
              mooeEstimate: true,
              feEstimate: true,
              coEstimate: true,
              // Not rendered by the tree — these three are what
              // `deriveDataWarnings` reads to produce each row's `dataWarnings`.
              fundSources: true,
              implementationStartYear: true,
              implementationEndYear: true,
              sourceRef: true,
              sourceDocument: SOURCE_DOCUMENT_SELECT,
            },
            orderBy: { orderIndex: 'asc' },
          },
          comments: {
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          readStates: {
            where: { userId: user.sub },
            select: { lastSeenAt: true },
            take: 1,
          },
        },
        // Ordered to match how the city reads its AIP, and how the export
        // prints it: **office first**, then the three sections inside, then the
        // office's own ranking. `AIPRegistryExportService` sorts by
        // `office.acronym` and buckets by `papClass` for exactly this reason —
        // ordering the same way here is what lets the screen and the workbook
        // agree, and what lets the client group by run-length rather than
        // re-sorting a page it can only partly see.
        //
        // `papClass` enum sort follows declaration order, which is already
        // GAS → STO → OPERATIONS. `nulls: 'last'` puts unclassified rows
        // immediately after OPERATIONS, where the client folds them in, matching
        // the export and keeping the group contiguous.
        //
        // `orderIndex` asc, not `createdAt` desc: orderIndex is the
        // user-controlled rank within the code scope (aipCycleId, officeId,
        // papSectorId) that the AIP code's ordinal segment is derived from — see
        // AIPCodesService.resyncTentativeProgramCodes — and there is an index on
        // exactly that tuple. Sorting by it prints reference codes in ascending
        // order; the previous `createdAt: 'desc'` printed them backwards.
        orderBy: [
          { aipCycle: { fiscalYear: 'desc' } },
          { office: { acronym: 'asc' } },
          { papClass: { sort: 'asc', nulls: 'last' } },
          { orderIndex: 'asc' },
          { createdAt: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const { tabCounts, aggregateTotals } = summary;

    const items = rows.map(
      ({
        comments,
        readStates,
        supportingOffices,
        sourceDocument,
        projectActivities,
        thematicTags = [],
        ...program
      }) => {
        const latestComment = comments[0]?.createdAt ?? null;
        const lastActivityAt =
          latestComment && latestComment > program.updatedAt
            ? latestComment
            : program.updatedAt;
        const lastSeenAt = readStates[0]?.lastSeenAt ?? null;
        // A program row's own direct tags — never inherited (data-model.md).
        const programTags = thematicTags.map((t) => ({
          id: t.tag.id,
          name: t.tag.name,
          inherited: false,
        }));
        return {
          ...program,
          // The workbook row each line came from, as an "open in sheet" link.
          source: sourceLink(sourceDocument, program.sourceRef),
          thematicTags: programTags,
          projectActivities: projectActivities.map(
            ({ sourceDocument: doc, thematicTags: paTags = [], ...pa }) => {
              // Effective tags: the PA's own direct applications, plus the
              // parent program's tags it doesn't already carry directly —
              // same union `project-activities.service.ts#findOne` computes,
              // reused here rather than re-derived a second way.
              const direct = paTags.map((t) => ({
                id: t.tag.id,
                name: t.tag.name,
              }));
              const directIds = new Set(direct.map((t) => t.id));
              return {
                ...pa,
                source: sourceLink(doc, pa.sourceRef),
                thematicTags: [
                  ...direct.map((t) => ({ ...t, inherited: false })),
                  ...programTags
                    .filter((t) => !directIds.has(t.id))
                    .map((t) => ({ id: t.id, name: t.name, inherited: true })),
                ],
              };
            },
          ),
          supportingOffices: supportingOffices.map((r) => r.office),
          lastActivityAt,
          hasUnread: !lastSeenAt || lastActivityAt > lastSeenAt,
          // The same sentences `readinessFor` puts in the publish panel's
          // advisory `warnings`, on the row so an office can see which entries
          // still need work without opening 241 of them. Derived here rather
          // than stored, for the reason in `import-data-warnings.ts`: a gap
          // that gets filled has to stop being reported by itself.
          dataWarnings: deriveDataWarnings({
            papClass: program.papClass,
            fiscalYear: program.aipCycle.fiscalYear,
            leaves: leavesOf(projectActivities),
            statesOwnCosts: program.costMode === PPACostMode.DIRECT_COSTS,
            ownRow: program,
          }),
        };
      },
    );

    // The active tab's count *is* the total — `where` is exactly
    // `tabWhereOf(opts.tab)`, and RegistryTab is exhaustive over tabCounts. A
    // separate count({ where }) was a fifth identical round-trip to a remote DB.
    const total = tabCounts[opts.tab];

    return {
      tab: opts.tab,
      total,
      page,
      pageSize,
      tabCounts,
      items,
      aggregateTotals,
    };
  }

  /**
   * D16: a pure status partition, so the four counts add up and no row can fall
   * between tabs. The old role-adaptive needsActionFilter is gone — its HEAD and
   * LFC-member branches were dead in Phase 1, and the comment-driven surfacing
   * it provided is carried by the existing per-row `hasUnread` dot.
   */
}

function tabFilter(tab: RegistryTab): Prisma.ProgramWhereInput {
  switch (tab) {
    case 'DRAFTS':
      return { status: ProgramStatus.DRAFT };
    case 'REVISIONS':
      return { status: ProgramStatus.PUBLISHED_REVISION };
    case 'PUBLISHED':
      return { status: ProgramStatus.PUBLISHED };
    // Archived programs are out of every total (specs/013), ALL's footer
    // included — they only show on their own tab.
    case 'ARCHIVED':
      return { status: ProgramStatus.ARCHIVED };
    case 'ALL':
    default:
      return { status: { not: ProgramStatus.ARCHIVED } };
  }
}
