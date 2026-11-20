import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AIPCycleStatus, ProgramStatus } from '../generated/prisma/index';
import { AIPCyclesService } from './aip-cycles.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CacheService } from '../cache/cache.service.js';
import type { RegistryCacheService } from '../cache/registry-cache.service.js';

function setup(exists = true) {
  const prisma = {
    aIPCycle: {
      findUnique: jest.fn(() => Promise.resolve(exists ? { id: 'c1' } : null)),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'c1', ...data }),
      ),
    },
  };
  const cache = { del: jest.fn(() => Promise.resolve()) };
  const registryCache = {
    invalidatePublicRegistry: jest.fn(() => Promise.resolve()),
  };
  const service = new AIPCyclesService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
    registryCache as unknown as RegistryCacheService,
  );
  return { service, prisma, registryCache };
}

describe('AIPCyclesService.setOpenData', () => {
  it('sets the flag and drops the public cache that holds the bundle', async () => {
    const { service, prisma, registryCache } = setup();
    await expect(service.setOpenData('c1', true)).resolves.toMatchObject({
      openDataEnabled: true,
    });
    expect(prisma.aIPCycle.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { openDataEnabled: true },
    });
    expect(registryCache.invalidatePublicRegistry).toHaveBeenCalled();
  });

  it('404s on an unknown cycle without writing', async () => {
    const { service, prisma } = setup(false);
    await expect(service.setOpenData('nope', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.aIPCycle.update).not.toHaveBeenCalled();
  });
});

describe('AIPCyclesService.transitionStatus → ADOPTED (specs/012)', () => {
  function adoptSetup(status: string, unfinished: number) {
    const prisma = {
      aIPCycle: {
        findUnique: jest.fn(() => Promise.resolve({ id: 'c1', status })),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'c1', ...data }),
        ),
      },
      program: { count: jest.fn(() => Promise.resolve(unfinished)) },
    };
    const service = new AIPCyclesService(
      prisma as unknown as PrismaService,
      { del: jest.fn(() => Promise.resolve()) } as unknown as CacheService,
      {} as unknown as RegistryCacheService,
    );
    return { service, prisma };
  }

  // #81: a cycle of published programs could never reach LOCKED.
  it('adopts a CLOSED cycle whose programs are all published', async () => {
    const { service, prisma } = adoptSetup('CLOSED', 0);
    await expect(
      service.transitionStatus('c1', AIPCycleStatus.ADOPTED),
    ).resolves.toMatchObject({ status: AIPCycleStatus.ADOPTED });
    expect(prisma.program.count).toHaveBeenCalledWith({
      where: {
        aipCycleId: 'c1',
        deletedAt: null,
        status: {
          notIn: [
            ProgramStatus.PUBLISHED,
            ProgramStatus.APPROVED,
            ProgramStatus.REJECTED,
            ProgramStatus.ARCHIVED,
          ],
        },
      },
    });
  });

  it('treats a request for LOCKED as ADOPTED', async () => {
    const { service } = adoptSetup('CLOSED', 0);
    await expect(
      service.transitionStatus('c1', AIPCycleStatus.LOCKED),
    ).resolves.toMatchObject({ status: AIPCycleStatus.ADOPTED });
  });

  it('refuses while drafts or unpublished revisions remain', async () => {
    const { service } = adoptSetup('CLOSED', 3);
    await expect(
      service.transitionStatus('c1', AIPCycleStatus.ADOPTED),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses from any state but CLOSED', async () => {
    const { service } = adoptSetup('OPEN', 0);
    await expect(
      service.transitionStatus('c1', AIPCycleStatus.ADOPTED),
    ).rejects.toThrow(BadRequestException);
  });
});
