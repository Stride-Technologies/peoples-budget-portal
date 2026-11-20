import type { EstimateRollupService } from '../budget-rollup/estimate-rollup.service.js';
import { ProgramsService } from './programs.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AIPCodesService } from '../aip-codes/aip-codes.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  IdentityType,
  PapClass,
  ProgramStatus,
  Role,
} from '../generated/prisma/index';
import type { OfficeScopeService } from '../permissions/office-scope.service.js';
import type { ProgramAuditLogService } from '../program-audit/program-audit-log.service.js';
import type { RegistryCacheService } from '../cache/registry-cache.service.js';
import {
  isDeletableStatus,
  isEditableStatus,
  isSubmittableStatus,
} from './program-status.constants.js';

/**
 * These tests cover endorser/cluster visibility and status gating, which sit
 * *beside* office scope — scope itself is covered in permissions.spec.ts.
 *
 * The stub lets the ownership assertion pass (as it would for a real user
 * acting on their own office, since the effective list unions the home office)
 * while returning an empty list, so the cluster/endorser read branches are
 * still the ones under test rather than being short-circuited by scope.
 */
/** The audit log is exercised in program-audit.spec.ts; here it just absorbs writes. */
const auditStub = () =>
  ({
    record: jest.fn().mockResolvedValue(null),
  }) as unknown as ProgramAuditLogService;

const registryCacheStub = () =>
  ({
    invalidatePublicRegistry: jest.fn().mockResolvedValue(undefined),
    invalidateRegistryCounts: jest.fn().mockResolvedValue(undefined),
    invalidateAll: jest.fn().mockResolvedValue(undefined),
  }) as unknown as RegistryCacheService;

const officeScopeStub = () =>
  ({
    // Mirrors the real union-with-home-office rule for a user holding no
    // explicit grants, which is what every fixture in this file is.
    effectiveOfficeIds: jest.fn((u: JwtPayload) =>
      Promise.resolve(u.officeId ? [u.officeId] : []),
    ),
    hasExplicitGrants: jest.fn().mockResolvedValue(false),
    assertOfficeInScope: jest.fn((u: JwtPayload, officeId: string | null) =>
      u.officeId && u.officeId === officeId
        ? Promise.resolve()
        : Promise.reject(new Error('out of scope')),
    ),
  }) as unknown as OfficeScopeService;

const admin: JwtPayload = {
  sub: 'admin-1',
  role: Role.SUPER_ADMIN,
  email: 'a@x.com',
  firstName: 'A',
  lastName: 'D',
  identityType: null,
  officeId: null,
  civilSocietyOrganizationId: null,
};

describe('ProgramsService.assertCanRead — NCPC endorsers', () => {
  const lguProgram = {
    id: 'p-1',
    deletedAt: null,
    officeId: 'office-A',
    civilSocietyOrganizationId: null,
    office: { clusterId: 'cl-1' },
    civilSocietyOrganization: null,
  };

  it('grants the NCPC umbrella head read access to an LGU program', async () => {
    const prisma = {
      program: { findUnique: jest.fn().mockResolvedValue(lguProgram) },
    } as unknown as PrismaService;
    const umbrella: JwtPayload = {
      sub: 'ncpc-head',
      role: Role.HEAD,
      email: 'n@x.com',
      firstName: 'N',
      lastName: 'C',
      identityType: IdentityType.NCPC,
      officeId: null,
      civilSocietyOrganizationId: null,
    };
    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );
    await expect(service.assertCanRead('p-1', umbrella)).resolves.toMatchObject(
      {
        id: 'p-1',
      },
    );
  });

  it('denies a CSO rep whose CSO is not canEndorse', async () => {
    const prisma = {
      program: { findUnique: jest.fn().mockResolvedValue(lguProgram) },
      civilSocietyOrganization: {
        findUnique: jest.fn().mockResolvedValue({ canEndorse: false }),
      },
    } as unknown as PrismaService;
    const csoRep: JwtPayload = {
      sub: 'cso-head',
      role: Role.HEAD,
      email: 'c@x.com',
      firstName: 'C',
      lastName: 'R',
      identityType: IdentityType.NCPC,
      officeId: null,
      civilSocietyOrganizationId: 'cso-x',
    };
    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );
    await expect(service.assertCanRead('p-1', csoRep)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('ProgramsService.buildVisibilityWhere — no scope (#102)', () => {
  const service = () =>
    new ProgramsService(
      {} as PrismaService,
      {} as AIPCodesService,
      {
        effectiveOfficeIds: jest.fn().mockResolvedValue([]),
        hasExplicitGrants: jest.fn().mockResolvedValue(false),
      } as unknown as OfficeScopeService,
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

  it('lists nothing for a user with no office, scope, cluster or endorser role', async () => {
    // A Developer (or NCPC staff without a CSO) before anyone grants offices.
    // `OR: undefined` used to drop the filter and list every program.
    const developer: JwtPayload = {
      ...admin,
      sub: 'dev-1',
      role: Role.STAFF,
      identityType: IdentityType.DEVELOPER,
    };
    await expect(service().buildVisibilityWhere(developer)).resolves.toEqual({
      deletedAt: null,
      id: { in: [] },
    });
  });
});

describe('ProgramsService.markSeen', () => {
  it('upserts the read-state row for the current user + program', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      // assertCanRead lookup — SUPER_ADMIN short-circuits after this.
      program: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p-1',
          deletedAt: null,
          officeId: 'office-A',
          civilSocietyOrganizationId: null,
          office: { clusterId: 'cl-1' },
          civilSocietyOrganization: null,
        }),
      },
      programReadState: { upsert },
    } as unknown as PrismaService;

    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );
    const result = await service.markSeen('p-1', admin);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_programId: { userId: 'admin-1', programId: 'p-1' } },
      }),
    );
    expect(result.lastSeenAt).toBeInstanceOf(Date);
  });
});

describe('ProgramsService.softDelete', () => {
  const draftProgram = {
    id: 'p-1',
    deletedAt: null,
    status: ProgramStatus.DRAFT,
    officeId: 'office-A',
  };

  it('hard-deletes child project activities when program is DRAFT', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const programUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      projectActivity: { deleteMany },
      program: { update: programUpdate },
    };
    const prisma = {
      program: { findUnique: jest.fn().mockResolvedValue(draftProgram) },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;

    const codes = {
      resyncTentativeProgramCodes: jest.fn(),
    } as unknown as AIPCodesService;
    const service = new ProgramsService(
      prisma,
      codes,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );
    await service.softDelete('p-1', admin);

    expect(deleteMany).toHaveBeenCalledWith({ where: { programId: 'p-1' } });
    // The gap this leaves in the scope's numbering must be closed.
    expect(codes.resyncTentativeProgramCodes).toHaveBeenCalledWith(
      expect.objectContaining({ officeId: 'office-A' }),
      tx,
    );
    expect(programUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p-1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  it('invalidates both registry caches after the row is gone', async () => {
    // Without this, the tab badges keep counting a deleted program until the
    // 60s TTL lapses, and a deleted published program stays on the public list.
    const tx = {
      projectActivity: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      program: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      program: { findUnique: jest.fn().mockResolvedValue(draftProgram) },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;

    const registryCache = registryCacheStub();
    await new ProgramsService(
      prisma,
      { resyncTentativeProgramCodes: jest.fn() } as unknown as AIPCodesService,
      officeScopeStub(),
      auditStub(),
      registryCache,
      {} as EstimateRollupService,
    ).softDelete('p-1', admin);

    expect(registryCache.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('releases the tentative code so the resync can reuse it', async () => {
    // The unique index on tentative_aip_reference_code ignores deleted_at, so a
    // dead row keeping its code makes the very next renumber collide.
    const programUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      projectActivity: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      program: { update: programUpdate },
    };
    const prisma = {
      program: { findUnique: jest.fn().mockResolvedValue(draftProgram) },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    const codes = {
      resyncTentativeProgramCodes: jest.fn(),
    } as unknown as AIPCodesService;

    const service = new ProgramsService(
      prisma,
      codes,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );
    await service.softDelete('p-1', admin);

    const { data } = programUpdate.mock.calls[0][0] as {
      data: { tentativeAipReferenceCode: string };
    };
    expect(data.tentativeAipReferenceCode).toBe('~p-1');
    // The code must be released before the scope is renumbered, not after.
    expect(programUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      (codes.resyncTentativeProgramCodes as jest.Mock).mock
        .invocationCallOrder[0],
    );
  });

  it('throws 400 when program is non-DRAFT and caller is not SUPER_ADMIN', async () => {
    const staff: JwtPayload = {
      sub: 'staff-1',
      role: Role.STAFF,
      email: 's@x.com',
      firstName: 'S',
      lastName: 'T',
      identityType: null,
      officeId: 'office-A',
      civilSocietyOrganizationId: null,
    };
    const prisma = {
      program: {
        findUnique: jest.fn().mockResolvedValue({
          ...draftProgram,
          status: ProgramStatus.SUBMITTED,
        }),
      },
    } as unknown as PrismaService;

    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );
    await expect(service.softDelete('p-1', staff)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws 403 when caller does not own the program', async () => {
    const otherStaff: JwtPayload = {
      sub: 'staff-2',
      role: Role.STAFF,
      email: 'o@x.com',
      firstName: 'O',
      lastName: 'T',
      identityType: null,
      officeId: 'office-B',
      civilSocietyOrganizationId: null,
    };
    const prisma = {
      program: { findUnique: jest.fn().mockResolvedValue(draftProgram) },
    } as unknown as PrismaService;

    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );
    await expect(service.softDelete('p-1', otherStaff)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('ProgramsService.create — LGU-only (NCPC proponent track retired)', () => {
  it('rejects create without a officeId', async () => {
    const prisma = {} as PrismaService;
    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    await expect(
      service.create(
        {
          aipCycleId: 'cycle-1',
          papSectorId: 'pap-1',
          papClass: PapClass.OPERATIONS,
          finishLineId: 'fl-1',
          name: 'Sample Program',
          expectedOutput: 'Expected output details',
          implementationStartMonth: 1,
          implementationStartYear: 2026,
          implementationEndMonth: 12,
          implementationEndYear: 2026,
        } as unknown as Parameters<ProgramsService['create']>[0],
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ProgramsService implementation period validations', () => {
  it('rejects create when implementation start is after end', async () => {
    const prisma = {} as PrismaService;
    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    await expect(
      service.create(
        {
          aipCycleId: 'cycle-1',
          officeId: 'office-1',
          papSectorId: 'pap-1',
          papClass: PapClass.OPERATIONS,
          finishLineId: 'fl-1',
          name: 'Sample Program',
          expectedOutput: 'Expected output details',
          implementationStartMonth: 12,
          implementationStartYear: 2026,
          implementationEndMonth: 1,
          implementationEndYear: 2026,
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects update when program is not in DRAFT', async () => {
    const prisma = {
      program: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p-1',
          deletedAt: null,
          status: ProgramStatus.SUBMITTED,
        }),
      },
    } as unknown as PrismaService;
    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    await expect(service.update('p-1', {}, admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects update when merged implementation period is invalid', async () => {
    const prisma = {
      program: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p-1',
          deletedAt: null,
          status: ProgramStatus.DRAFT,
          officeId: null,
          finishLineId: 'fl-1',
          papSectorId: 'pap-1',
          implementationStartMonth: null,
          implementationStartYear: null,
          implementationEndMonth: 1,
          implementationEndYear: 2026,
        }),
      },
    } as unknown as PrismaService;
    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    await expect(
      service.update(
        'p-1',
        { implementationStartMonth: 2, implementationStartYear: 2026 },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ProgramsService.update — implementing office reassignment', () => {
  const staff: JwtPayload = {
    sub: 'staff-1',
    role: Role.STAFF,
    email: 's@x.com',
    firstName: 'S',
    lastName: 'T',
    identityType: IdentityType.LGU,
    officeId: 'office-old',
    civilSocietyOrganizationId: null,
  };

  const programRow = {
    id: 'p-1',
    deletedAt: null,
    status: ProgramStatus.PUBLISHED_REVISION as ProgramStatus,
    currentVersion: 1,
    aipCycleId: 'cycle-1',
    officeId: 'office-old',
    finishLineId: 'fl-1',
    papSectorId: 'pap-1',
    papSubsectorCode: '000',
    papClass: PapClass.GAS as PapClass | null,
    subFinishLineId: null,
    implementationStartMonth: 1,
    implementationStartYear: 2027,
    implementationEndMonth: 12,
    implementationEndYear: 2027,
  };

  const buildPrisma = (
    update: jest.Mock,
    rowOverrides: Partial<typeof programRow> = {},
  ) =>
    ({
      program: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...programRow, ...rowOverrides }),
      },
      office: {
        findUnique: jest.fn().mockResolvedValue({ id: 'office-new' }),
      },
      pAPSector: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pap-2' }),
      },
      aIPCycle: {
        findUnique: jest.fn().mockResolvedValue({ fiscalYear: 2027 }),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          program: {
            update,
            aggregate: jest.fn().mockResolvedValue({ _max: { orderIndex: 4 } }),
            findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'p-1' }),
          },
          programSupportingOffice: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        }),
      ),
    }) as unknown as PrismaService;

  /** The code itself is derived by the resync; these tests only assert it runs. */
  const codesStub = () =>
    ({
      resyncTentativeProgramCodes: jest.fn(),
    }) as unknown as AIPCodesService;

  it('persists the new office and resyncs both the old and new scope', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'p-1' });
    const codes = codesStub();

    const service = new ProgramsService(
      buildPrisma(update),
      codes,
      // SUPER_ADMIN skips the scope assertions entirely.
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    await service.update('p-1', { officeId: 'office-new' }, admin);

    // The office must actually reach the write — this is the bug that let the
    // field silently revert on save.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ officeId: 'office-new' }),
      }),
    );
    // The code is no longer written here; the resync derives it. The old scope
    // must be resynced first so the vacated ordinal is free before the new
    // scope can claim it.
    const scopes = (
      codes.resyncTentativeProgramCodes as jest.Mock
    ).mock.calls.map((c) => (c[0] as { officeId: string }).officeId);
    expect(scopes).toEqual(['office-old', 'office-new']);
    expect(update.mock.calls[0][0].data).not.toHaveProperty(
      'tentativeAipReferenceCode',
    );
  });

  it('resyncs when only the PAP sector changes', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'p-1' });
    const codes = codesStub();

    const service = new ProgramsService(
      // The sector is immutable once submitted (currentVersion > 0), so this
      // only applies to a program that has never been submitted.
      buildPrisma(update, {
        currentVersion: 0,
        status: ProgramStatus.DRAFT,
      }),
      codes,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    await service.update('p-1', { papSectorId: 'pap-2' }, admin);

    // The sector is the code's first segment. It used to be written without any
    // reissue, leaving the code naming a sector the program was no longer in.
    expect(codes.resyncTentativeProgramCodes).toHaveBeenCalledWith(
      expect.objectContaining({ papSectorId: 'pap-2' }),
      expect.anything(),
    );
  });

  /**
   * `papClass` is not one of the code's segments, which is why it was not a code
   * input before. It is now the first key of the ordinal's rank (GAS → STO →
   * Operations), so moving a program between sections renumbers it and every
   * sibling it steps over.
   */
  it('resyncs when only the AIP form section changes', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'p-1' });
    const codes = codesStub();

    const service = new ProgramsService(
      buildPrisma(update),
      codes,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    await service.update('p-1', { papClass: PapClass.OPERATIONS }, admin);

    expect(codes.resyncTentativeProgramCodes).toHaveBeenCalledWith(
      expect.objectContaining({ officeId: 'office-old', papSectorId: 'pap-1' }),
      expect.anything(),
    );
  });

  it('leaves the code alone when no code input changed', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'p-1' });
    const codes = codesStub();

    const service = new ProgramsService(
      buildPrisma(update),
      codes,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    await service.update('p-1', { officeId: 'office-old' }, admin);

    expect(codes.resyncTentativeProgramCodes).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data).not.toHaveProperty(
      'tentativeAipReferenceCode',
    );
  });

  it('refuses to move a program to an office outside the caller scope', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'p-1' });
    const service = new ProgramsService(
      buildPrisma(update),
      codesStub(),
      // The stub only admits the caller's own office ('office-old'), so
      // 'office-new' is out of scope.
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    await expect(
      service.update('p-1', { officeId: 'office-new' }, staff),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('validates supporting offices against the incoming office, not the old one', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'p-1' });
    const service = new ProgramsService(
      buildPrisma(update),
      codesStub(),
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    // 'office-new' becomes the implementing office, so it must not also appear
    // as a supporting office — even though it is not the *stored* one.
    await expect(
      service.update(
        'p-1',
        { officeId: 'office-new', supportingOfficeIds: ['office-new'] },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ProgramsService office scope (Phase 1 D2)', () => {
  const encoder: JwtPayload = {
    sub: 'cpdo-encoder',
    role: Role.STAFF,
    email: 'person1@example.gov.ph',
    firstName: 'E',
    lastName: 'N',
    identityType: IdentityType.LGU,
    officeId: 'office-cpdo',
    civilSocietyOrganizationId: null,
  };

  /** A CPDO encoder granted CAgO on top of their own office. */
  const scopeWith = (ids: string[], hasExplicitGrants = false) =>
    ({
      effectiveOfficeIds: jest.fn().mockResolvedValue(ids),
      hasExplicitGrants: jest.fn().mockResolvedValue(hasExplicitGrants),
      assertOfficeInScope: jest.fn((_u: JwtPayload, officeId: string | null) =>
        officeId && ids.includes(officeId)
          ? Promise.resolve()
          : Promise.reject(new Error('out of scope')),
      ),
    }) as unknown as OfficeScopeService;

  it('lets an encoder act on a granted office that is not their own', async () => {
    const service = new ProgramsService(
      {} as PrismaService,
      {} as AIPCodesService,
      scopeWith(['office-cpdo', 'office-cago']),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );
    await expect(
      service.assertOwner({ officeId: 'office-cago' }, encoder),
    ).resolves.toBeUndefined();
  });

  it('still refuses an office outside the grant', async () => {
    const service = new ProgramsService(
      {} as PrismaService,
      {} as AIPCodesService,
      scopeWith(['office-cpdo', 'office-cago']),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );
    await expect(
      service.assertOwner({ officeId: 'office-enro' }, encoder),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /**
   * The bug: a CPDO encoder granted the eight Economy offices could read all 23
   * Governance offices, because CPDO sits in Governance and the cluster branch
   * was unioned on top of the grants. 101 programs visible instead of 48.
   */
  it('does not widen an explicitly granted scope to the home cluster', async () => {
    const prisma = {
      office: {
        findUnique: jest.fn().mockResolvedValue({ clusterId: 'cluster-gov' }),
      },
    } as unknown as PrismaService;
    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      scopeWith(['office-cpdo', 'office-cago'], true),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    const where = await service.buildVisibilityWhere(encoder);

    expect(where).toEqual({
      deletedAt: null,
      OR: [{ officeId: { in: ['office-cpdo', 'office-cago'] } }],
    });
    expect(JSON.stringify(where)).not.toContain('clusterId');
  });

  it('by-id reads apply the same rule: no home-cluster read past explicit grants', async () => {
    const prisma = {
      office: {
        findUnique: jest.fn().mockResolvedValue({ clusterId: 'cluster-gov' }),
      },
    } as unknown as PrismaService;
    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      scopeWith(['office-cpdo', 'office-cago'], true),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    await expect(
      service.canReadOffice('office-other-gov', 'cluster-gov', encoder),
    ).resolves.toBe(false);
    await expect(
      service.canReadOffice('office-cago', 'cluster-econ', encoder),
    ).resolves.toBe(true);
  });

  it('keeps the same-cluster peer rule for users with no grants', async () => {
    // Unchanged for everyone the endpoint already served correctly — the grants
    // are what make a scope authoritative, not the mere presence of an office.
    const prisma = {
      office: {
        findUnique: jest.fn().mockResolvedValue({ clusterId: 'cluster-gov' }),
      },
    } as unknown as PrismaService;
    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      scopeWith(['office-cpdo'], false),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    const where = await service.buildVisibilityWhere(encoder);

    expect(where).toEqual({
      deletedAt: null,
      OR: [
        { officeId: { in: ['office-cpdo'] } },
        { office: { clusterId: 'cluster-gov' } },
      ],
    });
  });

  it('reads every program when the scope is ALL', async () => {
    const service = new ProgramsService(
      {} as PrismaService,
      {} as AIPCodesService,
      {
        effectiveOfficeIds: jest.fn().mockResolvedValue('ALL'),
      } as unknown as OfficeScopeService,
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );
    await expect(service.buildVisibilityWhere(encoder)).resolves.toEqual({
      deletedAt: null,
    });
  });
});

describe('Phase 1 status carve-outs (§3.1)', () => {
  const staff: JwtPayload = {
    sub: 'encoder',
    role: Role.STAFF,
    email: 'person1@example.gov.ph',
    firstName: 'E',
    lastName: 'N',
    identityType: IdentityType.LGU,
    officeId: 'office-1',
    civilSocietyOrganizationId: null,
  };

  const publishedRevision = {
    id: 'p-1',
    deletedAt: null,
    status: ProgramStatus.PUBLISHED_REVISION,
    officeId: 'office-1',
    currentVersion: 1,
  };

  it('allows structural edits while a revision is open', () => {
    expect(isEditableStatus(ProgramStatus.PUBLISHED_REVISION)).toBe(true);
  });

  it('never treats a published program as editable', () => {
    // The invariant discard-draft depends on: for any PUBLISHED program, live
    // rows equal the published snapshot.
    expect(isEditableStatus(ProgramStatus.PUBLISHED)).toBe(false);
  });

  it('refuses to delete a program mid-revision, even though it is editable', async () => {
    // Carve-out 1: reusing the editable set here would let any encoder delete a
    // public budget document by opening a revision first.
    expect(isDeletableStatus(ProgramStatus.PUBLISHED_REVISION)).toBe(false);

    const prisma = {
      program: { findUnique: jest.fn().mockResolvedValue(publishedRevision) },
    } as unknown as PrismaService;
    const service = new ProgramsService(
      prisma,
      {} as AIPCodesService,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

    await expect(service.softDelete('p-1', staff)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses to submit a published program back into the approval chain', () => {
    // Carve-out 2: guards the Phase 2 merge from archive/full-approval-workflow.
    expect(isSubmittableStatus(ProgramStatus.PUBLISHED_REVISION)).toBe(false);
    expect(isSubmittableStatus(ProgramStatus.PUBLISHED)).toBe(false);
    expect(isSubmittableStatus(ProgramStatus.DRAFT)).toBe(true);
  });
});

describe('ProgramsService.reorder', () => {
  const inScope = (id: string) => ({
    id,
    aipCycleId: 'cy-1',
    officeId: 'office-A',
    papSectorId: 'ps-1',
    status: ProgramStatus.DRAFT,
  });

  const build = (
    update: jest.Mock,
    rows: ReturnType<typeof inScope>[],
    scopeCount = rows.length,
  ) => {
    const tx = { program: { update, findMany: jest.fn() } };
    const prisma = {
      program: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(scopeCount),
      },
      $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const codes = {
      resyncTentativeProgramCodes: jest.fn(),
    } as unknown as AIPCodesService;
    const service = new ProgramsService(
      prisma,
      codes,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );
    return { service, codes };
  };

  it('writes 1-based orderIndex in payload order, then resyncs the scope', async () => {
    const update = jest.fn();
    const { service, codes } = build(update, [
      inScope('p-1'),
      inScope('p-2'),
      inScope('p-3'),
    ]);

    await service.reorder({ ids: ['p-3', 'p-1', 'p-2'] }, admin);

    expect(
      update.mock.calls.map((c) => [
        (c[0] as { where: { id: string } }).where.id,
        (c[0] as { data: { orderIndex: number } }).data.orderIndex,
      ]),
    ).toEqual([
      ['p-3', 1],
      ['p-1', 2],
      ['p-2', 3],
    ]);
    expect(codes.resyncTentativeProgramCodes).toHaveBeenCalledWith(
      expect.objectContaining({
        aipCycleId: 'cy-1',
        officeId: 'office-A',
        papSectorId: 'ps-1',
      }),
      expect.anything(),
    );
  });

  it('refuses a payload spanning two PAP sectors', async () => {
    const update = jest.fn();
    // The ordinal restarts per sector, so a drag across sectors could not move
    // the code — reordering them together would be a silent no-op.
    const { service } = build(update, [
      inScope('p-1'),
      { ...inScope('p-2'), papSectorId: 'ps-2' },
    ]);

    await expect(
      service.reorder({ ids: ['p-2', 'p-1'] }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a partial list of the scope', async () => {
    const update = jest.fn();
    // Two listed, but the scope holds three.
    const { service } = build(update, [inScope('p-1'), inScope('p-2')], 3);

    await expect(
      service.reorder({ ids: ['p-2', 'p-1'] }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects duplicate ids', async () => {
    const update = jest.fn();
    const { service } = build(update, [inScope('p-1')]);

    await expect(
      service.reorder({ ids: ['p-1', 'p-1'] }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('ProgramsService.assertCanTag (FR-013, Decision 3)', () => {
  const program = { officeId: 'office-A' };

  const buildService = () =>
    new ProgramsService(
      {} as PrismaService,
      {} as AIPCodesService,
      officeScopeStub(),
      auditStub(),
      registryCacheStub(),
      {} as EstimateRollupService,
    );

  it('passes for the owning office', async () => {
    const owner: JwtPayload = {
      sub: 'u-1',
      role: Role.STAFF,
      email: 'o@x.com',
      firstName: 'O',
      lastName: 'W',
      identityType: IdentityType.LGU,
      officeId: 'office-A',
      civilSocietyOrganizationId: null,
    };
    await expect(
      buildService().assertCanTag(program, owner),
    ).resolves.toBeUndefined();
  });

  it('passes for any NCPC user regardless of office', async () => {
    const ncpc: JwtPayload = {
      sub: 'u-2',
      role: Role.STAFF,
      email: 'n@x.com',
      firstName: 'N',
      lastName: 'C',
      identityType: IdentityType.NCPC,
      officeId: null,
      civilSocietyOrganizationId: null,
    };
    await expect(
      buildService().assertCanTag(program, ncpc),
    ).resolves.toBeUndefined();
  });

  it('denies a user from an unrelated office who is not NCPC', async () => {
    const outsider: JwtPayload = {
      sub: 'u-3',
      role: Role.STAFF,
      email: 'u@x.com',
      firstName: 'U',
      lastName: 'S',
      identityType: IdentityType.LGU,
      officeId: 'office-B',
      civilSocietyOrganizationId: null,
    };
    await expect(
      buildService().assertCanTag(program, outsider),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes for SUPER_ADMIN', async () => {
    await expect(
      buildService().assertCanTag(program, admin),
    ).resolves.toBeUndefined();
  });
});
