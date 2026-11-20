import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AIPCodesService } from '../aip-codes/aip-codes.service.js';
import { ProgramsService } from './programs.service.js';
import { ProgramVersionsService } from './program-versions.service.js';
import { ProgramAuditLogService } from '../program-audit/program-audit-log.service.js';
import { RegistryCacheService } from '../cache/registry-cache.service.js';
import { EstimateRollupService } from '../budget-rollup/estimate-rollup.service.js';
import { BudgetRollupService } from '../budget-rollup/budget-rollup.service.js';
import {
  deriveDataWarnings,
  leavesOf,
  climateWarnings,
  uncodedClimateTags,
} from './import-data-warnings.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import {
  FundSource,
  PapClass,
  PPACostMode,
  Prisma,
  ProgramAuditAction,
  ProgramStatus,
  Role,
} from '../generated/prisma/index';
import { LIVE_PROGRAM, PUBLICLY_VISIBLE } from './program-filters.js';
import { GOAL } from '../common/brand.js';

type Tx = Prisma.TransactionClient;

/** Why a program cannot be published right now. Shared by publish and preview. */
export type PublishBlocker =
  | 'NO_PPAS'
  | 'ZERO_PROPOSED_BUDGET'
  | 'ALREADY_PUBLISHED'
  | 'NOT_PUBLISHABLE_STATUS'
  /**
   * Bulk-imported and still carrying unconfirmed import decisions in
   * `Program.importWarnings`. Cleared by `acknowledgeImport`, not by editing.
   */
  | 'INCOMPLETE_IMPORT'
  /** A PPA is missing a funding source, implementation dates or an output. */
  | 'INCOMPLETE_DATA'
  /** A cost-derived parent PPA has no children to derive from. */
  | 'EMPTY_PARENT_PPA';

export interface PublishReadiness {
  programId: string;
  name: string;
  officeId: string | null;
  paCount: number;
  proposedTotal: string;
  ready: boolean;
  blockers: PublishBlocker[];
  /**
   * Decisions the 2027 import had to make on this program's behalf — an
   * inferred finish line, a duplicate merge, a synthesised heading — verbatim,
   * so the UI can show what to confirm rather than just that something is
   * wrong. Empty on every hand-authored program.
   *
   * Stored rather than derived because nothing in the rows can re-check them: a
   * finish line the importer guessed is indistinguishable from one deliberately
   * chosen. Cleared only by `acknowledgeImport`. Data *gaps* used to live here
   * too and now come back through `warnings`, recomputed — see
   * `import-data-warnings.ts`.
   */
  importWarnings: string[];
  /**
   * Advisory only — never blocks (D18/§3.4). Ceiling overruns plus the derived
   * data warnings, which explain in words what `INCOMPLETE_DATA` and
   * `ZERO_PROPOSED_BUDGET` only name.
   */
  warnings: string[];
  unresolvedComments: number;
}

/**
 * Owns the Phase 1 lifecycle: revise → save drafts → publish / discard.
 *
 * The mechanic in one line: the live `Program` + `ProjectActivity` tree is the
 * **working copy**, and the public reads the last published snapshot. Editing a
 * published AIP therefore always lands in an unpublished draft first — there is
 * no path where a keystroke reaches the public registry (D8).
 *
 * See docs/design/phase-1-publish-scope.md §3.2-3.4.
 */
@Injectable()
export class ProgramPublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly programs: ProgramsService,
    private readonly versions: ProgramVersionsService,
    private readonly codes: AIPCodesService,
    private readonly estimates: EstimateRollupService,
    private readonly rollup: BudgetRollupService,
    private readonly audit: ProgramAuditLogService,
    private readonly registryCache: RegistryCacheService,
  ) {}

  // ─── Revision ─────────────────────────────────────────────────────────────

  /**
   * `PUBLISHED → PUBLISHED_REVISION`. Explicit rather than implicit: if
   * PUBLISHED is not editable, the first PATCH would throw at the guard before
   * anything could flip the status. Making it a deliberate act also gives the
   * public-transparency system a permissioned, logged moment where an AIP
   * starts to diverge from what citizens see.
   */
  async openRevision(programId: string, user: JwtPayload) {
    const program = await this.load(programId);
    await this.programs.assertOwner(program, user);

    if (program.status === ProgramStatus.PUBLISHED_REVISION) {
      // Idempotent: two encoders clicking "Edit" is not an error.
      return program;
    }
    if (program.status !== ProgramStatus.PUBLISHED) {
      throw new BadRequestException(
        `Only a PUBLISHED program can be revised (current: ${program.status})`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.program.update({
        where: { id: programId },
        data: { status: ProgramStatus.PUBLISHED_REVISION },
      });

      await this.audit.record(
        {
          programId,
          action: ProgramAuditAction.REVISION_OPENED,
          actor: user,
          onBehalfOfOfficeId: program.officeId,
          summary: 'Published AIP reopened for editing',
          programVersionId: program.publishedVersionId,
        },
        tx,
      );

      return row;
    });

    // PUBLISHED → PUBLISHED_REVISION moves the tab counts.
    await this.registryCache.invalidateRegistryCounts();
    return updated;
  }

  /**
   * `PUBLISHED_REVISION → PUBLISHED`, restoring live rows from the published
   * snapshot. Requires only `aip:write` because it moves *toward* the published
   * state, never away from it.
   */
  async discardDraft(programId: string, user: JwtPayload) {
    const program = await this.load(programId);
    await this.programs.assertOwner(program, user);

    if (program.status !== ProgramStatus.PUBLISHED_REVISION) {
      throw new BadRequestException('This program has no unpublished draft');
    }
    if (!program.publishedVersionId) {
      // Belt and braces: PUBLISHED_REVISION is only reachable from PUBLISHED,
      // which always has a snapshot. If this ever fires, something restored a
      // status without its version pointer.
      throw new ConflictException(
        'Cannot discard: this program has no published version to restore',
      );
    }

    const version = await this.prisma.programVersion.findUnique({
      where: { id: program.publishedVersionId },
    });
    if (!version) throw new NotFoundException('Published version not found');

    const snapshot = version.snapshot as unknown as SnapshotShape;

    const result = await this.prisma.$transaction(async (tx) => {
      await this.restoreFromSnapshot(programId, snapshot, tx);

      await tx.program.update({
        where: { id: programId },
        data: { status: ProgramStatus.PUBLISHED },
      });

      await this.audit.record(
        {
          programId,
          action: ProgramAuditAction.DRAFT_DISCARDED,
          actor: user,
          onBehalfOfOfficeId: program.officeId,
          summary: `Discarded unpublished changes, restored v${version.version}`,
          programVersionId: version.id,
        },
        tx,
      );

      return { message: `Draft discarded; restored v${version.version}.` };
    });

    // Both caches: the status moves the tab counts, and restoring the snapshot
    // rewrites the live money columns the public list reads.
    await this.registryCache.invalidateAll();
    return result;
  }

  // ─── Archive ──────────────────────────────────────────────────────────────

  /**
   * `PUBLISHED → ARCHIVED` (specs/013): a superseded program keeps its history,
   * versions and comments but counts nowhere — every live query reads
   * `LIVE_PROGRAM` / `PUBLICLY_VISIBLE` (program-filters.ts). Its public link
   * still opens, marked archived, with the reason given here.
   *
   * Only from PUBLISHED: an open revision is discarded first, so what stays
   * readable is exactly what was public. SUPER_ADMIN only, reason required.
   */
  async archive(programId: string, reason: string, user: JwtPayload) {
    const text = this.assertArchiver(user, reason);
    const program = await this.load(programId);
    if (program.status !== ProgramStatus.PUBLISHED) {
      throw new ConflictException(
        program.status === ProgramStatus.PUBLISHED_REVISION
          ? 'Discard the open revision before archiving this program'
          : `Only a PUBLISHED program can be archived (current: ${program.status})`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Hand the tentative code back, as softDelete does: the unique index
      // ignores status, so a parked row is the only way the scope can renumber.
      // The published snapshot keeps the code it was published under.
      const row = await tx.program.update({
        where: { id: programId },
        data: {
          status: ProgramStatus.ARCHIVED,
          archivedAt: new Date(),
          archivedReason: text,
          tentativeAipReferenceCode: `~${programId}`,
        },
      });
      await this.resyncScopeOf(program, tx);
      await this.audit.record(
        {
          programId,
          action: ProgramAuditAction.ARCHIVED,
          actor: user,
          onBehalfOfOfficeId: program.officeId,
          summary: `Archived: ${text}`,
          changes: {
            status: {
              from: ProgramStatus.PUBLISHED,
              to: ProgramStatus.ARCHIVED,
            },
            archivedReason: { from: null, to: text },
          },
          programVersionId: program.publishedVersionId,
        },
        tx,
      );
      return row;
    });

    // Leaves every public list and total, and moves the tab counts.
    await this.registryCache.invalidateAll();
    return updated;
  }

  /**
   * `ARCHIVED → DRAFT`. Back to draft rather than straight to published: the
   * program must pass the readiness gate again before it counts anywhere. Its
   * tentative code is re-derived from its position in the scope.
   */
  async unarchive(programId: string, reason: string, user: JwtPayload) {
    const text = this.assertArchiver(user, reason);
    const program = await this.load(programId);
    if (program.status !== ProgramStatus.ARCHIVED) {
      throw new ConflictException('This program is not archived');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.program.update({
        where: { id: programId },
        data: {
          status: ProgramStatus.DRAFT,
          archivedAt: null,
          archivedReason: null,
        },
      });
      await this.resyncScopeOf(program, tx);
      await this.audit.record(
        {
          programId,
          action: ProgramAuditAction.UNARCHIVED,
          actor: user,
          onBehalfOfOfficeId: program.officeId,
          summary: `Unarchived to draft: ${text}`,
          changes: {
            status: { from: ProgramStatus.ARCHIVED, to: ProgramStatus.DRAFT },
            archivedReason: { from: program.archivedReason, to: null },
          },
        },
        tx,
      );
      return row;
    });

    await this.registryCache.invalidateAll();
    return updated;
  }

  private assertArchiver(user: JwtPayload, reason: string): string {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can archive programs');
    }
    const text = reason?.trim() ?? '';
    if (!text || text.length > 500) {
      throw new BadRequestException('A reason of 1–500 characters is required');
    }
    return text;
  }

  private async resyncScopeOf(
    program: {
      aipCycleId: string;
      officeId: string | null;
      papSectorId: string;
    },
    tx: Tx,
  ) {
    if (!program.officeId) return;
    await this.codes.resyncTentativeProgramCodes(
      {
        aipCycleId: program.aipCycleId,
        officeId: program.officeId,
        papSectorId: program.papSectorId,
      },
      tx,
    );
  }

  // ─── Import review ────────────────────────────────────────────────────────

  /**
   * Confirm the decisions the 2027 import made on this program's behalf, so it
   * stops being held back by `INCOMPLETE_IMPORT`.
   *
   * This exists because the stored warnings have no other way out. Data gaps are
   * derived and clear themselves when the data is fixed; these three do not —
   * a finish line the importer guessed is indistinguishable from one chosen on
   * purpose, so the only thing that can settle it is a person saying so. Without
   * this method the ~101 flagged 2027 programs were unpublishable except by
   * direct SQL, whatever anyone did to the rows.
   *
   * Requires `aip:publish` at the route, and ownership here, on the same footing
   * as `publish` itself: confirming the import is a precondition of publishing,
   * so it is the same authority rather than a lesser one.
   *
   * No cache invalidation. Only the registry *counts* summary is cached, and
   * this moves neither status nor money — the row list that renders the warning
   * marker is read uncached.
   */
  async acknowledgeImport(programId: string, user: JwtPayload) {
    const program = await this.load(programId);
    await this.programs.assertOwner(program, user);

    if (program.importWarnings.length === 0) {
      // Idempotent, same reasoning as `openRevision`: two reviewers clicking
      // "Mark reviewed" is not an error.
      return program;
    }

    const cleared = program.importWarnings;

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.program.update({
        where: { id: programId },
        data: { importWarnings: [] },
      });

      await this.audit.record(
        {
          programId,
          action: ProgramAuditAction.IMPORT_REVIEWED,
          actor: user,
          onBehalfOfOfficeId: program.officeId,
          summary: `Confirmed ${cleared.length} import decision${cleared.length === 1 ? '' : 's'}`,
          // The only surviving record of what was cleared.
          changes: { importWarnings: { from: cleared, to: [] } },
        },
        tx,
      );

      return row;
    });
  }

  // ─── Publish ──────────────────────────────────────────────────────────────

  async publish(programId: string, user: JwtPayload) {
    const program = await this.load(programId);
    await this.programs.assertOwner(program, user);

    const readiness = await this.readinessFor(programId);
    if (!readiness.ready) {
      throw new BadRequestException({
        message: 'Program is not ready to publish',
        blockers: readiness.blockers,
      });
    }

    const result = await this.prisma.$transaction((tx) =>
      this.publishOne(program, user, tx),
    );
    // After commit, not inside `publishOne`: invalidating mid-transaction would
    // drop the entry while the old rows are still what a concurrent reader sees.
    await this.registryCache.invalidateAll();
    return result;
  }

  /**
   * Confirm the import decisions on every flagged program in one or more
   * clusters, so a bulk-imported cycle can actually be published.
   *
   * Acknowledging one program at a time is the right unit for a handful of
   * rows. It is the wrong unit for an imported book: every one of the 419
   * programs in the enacted 2026 budget carries an inferred finish line, so the
   * publish button would skip all of them and there would be no way through
   * short of 419 clicks.
   *
   * Same authority as publishing, because that is what it unblocks — and every
   * program still gets its own `IMPORT_REVIEWED` audit row naming what was
   * cleared, so a bulk confirmation is as traceable as a single one.
   */
  async acknowledgeImportsForClusters(
    aipCycleId: string,
    clusterIds: string[],
    user: JwtPayload,
  ) {
    if (clusterIds.length === 0) {
      throw new BadRequestException('At least one clusterId is required');
    }
    const flagged = await this.prisma.program.findMany({
      where: {
        aipCycleId,
        ...LIVE_PROGRAM,
        office: { cluster: { id: { in: clusterIds } } },
        importWarnings: { isEmpty: false },
      },
      select: { id: true },
    });

    let acknowledged = 0;
    const failed: { programId: string; error: string }[] = [];
    for (const { id } of flagged) {
      try {
        await this.acknowledgeImport(id, user);
        acknowledged++;
      } catch (error) {
        failed.push({ programId: id, error: (error as Error).message });
      }
    }
    return { total: flagged.length, acknowledged, failed };
  }

  /**
   * Publish every ready program in a cluster. One transaction **per program**,
   * not one for the batch: publishing consumes `AIPCodeCounter`, and a single
   * long transaction would hold that counter's row lock for the whole run.
   * Per-program is also what makes "blocked entries are skipped, not failed"
   * true — a failure on the ninth program keeps the first eight published.
   */
  async publishCluster(
    aipCycleId: string,
    clusterIds: string[],
    user: JwtPayload,
  ) {
    const targets = await this.resolveClusterTargets(aipCycleId, clusterIds);

    const published: { programId: string; version: number; code: string }[] =
      [];
    const skipped: { programId: string; reason: PublishBlocker }[] = [];
    const failed: { programId: string; error: string }[] = [];

    for (const program of targets) {
      // Office scope is checked per program: a batch must not become a way to
      // publish an office the caller could not publish individually.
      try {
        await this.programs.assertOwner(program, user);
      } catch {
        continue;
      }

      const readiness = await this.readinessFor(program.id);
      if (!readiness.ready) {
        skipped.push({
          programId: program.id,
          reason: readiness.blockers[0] ?? 'NOT_PUBLISHABLE_STATUS',
        });
        continue;
      }

      try {
        const result = await this.prisma.$transaction((tx) =>
          this.publishOne(program, user, tx),
        );
        published.push({
          programId: program.id,
          version: result.version,
          code: result.aipReferenceCode,
        });
      } catch (err) {
        failed.push({
          programId: program.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    if (published.length > 0) {
      await this.registryCache.invalidateAll();
    }

    return { published, skipped, failed };
  }

  /**
   * Dry run of the same preconditions, so the readiness screen cannot disagree
   * with what the button does.
   */
  async publishPreview(aipCycleId: string, clusterIds: string[]) {
    const targets = await this.resolveClusterTargets(aipCycleId, clusterIds);
    return Promise.all(targets.map((p) => this.readinessFor(p.id)));
  }

  /**
   * How many unpublished entries each cluster holds, keyed by cluster id — the
   * per-option count on the batch-publish picker, so a cluster with nothing to
   * publish is visible before it is selected.
   *
   * Counts the same set `resolveClusterTargets` publishes (DRAFT and
   * PUBLISHED_REVISION), so the number cannot promise more than the button
   * delivers. Deliberately *not* full readiness: that runs several queries per
   * program, which is far too much work to open a dropdown.
   */
  async publishableCounts(aipCycleId: string): Promise<Record<string, number>> {
    const programs = await this.prisma.program.findMany({
      where: {
        aipCycleId,
        deletedAt: null,
        status: {
          in: [
            ProgramStatus.DRAFT,
            ProgramStatus.PUBLISHED_REVISION,
            ProgramStatus.APPROVED,
          ],
        },
      },
      select: { office: { select: { clusterId: true } } },
    });

    const counts: Record<string, number> = {};
    for (const program of programs) {
      const clusterId = program.office?.clusterId;
      if (clusterId) counts[clusterId] = (counts[clusterId] ?? 0) + 1;
    }
    return counts;
  }

  private async publishOne(
    program: LoadedProgram,
    user: JwtPayload,
    tx: Tx,
  ): Promise<{ version: number; aipReferenceCode: string }> {
    const isFirstPublish = !program.publishedVersionId;

    // The final code is assigned at first publish and never reassigned (§3.3).
    let aipReferenceCode = program.aipReferenceCode;
    if (!aipReferenceCode) {
      aipReferenceCode = await this.codes.issueFinalProgramCode(
        {
          aipCycleId: program.aipCycleId,
          papSectorId: program.papSectorId,
          officeId: program.officeId,
          papClass: program.papClass,
        },
        tx,
      );
    }

    const version = await this.versions.snapshot(program.id, user.sub, tx);

    const totals = await tx.program.findUniqueOrThrow({
      where: { id: program.id },
      select: { name: true, proposedTotal: true },
    });

    await tx.program.update({
      where: { id: program.id },
      data: {
        status: ProgramStatus.PUBLISHED,
        aipReferenceCode,
        publishedVersionId: version.id,
        publishedByUserId: user.sub,
        ...(isFirstPublish ? { publishedAt: new Date() } : {}),
        // Mirrors the public list reads, so an open revision cannot leak.
        publishedName: totals.name,
        publishedProposedTotal: totals.proposedTotal,
      },
    });

    await this.audit.record(
      {
        programId: program.id,
        action: isFirstPublish
          ? ProgramAuditAction.PUBLISHED
          : ProgramAuditAction.REPUBLISHED,
        actor: user,
        onBehalfOfOfficeId: program.officeId,
        summary: isFirstPublish
          ? `Published as v${version.version} · ${aipReferenceCode}`
          : `Republished as v${version.version}`,
        programVersionId: version.id,
      },
      tx,
    );

    return { version: version.version, aipReferenceCode };
  }

  // ─── Preconditions ────────────────────────────────────────────────────────

  /**
   * Publish preconditions (D19), deliberately thin:
   *   - at least one PA,
   *   - every PA has `proposedBudget > 0`,
   *   - the program is in a publishable status.
   *
   * Gating on `proposedBudget` rather than on the estimate trio is what lets a
   * program migrated from the old workflow be republished after an unrelated
   * typo fix, instead of blocking behind a full re-keying exercise.
   *
   * Unresolved comment threads are reported but never block: comments arrive
   * *after* publication in this phase, so the submit-era gate is simply wrong
   * here.
   */
  async readinessFor(programId: string): Promise<PublishReadiness> {
    const program = await this.prisma.program.findFirst({
      where: { id: programId, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        officeId: true,
        finishLineId: true,
        aipCycleId: true,
        // Decides whether the fund-source and expected-output checks apply at
        // all — a historical cycle is held verbatim, not governed.
        aipCycle: { select: { fiscalYear: true } },
        proposedTotal: true,
        importWarnings: true,
        papClass: true,
        // A direct-cost program is checked on its own fields, so they have to
        // be selected alongside the PA ones.
        costMode: true,
        fundSources: true,
        expectedOutput: true,
        implementationStartYear: true,
        implementationEndYear: true,
        climateChangeTag: {
          select: {
            ccaAmount: true,
            ccmAmount: true,
            _count: { select: { codes: true } },
          },
        },
        psProposedTotal: true,
        mooeProposedTotal: true,
        feProposedTotal: true,
        coProposedTotal: true,
        projectActivities: {
          select: {
            id: true,
            name: true,
            climateChangeTag: {
              select: {
                ccaAmount: true,
                ccmAmount: true,
                _count: { select: { codes: true } },
              },
            },
            proposedBudget: true,
            parentProjectActivityId: true,
            costMode: true,
            fundSources: true,
            expectedOutput: true,
            implementationStartYear: true,
            implementationEndYear: true,
            psEstimate: true,
            mooeEstimate: true,
            feEstimate: true,
            coEstimate: true,
          },
        },
        _count: {
          select: {
            comments: { where: { parentCommentId: null, resolvedAt: null } },
          },
        },
      },
    });
    if (!program) throw new NotFoundException('Program not found');

    const blockers: PublishBlocker[] = [];

    // APPROVED counts as publishable. It is the end of the workflow — a program
    // the LFC has signed off — so publishing it is the natural next step, and
    // without it the enacted 2026 corpus (every row APPROVED, none published)
    // could not be made public at all.
    if (
      program.status !== ProgramStatus.DRAFT &&
      program.status !== ProgramStatus.PUBLISHED_REVISION &&
      program.status !== ProgramStatus.APPROVED
    ) {
      blockers.push(
        program.status === ProgramStatus.PUBLISHED
          ? 'ALREADY_PUBLISHED'
          : 'NOT_PUBLISHABLE_STATUS',
      );
    }

    // A PPA that other PPAs hang off derives its money from them
    // (costMode ACTIVITY_CHILDREN), so its own proposedBudget is null by
    // design. Only the leaves are required to carry an amount — checking
    // every row instead would fail every nested program, which is the shape
    // the 2027 workbook uses throughout.
    const leaves = leavesOf(program.projectActivities);

    const statesOwnCosts = program.costMode === PPACostMode.DIRECT_COSTS;

    if (statesOwnCosts) {
      // A direct-cost program is checked exactly as a leaf PA is — it is the
      // leaf. `NO_PPAS` deliberately does not apply: having no PPAs is the
      // point, not a gap.
      if (
        !program.proposedTotal ||
        program.proposedTotal.lessThanOrEqualTo(0)
      ) {
        blockers.push('ZERO_PROPOSED_BUDGET');
      }
      // Fund source and expected output never block (specs/013): the public
      // page says "Not yet stated" and staff keep the warning (`dataWarnings`).
      if (
        program.implementationStartYear === null ||
        program.implementationEndYear === null
      ) {
        blockers.push('INCOMPLETE_DATA');
      }
    } else if (program.projectActivities.length === 0) {
      blockers.push('NO_PPAS');
    } else {
      if (
        leaves.some(
          (pa) => !pa.proposedBudget || pa.proposedBudget.lessThanOrEqualTo(0),
        )
      ) {
        blockers.push('ZERO_PROPOSED_BUDGET');
      }

      // The mirror case: a row declared cost-derived with nothing under it
      // would publish as ₱0 with no indication why. A leaf is by definition a
      // row nothing hangs off, so "cost-derived leaf" is exactly that case.
      if (leaves.some((pa) => pa.costMode === PPACostMode.ACTIVITY_CHILDREN)) {
        blockers.push('EMPTY_PARENT_PPA');
      }

      // The one field a published AIP entry must state: when it runs. Derived,
      // so filling it in clears the blocker with no extra bookkeeping.
      //
      // Fund source and expected output do not block (specs/013, the 2027
      // launch): the city's workbook leaves 100 and 277 leaves blank, the public
      // page says "Not yet stated", and `deriveDataWarnings` keeps the gap in
      // front of staff until an office fills it in.
      if (
        leaves.some(
          (pa) =>
            pa.implementationStartYear === null ||
            pa.implementationEndYear === null,
        )
      ) {
        blockers.push('INCOMPLETE_DATA');
      }
    }

    const climateTags = [
      ...(program.climateChangeTag
        ? [
            {
              owner: program.name,
              budget: statesOwnCosts ? program.proposedTotal : null,
              ...program.climateChangeTag,
            },
          ]
        : []),
      ...program.projectActivities.flatMap((pa) =>
        pa.climateChangeTag
          ? [
              {
                owner: pa.name,
                budget: pa.proposedBudget,
                ...pa.climateChangeTag,
              },
            ]
          : [],
      ),
    ].map((t) => ({ ...t, codeCount: t._count.codes }));
    if (
      uncodedClimateTags(climateTags).length > 0 &&
      !blockers.includes('INCOMPLETE_DATA')
    ) {
      blockers.push('INCOMPLETE_DATA');
    }

    // Decisions the import made on the program's behalf, which only a human can
    // confirm. Stored rather than derived: an inferred finish line leaves no
    // trace in the data itself, so there is nothing to re-check it against.
    // Data gaps are NOT in here — they come back through `warnings` below,
    // recomputed on every read so an edit clears them by itself.
    if (program.importWarnings.length > 0) {
      blockers.push('INCOMPLETE_IMPORT');
    }

    return {
      programId: program.id,
      name: program.name,
      officeId: program.officeId,
      paCount: program.projectActivities.length,
      proposedTotal: program.proposedTotal.toFixed(2),
      ready: blockers.length === 0,
      blockers,
      importWarnings: program.importWarnings,
      warnings: [
        ...(await this.ceilingWarnings(program)),
        ...deriveDataWarnings({
          papClass: program.papClass,
          fiscalYear: program.aipCycle.fiscalYear,
          leaves,
          statesOwnCosts,
          ownRow: program,
        }),
        ...climateWarnings(climateTags),
      ],
      unresolvedComments: program._count.comments,
    };
  }

  /**
   * Ceilings are optional and advisory in Phase 1 (D18). A *missing* row is
   * skipped silently — they are not reliably configured for every finish line
   * yet, and a missing row must not block a perfectly good AIP.
   *
   * A ceiling **of zero is a real cap**, not "unset": setting a finish line to
   * ₱0 is how the LFC says "nothing goes here this cycle", so any positive
   * proposal against it must warn.
   *
   * Measured on `proposedTotal`, not `grandTotal`: the latter is structurally 0
   * while line items are hidden, so the old check would have compared 0 against
   * the cap and passed unconditionally.
   */
  private async ceilingWarnings(program: {
    id: string;
    aipCycleId: string;
    finishLineId: string;
    proposedTotal: Prisma.Decimal;
  }): Promise<string[]> {
    const ceiling = await this.prisma.finishLineBudgetCeiling.findUnique({
      where: {
        aipCycleId_finishLineId: {
          aipCycleId: program.aipCycleId,
          finishLineId: program.finishLineId,
        },
      },
    });
    if (!ceiling) return [];

    const others = await this.prisma.program.aggregate({
      where: {
        aipCycleId: program.aipCycleId,
        finishLineId: program.finishLineId,
        ...PUBLICLY_VISIBLE,
        NOT: { id: program.id },
      },
      _sum: { proposedTotal: true },
    });

    const wouldBe = (others._sum.proposedTotal ?? new Prisma.Decimal(0)).plus(
      program.proposedTotal,
    );

    if (wouldBe.lessThanOrEqualTo(ceiling.totalCeiling)) return [];

    return [
      `Publishing brings this ${GOAL.toLowerCase()} to ${wouldBe.toFixed(2)}, over its ceiling of ${ceiling.totalCeiling.toFixed(2)}.`,
    ];
  }

  // ─── Snapshot restore ─────────────────────────────────────────────────────

  /**
   * Rebuild the live tree from a snapshot inside one transaction.
   *
   * Line items are part of the snapshot and are restored too, even though
   * Phase 1 hides them (D5) — a discard must not quietly drop Phase 2 data.
   * So are the program's own cost columns, fund splits and climate tags, on the
   * program and on every PA.
   */
  private async restoreFromSnapshot(
    programId: string,
    snapshot: SnapshotShape,
    tx: Tx,
  ): Promise<void> {
    await tx.program.update({
      where: { id: programId },
      data: {
        name: snapshot.name,
        description: snapshot.description ?? null,
        remarks: snapshot.remarks ?? null,
        expectedOutput: snapshot.expectedOutput,
        // Optional in the shape: snapshots taken before these columns existed
        // simply do not carry them, and `?? null` restores them to empty rather
        // than leaving a revision-era value behind while every sibling column
        // reverts.
        majorFinalOutput: snapshot.majorFinalOutput ?? null,
        targetForBudgetYear: snapshot.targetForBudgetYear ?? null,
        finishLineId: snapshot.finishLineId,
        subFinishLineId: snapshot.subFinishLineId ?? null,
        papSectorId: snapshot.papSectorId,
        papSubsectorCode: snapshot.papSubsectorCode,
        papClass: snapshot.papClass ?? null,
        sglgIndicatorId: snapshot.sglgIndicatorId ?? null,
        implementationStartMonth: snapshot.implementationStartMonth ?? null,
        implementationStartYear: snapshot.implementationStartYear ?? null,
        implementationEndMonth: snapshot.implementationEndMonth ?? null,
        implementationEndYear: snapshot.implementationEndYear ?? null,
        // The program's own money. For a program that states its costs
        // (DIRECT_COSTS) these columns are the input, so leaving them out kept a
        // discarded revision's figures and fund split while everything else
        // reverted. For a derived program the rollup below rewrites them anyway.
        // Snapshots from before a column existed restore its default.
        costMode: snapshot.costMode ?? PPACostMode.ACTIVITY_CHILDREN,
        fundSources: snapshot.fundSources ?? [],
        psProposedTotal: new Prisma.Decimal(snapshot.psProposedTotal ?? 0),
        mooeProposedTotal: new Prisma.Decimal(snapshot.mooeProposedTotal ?? 0),
        feProposedTotal: new Prisma.Decimal(snapshot.feProposedTotal ?? 0),
        coProposedTotal: new Prisma.Decimal(snapshot.coProposedTotal ?? 0),
        fundAllocations: {
          deleteMany: {},
          create: allocationRows(snapshot.fundAllocations),
        },
      },
    });

    await tx.climateChangeTag.deleteMany({ where: { programId } });
    if (snapshot.climateChangeTag)
      await tx.climateChangeTag.create({
        data: { programId, ...tagRow(snapshot.climateChangeTag) },
      });

    // Rows elsewhere that point at these PAs — PPMP lines (specs/012 D8) and
    // budget-document PPAs carried from them — lose the link to ON DELETE SET
    // NULL in the rebuild below. PA ids come back unchanged, so note the links
    // now and put back the ones whose PA is restored.
    const [ppmpLinks, itemSources] = await Promise.all([
      tx.pPMPLineItem.findMany({
        where: { projectActivity: { programId } },
        select: { id: true, projectActivityId: true },
      }),
      tx.budgetItem.findMany({
        where: { sourceProjectActivity: { programId } },
        select: { id: true, sourceProjectActivityId: true },
      }),
    ]);

    // Replace the PA subtree wholesale. Rebuilding rather than diffing keeps
    // "restored" unambiguous: anything added during the revision disappears,
    // anything deleted comes back with its original id.
    await tx.projectActivity.deleteMany({ where: { programId } });

    const rows = snapshot.projectActivities ?? [];
    // Parents first, so parentProjectActivityId always resolves.
    const ordered = [...rows].sort((a, b) =>
      a.parentProjectActivityId === null && b.parentProjectActivityId !== null
        ? -1
        : a.parentProjectActivityId !== null &&
            b.parentProjectActivityId === null
          ? 1
          : 0,
    );

    for (const pa of ordered) {
      await tx.projectActivity.create({
        data: {
          id: pa.id,
          programId,
          parentProjectActivityId: pa.parentProjectActivityId ?? null,
          type: pa.type,
          name: pa.name,
          description: pa.description ?? null,
          remarks: pa.remarks ?? null,
          expectedOutput: pa.expectedOutput ?? null,
          majorFinalOutput: pa.majorFinalOutput ?? null,
          targetForBudgetYear: pa.targetForBudgetYear ?? null,
          costMode: pa.costMode,
          fundSources: pa.fundSources ?? [],
          proposedBudget: decimalOrNull(pa.proposedBudget),
          psEstimate: decimalOrNull(pa.psEstimate),
          mooeEstimate: decimalOrNull(pa.mooeEstimate),
          // Snapshots from before FE existed carry no key: restore as empty.
          feEstimate: decimalOrNull(pa.feEstimate ?? null),
          coEstimate: decimalOrNull(pa.coEstimate),
          implementationStartMonth: pa.implementationStartMonth ?? null,
          implementationStartYear: pa.implementationStartYear ?? null,
          implementationEndMonth: pa.implementationEndMonth ?? null,
          implementationEndYear: pa.implementationEndYear ?? null,
          // Codes are derived state, so they are rebuilt rather than restored.
          // The snapshot is an immutable record of what was submitted and still
          // holds whatever the code looked like then — restoring it verbatim
          // would write a stale code (an old format after the realignment, or
          // one a sibling has since been given) straight into a unique column.
          // Park on a sentinel here; `resyncTentativePACodes` below fills them.
          tentativeAipReferenceCode: `~${pa.id}`,
          aipReferenceCode: null,
          orderIndex: pa.orderIndex ?? 0,
          createdByUserId: pa.createdByUserId,
          // Both cascade away with the deleteMany above, so they come back from
          // the snapshot or not at all.
          fundAllocations: pa.fundAllocations?.length
            ? { create: allocationRows(pa.fundAllocations) }
            : undefined,
          climateChangeTag: pa.climateChangeTag
            ? { create: tagRow(pa.climateChangeTag) }
            : undefined,
          lineItems: pa.lineItems?.length
            ? {
                create: pa.lineItems.map((li) => ({
                  id: li.id,
                  expenseClass: li.expenseClass,
                  uacsObjectId: li.uacsObjectId,
                  uacsCode: li.uacsCode,
                  uacsDescription: li.uacsDescription,
                  quantity: new Prisma.Decimal(li.quantity),
                  unit: li.unit,
                  unitCost: new Prisma.Decimal(li.unitCost),
                  lineTotal: new Prisma.Decimal(li.lineTotal),
                  remarks: li.remarks ?? null,
                  orderIndex: li.orderIndex ?? 0,
                })),
              }
            : undefined,
        },
      });
    }

    const restored = new Set(ordered.map((pa) => pa.id));
    for (const l of ppmpLinks)
      if (restored.has(l.projectActivityId!))
        await tx.pPMPLineItem.update({
          where: { id: l.id },
          data: { projectActivityId: l.projectActivityId },
        });
    for (const i of itemSources)
      if (restored.has(i.sourceProjectActivityId!))
        await tx.budgetItem.update({
          where: { id: i.id },
          data: { sourceProjectActivityId: i.sourceProjectActivityId },
        });

    // Rebuild the PA codes the sentinels above are standing in for. Ranks are
    // read from the rows just written, so the restored subtree numbers exactly
    // as it would have if it had been created by hand.
    //
    // Forced: `discardDraft` has no cycle-status guard, so this can run against
    // a program in a CLOSED cycle. The frozen check protects codes that already
    // exist; here there are none, and skipping would leave every PA parked on
    // its sentinel.
    await this.codes.resyncTentativePACodes(programId, tx, { force: true });

    // Both rollup families, so a discard leaves no drift behind.
    await this.rollup.recomputeProgram(programId, tx);
    await this.estimates.recomputeProgram(programId, tx);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async load(programId: string) {
    const program = await this.prisma.program.findFirst({
      where: { id: programId, deletedAt: null },
    });
    if (!program) throw new NotFoundException('Program not found');
    return program;
  }

  private async resolveClusterTargets(
    aipCycleId: string,
    clusterIds: string[],
  ) {
    if (clusterIds.length === 0) {
      throw new BadRequestException('At least one clusterId is required');
    }
    return this.prisma.program.findMany({
      where: {
        aipCycleId,
        deletedAt: null,
        office: { cluster: { id: { in: clusterIds } } },
        status: {
          in: [
            ProgramStatus.DRAFT,
            ProgramStatus.PUBLISHED_REVISION,
            ProgramStatus.APPROVED,
          ],
        },
      },
    });
  }
}

type LoadedProgram = Awaited<
  ReturnType<PrismaService['program']['findFirstOrThrow']>
>;

/** The shape we read back out of `ProgramVersion.snapshot`. */
interface SnapshotShape {
  name: string;
  description: string | null;
  remarks: string | null;
  expectedOutput: string;
  majorFinalOutput?: string | null;
  targetForBudgetYear?: string | null;
  finishLineId: string;
  subFinishLineId: string | null;
  papSectorId: string;
  papSubsectorCode: string;
  papClass: PapClass | null;
  sglgIndicatorId: string | null;
  implementationStartMonth: number | null;
  implementationStartYear: number | null;
  implementationEndMonth: number | null;
  implementationEndYear: number | null;
  costMode?: PPACostMode;
  fundSources?: FundSource[];
  psProposedTotal?: string;
  mooeProposedTotal?: string;
  feProposedTotal?: string;
  coProposedTotal?: string;
  fundAllocations?: SnapshotFundAllocation[];
  climateChangeTag?: SnapshotClimateTag | null;
  projectActivities?: SnapshotPA[];
}

interface SnapshotFundAllocation {
  fundSource: FundSource;
  ps: string;
  mooe: string;
  fe?: string;
  co: string;
}

interface SnapshotClimateTag {
  id: string;
  ccaAmount: string;
  ccmAmount: string;
  remarks: string | null;
  codes?: { ccetCodeId: string }[];
}

interface SnapshotPA {
  id: string;
  parentProjectActivityId: string | null;
  type: 'PROJECT' | 'ACTIVITY';
  name: string;
  description: string | null;
  remarks: string | null;
  expectedOutput: string | null;
  majorFinalOutput?: string | null;
  targetForBudgetYear?: string | null;
  costMode: 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN';
  fundSources?: FundSource[];
  proposedBudget: string | null;
  psEstimate: string | null;
  mooeEstimate: string | null;
  /** Absent from snapshots taken before FE existed (specs/008). */
  feEstimate?: string | null;
  coEstimate: string | null;
  implementationStartMonth: number | null;
  implementationStartYear: number | null;
  implementationEndMonth: number | null;
  implementationEndYear: number | null;
  tentativeAipReferenceCode: string;
  aipReferenceCode: string | null;
  orderIndex: number;
  createdByUserId: string;
  fundAllocations?: SnapshotFundAllocation[];
  climateChangeTag?: SnapshotClimateTag | null;
  lineItems?: SnapshotLineItem[];
}

interface SnapshotLineItem {
  id: string;
  expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
  uacsObjectId: string;
  uacsCode: string;
  uacsDescription: string;
  quantity: string;
  unit: string;
  unitCost: string;
  lineTotal: string;
  remarks: string | null;
  orderIndex: number;
}

function allocationRows(lines: SnapshotFundAllocation[] = []) {
  return lines.map((l, orderIndex) => ({
    fundSource: l.fundSource,
    ps: new Prisma.Decimal(l.ps),
    mooe: new Prisma.Decimal(l.mooe),
    fe: new Prisma.Decimal(l.fe ?? 0),
    co: new Prisma.Decimal(l.co),
    orderIndex,
  }));
}

function tagRow(tag: SnapshotClimateTag) {
  return {
    id: tag.id,
    ccaAmount: new Prisma.Decimal(tag.ccaAmount),
    ccmAmount: new Prisma.Decimal(tag.ccmAmount),
    remarks: tag.remarks ?? null,
    codes: {
      create: (tag.codes ?? []).map((c) => ({ ccetCodeId: c.ccetCodeId })),
    },
  };
}

function decimalOrNull(value: string | null): Prisma.Decimal | null {
  return value === null || value === undefined
    ? null
    : new Prisma.Decimal(value);
}
