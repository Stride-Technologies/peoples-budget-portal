import { BadRequestException } from '@nestjs/common';
import { ProjectActivitiesService } from './project-activities.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ProgramsService } from '../programs/programs.service.js';
import type { AIPCodesService } from '../aip-codes/aip-codes.service.js';
import type { BudgetRollupService } from '../budget-rollup/budget-rollup.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import {
  PPAType,
  Prisma,
  ProgramStatus,
  Role,
  FundSource,
} from '../generated/prisma/index';

import type { EstimateRollupService } from '../budget-rollup/estimate-rollup.service.js';

/** The `data` payload a mocked `projectActivity.update` was called with. */
const writtenData = (update: jest.Mock) =>
  (update.mock.calls[0][0] as { data: Record<string, Prisma.Decimal | null> })
    .data;

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

describe('ProjectActivitiesService', () => {
  it('rejects create when PA implementation period falls outside parent Program period', async () => {
    const prisma = {
      program: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'program-1',
          deletedAt: null,
          status: ProgramStatus.DRAFT,
          implementationStartMonth: 1,
          implementationStartYear: 2026,
          implementationEndMonth: 12,
          implementationEndYear: 2026,
        }),
      },
    } as unknown as PrismaService;
    const programs = {
      assertOwner: jest.fn(),
    } as unknown as ProgramsService;
    const codes = {
      resyncTentativePACodes: jest.fn(),
    } as unknown as AIPCodesService;
    const service = new ProjectActivitiesService(
      prisma,
      programs,
      codes,
      {} as BudgetRollupService,
      {
        recomputeProjectActivity: jest.fn().mockResolvedValue(undefined),
        recomputeProgram: jest.fn().mockResolvedValue(undefined),
      } as unknown as EstimateRollupService,
      { record: jest.fn().mockResolvedValue(null) },
    );

    await expect(
      service.create(
        'program-1',
        {
          type: PPAType.PROJECT,
          name: 'Test project',
          expectedOutput: 'Expected output details',
          fundSources: [FundSource.GF],
          implementationStartMonth: 12,
          implementationStartYear: 2025,
          implementationEndMonth: 1,
          implementationEndYear: 2026,
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects update when parent Program is not in DRAFT', async () => {
    const prisma = {
      projectActivity: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pa-1',
          programId: 'program-1',
          costMode: 'DIRECT_COSTS',
          implementationStartMonth: null,
          implementationStartYear: null,
          implementationEndMonth: null,
          implementationEndYear: null,
          program: {
            id: 'program-1',
            deletedAt: null,
            status: ProgramStatus.SUBMITTED,
          },
        }),
      },
    } as unknown as PrismaService;
    const programs = {
      assertOwner: jest.fn(),
    } as unknown as ProgramsService;
    const service = new ProjectActivitiesService(
      prisma,
      programs,
      {} as AIPCodesService,
      {} as BudgetRollupService,
      {
        recomputeProjectActivity: jest.fn().mockResolvedValue(undefined),
        recomputeProgram: jest.fn().mockResolvedValue(undefined),
      } as unknown as EstimateRollupService,
      { record: jest.fn().mockResolvedValue(null) },
    );

    await expect(service.update('pa-1', {}, admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe('update — cost estimates', () => {
    const buildService = (update: jest.Mock, costMode = 'DIRECT_COSTS') => {
      const prisma = {
        projectActivity: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'pa-1',
            programId: 'program-1',
            costMode,
            psEstimate: null,
            mooeEstimate: null,
            coEstimate: null,
            implementationStartMonth: null,
            implementationStartYear: null,
            implementationEndMonth: null,
            implementationEndYear: null,
            program: {
              id: 'program-1',
              deletedAt: null,
              status: ProgramStatus.DRAFT,
              officeId: 'office-1',
              implementationStartMonth: null,
              implementationStartYear: null,
              implementationEndMonth: null,
              implementationEndYear: null,
            },
          }),
          update,
        },
        $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
          cb({ projectActivity: { update } }),
        ),
      } as unknown as PrismaService;

      return new ProjectActivitiesService(
        prisma,
        { assertOwner: jest.fn() } as unknown as ProgramsService,
        {} as AIPCodesService,
        {} as BudgetRollupService,
        {
          recomputeProjectActivity: jest.fn().mockResolvedValue(undefined),
          recomputeProgram: jest.fn().mockResolvedValue(undefined),
        } as unknown as EstimateRollupService,
        { record: jest.fn().mockResolvedValue(null) },
      );
    };

    it('writes edited PS/MOOE/CO through to the row', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'pa-1' });
      const service = buildService(update);

      await service.update(
        'pa-1',
        { psEstimate: '1000.50', mooeEstimate: '2500000', coEstimate: '0' },
        admin,
      );

      // The bug: update() accepted these, logged ESTIMATE_UPDATED, and never
      // wrote them — so the edit vanished on reload.
      const data = writtenData(update);
      expect(data.psEstimate?.toString()).toBe('1000.5');
      expect(data.mooeEstimate?.toString()).toBe('2500000');
      expect(data.coEstimate?.toString()).toBe('0');
    });

    it('clears an estimate when explicitly set to null', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'pa-1' });
      const service = buildService(update);

      await service.update('pa-1', { psEstimate: null }, admin);

      expect(update.mock.calls[0][0].data).toHaveProperty('psEstimate', null);
    });

    it('leaves estimates untouched when the DTO omits them', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'pa-1' });
      const service = buildService(update);

      await service.update('pa-1', { name: 'Renamed' }, admin);

      const data = writtenData(update);
      expect(data).not.toHaveProperty('psEstimate');
      expect(data).not.toHaveProperty('mooeEstimate');
      expect(data).not.toHaveProperty('coEstimate');
    });

    it('still refuses estimates when costs are derived from children', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'pa-1' });
      const service = buildService(update, 'ACTIVITY_CHILDREN');

      await expect(
        service.update('pa-1', { psEstimate: '100' }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    // Fund sources follow the estimates: derived from the children, so the
    // request may not carry them — accepting a list would fight the union.
    it('refuses fund sources when costs are derived from children', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'pa-1' });
      const service = buildService(update, 'ACTIVITY_CHILDREN');

      await expect(
        service.update('pa-1', { fundSources: [FundSource.GF] }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses an empty fund-source list on a direct-cost PA', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'pa-1' });
      const service = buildService(update);

      await expect(
        service.update('pa-1', { fundSources: [] }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('recomputes the rollup when only fund sources change', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'pa-1' });
      const service = buildService(update);
      const estimates = (
        service as unknown as {
          estimates: { recomputeProjectActivity: jest.Mock };
        }
      ).estimates;

      await service.update('pa-1', { fundSources: [FundSource.SEF] }, admin);

      // A child's funds feed its parent's union, so the cascade must run even
      // though no amount moved.
      expect(estimates.recomputeProjectActivity).toHaveBeenCalledWith(
        'pa-1',
        expect.anything(),
      );
    });
  });

  it('cascades delete across descendants and recomputes program rollups', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'child-1' }, { id: 'child-2' }])
      .mockResolvedValueOnce([{ id: 'grandchild-1' }])
      .mockResolvedValueOnce([]);
    const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
    const tx = {
      projectActivity: {
        findMany,
        deleteMany,
      },
    };
    const prisma = {
      projectActivity: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'root-1',
          programId: 'program-1',
          program: {
            id: 'program-1',
            deletedAt: null,
            status: ProgramStatus.DRAFT,
          },
        }),
      },
      $transaction: jest.fn((cb: (trx: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const programs = {
      assertOwner: jest.fn(),
    } as unknown as ProgramsService;
    const recomputeProgram = jest.fn().mockResolvedValue(undefined);
    const rollup = {
      recomputeProgram,
    } as unknown as BudgetRollupService;
    const service = new ProjectActivitiesService(
      prisma,
      programs,
      { resyncTentativePACodes: jest.fn() } as unknown as AIPCodesService,
      rollup,
      {
        recomputeProjectActivity: jest.fn().mockResolvedValue(undefined),
        recomputeProgram: jest.fn().mockResolvedValue(undefined),
      } as unknown as EstimateRollupService,
      { record: jest.fn().mockResolvedValue(null) },
    );

    const result = await service.remove('root-1', admin);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['root-1', 'child-1', 'child-2', 'grandchild-1'] } },
    });
    expect(recomputeProgram).toHaveBeenCalledWith('program-1', tx);
    expect(result).toEqual({ message: 'Project/Activity deleted.' });
  });

  describe('reorder', () => {
    const siblings = [{ id: 'pa-1' }, { id: 'pa-2' }, { id: 'pa-3' }];

    const build = (update: jest.Mock, codes: AIPCodesService) => {
      const tx = { projectActivity: { update, findMany: jest.fn() } };
      const prisma = {
        program: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'program-1',
            deletedAt: null,
            status: ProgramStatus.DRAFT,
          }),
        },
        projectActivity: { findMany: jest.fn().mockResolvedValue(siblings) },
        $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
      } as unknown as PrismaService;
      return new ProjectActivitiesService(
        prisma,
        { assertOwner: jest.fn() } as unknown as ProgramsService,
        codes,
        {} as BudgetRollupService,
        {} as unknown as EstimateRollupService,
        { record: jest.fn().mockResolvedValue(null) },
      );
    };

    it('writes 1-based orderIndex in payload order, then resyncs the codes', async () => {
      const update = jest.fn();
      const codes = {
        resyncTentativePACodes: jest.fn(),
      } as unknown as AIPCodesService;
      const service = build(update, codes);

      await service.reorder(
        'program-1',
        { ids: ['pa-3', 'pa-1', 'pa-2'] },
        admin,
      );

      expect(
        update.mock.calls.map((c) => [
          (c[0] as { where: { id: string } }).where.id,
          (c[0] as { data: { orderIndex: number } }).data.orderIndex,
        ]),
      ).toEqual([
        ['pa-3', 1],
        ['pa-1', 2],
        ['pa-2', 3],
      ]);
      // The order is only half the job — the codes derive from it.
      expect(codes.resyncTentativePACodes).toHaveBeenCalledWith(
        'program-1',
        expect.anything(),
      );
    });

    it('rejects a partial sibling list', async () => {
      const update = jest.fn();
      const service = build(update, {
        resyncTentativePACodes: jest.fn(),
      } as unknown as AIPCodesService);

      // pa-3 omitted — it would keep a stale rank and shuffle on next resync.
      await expect(
        service.reorder('program-1', { ids: ['pa-1', 'pa-2'] }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects duplicate ids', async () => {
      const update = jest.fn();
      const service = build(update, {
        resyncTentativePACodes: jest.fn(),
      } as unknown as AIPCodesService);

      await expect(
        service.reorder('program-1', { ids: ['pa-1', 'pa-1', 'pa-2'] }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });
  });
});

describe('ProjectActivitiesService thematic tags (FR-008, FR-009)', () => {
  const pa = {
    id: 'pa-1',
    programId: 'program-1',
    program: {
      id: 'program-1',
      officeId: 'office-A',
      status: ProgramStatus.DRAFT,
    },
  };

  function build(overrides: Record<string, unknown> = {}) {
    const prisma: Record<string, unknown> = {
      projectActivity: { findUnique: jest.fn().mockResolvedValue(pa) },
      projectActivityThematicTag: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      programThematicTag: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      thematicTag: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'tag-youth', name: 'Youth' }),
      },
      ...overrides,
    };
    prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
    const programs = {
      assertCanTag: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProgramsService;
    const audit = { record: jest.fn().mockResolvedValue(null) };
    const service = new ProjectActivitiesService(
      prisma as unknown as PrismaService,
      programs,
      {} as AIPCodesService,
      {} as BudgetRollupService,
      {} as EstimateRollupService,
      audit,
    );
    return { service, prisma, audit };
  }

  it('rejects removing a tag that is only present through inheritance (FR-009)', async () => {
    const { service, prisma } = build({
      programThematicTag: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ programId: 'program-1', tagId: 'tag-youth' }),
      },
    });

    await expect(
      service.removeThematicTag('pa-1', 'tag-youth', {
        sub: 'u-1',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      (prisma.projectActivityThematicTag as { delete: jest.Mock }).delete,
    ).not.toHaveBeenCalled();
  });

  it('removes a direct application and logs TAG_REMOVED, leaving inheritance alone', async () => {
    const { service, prisma, audit } = build({
      projectActivityThematicTag: {
        findUnique: jest.fn().mockResolvedValue({
          projectActivityId: 'pa-1',
          tagId: 'tag-youth',
          tag: { id: 'tag-youth', name: 'Youth' },
        }),
        delete: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    await service.removeThematicTag('pa-1', 'tag-youth', {
      sub: 'u-1',
    } as never);

    expect(
      (prisma.projectActivityThematicTag as { delete: jest.Mock }).delete,
    ).toHaveBeenCalledWith({
      where: {
        projectActivityId_tagId: {
          projectActivityId: 'pa-1',
          tagId: 'tag-youth',
        },
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TAG_REMOVED', targetId: 'pa-1' }),
      prisma,
    );
  });

  it('applying an already-applied tag is a no-op (idempotent)', async () => {
    const { service, prisma, audit } = build({
      projectActivityThematicTag: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ projectActivityId: 'pa-1', tagId: 'tag-youth' }),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    await service.applyThematicTag('pa-1', 'tag-youth', {
      sub: 'u-1',
    } as never);

    expect(
      (prisma.projectActivityThematicTag as { create: jest.Mock }).create,
    ).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
