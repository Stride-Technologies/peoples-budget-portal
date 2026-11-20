import { BadRequestException, ConflictException } from '@nestjs/common';
import { PpmpService } from './ppmp.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OfficeScopeService } from '../permissions/office-scope.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { Prisma, Role } from '../generated/prisma/index';

/** specs/012 P5: line links and the Final PPMP. */
const user = {
  sub: 'user-1',
  role: Role.STAFF,
  officeId: 'office-1',
} as JwtPayload;
const scope = {
  assertOfficeInScope: jest.fn(() => Promise.resolve()),
} as unknown as OfficeScopeService;

const line = (id: string, link: Record<string, string | null> = {}) => ({
  id,
  ppmpId: 'ind-1',
  lineItemName: `Line ${id}`,
  quantity: new Prisma.Decimal(1),
  unitCost: new Prisma.Decimal(100),
  lineTotal: new Prisma.Decimal(100),
  uacsObjectId: 'uacs-1',
  orderIndex: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  programId: null,
  projectActivityId: null,
  budgetItemId: null,
  program: null,
  projectActivity: null,
  budgetItem: null,
  ...link,
});

function setup({
  kind = 'INDICATIVE',
  ordinance = true,
  existingFinal = false,
}: { kind?: string; ordinance?: boolean; existingFinal?: boolean } = {}) {
  const create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'fin-1', ...data, lineItems: [] }),
  );
  const prisma = {
    pPMP: {
      findUnique: jest.fn(({ where }: { where: Record<string, string> }) =>
        Promise.resolve(
          where.id
            ? {
                id: 'ind-1',
                kind,
                officeId: 'office-1',
                aipCycleId: 'cy-2027',
                name: 'Medicines',
                fundingProgram: 'Health',
                classification: 'OPERATIONS',
                lineItems: [
                  line('a', { projectActivityId: 'pa-1' }),
                  line('b', { programId: 'p-gone' }),
                  line('c'),
                ],
              }
            : existingFinal
              ? { id: 'fin-0' }
              : null,
        ),
      ),
      create,
    },
    pPMPLineItem: {
      findUnique: jest.fn(() => Promise.resolve({ id: 'a', ppmpId: 'ind-1' })),
      update: jest.fn(({ data }: { data: unknown }) => Promise.resolve(data)),
    },
    budgetDocument: {
      findFirst: jest.fn(() =>
        Promise.resolve(ordinance ? { id: 'ord-2027' } : null),
      ),
    },
    budgetItem: {
      findMany: jest.fn(({ where }: { where: { documentId?: string } }) =>
        Promise.resolve(
          where.documentId
            ? [
                {
                  id: 'item-1',
                  sourceProgramId: null,
                  sourceProjectActivityId: 'pa-1',
                  sourceItemId: null,
                },
              ]
            : [],
        ),
      ),
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
    program: { findFirst: jest.fn(() => Promise.resolve({ id: 'p-1' })) },
    projectActivity: { findFirst: jest.fn(() => Promise.resolve(null)) },
  };
  const service = new PpmpService(
    prisma as unknown as PrismaService,
    scope,
    {} as StorageService,
  );
  return { service, prisma, create };
}

describe('PPMP Final (specs/012 D9)', () => {
  it('copies every line, relinks the matched ones and lists the rest', async () => {
    const { service, create } = setup();
    const { unmatched } = await service.createFinal('ind-1', user);
    const data = create.mock.calls[0][0].data as {
      kind: string;
      sourcePpmpId: string;
      lineItems: { create: Record<string, unknown>[] };
    };
    expect(data).toMatchObject({ kind: 'FINAL', sourcePpmpId: 'ind-1' });
    const lines = data.lineItems.create;
    expect(lines.map((l) => l.budgetItemId)).toEqual(['item-1', null, null]);
    // No AIP link, no id, no parent survives the copy.
    for (const l of lines) {
      expect(l).not.toHaveProperty('id');
      expect(l).not.toHaveProperty('ppmpId');
      expect(l).not.toHaveProperty('projectActivityId');
      expect(l).not.toHaveProperty('programId');
    }
    // Line c had no link to relink, so it is not reported.
    expect(unmatched).toEqual([
      { lineItemId: 'b', lineItemName: 'Line b', reason: 'none' },
    ]);
  });

  it('is refused before the Ordinance is enacted', async () => {
    const { service, create } = setup({ ordinance: false });
    await expect(service.createFinal('ind-1', user)).rejects.toThrow(
      ConflictException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('is refused twice and from a Final', async () => {
    await expect(
      setup({ existingFinal: true }).service.createFinal('ind-1', user),
    ).rejects.toThrow(ConflictException);
    await expect(
      setup({ kind: 'FINAL' }).service.createFinal('ind-1', user),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('PPMP line links (specs/012 D8)', () => {
  it("links an Indicative line to its office's AIP program and clears it", async () => {
    const { service, prisma } = setup();
    await service.setLineLink('ind-1', 'a', { programId: 'p-1' }, user);
    expect(prisma.pPMPLineItem.update.mock.calls[0][0]).toMatchObject({
      data: { programId: 'p-1', projectActivityId: null, budgetItemId: null },
    });
    await service.setLineLink('ind-1', 'a', {}, user);
    expect(prisma.pPMPLineItem.update.mock.calls[1][0]).toMatchObject({
      data: { programId: null, projectActivityId: null, budgetItemId: null },
    });
  });

  it('refuses two links, the wrong kind of row, or a row from elsewhere', async () => {
    const { service } = setup();
    await expect(
      service.setLineLink(
        'ind-1',
        'a',
        { programId: 'p-1', projectActivityId: 'pa-1' },
        user,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.setLineLink('ind-1', 'a', { budgetItemId: 'item-1' }, user),
    ).rejects.toThrow(/Indicative/);
    await expect(
      service.setLineLink('ind-1', 'a', { projectActivityId: 'pa-x' }, user),
    ).rejects.toThrow(/not this office/);
    await expect(
      setup({ kind: 'FINAL' }).service.setLineLink(
        'ind-1',
        'a',
        { programId: 'p-1' },
        user,
      ),
    ).rejects.toThrow(/Final/);
  });
});
