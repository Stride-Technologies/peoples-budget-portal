import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LIVE_PROGRAM } from '../programs/program-filters.js';
import {
  AIPCycleStatus,
  OfficeType,
  PapClass,
  Prisma,
  ProgramStatus,
} from '../generated/prisma/index';

type Tx = Prisma.TransactionClient;

/**
 * The AIP form's section order (I. GAS, II. STO, III. Operations), which is also
 * the `PapClass` enum's declaration order and therefore its Postgres sort order.
 * Spelled out here only because `previewProgramCode` has to reason about "sorts
 * before" without a query; everything else just orders by the enum.
 */
const PAP_CLASS_ORDER: PapClass[] = [
  PapClass.GAS,
  PapClass.STO,
  PapClass.OPERATIONS,
];

/**
 * AIP code segment 5, straight from the city's coding sheet.
 *
 * `004` — the sheet's bucket for component programs budgeted under a host
 * office — is deliberately absent. We never emit it: a component program keeps
 * its own office's code and prints inside the host's sheet by way of
 * `Program.hostOfficeId`. AB 2026's `004` codes are imported verbatim, not
 * generated.
 */
const PAP_CLASS_CODE: Record<PapClass, string> = {
  GAS: '001',
  STO: '002',
  OPERATIONS: '003',
};

/**
 * What an unclassified program emits. Legacy rows carry no `papClass` and fall
 * through to Operations everywhere else too — the registry, the export and the
 * grouping helper all do the same. `import-data-warnings.ts` keeps flagging
 * them, so the fall-through never passes for a real classification.
 *
 * Consequence worth holding onto: a null-papClass program and an `OPERATIONS`
 * sibling emit the **same** segment, so they must share one ordinal bucket.
 * Ranking them separately would hand both `001` and collide.
 */
const UNCLASSIFIED_PAP_CLASS_CODE = PAP_CLASS_CODE[PapClass.OPERATIONS];

function papClassCodeOf(papClass: PapClass | null | undefined): string {
  return papClass ? PAP_CLASS_CODE[papClass] : UNCLASSIFIED_PAP_CLASS_CODE;
}

/** Matches every program that emits `code` as its papClass segment. */
function papClassFilter(code: string): Prisma.ProgramWhereInput {
  if (code !== UNCLASSIFIED_PAP_CLASS_CODE) {
    const papClass = PAP_CLASS_ORDER.find((c) => PAP_CLASS_CODE[c] === code);
    return { papClass };
  }
  return { OR: [{ papClass: PapClass.OPERATIONS }, { papClass: null }] };
}

// Programs are LGU-only (the NCPC proponent track and its 6-segment code format
// were retired). The proponent is always the implementing city office.
interface ProgramCodeInputs {
  aipCycleId: string;
  papSectorId: string;
  officeId?: string | null;
  /**
   * AIP code segment 5, and the bucket the ordinal restarts in. Unclassified
   * programs share the Operations bucket — see `UNCLASSIFIED_PAP_CLASS_CODE`.
   */
  papClass?: PapClass | null;
}

interface ResolvedSegments {
  papSectorCode: string; // 4-digit
  lguLevel: string; // 1-digit
  officeTypeCode: string; // 2-digit
  officeCode: string; // verbatim, whitespace stripped
  papClassCode: string; // 3-digit
}

const OFFICE_TYPE_CODE: Record<OfficeType, string> = {
  MANDATORY: '01',
  OPTIONAL: '02',
  OTHERS: '03',
};

function pad(n: number | string, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * Builder + atomic counter consumer for AIP reference codes.
 *
 * Two-phase: every Program gets a tentative code at create time; the final
 * (chronological among approved) code is issued on the first APPROVED
 * transition. ProjectActivity codes follow the same pattern with parent scope.
 */
@Injectable()
export class AIPCodesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Scope key builders ────────────────────────────────────────────────────

  private programScopeKey(
    input: ProgramCodeInputs,
    phase: 'tentative' | 'final',
  ): string {
    if (!input.officeId) {
      throw new BadRequestException('officeId required');
    }
    // The `:LGU:` literal is retained so existing counter scope keys are stable.
    //
    // The papClass segment is part of the key because the ordinal restarts in
    // each AIP form section, exactly as the city's book numbers them. Keying it
    // off the emitted *code* rather than the enum keeps unclassified programs in
    // the Operations counter, where their identical segment requires them to be.
    return `${input.aipCycleId}:LGU:${input.officeId}:${input.papSectorId}:${papClassCodeOf(
      input.papClass,
    )}:${phase}`;
  }

  private paScopeKey(programId: string, phase: 'tentative' | 'final'): string {
    return `${programId}:${phase}`;
  }

  /** Counter scope for activities nested under a specific project/activity. */
  private paChildScopeKey(
    parentPaId: string,
    phase: 'tentative' | 'final',
  ): string {
    return `pa-child:${parentPaId}:${phase}`;
  }

  // ─── Counter ops ──────────────────────────────────────────────────────────

  /** Increments counter atomically; returns the just-issued integer. */
  private async consume(
    scopeKey: string,
    tx: Tx | PrismaService,
  ): Promise<number> {
    const result = await tx.aIPCodeCounter.upsert({
      where: { scopeKey },
      update: { nextValue: { increment: 1 } },
      create: { scopeKey, nextValue: 2 },
      select: { nextValue: true },
    });
    return result.nextValue - 1;
  }

  // ─── Segment resolution ───────────────────────────────────────────────────

  private async resolveSegments(
    input: ProgramCodeInputs,
  ): Promise<ResolvedSegments> {
    const papSector = await this.prisma.pAPSector.findUnique({
      where: { id: input.papSectorId },
    });
    if (!papSector) throw new NotFoundException('PAP sector not found');

    if (!input.officeId) {
      throw new BadRequestException('officeId required');
    }
    const office = await this.prisma.office.findUnique({
      where: { id: input.officeId },
    });
    if (!office) throw new NotFoundException('Office not found');
    if (!office.officeCode || !office.officeType) {
      throw new BadRequestException(
        'Office has no AIP office code or office type yet; SUPER_ADMIN must set both in the control panel before AIP codes can be generated',
      );
    }
    return {
      papSectorCode: papSector.code,
      lguLevel: String(office.lguLevel),
      officeTypeCode: OFFICE_TYPE_CODE[office.officeType],
      // The coding sheet writes the disambiguating suffix with a space
      // ("11 (1)") and prints the code without one ("…-11(1)-…"). The column
      // keeps the sheet's spelling; only the segment is normalised.
      officeCode: office.officeCode.replace(/\s+/g, ''),
      papClassCode: papClassCodeOf(input.papClass),
    };
  }

  // ─── Code formatters ──────────────────────────────────────────────────────

  /**
   * The city's 7-segment AIP reference code, as printed in the Annual Budget:
   *
   *     1000-2-02-18-001-000-000
   *     └─┬─┘ │ └┬┘ └┬┘ └┬┘ └┬┘ └┬┘
   *       │   │  │   │   │   │   └── project/activity ordinal
   *       │   │  │   │   │   └────── program ordinal, restarts per papClass
   *       │   │  │   │   └────────── papClass (001 GAS / 002 STO / 003 Ops)
   *       │   │  │   └────────────── office code, verbatim ("18", "11(1)")
   *       │   │  └────────────────── office type (01 / 02 / 03)
   *       │   └───────────────────── LGU level (2 = City)
   *       └───────────────────────── PAP sector
   *
   * The office code is not padded: the sheet numbers offices 2-wide and
   * disambiguates sub-offices with a parenthetical suffix, both of which have to
   * come out exactly as written or the export won't match the city's book.
   */
  private format(
    segs: ResolvedSegments,
    programCounter: number,
    paCounter = 0,
  ): string {
    return [
      segs.papSectorCode,
      segs.lguLevel,
      segs.officeTypeCode,
      segs.officeCode,
      segs.papClassCode,
      pad(programCounter, 3),
      pad(paCounter, 3),
    ].join('-');
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Preview the code a new program in this scope would get.
   *
   * The tentative ordinal is a rank, so the preview is "one past the live
   * siblings that sort ahead of it" — no counter to peek at, and it self-heals
   * after deletes instead of drifting upward forever.
   *
   * The ordinal restarts inside each AIP form section, so only siblings in the
   * *same* section count. Unclassified siblings count toward Operations,
   * because that is the segment they emit.
   */
  async previewProgramCode(input: ProgramCodeInputs): Promise<{
    code: string;
    counter: number;
  }> {
    const segs = await this.resolveSegments(input);
    const counter =
      (await this.prisma.program.count({
        where: {
          aipCycleId: input.aipCycleId,
          officeId: input.officeId,
          papSectorId: input.papSectorId,
          ...LIVE_PROGRAM,
          ...papClassFilter(segs.papClassCode),
        },
      })) + 1;
    return {
      code: this.format(segs, counter, 0),
      counter,
    };
  }

  /**
   * Preview the code the next project/activity in this scope would get.
   *
   * Same rank-not-counter reasoning as `previewProgramCode`, and deliberately
   * the same two shapes `resyncTentativePACodes` writes, so what the form shows
   * is what the row is saved with:
   *
   *   root PA  → the program's code with its trailing slot filled (`…-001-000`
   *              becomes `…-001-001`)
   *   activity → the parent PA's code plus a 2-digit segment (`…-001-001-01`)
   *
   * The nested branch is why the add-activity form's code is a segment longer
   * than the add-project form's: an activity hangs off the project that derives
   * its cost from it, and the code says so.
   */
  async previewPACode(input: {
    programId: string;
    parentProjectActivityId?: string | null;
  }): Promise<{ code: string; counter: number }> {
    const program = await this.prisma.program.findUnique({
      where: { id: input.programId },
      select: { tentativeAipReferenceCode: true },
    });
    if (!program) throw new NotFoundException('Program not found');

    const parentId = input.parentProjectActivityId ?? null;
    const counter =
      (await this.prisma.projectActivity.count({
        where: {
          programId: input.programId,
          parentProjectActivityId: parentId,
        },
      })) + 1;

    if (parentId === null) {
      const parts = program.tentativeAipReferenceCode.split('-');
      parts[parts.length - 1] = pad(counter, 3);
      return { code: parts.join('-'), counter };
    }

    const parent = await this.prisma.projectActivity.findUnique({
      where: { id: parentId },
      select: { tentativeAipReferenceCode: true, programId: true },
    });
    if (!parent || parent.programId !== input.programId) {
      throw new NotFoundException('Parent project/activity not found');
    }
    return {
      code: `${parent.tentativeAipReferenceCode}-${pad(counter, 2)}`,
      counter,
    };
  }

  /**
   * The five leading segments of a code — everything before the two ordinals.
   *
   * Exists for `prisma/restate-aip-codes.ts`, which re-renders **final** codes:
   * their ordinal is a counter value with chronological meaning, so it is kept
   * while the prefix around it changes. Old and new layouts both have exactly
   * five leading segments, so swapping the prefix restates a program code, a
   * root PA code and a nested activity code identically.
   *
   * Public only so that the restatement does not need its own copy of the
   * office-type and papClass tables — one format, one place.
   */
  async programCodePrefix(input: ProgramCodeInputs): Promise<string> {
    const segs = await this.resolveSegments(input);
    return [
      segs.papSectorCode,
      segs.lguLevel,
      segs.officeTypeCode,
      segs.officeCode,
      segs.papClassCode,
    ].join('-');
  }

  /** Consume the final counter (called inside the APPROVED transition tx). */
  async issueFinalProgramCode(
    input: ProgramCodeInputs,
    tx: Tx,
  ): Promise<string> {
    const segs = await this.resolveSegments(input);
    const counter = await this.consume(
      this.programScopeKey(input, 'final'),
      tx,
    );
    return this.format(segs, counter, 0);
  }

  /**
   * Append a `-NN` sub-segment to the parent project/activity's code, scoped
   * to that parent so each project numbers its own activities independently.
   */
  private async issueNestedPACode(
    parentProjectActivityId: string,
    phase: 'tentative' | 'final',
    tx: Tx | PrismaService,
  ): Promise<string> {
    const parent = await tx.projectActivity.findUnique({
      where: { id: parentProjectActivityId },
      select: { tentativeAipReferenceCode: true, aipReferenceCode: true },
    });
    if (!parent) {
      throw new NotFoundException('Parent project/activity not found');
    }
    const parentCode =
      phase === 'final'
        ? parent.aipReferenceCode
        : parent.tentativeAipReferenceCode;
    if (!parentCode) {
      throw new BadRequestException(
        `Parent project/activity has no ${phase} AIP code yet`,
      );
    }
    const childCounter = await this.consume(
      this.paChildScopeKey(parentProjectActivityId, phase),
      tx,
    );
    return `${parentCode}-${pad(childCounter, 2)}`;
  }

  // ─── Resync (derived tentative codes) ─────────────────────────────────────

  /**
   * Recompute every tentative code in one program scope from current state.
   *
   * The tentative ordinal is a **rank among live siblings**, not a counter
   * value. That single change is what makes deletes close their gap, drags
   * reorder codes, and office/sector edits propagate — all from one function
   * instead of a special case per event.
   *
   * Siblings rank by AIP form section first (GAS → STO → Operations), then by
   * the user's `orderIndex` within it, so the codes ascend in the order the
   * registry lists them. The ordinal **restarts in each section**, matching how
   * the city numbers its Annual Budget: GAS runs 001…, STO restarts at 001,
   * Operations restarts at 001.
   *
   * Cascades into each affected program's project/activities, whose codes are
   * built from the program's code.
   *
   * Frozen rows (APPROVED, or in a cycle that is no longer OPEN) keep their
   * code but still consume their rank, so unapproved siblings step over them
   * rather than colliding. That skip-over is the settled policy (#85) — see
   * docs/design/tentative-aip-code-rework.md §2.
   *
   * `force` renumbers frozen rows too, for `prisma/restate-aip-codes.ts`. A
   * format change moves every code, so there is no longer an older code worth
   * preserving — and the reservation logic exists only to protect one. Note
   * that a forced dense pass and a later ordinary pass agree: the ordinary pass
   * reserves the frozen ordinals this one assigned and steps the rest over
   * them, landing on the same numbers.
   */
  async resyncTentativeProgramCodes(
    scope: { aipCycleId: string; officeId: string; papSectorId: string },
    tx: Tx,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const siblings = await tx.program.findMany({
      where: {
        aipCycleId: scope.aipCycleId,
        officeId: scope.officeId,
        papSectorId: scope.papSectorId,
        ...LIVE_PROGRAM,
      },
      // Must stay identical to the registry's list order
      // (AIPRegistryService.list) — the ordinal segment of the code is a rank,
      // so any disagreement between the two prints codes out of sequence in the
      // very table that shows them. The AIP form numbers its sections
      // I. GAS → II. STO → III. Operations, and `PapClass` is declared in that
      // order, so Postgres enum asc is the section order for free.
      // `nulls: 'last'` puts unclassified programs after OPERATIONS, where both
      // the registry and the export fold them in.
      orderBy: [
        { papClass: { sort: 'asc', nulls: 'last' } },
        { orderIndex: 'asc' },
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        papClass: true,
        tentativeAipReferenceCode: true,
        status: true,
        aipCycle: { select: { status: true } },
      },
    });
    if (siblings.length === 0) return;

    // Office and sector are constant across the scope, so resolve the shared
    // segments once; only the papClass segment varies per program.
    const segs = await this.resolveSegments({
      aipCycleId: scope.aipCycleId,
      papSectorId: scope.papSectorId,
      officeId: scope.officeId,
    });

    // Frozen rows keep their ordinal, so it is reserved: movable rows step over
    // it rather than renumbering into a code that is still taken. Without this,
    // renumbering past an approved sibling violates the unique index on
    // tentative_aip_reference_code and aborts the whole transaction.
    //
    // Reservations are per section, because the ordinal is. An approved GAS
    // program holding 002 must not push an Operations sibling off 002 — they
    // differ in the papClass segment, so their codes were never in conflict.
    const reserved = new Map<string, Set<number>>();
    const bucketFor = (map: Map<string, Set<number>>, code: string) => {
      let bucket = map.get(code);
      if (!bucket) map.set(code, (bucket = new Set<number>()));
      return bucket;
    };
    const frozen = (p: (typeof siblings)[number]) =>
      !options.force && this.isFrozen(p.status, p.aipCycle.status);

    for (const program of siblings) {
      if (frozen(program)) {
        const ordinal = this.ordinalOf(program.tentativeAipReferenceCode);
        if (ordinal !== null) {
          bucketFor(reserved, papClassCodeOf(program.papClass)).add(ordinal);
        }
      }
    }

    const changed: { id: string; code: string }[] = [];
    const nextOrdinal = new Map<string, number>();
    for (const program of siblings) {
      if (frozen(program)) continue;
      const papClassCode = papClassCodeOf(program.papClass);
      const taken = bucketFor(reserved, papClassCode);
      let ordinal = nextOrdinal.get(papClassCode) ?? 0;
      do {
        ordinal++;
      } while (taken.has(ordinal));
      nextOrdinal.set(papClassCode, ordinal);
      const code = this.format({ ...segs, papClassCode }, ordinal, 0);
      if (code !== program.tentativeAipReferenceCode) {
        changed.push({ id: program.id, code });
      }
    }

    await this.writeCodesWithoutCollision(changed, (id, code) =>
      tx.program.update({
        where: { id },
        data: { tentativeAipReferenceCode: code },
      }),
    );

    // A program whose code moved drags all of its PA codes with it.
    //
    // Park *every* affected PA on a sentinel before any of them is rewritten.
    // `resyncTentativePACodes` runs one program at a time and only parks that
    // program's own rows, which is not enough when two programs swap ranks:
    // program A's new PA codes are precisely the ones program B's PAs still
    // hold, and the first write collides on the unique index. Widening the park
    // to the whole changed set is the same two-pass trick one level up.
    if (changed.length > 0) {
      const affected = await tx.projectActivity.findMany({
        where: { programId: { in: changed.map((c) => c.id) } },
        select: { id: true },
      });
      for (const { id } of affected) {
        await tx.projectActivity.update({
          where: { id },
          data: { tentativeAipReferenceCode: `~${id}` },
        });
      }
    }

    for (const { id } of changed) {
      // Carry `force` down: a frozen program that was just renumbered has PAs
      // built from its code, and leaving them behind is how a code tree ends up
      // half-restated.
      await this.resyncTentativePACodes(id, tx, options);
    }
  }

  /**
   * Recompute the tentative codes of a program's project/activities.
   *
   * Root PAs take the program's code with the trailing segment replaced by
   * their rank; nested activities append `-NN` to their parent's code, at any
   * depth.
   *
   * `force` writes even when the program is frozen. The frozen check exists to
   * protect codes that already exist, so it is wrong in the one case where the
   * rows were just rebuilt from scratch and are sitting on `~{id}` sentinels —
   * `ProgramPublishService.restoreFromSnapshot`. Skipping there would strand
   * them on the sentinel, which is worse than the stale code it replaced.
   */
  async resyncTentativePACodes(
    programId: string,
    tx: Tx,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const program = await tx.program.findUnique({
      where: { id: programId },
      select: {
        tentativeAipReferenceCode: true,
        status: true,
        aipCycle: { select: { status: true } },
      },
    });
    if (!program) return;

    const frozen =
      !options.force && this.isFrozen(program.status, program.aipCycle.status);
    const parts = program.tentativeAipReferenceCode.split('-');
    const changed: { id: string; code: string }[] = [];

    const walk = async (
      parentId: string | null,
      parentCode: string,
    ): Promise<void> => {
      const children = await tx.projectActivity.findMany({
        where: { programId, parentProjectActivityId: parentId },
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, tentativeAipReferenceCode: true },
      });
      for (const [index, child] of children.entries()) {
        let code: string;
        if (parentId === null) {
          // Root PA: the program's code with its trailing PA slot filled.
          const own = [...parts];
          own[own.length - 1] = pad(index + 1, 3);
          code = own.join('-');
        } else {
          code = `${parentCode}-${pad(index + 1, 2)}`;
        }
        if (!frozen && code !== child.tentativeAipReferenceCode) {
          changed.push({ id: child.id, code });
        }
        await walk(child.id, code);
      }
    };

    await walk(null, program.tentativeAipReferenceCode);

    await this.writeCodesWithoutCollision(changed, (id, code) =>
      tx.projectActivity.update({
        where: { id },
        data: { tentativeAipReferenceCode: code },
      }),
    );
  }

  /**
   * The program ordinal segment of a code, if parseable.
   *
   * Still second-to-last after the format realignment — the layout ends
   * `…-{papClass}-{programOrdinal}-{paOrdinal}` — and only ever called on
   * program codes, which are exactly 7 segments. A `~{uuid}` sentinel splits
   * into fewer parts and yields NaN, so it is never mistaken for a reservation.
   */
  private ordinalOf(code: string): number | null {
    const parts = code.split('-');
    const value = Number(parts[parts.length - 2]);
    return Number.isInteger(value) ? value : null;
  }

  /** APPROVED programs and anything outside an OPEN cycle keep their code. */
  private isFrozen(
    status: ProgramStatus,
    cycleStatus: AIPCycleStatus,
  ): boolean {
    return (
      status === ProgramStatus.APPROVED || cycleStatus !== AIPCycleStatus.OPEN
    );
  }

  /**
   * Renumbering swaps codes between rows (`002→001`, `003→002`), which trips
   * the `@unique` constraint the moment two rows briefly share a value. Park
   * every changed row on a collision-proof sentinel first, then write the real
   * codes. Both passes run inside the caller's transaction.
   */
  private async writeCodesWithoutCollision(
    changed: { id: string; code: string }[],
    update: (id: string, code: string) => Promise<unknown>,
  ): Promise<void> {
    if (changed.length === 0) return;
    // '~' never appears in a real code, and the id keeps each sentinel unique.
    for (const { id } of changed) await update(id, `~${id}`);
    for (const { id, code } of changed) await update(id, code);
  }

  /** Consume the PA final counter; relies on the parent having a final code already.
   *  Nested activities append a `-NN` sub-segment to their parent PA's final code,
   *  so the parent must be issued first (callers process parents before children). */
  async issueFinalPACode(paId: string, tx: Tx): Promise<string> {
    const pa = await tx.projectActivity.findUnique({
      where: { id: paId },
      include: { program: true },
    });
    if (!pa) throw new NotFoundException('Project/Activity not found');
    if (pa.parentProjectActivityId) {
      return this.issueNestedPACode(pa.parentProjectActivityId, 'final', tx);
    }
    if (!pa.program.aipReferenceCode) {
      throw new BadRequestException(
        'Cannot issue final PA code before parent program has a final code',
      );
    }
    // Parent final code template: replace its last segment (PA counter) with ours.
    const parts = pa.program.aipReferenceCode.split('-');
    const paCounter = await this.consume(
      this.paScopeKey(pa.programId, 'final'),
      tx,
    );
    parts[parts.length - 1] = pad(paCounter, 3);
    return parts.join('-');
  }
}
