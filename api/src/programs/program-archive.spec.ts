import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ProgramPublishService } from './program-publish.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AIPCodesService } from '../aip-codes/aip-codes.service.js';
import type { ProgramsService } from './programs.service.js';
import type { ProgramVersionsService } from './program-versions.service.js';
import type { RegistryCacheService } from '../cache/registry-cache.service.js';
import type { EstimateRollupService } from '../budget-rollup/estimate-rollup.service.js';
import type { BudgetRollupService } from '../budget-rollup/budget-rollup.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import {
  ProgramAuditAction,
  ProgramStatus,
  Role,
} from '../generated/prisma/index';
import {
  LIVE_PROGRAM,
  PUBLICLY_READABLE,
  PUBLICLY_VISIBLE,
} from './program-filters.js';

/** specs/013 — `archive` / `unarchive` and the predicates that make it stick. */

const admin = { sub: 'u-admin', role: Role.SUPER_ADMIN } as JwtPayload;
const staff = { sub: 'u-staff', role: Role.STAFF } as JwtPayload;

function makeService(status: ProgramStatus) {
  const program = {
    id: 'p-1',
    status,
    aipCycleId: 'cy-1',
    officeId: 'o-1',
    papSectorId: 's-1',
    publishedVersionId: 'v-1',
    archivedReason: status === ProgramStatus.ARCHIVED ? 'Old' : null,
  };
  const tx = {
    program: { update: jest.fn().mockResolvedValue({ ...program }) },
  };
  const prisma = {
    program: { findFirst: jest.fn().mockResolvedValue(program) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const codes = {
    resyncTentativeProgramCodes: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(null) };
  const cache = { invalidateAll: jest.fn().mockResolvedValue(undefined) };
  const stub = <T>() => ({}) as T;
  const service = new ProgramPublishService(
    prisma,
    stub<ProgramsService>(),
    stub<ProgramVersionsService>(),
    codes as unknown as AIPCodesService,
    stub<EstimateRollupService>(),
    stub<BudgetRollupService>(),
    audit,
    cache as unknown as RegistryCacheService,
  );
  return { service, tx, codes, audit, cache };
}

describe('ProgramPublishService.archive', () => {
  it('archives a PUBLISHED program, parks its code, resyncs, audits and invalidates', async () => {
    const { service, tx, codes, audit, cache } = makeService(
      ProgramStatus.PUBLISHED,
    );
    await service.archive('p-1', '  Superseded by the import  ', admin);

    expect(tx.program.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: expect.objectContaining({
        status: ProgramStatus.ARCHIVED,
        archivedReason: 'Superseded by the import',
        tentativeAipReferenceCode: '~p-1',
        archivedAt: expect.any(Date),
      }),
    });
    expect(codes.resyncTentativeProgramCodes).toHaveBeenCalledWith(
      { aipCycleId: 'cy-1', officeId: 'o-1', papSectorId: 's-1' },
      tx,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: ProgramAuditAction.ARCHIVED }),
      tx,
    );
    expect(cache.invalidateAll).toHaveBeenCalled();
  });

  it('refuses anyone but a super admin', async () => {
    const { service, tx } = makeService(ProgramStatus.PUBLISHED);
    await expect(service.archive('p-1', 'Reason', staff)).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.program.update).not.toHaveBeenCalled();
  });

  it.each(['', '   ', 'x'.repeat(501)])(
    'refuses a missing or overlong reason (%#)',
    async (reason) => {
      const { service } = makeService(ProgramStatus.PUBLISHED);
      await expect(service.archive('p-1', reason, admin)).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it('asks for an open revision to be discarded first', async () => {
    const { service } = makeService(ProgramStatus.PUBLISHED_REVISION);
    await expect(service.archive('p-1', 'Reason', admin)).rejects.toThrow(
      /Discard the open revision/,
    );
  });

  it.each([ProgramStatus.DRAFT, ProgramStatus.ARCHIVED])(
    'refuses a %s program',
    async (status) => {
      const { service } = makeService(status);
      await expect(service.archive('p-1', 'Reason', admin)).rejects.toThrow(
        ConflictException,
      );
    },
  );
});

describe('ProgramPublishService.unarchive', () => {
  it('returns an ARCHIVED program to DRAFT and clears the archive fields', async () => {
    const { service, tx, codes, audit } = makeService(ProgramStatus.ARCHIVED);
    await service.unarchive('p-1', 'Needed again', admin);
    expect(tx.program.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: {
        status: ProgramStatus.DRAFT,
        archivedAt: null,
        archivedReason: null,
      },
    });
    expect(codes.resyncTentativeProgramCodes).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: ProgramAuditAction.UNARCHIVED }),
      tx,
    );
  });

  it('refuses a program that is not archived', async () => {
    const { service } = makeService(ProgramStatus.PUBLISHED);
    await expect(service.unarchive('p-1', 'Reason', admin)).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('program-filters', () => {
  it('keeps archived programs out of everything that lists or totals', () => {
    expect(LIVE_PROGRAM.status).toEqual({ not: ProgramStatus.ARCHIVED });
    expect(PUBLICLY_VISIBLE).toMatchObject(LIVE_PROGRAM);
    expect(PUBLICLY_VISIBLE.publishedVersionId).toEqual({ not: null });
  });

  it('lets an archived program be opened by its link, and only that', () => {
    expect(PUBLICLY_READABLE).not.toHaveProperty('status');
    expect(PUBLICLY_READABLE.publishedVersionId).toEqual({ not: null });
  });
});
