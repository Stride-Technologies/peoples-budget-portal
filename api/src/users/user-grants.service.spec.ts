import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, UserAuditAction } from '../generated/prisma/index.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { OfficeScopeService } from '../permissions/office-scope.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { UserGrantsService } from './user-grants.service.js';

const requester = (over: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'admin-1',
  role: Role.HEAD,
  email: 'a@b.c',
  firstName: 'A',
  lastName: 'B',
  identityType: null,
  officeId: 'off-a',
  civilSocietyOrganizationId: null,
  permissions: ['users:write'],
  allOfficesScope: false,
  ...over,
});

type Captured = {
  auditRows: { action: UserAuditAction; summary: string; metadata: unknown }[];
  permDeletes: unknown[];
  permCreates: unknown[];
  officeDeletes: unknown[];
  officeCreates: unknown[];
  userUpdates: unknown[];
};

function makeService(
  existing: {
    permissions: string[];
    allOfficesScope: boolean;
    officeIds: string[];
  },
  ceiling: {
    /** Keys the requester holds. */
    held?: string[];
    /** The requester's effective office scope. */
    scope?: string[] | 'ALL';
    /** The target user's role and home office. */
    target?: { role: Role; officeId: string | null };
  } = {},
) {
  const held = ceiling.held ?? [
    'aip:read',
    'aip:write',
    'aip:export',
    'users:write',
  ];
  const target = ceiling.target ?? { role: Role.STAFF, officeId: 'off-a' };
  const captured: Captured = {
    auditRows: [],
    permDeletes: [],
    permCreates: [],
    officeDeletes: [],
    officeCreates: [],
    userUpdates: [],
  };

  const tx = {
    userPermission: {
      deleteMany: jest.fn((a: unknown) => {
        captured.permDeletes.push(a);
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn((a: unknown) => {
        captured.permCreates.push(a);
        return Promise.resolve({ count: 0 });
      }),
    },
    userOfficeScope: {
      deleteMany: jest.fn((a: unknown) => {
        captured.officeDeletes.push(a);
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn((a: unknown) => {
        captured.officeCreates.push(a);
        return Promise.resolve({ count: 0 });
      }),
    },
    user: {
      update: jest.fn((a: unknown) => {
        captured.userUpdates.push(a);
        return Promise.resolve({});
      }),
    },
    userAuditLog: {
      createMany: jest.fn(({ data }: { data: Captured['auditRows'] }) => {
        captured.auditRows.push(...data);
        return Promise.resolve({ count: data.length });
      }),
    },
  };

  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        role: target.role,
        lguusers: target.officeId ? [{ officeId: target.officeId }] : [],
        ncpcusers: [],
        allOfficesScope: existing.allOfficesScope,
        permissions: existing.permissions.map((key) => ({ key })),
        officeScopes: existing.officeIds.map((officeId) => ({
          officeId,
        })),
      }),
    },
    office: {
      count: jest.fn((a: { where: { id: { in: string[] } } }) =>
        Promise.resolve(a.where.id.in.length),
      ),
    },
    userPermission: {
      findMany: jest.fn().mockResolvedValue(held.map((key) => ({ key }))),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;

  const officeScope = {
    invalidate: jest.fn().mockResolvedValue(undefined),
    effectiveOfficeIds: jest.fn().mockResolvedValue(ceiling.scope ?? 'ALL'),
  } as unknown as OfficeScopeService;

  return {
    service: new UserGrantsService(prisma, officeScope),
    captured,
    officeScope,
  };
}

describe('UserGrantsService', () => {
  it('rejects a key that is not in the catalog', async () => {
    const { service } = makeService({
      permissions: [],
      allOfficesScope: false,
      officeIds: [],
    });
    await expect(
      service.update('u1', { permissions: ['aip:teleport'] }, requester()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stops an admin removing their own users:write', async () => {
    const { service } = makeService({
      permissions: ['users:write', 'aip:read'],
      allOfficesScope: false,
      officeIds: [],
    });
    await expect(
      service.update('admin-1', { permissions: ['aip:read'] }, requester()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets SUPER_ADMIN through that guard — they bypass permissions anyway', async () => {
    const { service } = makeService({
      permissions: ['users:write'],
      allOfficesScope: false,
      officeIds: [],
    });
    await expect(
      service.update(
        'admin-1',
        { permissions: [] },
        requester({ role: Role.SUPER_ADMIN }),
      ),
    ).resolves.toBeDefined();
  });

  it('replaces the permission set and logs the delta, not the whole list', async () => {
    const { service, captured } = makeService({
      permissions: ['aip:read', 'aip:export'],
      allOfficesScope: false,
      officeIds: [],
    });

    await service.update(
      'u1',
      { permissions: ['aip:read', 'aip:write'] },
      requester(),
    );

    expect(captured.permDeletes).toEqual([
      { where: { userId: 'u1', key: { notIn: ['aip:read', 'aip:write'] } } },
    ]);
    const log = captured.auditRows.find(
      (r) => r.action === UserAuditAction.PERMISSIONS_CHANGED,
    );
    expect(log?.metadata).toEqual({
      added: ['aip:write'],
      removed: ['aip:export'],
      after: ['aip:read', 'aip:write'],
    });
  });

  it('writes no audit row when nothing actually changed', async () => {
    const { service, captured } = makeService({
      permissions: ['aip:read'],
      allOfficesScope: false,
      officeIds: ['o1'],
    });

    await service.update(
      'u1',
      {
        permissions: ['aip:read'],
        officeIds: ['o1'],
        allOfficesScope: false,
      },
      requester(),
    );

    expect(captured.auditRows).toEqual([]);
  });

  it('logs an office-scope change and drops the cached scope', async () => {
    const { service, captured, officeScope } = makeService({
      permissions: [],
      allOfficesScope: false,
      officeIds: ['o1'],
    });

    await service.update(
      'u1',
      { officeIds: ['o1', 'o2'], allOfficesScope: true },
      requester(),
    );

    const log = captured.auditRows.find(
      (r) => r.action === UserAuditAction.OFFICE_SCOPE_CHANGED,
    );
    expect(log?.summary).toContain('Granted access to all offices');
    expect(log?.metadata).toMatchObject({ added: ['o2'], removed: [] });
    expect(officeScope.invalidate).toHaveBeenCalledWith('u1');
  });

  it('leaves a dimension untouched when its field is omitted', async () => {
    const { service, captured } = makeService({
      permissions: ['aip:read'],
      allOfficesScope: false,
      officeIds: ['o1'],
    });

    await service.update('u1', { permissions: ['aip:read'] }, requester());

    expect(captured.officeDeletes).toEqual([]);
    expect(captured.officeCreates).toEqual([]);
    expect(captured.userUpdates).toEqual([]);
  });

  describe('what a HEAD may grant (no more than they hold)', () => {
    const none = { permissions: [], allOfficesScope: false, officeIds: [] };

    it("refuses to read or edit another office's user", async () => {
      const { service } = makeService(none, {
        target: { role: Role.STAFF, officeId: 'off-b' },
      });
      await expect(service.get('u1', requester())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.update('u1', { permissions: ['aip:read'] }, requester()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses to touch a SUPER_ADMIN's grants", async () => {
      const { service } = makeService(none, {
        target: { role: Role.SUPER_ADMIN, officeId: null },
      });
      await expect(service.get('u1', requester())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses a permission the HEAD does not hold, also on themselves', async () => {
      const { service, captured } = makeService(none, {
        held: ['users:write', 'aip:read'],
      });
      for (const id of ['u1', 'admin-1']) {
        await expect(
          service.update(id, { permissions: ['aip:publish'] }, requester()),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(captured.permCreates).toEqual([]);
    });

    it('refuses all-offices scope or an office outside their own scope', async () => {
      const { service } = makeService(none, { scope: ['off-a'] });
      await expect(
        service.update('u1', { allOfficesScope: true }, requester()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.update('u1', { officeIds: ['off-b'] }, requester()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.update('u1', { officeIds: ['off-a'] }, requester()),
      ).resolves.toBeDefined();
    });

    it('lets a HEAD remove grants they do not hold themselves', async () => {
      const { service } = makeService(
        {
          permissions: ['aip:publish'],
          allOfficesScope: true,
          officeIds: ['off-z'],
        },
        { held: ['users:write'], scope: ['off-a'] },
      );
      await expect(
        service.update(
          'u1',
          { permissions: [], allOfficesScope: false, officeIds: [] },
          requester(),
        ),
      ).resolves.toBeDefined();
    });
  });
});
