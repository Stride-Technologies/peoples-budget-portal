import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/index';
import { BudgetDocumentsService } from './budget-documents.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OfficeScopeService } from '../permissions/office-scope.service.js';
import type { RegistryCacheService } from '../cache/registry-cache.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';

const d = (v: number) => new Prisma.Decimal(v);

function setup(
  doc: { kind: 'LEP' | 'ORDINANCE'; status: string } | null,
  fiscalYear = 2027,
) {
  const prisma = {
    budgetCycle: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ fiscalYear }),
    },
    budgetDocument: {
      findUnique: jest
        .fn()
        .mockResolvedValue(doc ? { id: 'doc', ...doc } : null),
      update: jest.fn(({ data }: { data: object }) =>
        Promise.resolve({ id: 'doc', ...doc, ...data }),
      ),
    },
    budgetItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    budgetDocumentAuditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  // Set after the literal so `prisma` is not self-referential (which types it `any`).
  prisma.$transaction.mockImplementation(
    (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  );
  const registryCache = {
    invalidatePublicRegistry: jest.fn().mockResolvedValue(undefined),
  };
  const officeScope = { effectiveOfficeIds: jest.fn() };
  const service = new BudgetDocumentsService(
    prisma as unknown as PrismaService,
    officeScope as unknown as OfficeScopeService,
    registryCache as unknown as RegistryCacheService,
  );
  return { service, prisma, registryCache, officeScope };
}

describe('BudgetDocumentsService.finalize', () => {
  it('enacts an Ordinance with nothing flagged, audits it, and drops the public cache', async () => {
    const { service, prisma, registryCache } = setup({
      kind: 'ORDINANCE',
      status: 'DRAFT',
    });
    await expect(service.finalize('doc', 'u-1')).resolves.toMatchObject({
      status: 'ENACTED',
    });
    expect(prisma.budgetDocumentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'FINALIZED',
        actorUserId: 'u-1',
      }),
    });
    expect(registryCache.invalidatePublicRegistry).toHaveBeenCalled();
  });

  it("submits a current year's LEP (no warnings gate: it is not public)", async () => {
    const { service, prisma } = setup({ kind: 'LEP', status: 'DRAFT' });
    prisma.budgetItem.findMany.mockResolvedValue([
      { id: 'i-1', importWarnings: ['x'] },
    ]);
    await expect(service.finalize('doc', 'u-1')).resolves.toMatchObject({
      status: 'SUBMITTED',
    });
  });

  // specs/017 FR-002: a historical LEP is the year's public Annual document.
  it("refuses to submit a historical year's LEP while a PPA is flagged", async () => {
    const { service, prisma } = setup({ kind: 'LEP', status: 'DRAFT' }, 2025);
    prisma.budgetItem.findMany.mockResolvedValue([
      {
        id: 'i-1',
        aipReferenceCode: 'X',
        name: 'OCR row',
        importWarnings: ['x'],
      },
    ]);
    const err = await service.finalize('doc', 'u-1').catch((e: unknown) => e);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: 'DOCUMENT_HAS_IMPORT_WARNINGS',
    });
    expect(prisma.budgetDocument.update).not.toHaveBeenCalled();
  });

  it('refuses to enact while a PPA still carries an import warning, listing it', async () => {
    const { service, prisma } = setup({ kind: 'ORDINANCE', status: 'DRAFT' });
    prisma.budgetItem.findMany.mockResolvedValue([
      {
        id: 'i-1',
        aipReferenceCode: 'X',
        name: 'Uncoded row',
        importWarnings: ['no code'],
      },
    ]);
    const err = await service.finalize('doc', 'u-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: 'DOCUMENT_HAS_IMPORT_WARNINGS',
      items: [expect.objectContaining({ id: 'i-1' })],
    });
    expect(prisma.budgetDocument.update).not.toHaveBeenCalled();
  });

  it.each(['SUBMITTED', 'ENACTED'])(
    'refuses a %s document (frozen, no reopen)',
    async (status) => {
      const { service } = setup({ kind: 'ORDINANCE', status });
      const err = await service.finalize('doc', 'u-1').catch((e: unknown) => e);
      expect((err as ConflictException).getResponse()).toMatchObject({
        code: 'DOCUMENT_FROZEN',
      });
    },
  );

  it('404s an unknown document', async () => {
    const { service } = setup(null);
    await expect(service.finalize('nope', 'u-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('BudgetDocumentsService.acknowledgeImport', () => {
  it("clears one PPA's warnings and records what was cleared", async () => {
    const { service, prisma } = setup({ kind: 'ORDINANCE', status: 'DRAFT' });
    prisma.budgetItem.findFirst.mockResolvedValue({
      importWarnings: ['duplicated code'],
    });
    await service.acknowledgeImport('doc', 'i-1', 'u-1');
    expect(prisma.budgetItem.update).toHaveBeenCalledWith({
      where: { id: 'i-1' },
      data: { importWarnings: [] },
    });
    expect(prisma.budgetDocumentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ACKNOWLEDGED',
        itemId: 'i-1',
        detail: { cleared: ['duplicated code'] },
      }),
    });
  });

  it('refuses once the document is frozen', async () => {
    const { service } = setup({ kind: 'ORDINANCE', status: 'ENACTED' });
    await expect(
      service.acknowledgeImport('doc', 'i-1', 'u-1'),
    ).rejects.toThrow(ConflictException);
  });
});

describe('BudgetDocumentsService.recomputeTotals', () => {
  const node = (
    id: string,
    parentId: string | null,
    rootItemId: string,
    own: number,
    total = 0,
  ) => ({
    id,
    parentId,
    rootItemId,
    officeId: 'o',
    hostOfficeId: null,
    papClass: null,
    aipReferenceCode: null,
    name: id,
    majorFinalOutput: null,
    performanceIndicator: null,
    target: null,
    ps: d(own),
    mooe: d(0),
    fe: d(0),
    co: d(0),
    unsplit: d(0),
    total: d(total),
    fundSource: null,
    orderIndex: 0,
  });

  it('writes own + Σ children, only where it changed', async () => {
    const { service, prisma } = setup({ kind: 'ORDINANCE', status: 'DRAFT' });
    prisma.budgetItem.findMany.mockResolvedValue([
      node('r', null, 'r', 10, 0),
      node('a', 'r', 'r', 5, 25), // already right: 5 own + 20 below
      node('b', 'a', 'r', 20, 0),
    ]);
    await expect(service.recomputeTotals('doc')).resolves.toEqual({
      items: 3,
      changed: 3 - 1,
    });
    expect(prisma.budgetItem.update).toHaveBeenCalledWith({
      where: { id: 'r' },
      data: { total: d(35) },
    });
    expect(prisma.budgetItem.update).toHaveBeenCalledWith({
      where: { id: 'b' },
      data: { total: d(20) },
    });
  });

  it('refuses a child whose root differs from its parent', async () => {
    const { service, prisma } = setup({ kind: 'ORDINANCE', status: 'DRAFT' });
    prisma.budgetItem.findMany.mockResolvedValue([
      node('r', null, 'r', 1),
      node('a', 'r', 'other', 1),
    ]);
    await expect(service.recomputeTotals('doc')).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('BudgetDocumentsService.items scope', () => {
  const user = { sub: 'u' } as JwtPayload;

  it('reads nothing for a user with no office scope (never OR: [])', async () => {
    const { service, prisma, officeScope } = setup({
      kind: 'ORDINANCE',
      status: 'DRAFT',
    });
    officeScope.effectiveOfficeIds.mockResolvedValue([]);
    await service.items('doc', user);
    const where = prisma.budgetItem.findMany.mock.calls[0][0].where as {
      AND: object[];
    };
    expect(where.AND).toContainEqual({ id: { in: [] } });
  });

  it('reads an office or its hosted rows for a scoped user', async () => {
    const { service, prisma, officeScope } = setup({
      kind: 'ORDINANCE',
      status: 'DRAFT',
    });
    officeScope.effectiveOfficeIds.mockResolvedValue(['o-1']);
    await service.items('doc', user);
    const where = prisma.budgetItem.findMany.mock.calls[0][0].where as {
      AND: object[];
    };
    expect(where.AND).toContainEqual({
      OR: [{ officeId: { in: ['o-1'] } }, { hostOfficeId: { in: ['o-1'] } }],
    });
  });
});
