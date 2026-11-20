import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { IdentityType, Role } from '../generated/prisma/index.js';
import type { MailService } from '../mail/mail.service.js';
import type { OfficeScopeService } from '../permissions/office-scope.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

const requester: JwtPayload = {
  sub: 'admin',
  role: 'SUPER_ADMIN',
  email: 'admin@example.gov.ph',
  firstName: 'Admin',
  lastName: 'User',
  identityType: null,
  officeId: null,
  civilSocietyOrganizationId: null,
};

const dto = {
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  email: 'juan@example.gov.ph',
  role: Role.STAFF,
  identityType: IdentityType.LGU,
  officeId: 'office-1',
};

function invite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invite-1',
    userId: null,
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    email: 'juan@example.gov.ph',
    role: Role.STAFF,
    identityType: IdentityType.LGU,
    officeId: 'office-1',
    civilSocietyOrganizationId: null,
    token: 'token-hash',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1_000),
    usedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    userInvite: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(invite()),
      update: jest.fn().mockResolvedValue({}),
    },
    office: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ acronym: 'CBO', name: 'City Budget Office' }),
    },
    civilSocietyOrganization: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaService;

  const mail = {
    sendInvite: jest.fn().mockResolvedValue(undefined),
  } as unknown as MailService;

  const config = {
    getOrThrow: jest.fn().mockReturnValue('https://portal.example.test'),
  } as unknown as ConfigService;

  const officeScope = {
    effectiveOfficeIds: jest.fn().mockResolvedValue(['office-1']),
  } as unknown as OfficeScopeService;

  return {
    service: new UsersService(prisma, mail, config, officeScope),
    prisma,
    mail,
  };
}

describe('UsersService invite email failure handling', () => {
  it('invites SUPER_ADMIN without identity type or office fields', async () => {
    const { service, prisma, mail } = makeService();
    (prisma.userInvite.create as jest.Mock).mockResolvedValue(
      invite({
        role: Role.SUPER_ADMIN,
        identityType: null,
        officeId: null,
      }),
    );

    await expect(
      service.create(
        {
          firstName: 'Maria',
          lastName: 'Santos',
          email: 'maria@example.gov.ph',
          role: Role.SUPER_ADMIN,
        },
        requester,
      ),
    ).resolves.toEqual({ message: 'User invited. An email has been sent.' });

    expect(prisma.userInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: Role.SUPER_ADMIN,
          identityType: undefined,
          officeId: undefined,
          civilSocietyOrganizationId: undefined,
        }),
      }),
    );
    expect(mail.sendInvite).toHaveBeenCalledWith(
      'juan@example.gov.ph',
      'Juan',
      expect.stringContaining('/set-password?token='),
      expect.objectContaining({
        role: 'Super Admin',
        officeName: null,
      }),
    );
  });

  it('re-invites an email whose account was deactivated', async () => {
    const { service, prisma, mail } = makeService();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      isActive: false,
    });

    await expect(service.create(dto, requester)).resolves.toEqual({
      message: 'User invited. An email has been sent.',
    });
    expect(mail.sendInvite).toHaveBeenCalled();
  });

  it('still blocks an email that belongs to an active account', async () => {
    const { service, prisma } = makeService();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isActive: true });

    await expect(service.create(dto, requester)).rejects.toThrow(
      'Email already in use',
    );
    expect(prisma.userInvite.create).not.toHaveBeenCalled();
  });

  it('revokes a new invite and returns 503 when delivery fails', async () => {
    const { service, prisma, mail } = makeService();
    (mail.sendInvite as jest.Mock).mockRejectedValue(new Error('mail failed'));

    await expect(service.create(dto, requester)).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(prisma.userInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'juan@example.gov.ph',
          token: expect.any(String),
        }),
      }),
    );
    expect(prisma.userInvite.update).toHaveBeenCalledWith({
      where: { id: 'invite-1' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('creates and sends a replacement before revoking the old invite', async () => {
    const { service, prisma } = makeService();
    (prisma.userInvite.findUnique as jest.Mock).mockResolvedValue(
      invite({ id: 'old-invite' }),
    );
    (prisma.userInvite.create as jest.Mock).mockResolvedValue(
      invite({ id: 'new-invite' }),
    );

    await expect(
      service.resendInvite('old-invite', requester),
    ).resolves.toEqual({ message: 'Invite resent.' });

    expect(prisma.userInvite.update).toHaveBeenCalledWith({
      where: { id: 'old-invite' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('logs role change + deactivation, swaps office, and revokes sessions', async () => {
    const targetUser = {
      id: 'user-1',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      email: 'juan@example.gov.ph',
      role: Role.STAFF,
      identityType: IdentityType.LGU,
      isEmailVerified: true,
      isActive: true,
      password: 'hashed',
      createdAt: new Date(),
      lguusers: [{ officeId: 'office-1' }],
      ncpcusers: [],
    };

    const tx = {
      user: { update: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      lGUUser: {
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      nCPCUser: { deleteMany: jest.fn(), create: jest.fn() },
      userAuditLog: { createMany: jest.fn().mockResolvedValue({}) },
    };

    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(targetUser) },
      office: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'office-2',
            acronym: 'CTO',
            name: 'City Treasurer',
            isActive: true,
          })
          .mockResolvedValueOnce({
            acronym: 'CBO',
            name: 'City Budget Office',
          }),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
        cb(tx),
      ),
    } as unknown as PrismaService;

    const service = new UsersService(
      prisma,
      {} as unknown as MailService,
      {} as unknown as ConfigService,
      {} as unknown as OfficeScopeService,
    );

    await service.update(
      'user-1',
      { role: Role.HEAD, isActive: false, officeId: 'office-2' },
      requester,
    );

    // Office junction swapped
    expect(tx.lGUUser.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(tx.lGUUser.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', officeId: 'office-2' },
    });

    // One audit row per changed field: role, deactivation, office
    const logged = (
      tx.userAuditLog.createMany.mock.calls[0][0] as {
        data: { action: string }[];
      }
    ).data;
    expect(logged).toHaveLength(3);
    expect(logged.map((l) => l.action).sort()).toEqual(
      ['DEACTIVATED', 'OFFICE_CHANGED', 'ROLE_CHANGED'].sort(),
    );

    // Deactivation revokes the user's active sessions
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('refuses to let an admin deactivate their own account', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: requester.sub,
          role: Role.STAFF,
          firstName: 'Admin',
          lastName: 'User',
          isActive: true,
          lguusers: [],
          ncpcusers: [],
        }),
      },
    } as unknown as PrismaService;

    const service = new UsersService(
      prisma,
      {} as unknown as MailService,
      {} as unknown as ConfigService,
      {} as unknown as OfficeScopeService,
    );

    await expect(
      service.update(requester.sub, { isActive: false }, requester),
    ).rejects.toThrow(ForbiddenException);
  });

  it('keeps the old invite pending when replacement delivery fails', async () => {
    const { service, prisma, mail } = makeService();
    (prisma.userInvite.findUnique as jest.Mock).mockResolvedValue(
      invite({ id: 'old-invite' }),
    );
    (prisma.userInvite.create as jest.Mock).mockResolvedValue(
      invite({ id: 'new-invite' }),
    );
    (mail.sendInvite as jest.Mock).mockRejectedValue(new Error('mail failed'));

    await expect(service.resendInvite('old-invite', requester)).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(prisma.userInvite.update).toHaveBeenCalledTimes(1);
    expect(prisma.userInvite.update).toHaveBeenCalledWith({
      where: { id: 'new-invite' },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe('UsersService.findOne', () => {
  it('never selects the password hash', async () => {
    const { service, prisma } = makeService();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      role: Role.STAFF,
      lguusers: [],
      ncpcusers: [],
    });

    await service.findOne('u1', requester);

    const { select } = (prisma.user.findUnique as jest.Mock).mock.calls[0][0];
    expect(select).not.toHaveProperty('password');
  });
});

describe('UsersService.create (invite grants)', () => {
  it('refuses a HEAD inviting with a permission they do not hold', async () => {
    const { service, prisma, mail } = makeService();
    (prisma as unknown as Record<string, unknown>).userPermission = {
      findMany: jest.fn().mockResolvedValue([{ key: 'users:write' }]),
    };
    const head: JwtPayload = {
      ...requester,
      sub: 'head-1',
      role: 'HEAD',
      officeId: 'office-1',
    };
    await expect(
      service.create({ ...dto, permissions: ['aip:publish'] }, head),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mail.sendInvite).not.toHaveBeenCalled();
  });
});
