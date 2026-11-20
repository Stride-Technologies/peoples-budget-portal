import { ConflictException } from '@nestjs/common';
import { ThematicTagsService } from './thematic-tags.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { IdentityType, Role } from '../generated/prisma/index';

const user: JwtPayload = {
  sub: 'u-1',
  role: Role.STAFF,
  email: 'u@x.com',
  firstName: 'U',
  lastName: 'S',
  identityType: IdentityType.LGU,
  officeId: 'office-A',
  civilSocietyOrganizationId: null,
};

describe('ThematicTagsService.findOrCreate', () => {
  it('returns the existing row for a case/whitespace-normalized match (FR-007)', async () => {
    const existing = { id: 't-1', name: 'PWD', normalizedName: 'pwd' };
    const prisma = {
      thematicTag: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findMany: jest.fn(),
        create: jest.fn(),
      },
    } as unknown as PrismaService;
    const service = new ThematicTagsService(prisma);

    const result = await service.findOrCreate({ name: ' pwd ' }, user);

    expect(result).toEqual({ tag: existing, created: false });
    expect(prisma.thematicTag.create).not.toHaveBeenCalled();
  });

  it('409s with a close-match hint when text is a near-miss, no confirmNew (FR-007a)', async () => {
    const seniorCitizens = {
      id: 't-2',
      name: 'Senior Citizens',
      normalizedName: 'senior citizens',
    };
    const prisma = {
      thematicTag: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([seniorCitizens]),
        create: jest.fn(),
      },
    } as unknown as PrismaService;
    const service = new ThematicTagsService(prisma);

    await expect(
      service.findOrCreate({ name: 'Senior Citizen' }, user),
    ).rejects.toMatchObject({
      response: {
        closeMatch: { id: 't-2', name: 'Senior Citizens' },
      },
    });
    expect(prisma.thematicTag.create).not.toHaveBeenCalled();
  });

  it('creates a second, separate row when confirmNew is true despite a close match', async () => {
    const seniorCitizens = {
      id: 't-2',
      name: 'Senior Citizens',
      normalizedName: 'senior citizens',
    };
    const created = { id: 't-3', name: 'Senior Citizen' };
    const prisma = {
      thematicTag: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([seniorCitizens]),
        create: jest.fn().mockResolvedValue(created),
      },
    } as unknown as PrismaService;
    const service = new ThematicTagsService(prisma);

    const result = await service.findOrCreate(
      { name: 'Senior Citizen', confirmNew: true },
      user,
    );

    expect(result).toEqual({ tag: created, created: true });
    expect(prisma.thematicTag.create).toHaveBeenCalledWith({
      data: {
        name: 'Senior Citizen',
        normalizedName: 'senior citizen',
        createdByUserId: 'u-1',
      },
    });
  });

  it('creates a brand-new tag outright when nothing is close', async () => {
    const created = { id: 't-4', name: 'Solo Parents' };
    const prisma = {
      thematicTag: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(created),
      },
    } as unknown as PrismaService;
    const service = new ThematicTagsService(prisma);

    const result = await service.findOrCreate({ name: 'Solo Parents' }, user);

    expect(result).toEqual({ tag: created, created: true });
  });
});

describe('ThematicTagsService.list', () => {
  it('defaults to active-only, matching the picker search semantics', async () => {
    const prisma = {
      thematicTag: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new ThematicTagsService(prisma);

    await service.list({ search: 'solo' });

    expect(prisma.thematicTag.findMany).toHaveBeenCalledWith({
      where: { isActive: true, normalizedName: { contains: 'solo' } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isActive: true },
    });
  });
});

describe('ThematicTagsService.update (rename/deactivate)', () => {
  it('rejects a rename that collides with another active tag (normalized)', async () => {
    const prisma = {
      thematicTag: {
        findFirst: jest.fn().mockResolvedValue({ id: 'other', name: 'Youth' }),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const service = new ThematicTagsService(prisma);

    await expect(
      service.update('t-1', { name: ' youth ' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.thematicTag.update).not.toHaveBeenCalled();
  });

  it('propagates a rename with no collision', async () => {
    const updated = { id: 't-1', name: 'Women and Girls' };
    const prisma = {
      thematicTag: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(updated),
      },
    } as unknown as PrismaService;
    const service = new ThematicTagsService(prisma);

    const result = await service.update('t-1', { name: 'Women and Girls' });

    expect(result).toEqual(updated);
    expect(prisma.thematicTag.update).toHaveBeenCalledWith({
      where: { id: 't-1' },
      data: { name: 'Women and Girls', normalizedName: 'women and girls' },
    });
  });

  it('listAll reports each tag with an accurate usageCount, active and inactive alike', async () => {
    const prisma = {
      thematicTag: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 't-1',
            name: 'Youth',
            isActive: true,
            createdAt: new Date('2026-01-01'),
            _count: { programTags: 3, paTags: 2 },
          },
          {
            id: 't-2',
            name: 'Solo Parents',
            isActive: false,
            createdAt: new Date('2026-02-01'),
            _count: { programTags: 0, paTags: 0 },
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new ThematicTagsService(prisma);

    const result = await service.listAll();

    expect(result).toEqual([
      expect.objectContaining({ id: 't-1', usageCount: 5, isActive: true }),
      expect.objectContaining({ id: 't-2', usageCount: 0, isActive: false }),
    ]);
  });

  it('deactivates without touching name fields', async () => {
    const prisma = {
      thematicTag: {
        update: jest.fn().mockResolvedValue({ id: 't-1', isActive: false }),
      },
    } as unknown as PrismaService;
    const service = new ThematicTagsService(prisma);

    await service.update('t-1', { isActive: false });

    expect(prisma.thematicTag.update).toHaveBeenCalledWith({
      where: { id: 't-1' },
      data: { isActive: false },
    });
  });
});
