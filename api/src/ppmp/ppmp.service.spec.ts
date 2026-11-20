import { BadRequestException, ConflictException } from '@nestjs/common';
import { PpmpService } from './ppmp.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OfficeScopeService } from '../permissions/office-scope.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import {
  ExpenseClass,
  FundSource,
  Prisma,
  PpmpClassification,
  PPMPProjectType,
  PPMPProcurementMode,
  Role,
} from '../generated/prisma/index';

const officeUser: JwtPayload = {
  sub: 'user-1',
  role: Role.STAFF,
  email: 'a@x.com',
  firstName: 'A',
  lastName: 'B',
  identityType: null,
  officeId: 'office-1',
  civilSocietyOrganizationId: null,
};

const officeScopeStub = () =>
  ({
    assertOfficeInScope: jest.fn((u: JwtPayload, officeId: string | null) =>
      u.officeId && u.officeId === officeId
        ? Promise.resolve()
        : Promise.reject(new Error('out of scope')),
    ),
    officeScopeWhere: jest.fn((u: JwtPayload) =>
      Promise.resolve(
        u.officeId
          ? { officeId: { in: [u.officeId] } }
          : { officeId: { in: [] } },
      ),
    ),
  }) as unknown as OfficeScopeService;

const storageStub = () =>
  ({
    save: jest.fn().mockResolvedValue({
      url: 'http://localhost:8000/api/v1/ppmp/uploads/file.pdf',
      key: 'file.pdf',
    }),
  }) as unknown as StorageService;

/** Array-form `$transaction` mock: the ops are already-called promises. */
const transactionStub = () =>
  jest.fn((ops: Promise<unknown>[]) => Promise.all(ops));

const uacsSnapshot = {
  id: 'uacs-1',
  code: '5-02-03-990',
  description: 'Other MOOE',
  expenseClass: ExpenseClass.MOOE,
  isActive: true,
};

const dateFields = {
  preProcurementConferenceRequired: false,
  procurementStartMonth: 1,
  procurementStartYear: 2027,
  procurementEndMonth: 12,
  procurementEndYear: 2027,
  deliveryPeriod: 'within 30 days of PO',
};

describe('PpmpService.create', () => {
  it('creates a Project from the name and fundingProgram typed directly', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'ppmp-1',
      officeId: 'office-1',
      aipCycleId: 'cycle-1',
      name: 'Conduct of Capacity Building',
      fundingProgram: '1000-2-02-22-002-002-000',
      lineItems: [],
    });
    const prisma = {
      office: { findUnique: jest.fn().mockResolvedValue({ id: 'office-1' }) },
      aIPCycle: { findUnique: jest.fn().mockResolvedValue({ id: 'cycle-1' }) },
      pPMP: { create },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    const result = await service.create(
      {
        officeId: 'office-1',
        aipCycleId: 'cycle-1',
        name: 'Conduct of Capacity Building',
        fundingProgram: '1000-2-02-22-002-002-000',
        classification: PpmpClassification.OPERATIONS,
      },
      officeUser,
    );

    expect(result.grandTotal.toString()).toBe('0');
    const { data } = create.mock.calls[0][0] as {
      data: { name: string; fundingProgram: string };
    };
    expect(data.name).toBe('Conduct of Capacity Building');
    expect(data.fundingProgram).toBe('1000-2-02-22-002-002-000');
  });

  it('rejects when officeId is outside the caller’s scope', async () => {
    const prisma = {} as unknown as PrismaService;
    const service = new PpmpService(prisma, officeScopeStub(), storageStub());

    await expect(
      service.create(
        {
          officeId: 'office-2',
          aipCycleId: 'cycle-1',
          name: 'Conduct of Capacity Building',
          fundingProgram: '1000-2-02-22-002-002-000',
          classification: PpmpClassification.OPERATIONS,
        },
        officeUser,
      ),
    ).rejects.toThrow();
  });
});

describe('PpmpService.addLineItem', () => {
  it('computes lineTotal as quantity * unitCost with Decimal precision', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      $transaction: transactionStub(),
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          aipReferenceCode: '1000-2-02-22-002-002-000',
          lineItems: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      uACSObject: { findUnique: jest.fn().mockResolvedValue(uacsSnapshot) },
      pPMPLineItem: { create },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.addLineItem(
      'ppmp-1',
      {
        lineItemName: 'Conduct of Capacity Building',
        typeOfProject: PPMPProjectType.GOODS,
        modeOfProcurement: PPMPProcurementMode.SMALL_VALUE_PROCUREMENT,
        uacsObjectId: 'uacs-1',
        quantity: '10.00',
        unit: 'box',
        unitCost: '250.00',
        fundSource: FundSource.GF,
        expenseClass: ExpenseClass.MOOE,
        ...dateFields,
      },
      officeUser,
    );

    const { data } = create.mock.calls[0][0] as {
      data: { lineTotal: Prisma.Decimal; programId?: unknown };
    };
    expect(data.lineTotal.toString()).toBe('2500');
    expect(data.programId).toBeUndefined();
    expect(prisma.pPMP.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ppmp-1' },
        data: { updatedAt: expect.any(Date) },
      }),
    );
  });

  it('reverts an APPROVED Project to DRAFT when a line item is added', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      $transaction: transactionStub(),
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          status: 'APPROVED',
          lineItems: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      uACSObject: { findUnique: jest.fn().mockResolvedValue(uacsSnapshot) },
      pPMPLineItem: { create },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.addLineItem(
      'ppmp-1',
      {
        lineItemName: 'Office chairs',
        uacsObjectId: 'uacs-1',
        quantity: '1.00',
        unit: 'lot',
        unitCost: '100.00',
        fundSource: FundSource.GF,
        expenseClass: ExpenseClass.MOOE,
        ...dateFields,
      },
      officeUser,
    );

    expect(prisma.pPMP.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { updatedAt: expect.any(Date), status: 'DRAFT' },
      }),
    );
  });

  it('reverts an APPROVED, published Project to REVISION and unpublishes it when a line item is added', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      $transaction: transactionStub(),
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          status: 'APPROVED',
          isPublished: true,
          lineItems: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      uACSObject: { findUnique: jest.fn().mockResolvedValue(uacsSnapshot) },
      pPMPLineItem: { create },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.addLineItem(
      'ppmp-1',
      {
        lineItemName: 'Office chairs',
        uacsObjectId: 'uacs-1',
        quantity: '1.00',
        unit: 'lot',
        unitCost: '100.00',
        fundSource: FundSource.GF,
        expenseClass: ExpenseClass.MOOE,
        ...dateFields,
      },
      officeUser,
    );

    expect(prisma.pPMP.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          updatedAt: expect.any(Date),
          status: 'REVISION',
          isPublished: false,
        },
      }),
    );
  });
});

describe('PpmpService.approve', () => {
  it('sets status to APPROVED and stamps approvedAt', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'ppmp-1',
      status: 'APPROVED',
      lineItems: [],
    });
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          status: 'DRAFT',
          lineItems: [],
        }),
        update,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.approve('ppmp-1', officeUser);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'APPROVED', approvedAt: expect.any(Date) },
      }),
    );
  });

  it('re-approves a Project in REVISION back to APPROVED', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'ppmp-1',
      status: 'APPROVED',
      lineItems: [],
    });
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          status: 'REVISION',
          lineItems: [],
        }),
        update,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.approve('ppmp-1', officeUser);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'APPROVED', approvedAt: expect.any(Date) },
      }),
    );
  });

  it('is a no-op when already approved (idempotent)', async () => {
    const update = jest.fn();
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          status: 'APPROVED',
          lineItems: [],
        }),
        update,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.approve('ppmp-1', officeUser);

    expect(update).not.toHaveBeenCalled();
  });
});

describe('PpmpService.attachDocument', () => {
  it('stores the file and updates the line item with its URL/name', async () => {
    const update = jest.fn().mockResolvedValue({});
    const storage = storageStub();
    const prisma = {
      $transaction: transactionStub(),
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [{ id: 'li-1' }],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      pPMPLineItem: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'li-1', ppmpId: 'ppmp-1' }),
        update,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storage);
    const result = await service.attachDocument(
      'ppmp-1',
      'li-1',
      {
        buffer: Buffer.from('x'),
        mimetype: 'application/pdf',
        originalname: 'estimate.pdf',
      },
      officeUser,
    );

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          supportingDocumentUrl:
            'http://localhost:8000/api/v1/ppmp/uploads/file.pdf',
          supportingDocumentName: 'estimate.pdf',
        },
      }),
    );
    expect(result.supportingDocumentName).toBe('estimate.pdf');
    expect(prisma.pPMP.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ppmp-1' },
        data: { updatedAt: expect.any(Date) },
      }),
    );
  });

  it('replacing an existing document requires no delete-first step — newest wins', async () => {
    const update = jest.fn().mockResolvedValue({});
    const storage = {
      save: jest.fn().mockResolvedValue({
        url: 'http://localhost:8000/newer.pdf',
        key: 'newer.pdf',
      }),
    } as unknown as StorageService;
    const prisma = {
      $transaction: transactionStub(),
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [{ id: 'li-1' }],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      pPMPLineItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'li-1',
          ppmpId: 'ppmp-1',
          supportingDocumentUrl: 'http://localhost:8000/older.pdf',
          supportingDocumentName: 'older.pdf',
        }),
        update,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storage);
    const result = await service.attachDocument(
      'ppmp-1',
      'li-1',
      {
        buffer: Buffer.from('y'),
        mimetype: 'application/pdf',
        originalname: 'newer.pdf',
      },
      officeUser,
    );

    expect(result.supportingDocumentUrl).toBe(
      'http://localhost:8000/newer.pdf',
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ supportingDocumentName: 'newer.pdf' }),
      }),
    );
  });

  it('rejects when the PPMP is outside the caller’s office scope', async () => {
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-2',
          lineItems: [{ id: 'li-1' }],
        }),
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await expect(
      service.attachDocument(
        'ppmp-1',
        'li-1',
        {
          buffer: Buffer.from('x'),
          mimetype: 'application/pdf',
          originalname: 'x.pdf',
        },
        officeUser,
      ),
    ).rejects.toThrow();
  });
});

describe('PpmpService.updateLineItem', () => {
  const existing = {
    id: 'li-1',
    ppmpId: 'ppmp-1',
    quantity: new Prisma.Decimal('10.00'),
    unitCost: new Prisma.Decimal('250.00'),
    lineTotal: new Prisma.Decimal('2500.00'),
  };

  it('recomputes lineTotal when quantity changes', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      $transaction: transactionStub(),
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [existing],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      pPMPLineItem: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.updateLineItem(
      'ppmp-1',
      'li-1',
      { quantity: '20.00' },
      officeUser,
    );

    const { data } = update.mock.calls[0][0] as {
      data: { lineTotal: Prisma.Decimal };
    };
    expect(data.lineTotal.toString()).toBe('5000');
    expect(prisma.pPMP.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ppmp-1' },
        data: { updatedAt: expect.any(Date) },
      }),
    );
  });

  it('leaves lineTotal untouched when neither quantity nor unitCost change', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      $transaction: transactionStub(),
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [existing],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      pPMPLineItem: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.updateLineItem(
      'ppmp-1',
      'li-1',
      { remarks: 'note' },
      officeUser,
    );

    const { data } = update.mock.calls[0][0] as {
      data: { lineTotal?: unknown };
    };
    expect(data.lineTotal).toBeUndefined();
  });
});

describe('PpmpService.deleteLineItem', () => {
  it('returns the grand total recomputed from the remaining line items', async () => {
    const prisma = {
      $transaction: transactionStub(),
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [{ id: 'li-1', ppmpId: 'ppmp-1' }],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      pPMPLineItem: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'li-1', ppmpId: 'ppmp-1' }),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest
          .fn()
          .mockResolvedValue([{ lineTotal: new Prisma.Decimal('1000.00') }]),
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    const result = await service.deleteLineItem('ppmp-1', 'li-1', officeUser);

    expect(result.grandTotal.toString()).toBe('1000');
    expect(prisma.pPMP.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ppmp-1' },
        data: { updatedAt: expect.any(Date) },
      }),
    );
  });
});

describe('PpmpService.reorderLineItems', () => {
  it('rejects when the submitted id set does not match the PPMP’s current line items', async () => {
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [{ id: 'li-1' }, { id: 'li-2' }],
        }),
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await expect(
      service.reorderLineItems(
        'ppmp-1',
        { lineItemIds: ['li-1', 'li-3'] },
        officeUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('persists the new order and touches the parent PPMP', async () => {
    const update = jest.fn().mockResolvedValue({});
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'ppmp-1',
        officeId: 'office-1',
        lineItems: [{ id: 'li-1' }, { id: 'li-2' }],
      })
      .mockResolvedValueOnce({
        id: 'ppmp-1',
        officeId: 'office-1',
        lineItems: [{ id: 'li-2' }, { id: 'li-1' }],
      });
    const prisma = {
      $transaction: transactionStub(),
      pPMP: { findUnique, update: jest.fn().mockResolvedValue({}) },
      pPMPLineItem: { update },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.reorderLineItems(
      'ppmp-1',
      { lineItemIds: ['li-2', 'li-1'] },
      officeUser,
    );

    expect(prisma.pPMP.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ppmp-1' },
        data: { updatedAt: expect.any(Date) },
      }),
    );
  });
});

describe('PpmpService.findAll', () => {
  it('scopes results to the caller’s office and excludes other offices', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'ppmp-1',
        officeId: 'office-1',
        name: 'A',
        lineItems: [{ lineTotal: new Prisma.Decimal('100.00') }],
      },
    ]);
    const prisma = { pPMP: { findMany } } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    const result = await service.findAll({}, officeUser);

    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({
      officeId: { in: ['office-1'] },
    });
    expect(result[0].grandTotal.toString()).toBe('100');
    expect(result[0].lineItemCount).toBe(1);
  });

  it('narrows the scope by ?officeId= but never replaces it', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { pPMP: { findMany } } as unknown as PrismaService;
    const service = new PpmpService(prisma, officeScopeStub(), storageStub());

    await service.findAll({ officeId: 'office-2' }, officeUser);
    await service.publishAll({ officeId: 'office-2' }, officeUser);

    for (const [args] of findMany.mock.calls) {
      expect(args.where.AND).toEqual([
        { officeId: { in: ['office-1'] } },
        { officeId: 'office-2' },
      ]);
    }
  });
});

describe('PpmpService.publish', () => {
  it('rejects publishing a PPMP with zero line items', async () => {
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          isPublished: false,
          lineItems: [],
        }),
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await expect(service.publish('ppmp-1', officeUser)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('publishes a PPMP with at least one line item', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'ppmp-1',
      officeId: 'office-1',
      isPublished: true,
      publishedAt: new Date(),
      lineItems: [{ lineTotal: new Prisma.Decimal('100.00') }],
    });
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          isPublished: false,
          status: 'APPROVED',
          lineItems: [{ lineTotal: new Prisma.Decimal('100.00') }],
        }),
        update,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.publish('ppmp-1', officeUser);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPublished: true }),
      }),
    );
  });

  it('republishes a re-approved Project that was previously published (REVISION -> APPROVED -> publish)', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'ppmp-1',
      officeId: 'office-1',
      isPublished: true,
      publishedAt: new Date(),
      lineItems: [{ lineTotal: new Prisma.Decimal('100.00') }],
    });
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          isPublished: false,
          // Already re-approved by the time publish() is called — approve()
          // moves REVISION -> APPROVED first, same as the DRAFT path.
          status: 'APPROVED',
          publishedAt: new Date('2026-01-01'),
          lineItems: [{ lineTotal: new Prisma.Decimal('100.00') }],
        }),
        update,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.publish('ppmp-1', officeUser);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isPublished: true,
          publishedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('rejects publishing a PPMP that has not been approved', async () => {
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          isPublished: false,
          status: 'DRAFT',
          lineItems: [{ lineTotal: new Prisma.Decimal('100.00') }],
        }),
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await expect(service.publish('ppmp-1', officeUser)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('is a no-op when already published (idempotent)', async () => {
    const update = jest.fn();
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          isPublished: true,
          lineItems: [{ lineTotal: new Prisma.Decimal('100.00') }],
        }),
        update,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.publish('ppmp-1', officeUser);

    expect(update).not.toHaveBeenCalled();
  });
});

describe('PpmpService.unpublish', () => {
  it('sets isPublished to false', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'ppmp-1',
      officeId: 'office-1',
      isPublished: false,
      lineItems: [],
    });
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          isPublished: true,
          lineItems: [],
        }),
        update,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.unpublish('ppmp-1', officeUser);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isPublished: false },
      }),
    );
  });
});

describe('PpmpService.publishAll', () => {
  it('publishes ready PPMPs and counts empty ones as skipped', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      pPMP: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ppmp-1', status: 'APPROVED', lineItems: [{ id: 'li-1' }] },
          {
            id: 'ppmp-2',
            name: 'Empty Plan',
            status: 'APPROVED',
            lineItems: [],
          },
          {
            id: 'ppmp-3',
            name: 'Unapproved Plan',
            status: 'DRAFT',
            lineItems: [{ id: 'li-2' }],
          },
        ]),
        updateMany,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    const result = await service.publishAll({}, officeUser);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['ppmp-1'] } } }),
    );
    expect(result).toEqual({
      published: 1,
      skipped: 2,
      skippedNames: ['Empty Plan', 'Unapproved Plan'],
    });
  });
});

describe('PpmpService.remove', () => {
  it('deletes the PPMP after an office-scope check (cascade is enforced at the schema level)', async () => {
    const del = jest.fn().mockResolvedValue({});
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [],
        }),
        delete: del,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.remove('ppmp-1', officeUser);

    expect(del).toHaveBeenCalledWith({ where: { id: 'ppmp-1' } });
  });
});

describe('PpmpService.listComments / addComment', () => {
  it('lists root comments with one level of nested replies', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'c-1',
        content: 'root',
        replies: [{ id: 'c-2', content: 'reply' }],
      },
    ]);
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [],
        }),
      },
      ppmpComment: { findMany },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    const result = await service.listComments('ppmp-1', officeUser);

    expect(findMany.mock.calls[0][0].where).toEqual({
      ppmpId: 'ppmp-1',
      parentCommentId: null,
    });
    expect(result).toHaveLength(1);
  });

  it('rejects a reply that targets an existing reply (only one level of nesting)', async () => {
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [],
        }),
      },
      ppmpComment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c-2',
          ppmpId: 'ppmp-1',
          parentCommentId: 'c-1',
        }),
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await expect(
      service.addComment(
        'ppmp-1',
        { content: 'nested reply', parentCommentId: 'c-2' },
        officeUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('posts a root comment attributed to the caller', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'c-1', content: 'hi' });
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [],
        }),
      },
      ppmpComment: { create },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.addComment('ppmp-1', { content: 'hi' }, officeUser);

    expect(create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        ppmpId: 'ppmp-1',
        authorUserId: 'user-1',
        parentCommentId: null,
        content: 'hi',
      }),
    );
  });
});

describe('PpmpService.listFeedback / replyToFeedback', () => {
  it('rejects replying twice to the same submission', async () => {
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [],
        }),
      },
      ppmpFeedback: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'fb-1',
          ppmpId: 'ppmp-1',
          officialReply: 'already replied',
        }),
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await expect(
      service.replyToFeedback(
        'ppmp-1',
        'fb-1',
        { reply: 'thanks' },
        officeUser,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('records the official reply with the acting user', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [],
        }),
      },
      ppmpFeedback: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'fb-1',
          ppmpId: 'ppmp-1',
          officialReply: null,
        }),
        update,
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    await service.replyToFeedback(
      'ppmp-1',
      'fb-1',
      { reply: 'thanks for the note' },
      officeUser,
    );

    expect(update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        officialReply: 'thanks for the note',
        officialRepliedByUserId: 'user-1',
      }),
    );
  });
});

describe('PpmpService.getHistory', () => {
  it('synthesizes creation, publish, and line-item events in chronological order', async () => {
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          name: 'Office Supplies',
          isPublished: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-03T00:00:00Z'),
          publishedAt: new Date('2026-01-02T00:00:00Z'),
          lineItems: [
            {
              id: 'li-1',
              lineItemName: 'Office chairs',
              createdAt: new Date('2026-01-01T00:00:05Z'),
              updatedAt: new Date('2026-01-01T00:00:05Z'),
            },
          ],
        }),
      },
    } as unknown as PrismaService;

    const service = new PpmpService(prisma, officeScopeStub(), storageStub());
    const history = await service.getHistory('ppmp-1', officeUser);

    expect(history.map((e) => e.kind)).toEqual([
      'published',
      'line_item_added',
      'created',
    ]);
  });
});

describe('PpmpService.listFeedback', () => {
  it("never returns the resident's email to staff", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      pPMP: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ppmp-1',
          officeId: 'office-1',
          lineItems: [],
        }),
      },
      ppmpFeedback: { findMany },
    } as unknown as PrismaService;
    const service = new PpmpService(prisma, officeScopeStub(), storageStub());

    await service.listFeedback('ppmp-1', officeUser);

    expect(findMany.mock.calls[0][0].omit).toEqual({ submitterEmail: true });
  });
});
