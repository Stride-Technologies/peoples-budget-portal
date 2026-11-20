import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/index';
import { BudgetDocumentsService } from './budget-documents.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** An LEP starts from its total allocable budget; going over warns, never blocks. */
const D = (v: number) => new Prisma.Decimal(v);

function setup(doc: {
  kind: string;
  status: string;
  allocable: number | null;
}) {
  const prisma = {
    budgetDocument: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'doc',
          kind: doc.kind,
          status: doc.status,
          lepDetail: {
            allocableTotal: doc.allocable === null ? null : D(doc.allocable),
          },
          _count: { items: 1, objectLines: 0 },
          officeHeaders: [],
        }),
      ),
    },
    budgetItem: {
      aggregate: jest.fn(() => Promise.resolve({ _sum: { total: D(1200) } })),
      count: jest.fn(() => Promise.resolve(0)),
    },
    lepDetail: {
      findUnique: jest.fn(() => Promise.resolve({ allocableTotal: D(1000) })),
      upsert: jest.fn(() => Promise.resolve({})),
    },
    budgetDocumentAuditLog: { create: jest.fn(() => Promise.resolve({})) },
    aIPCycle: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  );
  const service = new BudgetDocumentsService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
  );
  return { service, prisma };
}

describe('LEP allocable total', () => {
  it('reports how far the LEP is over what the city can appropriate', async () => {
    const over = await setup({
      kind: 'LEP',
      status: 'DRAFT',
      allocable: 1000,
    }).service.findOne('doc');
    expect(over.overAllocable).toBe('200.00');
    const under = await setup({
      kind: 'LEP',
      status: 'DRAFT',
      allocable: 1500,
    }).service.findOne('doc');
    expect(under.overAllocable).toBe('-300.00');
    const none = await setup({
      kind: 'ORDINANCE',
      status: 'ENACTED',
      allocable: null,
    }).service.findOne('doc');
    expect(none.overAllocable).toBeNull();
  });

  it('refuses to start an LEP without a positive allocable total, before reading anything', async () => {
    const { service, prisma } = setup({
      kind: 'LEP',
      status: 'DRAFT',
      allocable: null,
    });
    await expect(service.carryForward('cy', 'u1', D(0))).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.aIPCycle.findUnique).not.toHaveBeenCalled();
  });

  it('revises a draft LEP and records the change; a frozen one or an Ordinance is refused', async () => {
    const { service, prisma } = setup({
      kind: 'LEP',
      status: 'DRAFT',
      allocable: 1000,
    });
    await service.setAllocableTotal('doc', D(1100), 'u1');
    expect(prisma.lepDetail.upsert).toHaveBeenCalled();
    expect(prisma.budgetDocumentAuditLog.create.mock.calls[0]).toMatchObject([
      {
        data: {
          action: 'EDITED',
          detail: { field: 'allocableTotal', from: '1000.00', to: '1100.00' },
        },
      },
    ]);
    await expect(
      setup({
        kind: 'LEP',
        status: 'SUBMITTED',
        allocable: 1000,
      }).service.setAllocableTotal('doc', D(1), 'u1'),
    ).rejects.toThrow(ConflictException);
    await expect(
      setup({
        kind: 'ORDINANCE',
        status: 'DRAFT',
        allocable: null,
      }).service.setAllocableTotal('doc', D(1), 'u1'),
    ).rejects.toThrow(BadRequestException);
  });
});
