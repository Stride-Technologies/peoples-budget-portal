import { NotFoundException } from '@nestjs/common';
import { ReferenceService } from './reference.service.js';
import { CacheService } from '../cache/cache.service.js';
import { MemoryCacheStore } from '../cache/memory-cache.store.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AIPCodesService } from '../aip-codes/aip-codes.service.js';
import { ClimatePillar, ExpenseClass } from '../generated/prisma/index';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const cluster = { id: 'cl-1', name: 'Governance', fullName: null };
const finishLine = { id: 'fl-1', name: 'Vision 6', visionNumber: 6 };
const subFinishLine = {
  id: 'sfl-1',
  code: 'FL6-A',
  name: 'Digital Services',
  finishLineId: 'fl-1',
  isActive: true,
};

const office = {
  id: 'co-1',
  name: 'City Mayor Office',
  acronym: 'CMO',
  isActive: true,
  canEndorse: false,
  lguLevel: 2,
  officeType: 'MANDATORY',
  officeCode: '01',
  clusterId: 'cl-1',
  cluster,
};

const inactiveOffice = {
  ...office,
  id: 'co-2',
  acronym: 'OLD',
  isActive: false,
};

const cso = {
  id: 'cso-1',
  name: 'Kaibigan',
  code: '001',
  isActive: true,
  canEndorse: false,
  clusterId: 'cl-1',
  cluster,
};

const papSector = {
  id: 'ps-1',
  code: '1000',
  name: 'General Public Services',
  subsectorCode: null,
  isActive: true,
};
const uacsObject = {
  id: 'uo-1',
  code: '5020301000',
  description: 'Travelling Expenses',
  expenseClass: 'MOOE',
  isActive: true,
};
const sglgIndicator = {
  id: 'si-1',
  code: 'FA_01',
  pillar: 'Financial Administration',
  name: 'Unqualified Opinion',
  dilgYear: 2025,
  isActive: true,
};
const sdgGoal = {
  id: 'sg-1',
  code: 'SDG-01',
  name: 'No Poverty',
  annexSource: 'UN 2030 Agenda',
  isActive: true,
};
const climateCode = {
  id: 'cc-1',
  code: 'CCA_001',
  pillar: ClimatePillar.ADAPTATION,
  name: 'Flood Risk',
  description: null,
  isActive: true,
};

// ─── Factory ─────────────────────────────────────────────────────────────────

function makeService() {
  const prisma = {
    cluster: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    office: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    civilSocietyOrganization: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    finishLine: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    subFinishLine: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pAPSector: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    program: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    projectActivity: {
      count: jest.fn().mockResolvedValue(0),
    },
    // Overwritten below to hand the callback the same mock, so a test that
    // stubs `prisma.office.update` sees it whether the call is transactional
    // or not.
    $transaction: jest.fn(),
    uACSObject: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    sGLGIndicator: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    sDGGoal: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    climateTypologyCode: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;

  (prisma.$transaction as jest.Mock).mockImplementation(
    (cb: (tx: unknown) => unknown) => cb(prisma),
  );

  const cache = new CacheService(new MemoryCacheStore());
  const codes = {
    resyncTentativeProgramCodes: jest.fn(),
  } as unknown as AIPCodesService;
  const service = new ReferenceService(prisma, cache, codes);
  return { service, prisma, cache, codes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Clusters
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceService — Clusters', () => {
  describe('findAllClusters()', () => {
    it('returns clusters from Prisma on cache miss', async () => {
      const { service, prisma } = makeService();
      (prisma.cluster.findMany as jest.Mock).mockResolvedValue([cluster]);

      const result = await service.findAllClusters();

      expect(result).toEqual([cluster]);
      expect(prisma.cluster.findMany).toHaveBeenCalledTimes(1);
    });

    it('serves cached result on second call', async () => {
      const { service, prisma } = makeService();
      (prisma.cluster.findMany as jest.Mock).mockResolvedValue([cluster]);

      await service.findAllClusters();
      await service.findAllClusters();

      expect(prisma.cluster.findMany).toHaveBeenCalledTimes(1);
    });

    it('filters offices to isActive: true', async () => {
      const { service, prisma } = makeService();
      (prisma.cluster.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAllClusters();

      expect(prisma.cluster.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            offices: expect.objectContaining({ where: { isActive: true } }),
          }),
        }),
      );
    });
  });

  describe('findAllClustersAdmin()', () => {
    it('always queries Prisma (no cache)', async () => {
      const { service, prisma } = makeService();
      (prisma.cluster.findMany as jest.Mock).mockResolvedValue([cluster]);

      await service.findAllClustersAdmin();
      await service.findAllClustersAdmin();

      expect(prisma.cluster.findMany).toHaveBeenCalledTimes(2);
    });

    it('includes all city offices without isActive filter', async () => {
      const { service, prisma } = makeService();
      (prisma.cluster.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAllClustersAdmin();

      const call = (prisma.cluster.findMany as jest.Mock).mock.calls[0][0];
      expect(call.include.offices).not.toHaveProperty('where');
    });
  });

  describe('updateCluster()', () => {
    it('updates and invalidates the cache', async () => {
      const { service, prisma, cache } = makeService();
      (prisma.cluster.findUnique as jest.Mock).mockResolvedValue(cluster);
      (prisma.cluster.update as jest.Mock).mockResolvedValue({
        ...cluster,
        name: 'Economy',
      });
      (prisma.cluster.findMany as jest.Mock).mockResolvedValue([cluster]);

      await service.findAllClusters(); // prime cache
      const spy = jest.spyOn(cache, 'delByPrefix');

      await service.updateCluster('cl-1', { name: 'Economy' });

      expect(prisma.cluster.update).toHaveBeenCalledWith({
        where: { id: 'cl-1' },
        data: { name: 'Economy' },
      });
      expect(spy).toHaveBeenCalled();
    });

    it('throws NotFoundException when cluster does not exist', async () => {
      const { service, prisma } = makeService();
      (prisma.cluster.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateCluster('bad-id', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// City Offices
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceService — Offices', () => {
  describe('findAllOffices()', () => {
    it('filters to isActive: true and caches', async () => {
      const { service, prisma } = makeService();
      (prisma.office.findMany as jest.Mock).mockResolvedValue([office]);

      await service.findAllOffices();
      await service.findAllOffices();

      expect(prisma.office.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.office.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('findAllOfficesAll()', () => {
    it('queries without isActive filter and does not cache', async () => {
      const { service, prisma } = makeService();
      (prisma.office.findMany as jest.Mock).mockResolvedValue([
        office,
        inactiveOffice,
      ]);

      const result = await service.findAllOfficesAll();
      await service.findAllOfficesAll();

      expect(result).toHaveLength(2);
      expect(prisma.office.findMany).toHaveBeenCalledTimes(2);
      const call = (prisma.office.findMany as jest.Mock).mock.calls[0][0];
      expect(call).not.toHaveProperty('where');
    });
  });

  describe('createOffice()', () => {
    it('creates the office and invalidates the cache', async () => {
      const { service, prisma, cache } = makeService();
      (prisma.office.create as jest.Mock).mockResolvedValue(office);
      (prisma.office.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAllOffices(); // prime cache
      const spy = jest.spyOn(cache, 'delByPrefix');

      const dto = { name: 'CMO', acronym: 'CMO', clusterId: 'cl-1' };
      const result = await service.createOffice(dto);

      expect(result).toEqual(office);
      expect(prisma.office.create).toHaveBeenCalledWith({ data: dto });
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('updateOffice()', () => {
    it('updates and invalidates the cache', async () => {
      const { service, prisma } = makeService();
      (prisma.office.findUnique as jest.Mock).mockResolvedValue(office);
      (prisma.office.update as jest.Mock).mockResolvedValue({
        ...office,
        name: 'Updated',
      });

      const result = await service.updateOffice('co-1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
      expect(prisma.office.update).toHaveBeenCalledWith({
        where: { id: 'co-1' },
        data: { name: 'Updated' },
      });
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.office.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.updateOffice('bad', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deactivateOffice()', () => {
    it('sets isActive: false and returns confirmation', async () => {
      const { service, prisma } = makeService();
      (prisma.office.findUnique as jest.Mock).mockResolvedValue(office);
      (prisma.office.update as jest.Mock).mockResolvedValue({
        ...office,
        isActive: false,
      });

      const result = await service.deactivateOffice('co-1');

      expect(result).toEqual({ message: 'Office deactivated.' });
      expect(prisma.office.update).toHaveBeenCalledWith({
        where: { id: 'co-1' },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.office.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deactivateOffice('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Civil Society Organizations
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceService — Civil Society Organizations', () => {
  describe('findAllCivilSocietyOrganizations()', () => {
    it('filters to isActive: true and caches', async () => {
      const { service, prisma } = makeService();
      (prisma.civilSocietyOrganization.findMany as jest.Mock).mockResolvedValue(
        [cso],
      );

      await service.findAllCivilSocietyOrganizations();
      await service.findAllCivilSocietyOrganizations();

      expect(prisma.civilSocietyOrganization.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.civilSocietyOrganization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('findAllCsosAll()', () => {
    it('returns all CSOs without isActive filter and does not cache', async () => {
      const { service, prisma } = makeService();
      const inactive = { ...cso, id: 'cso-2', isActive: false };
      (prisma.civilSocietyOrganization.findMany as jest.Mock).mockResolvedValue(
        [cso, inactive],
      );

      const result = await service.findAllCsosAll();
      await service.findAllCsosAll();

      expect(result).toHaveLength(2);
      expect(prisma.civilSocietyOrganization.findMany).toHaveBeenCalledTimes(2);
      const call = (prisma.civilSocietyOrganization.findMany as jest.Mock).mock
        .calls[0][0];
      expect(call).not.toHaveProperty('where');
    });
  });

  describe('createCso()', () => {
    it('creates the CSO with cluster include and invalidates cache', async () => {
      const { service, prisma, cache } = makeService();
      (prisma.civilSocietyOrganization.create as jest.Mock).mockResolvedValue(
        cso,
      );
      const spy = jest.spyOn(cache, 'delByPrefix');

      const dto = { name: 'Kaibigan', clusterId: 'cl-1' };
      const result = await service.createCso(dto);

      expect(result).toEqual(cso);
      expect(prisma.civilSocietyOrganization.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: dto }),
      );
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('updateCso()', () => {
    it('updates and returns updated CSO', async () => {
      const { service, prisma } = makeService();
      (
        prisma.civilSocietyOrganization.findUnique as jest.Mock
      ).mockResolvedValue(cso);
      (prisma.civilSocietyOrganization.update as jest.Mock).mockResolvedValue({
        ...cso,
        name: 'New Name',
      });

      const result = await service.updateCso('cso-1', { name: 'New Name' });

      expect(result.name).toBe('New Name');
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (
        prisma.civilSocietyOrganization.findUnique as jest.Mock
      ).mockResolvedValue(null);

      await expect(service.updateCso('bad', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('can restore an inactive CSO via isActive: true', async () => {
      const { service, prisma } = makeService();
      const inactive = { ...cso, isActive: false };
      (
        prisma.civilSocietyOrganization.findUnique as jest.Mock
      ).mockResolvedValue(inactive);
      (prisma.civilSocietyOrganization.update as jest.Mock).mockResolvedValue({
        ...inactive,
        isActive: true,
      });

      const result = await service.updateCso('cso-1', { isActive: true });

      expect(result.isActive).toBe(true);
      expect(prisma.civilSocietyOrganization.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: true } }),
      );
    });
  });

  describe('deactivateCso()', () => {
    it('sets isActive: false and returns confirmation', async () => {
      const { service, prisma } = makeService();
      (
        prisma.civilSocietyOrganization.findUnique as jest.Mock
      ).mockResolvedValue(cso);
      (prisma.civilSocietyOrganization.update as jest.Mock).mockResolvedValue({
        ...cso,
        isActive: false,
      });

      const result = await service.deactivateCso('cso-1');

      expect(result).toEqual({
        message: 'Civil society organization deactivated.',
      });
      expect(prisma.civilSocietyOrganization.update).toHaveBeenCalledWith({
        where: { id: 'cso-1' },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (
        prisma.civilSocietyOrganization.findUnique as jest.Mock
      ).mockResolvedValue(null);

      await expect(service.deactivateCso('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Finish Lines
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceService — Finish Lines', () => {
  describe('findAllFinishLines()', () => {
    it('returns and caches finish lines', async () => {
      const { service, prisma } = makeService();
      (prisma.finishLine.findMany as jest.Mock).mockResolvedValue([finishLine]);

      const result = await service.findAllFinishLines();
      await service.findAllFinishLines();

      expect(result).toEqual([finishLine]);
      expect(prisma.finishLine.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateFinishLine()', () => {
    it('updates and invalidates the cache', async () => {
      const { service, prisma } = makeService();
      (prisma.finishLine.findUnique as jest.Mock).mockResolvedValue(finishLine);
      (prisma.finishLine.update as jest.Mock).mockResolvedValue({
        ...finishLine,
        name: 'Updated',
      });

      const result = await service.updateFinishLine('fl-1', {
        name: 'Updated',
      });

      expect(result.name).toBe('Updated');
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.finishLine.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateFinishLine('bad', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Finish Lines
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceService — Sub-Finish Lines', () => {
  describe('findAllSubFinishLines()', () => {
    it('returns active sub-finish lines and caches the result', async () => {
      const { service, prisma } = makeService();
      (prisma.subFinishLine.findMany as jest.Mock).mockResolvedValue([
        subFinishLine,
      ]);

      const result = await service.findAllSubFinishLines();
      await service.findAllSubFinishLines();

      expect(result).toEqual([subFinishLine]);
      expect(prisma.subFinishLine.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAllSubFinishLinesAll()', () => {
    it('returns all sub-finish lines without cache', async () => {
      const { service, prisma } = makeService();
      const inactive = { ...subFinishLine, isActive: false };
      (prisma.subFinishLine.findMany as jest.Mock).mockResolvedValue([
        subFinishLine,
        inactive,
      ]);

      const result = await service.findAllSubFinishLinesAll();
      await service.findAllSubFinishLinesAll();

      expect(result).toHaveLength(2);
      expect(prisma.subFinishLine.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('createSubFinishLine()', () => {
    it('creates and invalidates the cache', async () => {
      const { service, prisma } = makeService();
      (prisma.finishLine.findUnique as jest.Mock).mockResolvedValue(finishLine);
      (prisma.subFinishLine.create as jest.Mock).mockResolvedValue(
        subFinishLine,
      );

      const result = await service.createSubFinishLine({
        code: 'FL6-A',
        name: 'Digital Services',
        finishLineId: 'fl-1',
      });

      expect(result).toEqual(subFinishLine);
      expect(prisma.subFinishLine.create).toHaveBeenCalledWith({
        data: { code: 'FL6-A', name: 'Digital Services', finishLineId: 'fl-1' },
      });
    });

    it('throws NotFoundException when the parent finish line does not exist', async () => {
      const { service, prisma } = makeService();
      (prisma.finishLine.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createSubFinishLine({
          code: 'FL6-A',
          name: 'X',
          finishLineId: 'bad',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSubFinishLine()', () => {
    it('updates and invalidates the cache', async () => {
      const { service, prisma } = makeService();
      (prisma.subFinishLine.findUnique as jest.Mock).mockResolvedValue(
        subFinishLine,
      );
      (prisma.subFinishLine.update as jest.Mock).mockResolvedValue({
        ...subFinishLine,
        name: 'Updated',
      });

      const result = await service.updateSubFinishLine('sfl-1', {
        name: 'Updated',
      });

      expect(result.name).toBe('Updated');
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.subFinishLine.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateSubFinishLine('bad', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivateSubFinishLine()', () => {
    it('sets isActive to false and returns a message', async () => {
      const { service, prisma } = makeService();
      (prisma.subFinishLine.findUnique as jest.Mock).mockResolvedValue(
        subFinishLine,
      );
      (prisma.subFinishLine.update as jest.Mock).mockResolvedValue({
        ...subFinishLine,
        isActive: false,
      });

      const result = await service.deactivateSubFinishLine('sfl-1');

      expect(result.message).toBe('Sub-development priority deactivated.');
      expect(prisma.subFinishLine.update).toHaveBeenCalledWith({
        where: { id: 'sfl-1' },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.subFinishLine.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deactivateSubFinishLine('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAP Sectors
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceService — PAP Sectors', () => {
  describe('findAllPAPSectors()', () => {
    it('returns only active sectors and caches the result', async () => {
      const { service, prisma } = makeService();
      (prisma.pAPSector.findMany as jest.Mock).mockResolvedValue([papSector]);

      await service.findAllPAPSectors();
      await service.findAllPAPSectors();

      expect(prisma.pAPSector.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.pAPSector.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('findAllPAPSectorsAll()', () => {
    it('returns all sectors without isActive filter', async () => {
      const { service, prisma } = makeService();
      const inactive = { ...papSector, id: 'ps-2', isActive: false };
      (prisma.pAPSector.findMany as jest.Mock).mockResolvedValue([
        papSector,
        inactive,
      ]);

      const result = await service.findAllPAPSectorsAll();

      expect(result).toHaveLength(2);
      const call = (prisma.pAPSector.findMany as jest.Mock).mock.calls[0][0];
      expect(call).not.toHaveProperty('where');
    });
  });

  describe('createPapSector()', () => {
    it('creates a sector and invalidates the cache', async () => {
      const { service, prisma, cache } = makeService();
      (prisma.pAPSector.create as jest.Mock).mockResolvedValue(papSector);
      const spy = jest.spyOn(cache, 'delByPrefix');

      const dto = { code: '1000', name: 'General Public Services' };
      const result = await service.createPapSector(dto);

      expect(result).toEqual(papSector);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('updatePapSector()', () => {
    it('updates the sector', async () => {
      const { service, prisma } = makeService();
      (prisma.pAPSector.findUnique as jest.Mock).mockResolvedValue(papSector);
      (prisma.pAPSector.update as jest.Mock).mockResolvedValue({
        ...papSector,
        name: 'Updated',
      });

      const result = await service.updatePapSector('ps-1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.pAPSector.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updatePapSector('bad', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivatePapSector()', () => {
    it('soft-deletes the sector', async () => {
      const { service, prisma } = makeService();
      (prisma.pAPSector.findUnique as jest.Mock).mockResolvedValue(papSector);
      (prisma.pAPSector.update as jest.Mock).mockResolvedValue({});

      const result = await service.deactivatePapSector('ps-1');

      expect(result).toEqual({ message: 'PAP sector deactivated.' });
      expect(prisma.pAPSector.update).toHaveBeenCalledWith({
        where: { id: 'ps-1' },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.pAPSector.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deactivatePapSector('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UACS Objects
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceService — UACS Objects', () => {
  describe('findAllUACSObjects()', () => {
    it('returns active objects filtered by isActive: true (cached when no filters)', async () => {
      const { service, prisma } = makeService();
      (prisma.uACSObject.findMany as jest.Mock).mockResolvedValue([uacsObject]);

      await service.findAllUACSObjects({});
      await service.findAllUACSObjects({});

      expect(prisma.uACSObject.findMany).toHaveBeenCalledTimes(1);
    });

    it('skips cache when search string is provided', async () => {
      const { service, prisma } = makeService();
      (prisma.uACSObject.findMany as jest.Mock).mockResolvedValue([uacsObject]);

      await service.findAllUACSObjects({ search: 'travel' });
      await service.findAllUACSObjects({ search: 'travel' });

      expect(prisma.uACSObject.findMany).toHaveBeenCalledTimes(2);
    });

    it('skips cache when expenseClass filter is provided', async () => {
      const { service, prisma } = makeService();
      (prisma.uACSObject.findMany as jest.Mock).mockResolvedValue([uacsObject]);

      await service.findAllUACSObjects({ expenseClass: ExpenseClass.MOOE });
      await service.findAllUACSObjects({ expenseClass: ExpenseClass.MOOE });

      expect(prisma.uACSObject.findMany).toHaveBeenCalledTimes(2);
    });

    it('passes expenseClass filter to Prisma when provided', async () => {
      const { service, prisma } = makeService();
      (prisma.uACSObject.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAllUACSObjects({ expenseClass: ExpenseClass.PS });

      expect(prisma.uACSObject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ expenseClass: ExpenseClass.PS }),
        }),
      );
    });

    it('passes search filter as OR condition to Prisma', async () => {
      const { service, prisma } = makeService();
      (prisma.uACSObject.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAllUACSObjects({ search: 'travel' });

      expect(prisma.uACSObject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });
  });

  describe('findAllUACSObjectsAll()', () => {
    it('returns all UACS objects including inactive, not cached', async () => {
      const { service, prisma } = makeService();
      const inactive = { ...uacsObject, id: 'uo-2', isActive: false };
      (prisma.uACSObject.findMany as jest.Mock).mockResolvedValue([
        uacsObject,
        inactive,
      ]);

      const result = await service.findAllUACSObjectsAll();
      await service.findAllUACSObjectsAll();

      expect(result).toHaveLength(2);
      expect(prisma.uACSObject.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('createUacsObject()', () => {
    it('creates and invalidates cache', async () => {
      const { service, prisma, cache } = makeService();
      (prisma.uACSObject.create as jest.Mock).mockResolvedValue(uacsObject);
      const spy = jest.spyOn(cache, 'delByPrefix');

      const dto = {
        code: '5020301000',
        description: 'Travelling',
        expenseClass: ExpenseClass.MOOE,
      };
      const result = await service.createUacsObject(dto);

      expect(result).toEqual(uacsObject);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('updateUacsObject()', () => {
    it('updates and invalidates cache', async () => {
      const { service, prisma } = makeService();
      (prisma.uACSObject.findUnique as jest.Mock).mockResolvedValue(uacsObject);
      (prisma.uACSObject.update as jest.Mock).mockResolvedValue({
        ...uacsObject,
        description: 'Updated',
      });

      const result = await service.updateUacsObject('uo-1', {
        description: 'Updated',
      });

      expect(result.description).toBe('Updated');
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.uACSObject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.updateUacsObject('bad', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deactivateUacsObject()', () => {
    it('soft-deletes the UACS object', async () => {
      const { service, prisma } = makeService();
      (prisma.uACSObject.findUnique as jest.Mock).mockResolvedValue(uacsObject);
      (prisma.uACSObject.update as jest.Mock).mockResolvedValue({});

      const result = await service.deactivateUacsObject('uo-1');

      expect(result).toEqual({ message: 'UACS object deactivated.' });
      expect(prisma.uACSObject.update).toHaveBeenCalledWith({
        where: { id: 'uo-1' },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.uACSObject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deactivateUacsObject('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SGLG Indicators
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceService — SGLG Indicators', () => {
  describe('findAllSGLGIndicators()', () => {
    it('defaults to isActive: true when no isActive option given', async () => {
      const { service, prisma } = makeService();
      (prisma.sGLGIndicator.findMany as jest.Mock).mockResolvedValue([
        sglgIndicator,
      ]);

      await service.findAllSGLGIndicators({});

      expect(prisma.sGLGIndicator.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('passes year filter when provided', async () => {
      const { service, prisma } = makeService();
      (prisma.sGLGIndicator.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAllSGLGIndicators({ year: 2025 });

      expect(prisma.sGLGIndicator.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ dilgYear: 2025 }),
        }),
      );
    });

    it('passes explicit isActive: false to show inactive records', async () => {
      const { service, prisma } = makeService();
      (prisma.sGLGIndicator.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAllSGLGIndicators({ isActive: false });

      expect(prisma.sGLGIndicator.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: false } }),
      );
    });

    it('caches result for the same year + isActive combination', async () => {
      const { service, prisma } = makeService();
      (prisma.sGLGIndicator.findMany as jest.Mock).mockResolvedValue([
        sglgIndicator,
      ]);

      await service.findAllSGLGIndicators({ year: 2025 });
      await service.findAllSGLGIndicators({ year: 2025 });

      expect(prisma.sGLGIndicator.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAllSGLGIndicatorsAll()', () => {
    it('returns all indicators without isActive filter', async () => {
      const { service, prisma } = makeService();
      const inactive = { ...sglgIndicator, id: 'si-2', isActive: false };
      (prisma.sGLGIndicator.findMany as jest.Mock).mockResolvedValue([
        sglgIndicator,
        inactive,
      ]);

      const result = await service.findAllSGLGIndicatorsAll();

      expect(result).toHaveLength(2);
      const call = (prisma.sGLGIndicator.findMany as jest.Mock).mock
        .calls[0][0];
      expect(call).not.toHaveProperty('where');
    });
  });

  describe('createSglgIndicator()', () => {
    it('creates an indicator and invalidates cache', async () => {
      const { service, prisma, cache } = makeService();
      (prisma.sGLGIndicator.create as jest.Mock).mockResolvedValue(
        sglgIndicator,
      );
      const spy = jest.spyOn(cache, 'delByPrefix');

      const dto = {
        code: 'FA_01',
        pillar: 'Financial Administration',
        name: 'Unqualified Opinion',
        dilgYear: 2025,
      };
      const result = await service.createSglgIndicator(dto);

      expect(result).toEqual(sglgIndicator);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('updateSglgIndicator()', () => {
    it('updates the indicator', async () => {
      const { service, prisma } = makeService();
      (prisma.sGLGIndicator.findUnique as jest.Mock).mockResolvedValue(
        sglgIndicator,
      );
      (prisma.sGLGIndicator.update as jest.Mock).mockResolvedValue({
        ...sglgIndicator,
        name: 'Updated',
      });

      const result = await service.updateSglgIndicator('si-1', {
        name: 'Updated',
      });

      expect(result.name).toBe('Updated');
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.sGLGIndicator.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.updateSglgIndicator('bad', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deactivateSglgIndicator()', () => {
    it('soft-deletes the indicator', async () => {
      const { service, prisma } = makeService();
      (prisma.sGLGIndicator.findUnique as jest.Mock).mockResolvedValue(
        sglgIndicator,
      );
      (prisma.sGLGIndicator.update as jest.Mock).mockResolvedValue({});

      const result = await service.deactivateSglgIndicator('si-1');

      expect(result).toEqual({ message: 'SGLG indicator deactivated.' });
      expect(prisma.sGLGIndicator.update).toHaveBeenCalledWith({
        where: { id: 'si-1' },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.sGLGIndicator.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deactivateSglgIndicator('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SDG Goals
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceService — SDG Goals', () => {
  describe('findAllSDGGoals()', () => {
    it('defaults to isActive: true when no isActive option given', async () => {
      const { service, prisma } = makeService();
      (prisma.sDGGoal.findMany as jest.Mock).mockResolvedValue([sdgGoal]);

      await service.findAllSDGGoals({});

      expect(prisma.sDGGoal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('passes explicit isActive: false to show inactive records', async () => {
      const { service, prisma } = makeService();
      (prisma.sDGGoal.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAllSDGGoals({ isActive: false });

      expect(prisma.sDGGoal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: false } }),
      );
    });

    it('orders by code so the zero-padded codes sort numerically', async () => {
      const { service, prisma } = makeService();
      (prisma.sDGGoal.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAllSDGGoals({});

      expect(prisma.sDGGoal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { code: 'asc' } }),
      );
    });

    it('caches result for the same isActive value', async () => {
      const { service, prisma } = makeService();
      (prisma.sDGGoal.findMany as jest.Mock).mockResolvedValue([sdgGoal]);

      await service.findAllSDGGoals({});
      await service.findAllSDGGoals({});

      expect(prisma.sDGGoal.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAllSDGGoalsAll()', () => {
    it('returns all goals without isActive filter', async () => {
      const { service, prisma } = makeService();
      const inactive = { ...sdgGoal, id: 'sg-2', isActive: false };
      (prisma.sDGGoal.findMany as jest.Mock).mockResolvedValue([
        sdgGoal,
        inactive,
      ]);

      const result = await service.findAllSDGGoalsAll();

      expect(result).toHaveLength(2);
      const call = (prisma.sDGGoal.findMany as jest.Mock).mock.calls[0][0];
      expect(call).not.toHaveProperty('where');
    });
  });

  describe('createSdgGoal()', () => {
    it('creates a goal and invalidates cache', async () => {
      const { service, prisma, cache } = makeService();
      (prisma.sDGGoal.create as jest.Mock).mockResolvedValue(sdgGoal);
      const spy = jest.spyOn(cache, 'delByPrefix');

      const result = await service.createSdgGoal({
        code: 'SDG-01',
        name: 'No Poverty',
      });

      expect(result).toEqual(sdgGoal);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('updateSdgGoal()', () => {
    it('updates the goal', async () => {
      const { service, prisma } = makeService();
      (prisma.sDGGoal.findUnique as jest.Mock).mockResolvedValue(sdgGoal);
      (prisma.sDGGoal.update as jest.Mock).mockResolvedValue({
        ...sdgGoal,
        name: 'Updated',
      });

      const result = await service.updateSdgGoal('sg-1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.sDGGoal.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.updateSdgGoal('bad', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deactivateSdgGoal()', () => {
    it('soft-deletes the goal', async () => {
      const { service, prisma } = makeService();
      (prisma.sDGGoal.findUnique as jest.Mock).mockResolvedValue(sdgGoal);
      (prisma.sDGGoal.update as jest.Mock).mockResolvedValue({});

      const result = await service.deactivateSdgGoal('sg-1');

      expect(result).toEqual({ message: 'SDG goal deactivated.' });
      expect(prisma.sDGGoal.update).toHaveBeenCalledWith({
        where: { id: 'sg-1' },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.sDGGoal.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deactivateSdgGoal('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Climate Typology Codes
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceService — Climate Typology Codes', () => {
  describe('findAllClimateTypologyCodes()', () => {
    it('returns active codes and caches the unfiltered result', async () => {
      const { service, prisma } = makeService();
      (prisma.climateTypologyCode.findMany as jest.Mock).mockResolvedValue([
        climateCode,
      ]);

      await service.findAllClimateTypologyCodes({});
      await service.findAllClimateTypologyCodes({});

      expect(prisma.climateTypologyCode.findMany).toHaveBeenCalledTimes(1);
    });

    it('passes pillar filter when provided (cached per-pillar key)', async () => {
      const { service, prisma } = makeService();
      (prisma.climateTypologyCode.findMany as jest.Mock).mockResolvedValue([
        climateCode,
      ]);

      await service.findAllClimateTypologyCodes({
        pillar: ClimatePillar.ADAPTATION,
      });
      await service.findAllClimateTypologyCodes({
        pillar: ClimatePillar.ADAPTATION,
      });

      // second call is served from cache — DB hit only once
      expect(prisma.climateTypologyCode.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.climateTypologyCode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ pillar: ClimatePillar.ADAPTATION }),
        }),
      );
    });

    it('uses separate cache entries for different pillars', async () => {
      const { service, prisma } = makeService();
      (prisma.climateTypologyCode.findMany as jest.Mock).mockResolvedValue([
        climateCode,
      ]);

      await service.findAllClimateTypologyCodes({
        pillar: ClimatePillar.ADAPTATION,
      });
      await service.findAllClimateTypologyCodes({
        pillar: ClimatePillar.MITIGATION,
      });

      expect(prisma.climateTypologyCode.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('findAllClimateTypologyCodesAll()', () => {
    it('returns all codes without isActive filter', async () => {
      const { service, prisma } = makeService();
      const inactive = { ...climateCode, id: 'cc-2', isActive: false };
      (prisma.climateTypologyCode.findMany as jest.Mock).mockResolvedValue([
        climateCode,
        inactive,
      ]);

      const result = await service.findAllClimateTypologyCodesAll();
      await service.findAllClimateTypologyCodesAll();

      expect(result).toHaveLength(2);
      expect(prisma.climateTypologyCode.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('createClimateTypologyCode()', () => {
    it('creates a code and invalidates cache', async () => {
      const { service, prisma, cache } = makeService();
      (prisma.climateTypologyCode.create as jest.Mock).mockResolvedValue(
        climateCode,
      );
      const spy = jest.spyOn(cache, 'delByPrefix');

      const dto = {
        code: 'CCA_001',
        pillar: ClimatePillar.ADAPTATION,
        name: 'Flood Risk',
      };
      const result = await service.createClimateTypologyCode(dto);

      expect(result).toEqual(climateCode);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('updateClimateTypologyCode()', () => {
    it('updates the code', async () => {
      const { service, prisma } = makeService();
      (prisma.climateTypologyCode.findUnique as jest.Mock).mockResolvedValue(
        climateCode,
      );
      (prisma.climateTypologyCode.update as jest.Mock).mockResolvedValue({
        ...climateCode,
        name: 'Updated',
      });

      const result = await service.updateClimateTypologyCode('cc-1', {
        name: 'Updated',
      });

      expect(result.name).toBe('Updated');
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.climateTypologyCode.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.updateClimateTypologyCode('bad', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivateClimateTypologyCode()', () => {
    it('soft-deletes the code', async () => {
      const { service, prisma } = makeService();
      (prisma.climateTypologyCode.findUnique as jest.Mock).mockResolvedValue(
        climateCode,
      );
      (prisma.climateTypologyCode.update as jest.Mock).mockResolvedValue({});

      const result = await service.deactivateClimateTypologyCode('cc-1');

      expect(result).toEqual({ message: 'Climate typology code deactivated.' });
      expect(prisma.climateTypologyCode.update).toHaveBeenCalledWith({
        where: { id: 'cc-1' },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException for unknown id', async () => {
      const { service, prisma } = makeService();
      (prisma.climateTypologyCode.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.deactivateClimateTypologyCode('bad'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache invalidation — cross-cutting
// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceService — cache invalidation', () => {
  it('every mutating method calls delByPrefix with the reference prefix', async () => {
    const { service, prisma, cache } = makeService();
    const spy = jest.spyOn(cache, 'delByPrefix');

    // Set up mocks for all mutations we'll call
    (prisma.cluster.findUnique as jest.Mock).mockResolvedValue(cluster);
    (prisma.cluster.update as jest.Mock).mockResolvedValue(cluster);
    (prisma.office.findUnique as jest.Mock).mockResolvedValue(office);
    (prisma.office.create as jest.Mock).mockResolvedValue(office);
    (prisma.office.update as jest.Mock).mockResolvedValue(office);
    (prisma.civilSocietyOrganization.findUnique as jest.Mock).mockResolvedValue(
      cso,
    );
    (prisma.civilSocietyOrganization.create as jest.Mock).mockResolvedValue(
      cso,
    );
    (prisma.civilSocietyOrganization.update as jest.Mock).mockResolvedValue(
      cso,
    );
    (prisma.finishLine.findUnique as jest.Mock).mockResolvedValue(finishLine);
    (prisma.finishLine.update as jest.Mock).mockResolvedValue(finishLine);
    (prisma.pAPSector.findUnique as jest.Mock).mockResolvedValue(papSector);
    (prisma.pAPSector.create as jest.Mock).mockResolvedValue(papSector);
    (prisma.pAPSector.update as jest.Mock).mockResolvedValue(papSector);
    (prisma.uACSObject.findUnique as jest.Mock).mockResolvedValue(uacsObject);
    (prisma.uACSObject.create as jest.Mock).mockResolvedValue(uacsObject);
    (prisma.uACSObject.update as jest.Mock).mockResolvedValue(uacsObject);
    (prisma.sGLGIndicator.findUnique as jest.Mock).mockResolvedValue(
      sglgIndicator,
    );
    (prisma.sGLGIndicator.create as jest.Mock).mockResolvedValue(sglgIndicator);
    (prisma.sGLGIndicator.update as jest.Mock).mockResolvedValue(sglgIndicator);
    (prisma.climateTypologyCode.findUnique as jest.Mock).mockResolvedValue(
      climateCode,
    );
    (prisma.climateTypologyCode.create as jest.Mock).mockResolvedValue(
      climateCode,
    );
    (prisma.climateTypologyCode.update as jest.Mock).mockResolvedValue(
      climateCode,
    );

    await service.updateCluster('cl-1', { name: 'X' });
    await service.createOffice({ name: 'X', acronym: 'X', clusterId: 'cl-1' });
    await service.updateOffice('co-1', { name: 'X' });
    await service.deactivateOffice('co-1');
    await service.createCso({ name: 'X', clusterId: 'cl-1' });
    await service.updateCso('cso-1', { name: 'X' });
    await service.deactivateCso('cso-1');
    await service.updateFinishLine('fl-1', { name: 'X' });
    await service.createPapSector({ code: '1000', name: 'X' });
    await service.updatePapSector('ps-1', { name: 'X' });
    await service.deactivatePapSector('ps-1');
    await service.createUacsObject({
      code: '5020301000',
      description: 'X',
      expenseClass: ExpenseClass.MOOE,
    });
    await service.updateUacsObject('uo-1', { description: 'X' });
    await service.deactivateUacsObject('uo-1');
    await service.createSglgIndicator({
      code: 'FA_01',
      pillar: 'X',
      name: 'X',
      dilgYear: 2025,
    });
    await service.updateSglgIndicator('si-1', { name: 'X' });
    await service.deactivateSglgIndicator('si-1');
    await service.createClimateTypologyCode({
      code: 'CCA_001',
      pillar: ClimatePillar.ADAPTATION,
      name: 'X',
    });
    await service.updateClimateTypologyCode('cc-1', { name: 'X' });
    await service.deactivateClimateTypologyCode('cc-1');

    // Every mutation should have called delByPrefix
    // One per `await service.*` mutation above; was 23 before the DBM office
    // methods were removed with the two-table office split.
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(20);
    spy.mock.calls.forEach((call) => {
      expect(call[0]).toMatch(/^ref:/);
    });
  });
});
