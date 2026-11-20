import type { PrismaService } from '../prisma/prisma.service.js';
import { AIPCodesService } from './aip-codes.service.js';

// ─── In-memory stand-ins ─────────────────────────────────────────────────────

type ProgramRow = {
  id: string;
  aipCycleId: string;
  officeId: string | null;
  papSectorId: string;
  papSubsectorCode: string;
  papClass: string | null;
  tentativeAipReferenceCode: string;
  orderIndex: number;
  createdAt: Date;
  status: string;
  deletedAt: Date | null;
  aipCycle: { status: string };
};

type PARow = {
  id: string;
  programId: string;
  parentProjectActivityId: string | null;
  tentativeAipReferenceCode: string;
  orderIndex: number;
  createdAt: Date;
};

const SCOPE = {
  aipCycleId: 'cycle-1',
  officeId: 'office-1',
  papSectorId: 'sector-1',
};

function program(
  id: string,
  orderIndex: number,
  code: string,
  overrides: Partial<ProgramRow> = {},
): ProgramRow {
  return {
    id,
    ...SCOPE,
    papSubsectorCode: '000',
    papClass: null,
    tentativeAipReferenceCode: code,
    orderIndex,
    createdAt: new Date(2026, 0, orderIndex),
    status: 'DRAFT',
    deletedAt: null,
    aipCycle: { status: 'OPEN' },
    ...overrides,
  };
}

function pa(
  id: string,
  parentProjectActivityId: string | null,
  orderIndex: number,
  code: string,
  programId = 'p1',
): PARow {
  return {
    id,
    programId,
    parentProjectActivityId,
    tentativeAipReferenceCode: code,
    orderIndex,
    createdAt: new Date(2026, 0, orderIndex),
  };
}

const byRank = (a: { orderIndex: number; createdAt: Date }, b: typeof a) =>
  a.orderIndex - b.orderIndex || a.createdAt.getTime() - b.createdAt.getTime();

/**
 * Programs rank by AIP form section before orderIndex. Mirrors what Postgres
 * does for `{ papClass: { sort: 'asc', nulls: 'last' } }`: the enum is declared
 * GAS, STO, OPERATIONS, so ascending is the form's section order.
 */
const PAP_CLASS_RANK: Record<string, number> = {
  GAS: 0,
  STO: 1,
  OPERATIONS: 2,
};
const classRank = (papClass: string | null) =>
  papClass === null ? 3 : PAP_CLASS_RANK[papClass];

const byProgramRank = (a: ProgramRow, b: ProgramRow) =>
  classRank(a.papClass) - classRank(b.papClass) || byRank(a, b);

/**
 * Mock that behaves enough like Prisma for the resync path: filtered+ordered
 * findMany, findUnique, and an update that mutates the row in place so the
 * two-pass sentinel write is observable.
 *
 * The updates also **enforce the unique index** on `tentativeAipReferenceCode`.
 * Without that the sentinel tests assert on write order alone and pass even when
 * the code would deadlock on a real database — which is exactly how the
 * cross-program PA collision (two programs swapping ranks) stayed hidden until a
 * production dry-run hit it.
 */
function buildDb(programs: ProgramRow[], pas: PARow[] = []) {
  const codeWrites: string[] = [];

  const assertUnique = (
    rows: { id: string; tentativeAipReferenceCode: string }[],
    id: string,
    code: string,
  ) => {
    const clash = rows.find(
      (r) => r.id !== id && r.tentativeAipReferenceCode === code,
    );
    if (clash) {
      throw new Error(
        `Unique constraint failed on tentative_aip_reference_code: ` +
          `"${code}" is already held by ${clash.id}`,
      );
    }
  };

  const db = {
    pAPSector: {
      findUnique: jest.fn().mockResolvedValue({ id: 'sector-1', code: '1000' }),
    },
    office: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'office-1',
        lguLevel: 2,
        officeType: 'OPTIONAL',
        officeCode: '18',
      }),
    },
    program: {
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          programs
            .filter(
              (p) =>
                p.aipCycleId === where.aipCycleId &&
                p.officeId === where.officeId &&
                p.papSectorId === where.papSectorId &&
                p.deletedAt === null,
            )
            .sort(byProgramRank),
        ),
      ),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(programs.find((p) => p.id === where.id) ?? null),
      ),
      count: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        // `papClassFilter` emits one of two shapes: `{ papClass }`, or an OR
        // that folds unclassified rows into the Operations bucket.
        const or = where.OR as { papClass: string | null }[] | undefined;
        const wanted = or
          ? or.map((c) => c.papClass)
          : [(where.papClass ?? null) as string | null];
        return Promise.resolve(
          programs.filter(
            (p) =>
              p.aipCycleId === where.aipCycleId &&
              p.officeId === where.officeId &&
              p.papSectorId === where.papSectorId &&
              p.deletedAt === null &&
              wanted.includes(p.papClass),
          ).length,
        );
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { tentativeAipReferenceCode: string };
        }) => {
          const row = programs.find((p) => p.id === where.id)!;
          assertUnique(programs, where.id, data.tentativeAipReferenceCode);
          row.tentativeAipReferenceCode = data.tentativeAipReferenceCode;
          codeWrites.push(data.tentativeAipReferenceCode);
          return Promise.resolve(row);
        },
      ),
    },
    projectActivity: {
      count: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          pas.filter(
            (p) =>
              p.programId === where.programId &&
              p.parentProjectActivityId ===
                (where.parentProjectActivityId ?? null),
          ).length,
        ),
      ),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(pas.find((p) => p.id === where.id) ?? null),
      ),
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          pas
            .filter((p) => {
              // The parking pass selects by `programId: { in: [...] }` and does
              // not filter on parent; the per-program walk selects one program
              // and one parent level.
              const scope = where.programId as
                | string
                | { in: string[] }
                | undefined;
              const inScope =
                typeof scope === 'object'
                  ? scope.in.includes(p.programId)
                  : p.programId === scope;
              if (!inScope) return false;
              if (!('parentProjectActivityId' in where)) return true;
              return (
                p.parentProjectActivityId ===
                (where.parentProjectActivityId ?? null)
              );
            })
            .sort(byRank),
        ),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { tentativeAipReferenceCode: string };
        }) => {
          const row = pas.find((p) => p.id === where.id)!;
          assertUnique(pas, where.id, data.tentativeAipReferenceCode);
          row.tentativeAipReferenceCode = data.tentativeAipReferenceCode;
          codeWrites.push(data.tentativeAipReferenceCode);
          return Promise.resolve(row);
        },
      ),
    },
  };
  return { db, codeWrites };
}

const codesOf = (rows: { tentativeAipReferenceCode: string }[]) =>
  rows.map((r) => r.tentativeAipReferenceCode);

// ─── Program ordinals ────────────────────────────────────────────────────────

describe('AIPCodesService.resyncTentativeProgramCodes', () => {
  it('closes the gap after a program is deleted', async () => {
    const programs = [
      program('p1', 1, '1000-2-02-18-003-001-000'),
      program('p2', 2, '1000-2-02-18-003-002-000'),
      program('p3', 3, '1000-2-02-18-003-003-000'),
      program('p4', 4, '1000-2-02-18-003-004-000'),
    ];
    const { db } = buildDb(programs);
    const service = new AIPCodesService(db as unknown as PrismaService);

    // Soft-delete the second program, then resync the scope. `ProgramsService
    // .softDelete` parks the dead row's code on a `~<id>` sentinel in the same
    // transaction — `tentative_aip_reference_code` is unique across the whole
    // table, `deleted_at` and all, so a dead row that kept its code would keep
    // that code taken forever and the resync below would collide with it.
    programs[1].deletedAt = new Date();
    programs[1].tentativeAipReferenceCode = `~${programs[1].id}`;
    await service.resyncTentativeProgramCodes(SCOPE, db as never);

    expect(codesOf(programs.filter((p) => !p.deletedAt))).toEqual([
      '1000-2-02-18-003-001-000',
      '1000-2-02-18-003-002-000',
      '1000-2-02-18-003-003-000',
    ]);
    // The deleted row is left on its sentinel; it is filtered out of every read.
    expect(programs[1].tentativeAipReferenceCode).toBe('~p2');
  });

  it('renumbers by orderIndex so a drag moves the code', async () => {
    const programs = [
      program('p1', 1, '1000-2-02-18-003-001-000'),
      program('p2', 2, '1000-2-02-18-003-002-000'),
      program('p3', 3, '1000-2-02-18-003-003-000'),
    ];
    const { db } = buildDb(programs);
    const service = new AIPCodesService(db as unknown as PrismaService);

    // Drag the last program to the front.
    programs[2].orderIndex = 0;
    await service.resyncTentativeProgramCodes(SCOPE, db as never);

    expect(programs.find((p) => p.id === 'p3')!.tentativeAipReferenceCode).toBe(
      '1000-2-02-18-003-001-000',
    );
    expect(programs.find((p) => p.id === 'p1')!.tentativeAipReferenceCode).toBe(
      '1000-2-02-18-003-002-000',
    );
    expect(programs.find((p) => p.id === 'p2')!.tentativeAipReferenceCode).toBe(
      '1000-2-02-18-003-003-000',
    );
  });

  /**
   * The registry lists programs by AIP form section (GAS → STO → Operations)
   * before orderIndex, so the ordinal has to rank the same way or the codes
   * print out of sequence in the table that shows them. PSO in the 2027 workbook
   * is the real case: two GAS/STO/Operations blocks under one office, which
   * numbered 001, 007, 002, 008, 003… when only orderIndex decided the rank.
   */
  it('ranks by AIP form section and restarts the ordinal in each', async () => {
    const programs = [
      program('gas-1', 1, 'stale-1', { papClass: 'GAS' }),
      program('sto-1', 2, 'stale-2', { papClass: 'STO' }),
      program('ops-1', 3, 'stale-3', { papClass: 'OPERATIONS' }),
      // A second block, written further down the sheet: higher orderIndex, but
      // its GAS and STO rows belong with the first block's.
      program('gas-2', 4, 'stale-4', { papClass: 'GAS' }),
      program('sto-2', 5, 'stale-5', { papClass: 'STO' }),
      program('unclassified', 6, 'stale-6'),
    ];
    const { db } = buildDb(programs);
    const service = new AIPCodesService(db as unknown as PrismaService);

    await service.resyncTentativeProgramCodes(SCOPE, db as never);

    const codeOf = (id: string) =>
      programs.find((p) => p.id === id)!.tentativeAipReferenceCode;
    // Segment 5 names the section, and the ordinal restarts inside each one —
    // exactly how the city numbers its Annual Budget.
    expect(codeOf('gas-1')).toBe('1000-2-02-18-001-001-000');
    expect(codeOf('gas-2')).toBe('1000-2-02-18-001-002-000');
    expect(codeOf('sto-1')).toBe('1000-2-02-18-002-001-000');
    expect(codeOf('sto-2')).toBe('1000-2-02-18-002-002-000');
    expect(codeOf('ops-1')).toBe('1000-2-02-18-003-001-000');
    // Unclassified emits the Operations segment, so it shares that ordinal
    // bucket and continues it — ranking it as its own section would hand it
    // 001 and collide with ops-1 on an identical code.
    expect(codeOf('unclassified')).toBe('1000-2-02-18-003-002-000');
    expect(new Set(codesOf(programs)).size).toBe(6);
  });

  /**
   * The city disambiguates two offices sharing a base code with a parenthetical
   * suffix, and writes it with a space on the coding sheet ("11 (1)") while
   * printing the code without one. The column keeps the sheet's spelling; only
   * the emitted segment is normalised.
   */
  it('emits the office code verbatim, whitespace stripped and unpadded', async () => {
    const programs = [program('p1', 1, 'stale-1', { papClass: 'OPERATIONS' })];
    const { db } = buildDb(programs);
    db.office.findUnique.mockResolvedValue({
      id: 'office-1',
      lguLevel: 2,
      officeType: 'MANDATORY',
      officeCode: '11 (1)',
    });
    const service = new AIPCodesService(db as unknown as PrismaService);

    await service.resyncTentativeProgramCodes(SCOPE, db as never);

    expect(programs[0].tentativeAipReferenceCode).toBe(
      '1000-2-01-11(1)-003-001-000',
    );
  });

  /**
   * Found by a dry run of `prisma/repair-aip-2027.ts` against production: when
   * two programs swap ranks, program A's *new* PA codes are exactly the codes
   * program B's PAs still hold. `resyncTentativePACodes` parks only the program
   * it is given, so the cross-program collision slipped through until the park
   * was widened to every changed program's PAs.
   */
  it('parks PAs across every reranked program, not one program at a time', async () => {
    const programs = [
      program('p1', 1, '1000-2-02-18-003-001-000'),
      program('p2', 2, '1000-2-02-18-003-002-000'),
    ];
    const pas = [
      pa('a1', null, 1, '1000-2-02-18-003-001-001', 'p1'),
      pa('a2', null, 1, '1000-2-02-18-003-002-001', 'p2'),
    ];
    const { db } = buildDb(programs, pas);
    const service = new AIPCodesService(db as unknown as PrismaService);

    // Swap the two programs.
    programs[0].orderIndex = 2;
    programs[1].orderIndex = 1;
    await service.resyncTentativeProgramCodes(SCOPE, db as never);

    expect(programs[1].tentativeAipReferenceCode).toBe(
      '1000-2-02-18-003-001-000',
    );
    expect(programs[0].tentativeAipReferenceCode).toBe(
      '1000-2-02-18-003-002-000',
    );
    // Each PA followed its own program's code, and no write ever collided.
    expect(pas.find((p) => p.id === 'a2')!.tentativeAipReferenceCode).toBe(
      '1000-2-02-18-003-001-001',
    );
    expect(pas.find((p) => p.id === 'a1')!.tentativeAipReferenceCode).toBe(
      '1000-2-02-18-003-002-001',
    );
  });

  it('parks codes on a sentinel first so a swap never collides', async () => {
    const programs = [
      program('p1', 1, '1000-2-02-18-003-001-000'),
      program('p2', 2, '1000-2-02-18-003-002-000'),
    ];
    const { db, codeWrites } = buildDb(programs);
    const service = new AIPCodesService(db as unknown as PrismaService);

    programs[1].orderIndex = 0; // swap the two
    await service.resyncTentativeProgramCodes(SCOPE, db as never);

    // Both sentinels must be written before either real code, or the unique
    // index on tentative_aip_reference_code rejects the second update.
    const firstRealWrite = codeWrites.findIndex((c) => !c.startsWith('~'));
    const sentinels = codeWrites.filter((c) => c.startsWith('~'));
    expect(sentinels).toHaveLength(2);
    expect(firstRealWrite).toBe(2);
  });

  it('reserves a frozen row’s ordinal so movable rows step over it', async () => {
    const programs = [
      program('p1', 1, '1000-2-02-18-003-001-000', { status: 'APPROVED' }),
      program('p2', 2, '1000-2-02-18-003-002-000'),
      program('p3', 3, '1000-2-02-18-003-003-000'),
    ];
    const { db } = buildDb(programs);
    const service = new AIPCodesService(db as unknown as PrismaService);

    // Drag both movable programs above the approved one.
    programs[1].orderIndex = -2;
    programs[2].orderIndex = -1;
    await service.resyncTentativeProgramCodes(SCOPE, db as never);

    // 001 stays with the approved program and is skipped, not overwritten —
    // reusing it would violate the unique index and abort the transaction.
    expect(programs[0].tentativeAipReferenceCode).toBe(
      '1000-2-02-18-003-001-000',
    );
    expect(programs[1].tentativeAipReferenceCode).toBe(
      '1000-2-02-18-003-002-000',
    );
    expect(programs[2].tentativeAipReferenceCode).toBe(
      '1000-2-02-18-003-003-000',
    );
    expect(new Set(codesOf(programs)).size).toBe(3);
  });

  it('skips a cycle that is no longer OPEN', async () => {
    const programs = [
      program('p1', 5, '1000-2-02-18-003-009-000', {
        aipCycle: { status: 'CLOSED' },
      }),
    ];
    const { db } = buildDb(programs);
    const service = new AIPCodesService(db as unknown as PrismaService);

    await service.resyncTentativeProgramCodes(SCOPE, db as never);

    expect(programs[0].tentativeAipReferenceCode).toBe(
      '1000-2-02-18-003-009-000',
    );
  });
});

// ─── PA ordinals ─────────────────────────────────────────────────────────────

describe('AIPCodesService.resyncTentativePACodes', () => {
  it('fills the trailing slot for root PAs and appends -NN for nested ones', async () => {
    const programs = [program('p1', 3, '1000-2-02-18-003-003-000')];
    const pas = [
      pa('root-a', null, 1, 'stale-1'),
      pa('root-b', null, 2, 'stale-2'),
      pa('child-1', 'root-a', 1, 'stale-3'),
      pa('child-2', 'root-a', 2, 'stale-4'),
    ];
    const { db } = buildDb(programs, pas);
    const service = new AIPCodesService(db as unknown as PrismaService);

    await service.resyncTentativePACodes('p1', db as never);

    expect(codesOf(pas)).toEqual([
      '1000-2-02-18-003-003-001',
      '1000-2-02-18-003-003-002',
      '1000-2-02-18-003-003-001-01',
      '1000-2-02-18-003-003-001-02',
    ]);
  });

  /**
   * `ProgramPublishService.restoreFromSnapshot` deletes the PA subtree and
   * recreates it on `~{id}` sentinels, because a snapshot's codes are a record
   * of what was submitted and go stale. Nothing there needs protecting, and
   * `discardDraft` has no cycle-status guard — so without `force` a frozen
   * program's restored PAs would keep the sentinel as their code.
   */
  it('force writes codes even when the program is frozen', async () => {
    const programs = [
      program('p1', 3, '1000-2-02-18-003-003-000', {
        aipCycle: { status: 'CLOSED' },
      }),
    ];
    const pas = [pa('root-a', null, 1, '~root-a')];
    const { db } = buildDb(programs, pas);
    const service = new AIPCodesService(db as unknown as PrismaService);

    await service.resyncTentativePACodes('p1', db as never);
    expect(pas[0].tentativeAipReferenceCode).toBe('~root-a');

    await service.resyncTentativePACodes('p1', db as never, { force: true });
    expect(pas[0].tentativeAipReferenceCode).toBe('1000-2-02-18-003-003-001');
  });

  it('closes the gap when a sibling activity is deleted', async () => {
    const programs = [program('p1', 3, '1000-2-02-18-003-003-000')];
    const pas = [
      pa('root-a', null, 1, '1000-2-02-18-003-003-001'),
      pa('root-c', null, 3, '1000-2-02-18-003-003-003'),
    ]; // root-b (002) has been hard-deleted
    const { db } = buildDb(programs, pas);
    const service = new AIPCodesService(db as unknown as PrismaService);

    await service.resyncTentativePACodes('p1', db as never);

    expect(codesOf(pas)).toEqual([
      '1000-2-02-18-003-003-001',
      '1000-2-02-18-003-003-002',
    ]);
  });
});

// ─── Preview ─────────────────────────────────────────────────────────────────

/**
 * The create-program form previews the code live while the user fills the form.
 * `papClass` is segment 5 *and* the bucket the ordinal restarts in, so a preview
 * that drops it does not merely blank a segment — it emits `003` for every
 * program and counts the wrong siblings. The client sent no `papClass` at all
 * for a while and the form showed a frozen `…-003-…` whatever section was
 * picked; this is the check that fails if that plumbing comes loose again.
 */
describe('AIPCodesService.previewProgramCode', () => {
  const preview = (
    papClass?: 'GAS' | 'STO' | 'OPERATIONS',
    rows: ProgramRow[] = [],
  ) => {
    const { db } = buildDb(rows);
    const service = new AIPCodesService(db as unknown as PrismaService);
    return service.previewProgramCode({ ...SCOPE, papClass });
  };

  it('emits the papClass segment it was given', async () => {
    await expect(preview('GAS')).resolves.toMatchObject({
      code: '1000-2-02-18-001-001-000',
    });
    await expect(preview('STO')).resolves.toMatchObject({
      code: '1000-2-02-18-002-001-000',
    });
    await expect(preview('OPERATIONS')).resolves.toMatchObject({
      code: '1000-2-02-18-003-001-000',
    });
  });

  it('falls through to Operations when no papClass is given', async () => {
    await expect(preview(undefined)).resolves.toMatchObject({
      code: '1000-2-02-18-003-001-000',
    });
  });

  it('counts only the siblings in its own section', async () => {
    const rows = [
      program('gas-1', 1, '1000-2-02-18-001-001-000', { papClass: 'GAS' }),
      program('gas-2', 2, '1000-2-02-18-001-002-000', { papClass: 'GAS' }),
      program('ops-1', 3, '1000-2-02-18-003-001-000', {
        papClass: 'OPERATIONS',
      }),
    ];
    // Third GAS, but only the *first* STO — the two GAS rows must not shift it.
    await expect(preview('GAS', rows)).resolves.toMatchObject({ counter: 3 });
    await expect(preview('STO', rows)).resolves.toMatchObject({ counter: 1 });
  });

  it('counts an unclassified sibling toward Operations', async () => {
    const rows = [program('legacy', 1, '1000-2-02-18-003-001-000')];
    await expect(preview('OPERATIONS', rows)).resolves.toMatchObject({
      counter: 2,
    });
    await expect(preview('GAS', rows)).resolves.toMatchObject({ counter: 1 });
  });
});

/**
 * The add-project/activity form previews this while the user fills it in. It
 * used to build the code client-side by pasting `-000` onto the program's, so
 * the field read `…-000` however many project/activities the program already
 * had. These pin the two shapes to the ones `resyncTentativePACodes` writes —
 * if the preview and the resync ever disagree, the form shows one code and
 * saves another.
 */
describe('AIPCodesService.previewPACode', () => {
  const PROGRAM_CODE = '1000-2-02-18-003-001-000';
  const build = (pas: PARow[]) => {
    const { db } = buildDb([program('p1', 1, PROGRAM_CODE)], pas);
    return new AIPCodesService(db as unknown as PrismaService);
  };

  it('fills the trailing slot for the first root project/activity', async () => {
    await expect(build([]).previewPACode({ programId: 'p1' })).resolves.toEqual(
      {
        code: '1000-2-02-18-003-001-001',
        counter: 1,
      },
    );
  });

  it('advances the ordinal as siblings are added', async () => {
    const pas = [
      pa('a1', null, 1, '1000-2-02-18-003-001-001'),
      pa('a2', null, 2, '1000-2-02-18-003-001-002'),
    ];
    await expect(
      build(pas).previewPACode({ programId: 'p1' }),
    ).resolves.toEqual({ code: '1000-2-02-18-003-001-003', counter: 3 });
  });

  it('appends a 2-digit segment for an activity under a project', async () => {
    const pas = [pa('a1', null, 1, '1000-2-02-18-003-001-001')];
    await expect(
      build(pas).previewPACode({
        programId: 'p1',
        parentProjectActivityId: 'a1',
      }),
    ).resolves.toEqual({ code: '1000-2-02-18-003-001-001-01', counter: 1 });
  });

  it("numbers each project's activities independently", async () => {
    const pas = [
      pa('a1', null, 1, '1000-2-02-18-003-001-001'),
      pa('a2', null, 2, '1000-2-02-18-003-001-002'),
      pa('a1-1', 'a1', 1, '1000-2-02-18-003-001-001-01'),
      pa('a1-2', 'a1', 2, '1000-2-02-18-003-001-001-02'),
    ];
    const service = build(pas);
    // Third under a1, but still the first under a2 — and the two root PAs must
    // not count toward either.
    await expect(
      service.previewPACode({ programId: 'p1', parentProjectActivityId: 'a1' }),
    ).resolves.toMatchObject({ counter: 3 });
    await expect(
      service.previewPACode({ programId: 'p1', parentProjectActivityId: 'a2' }),
    ).resolves.toMatchObject({ code: '1000-2-02-18-003-001-002-01' });
  });

  it('agrees with what the resync writes', async () => {
    // The preview is only useful if the row saves with the code it showed.
    const existing = [pa('a1', null, 1, 'stale-1')];
    const { db } = buildDb([program('p1', 1, PROGRAM_CODE)], existing);
    const service = new AIPCodesService(db as unknown as PrismaService);

    const preview = await service.previewPACode({ programId: 'p1' });
    existing.push(pa('a2', null, 2, 'stale-2'));
    await service.resyncTentativePACodes('p1', db as never);

    expect(existing.find((p) => p.id === 'a2')!.tentativeAipReferenceCode).toBe(
      preview.code,
    );
  });
});
