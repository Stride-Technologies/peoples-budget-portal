import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'node:crypto';
import type { MailService } from '../mail/mail.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

function sha256(v: string) {
  return crypto.createHash('sha256').update(v).digest('hex');
}

const userId = 'u-test';
const rawToken = crypto.randomBytes(64).toString('hex');
const tokenHash = sha256(rawToken);
const future = new Date(Date.now() + 7 * 86_400_000);
const past = new Date(Date.now() - 1_000);

const fakeUser = {
  id: userId,
  email: 'test@example.gov.ph',
  firstName: 'Test',
  lastName: 'User',
  role: 'STAFF' as const,
  identityType: null,
  password: 'hashed',
  isEmailVerified: true,
  lastVerifiedAt: new Date(),
  lguusers: [],
  ncpcusers: [],
  permissions: [],
  allOfficesScope: false,
  isActive: true,
};

function makeService() {
  const prisma = {
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(fakeUser),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    userInvite: {
      findUnique: jest.fn(),
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

  // Access tokens are mocked; sign-in challenges (HS256) are real so they verify.
  const realJwt = new JwtService({});
  const jwt = {
    sign: jest.fn((payload: object, opts: { algorithm?: string }) =>
      opts?.algorithm === 'HS256'
        ? realJwt.sign(payload, opts as never)
        : 'mock-access-token',
    ),
    verify: jest.fn((token: string, opts: object) =>
      realJwt.verify<Record<string, unknown>>(token, opts as never),
    ),
  } as unknown as JwtService;

  const config = {
    get: jest.fn((_key: string, def: string) => def),
    getOrThrow: jest.fn().mockReturnValue('mock-private-key'),
  } as unknown as ConfigService;

  const mail = {
    sendVerificationCode: jest.fn(),
    sendPasswordReset: jest.fn(),
  } as unknown as MailService;

  return {
    service: new AuthService(prisma, jwt, config, mail),
    prisma,
    config,
    mail,
  };
}

describe('AuthService — token lifecycle', () => {
  describe('previewInvite()', () => {
    it('returns account details for a usable invite token', async () => {
      const { service, prisma } = makeService();
      (prisma.userInvite.findUnique as jest.Mock).mockResolvedValue({
        id: 'invite-1',
        userId: null,
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        email: 'juan@example.gov.ph',
        role: 'HEAD',
        identityType: 'LGU',
        officeId: 'office-1',
        civilSocietyOrganizationId: null,
        expiresAt: future,
        usedAt: null,
        revokedAt: null,
      });

      await expect(service.previewInvite({ token: rawToken })).resolves.toEqual(
        {
          firstName: 'Juan',
          lastName: 'Dela Cruz',
          email: 'juan@example.gov.ph',
          role: 'HEAD',
          identityType: 'LGU',
          officeName: 'CBO - City Budget Office',
        },
      );

      expect(prisma.userInvite.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { token: tokenHash } }),
      );
    });
  });

  /**
   * A deactivated account can be re-invited, so acceptance may land on an email
   * that already has a user row. It must reuse that row — programs, comments and
   * audit trails point at its id — and never create a second one.
   */
  describe('setPassword()', () => {
    const usableInvite = {
      id: 'invite-1',
      userId: null,
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      email: 'juan@example.gov.ph',
      role: 'STAFF' as const,
      identityType: 'LGU' as const,
      officeId: 'office-1',
      civilSocietyOrganizationId: null,
      expiresAt: future,
      usedAt: null,
      revokedAt: null,
      permissions: ['program.read'],
      allOfficesScope: false,
      officeScopeIds: ['office-1'],
      invitedByUserId: 'admin-1',
    };

    const dto = {
      token: rawToken,
      password: 'Secret123!',
      confirmPassword: 'Secret123!',
    };

    /** The tx client `setPassword` drives, wired into `$transaction`. */
    function setup(existingUser: { id: string; isActive: boolean } | null) {
      const { service, prisma } = makeService();
      (prisma.userInvite.findUnique as jest.Mock).mockResolvedValue(
        usableInvite,
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser);

      const tx = {
        user: {
          create: jest.fn().mockResolvedValue({ id: 'new-user' }),
          update: jest.fn().mockResolvedValue({ id: existingUser?.id }),
          findUnique: jest.fn().mockResolvedValue({ role: 'SUPER_ADMIN' }),
        },
        userAuditLog: { create: jest.fn() },
        lGUUser: { deleteMany: jest.fn() },
        nCPCUser: { deleteMany: jest.fn() },
        userPermission: { deleteMany: jest.fn(), createMany: jest.fn() },
        userOfficeScope: { deleteMany: jest.fn(), createMany: jest.fn() },
        userInvite: { update: jest.fn() },
      };
      (prisma as unknown as { $transaction: unknown }).$transaction = jest.fn(
        (cb: (t: typeof tx) => unknown) => cb(tx),
      );
      return { service, tx };
    }

    it('reuses a deactivated account instead of creating a second row', async () => {
      const { service, tx } = setup({ id: 'old-user', isActive: false });

      await service.setPassword(dto);

      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'old-user' },
          data: expect.objectContaining({ isActive: true, role: 'STAFF' }),
        }),
      );
      // The invite is the new source of truth for office and access.
      expect(tx.lGUUser.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'old-user' },
      });
      expect(tx.userPermission.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'old-user' },
      });
      expect(tx.userOfficeScope.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'old-user' },
      });
      // Inactive → active is an audited state change, same as an admin edit.
      expect(tx.userAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ACTIVATED',
            actorUserId: 'admin-1',
            actorRole: 'SUPER_ADMIN',
          }),
        }),
      );
    });

    it('creates a fresh account when the email has no row', async () => {
      const { service, tx } = setup(null);

      await service.setPassword(dto);

      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'juan@example.gov.ph' }),
        }),
      );
      expect(tx.lGUUser.deleteMany).not.toHaveBeenCalled();
      expect(tx.userAuditLog.create).not.toHaveBeenCalled();
    });

    it('refuses when the account was reactivated before acceptance', async () => {
      const { service, tx } = setup({ id: 'old-user', isActive: true });

      await expect(service.setPassword(dto)).rejects.toThrow(
        'An active account already exists for this email',
      );
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });

  describe('refresh()', () => {
    it('revokes the old token and returns a fresh pair', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt-1',
        userId,
        token: tokenHash,
        revokedAt: null,
        expiresAt: future,
      });

      const result = await service.refresh({ refreshToken: rawToken });

      expect(result.accessToken).toBe('mock-access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken).not.toBe(rawToken);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('looks up the token by its SHA-256 hash, not the raw value', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.refresh({ refreshToken: rawToken })).rejects.toThrow(
        UnauthorizedException,
      );

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { token: tokenHash } }),
      );
    });

    it('throws 401 when the token is not found in the database', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.refresh({ refreshToken: rawToken })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 when the token has already been revoked', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt-1',
        userId,
        token: tokenHash,
        revokedAt: new Date(),
        expiresAt: future,
      });

      await expect(service.refresh({ refreshToken: rawToken })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 when the token is past its expiry date', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt-1',
        userId,
        token: tokenHash,
        revokedAt: null,
        expiresAt: past,
      });

      await expect(service.refresh({ refreshToken: rawToken })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('does not revoke the old token when validation fails', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt-1',
        userId,
        token: tokenHash,
        revokedAt: null,
        expiresAt: past,
      });

      await expect(
        service.refresh({ refreshToken: rawToken }),
      ).rejects.toThrow();

      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });

  describe('logout()', () => {
    it('marks the refresh token as revoked', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt-1',
        userId,
        revokedAt: null,
      });

      const result = await service.logout(rawToken);

      expect(result).toEqual({ message: 'Logged out' });
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('is idempotent — skips the update when the token is already revoked', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt-1',
        userId,
        revokedAt: new Date(),
      });

      await service.logout(rawToken);

      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('resolves cleanly for an unknown token', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.logout(rawToken)).resolves.toEqual({
        message: 'Logged out',
      });
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });
});

describe('AuthService — sign-in hardening (#122, #123)', () => {
  const bcrypt = jest.requireActual<typeof import('bcrypt')>('bcrypt');
  const passwordHash = bcrypt.hashSync('right-password', 4);

  function makeLoginService(
    user: Omit<Partial<typeof fakeUser>, 'role'> & {
      role: 'STAFF' | 'SUPER_ADMIN';
    },
    failures = 0,
  ) {
    const { service, prisma, config, mail } = makeService();
    const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
    p.user.findUnique.mockResolvedValue({
      ...fakeUser,
      ...user,
      password: passwordHash,
      isActive: true,
    });
    p.userAuditLog = {
      count: jest.fn().mockResolvedValue(failures),
      create: jest.fn().mockResolvedValue({}),
    };
    p.emailVerification = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    p.user.update = jest.fn().mockResolvedValue({});
    return { service, p, config, mail };
  }

  /** The challenge a correct password earns when a code is required. */
  async function challengeFor(service: AuthService): Promise<string> {
    const err = (await service
      .login({ email: fakeUser.email, password: 'right-password' })
      .catch((e: UnauthorizedException) => e)) as UnauthorizedException;
    const { challenge } = err.getResponse() as { challenge: string };
    expect(challenge).toEqual(expect.any(String));
    return challenge;
  }

  it('locks the account out after 5 recent failures, before checking the password', async () => {
    const { service } = makeLoginService({ role: 'STAFF' }, 5);
    await expect(
      service.login({ email: fakeUser.email, password: 'right-password' }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('records a failed password as LOGIN_FAILED', async () => {
    const { service, p } = makeLoginService({ role: 'STAFF' });
    await expect(
      service.login({ email: fakeUser.email, password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(p.userAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'LOGIN_FAILED' }),
      }),
    );
  });

  it('asks a SUPER_ADMIN for an emailed code at every sign-in', async () => {
    const { service, p } = makeLoginService({
      role: 'SUPER_ADMIN',
      lastVerifiedAt: new Date(),
    });
    await expect(
      service.login({ email: fakeUser.email, password: 'right-password' }),
    ).rejects.toThrow(/code has been sent/);
    expect(p.emailVerification.create).toHaveBeenCalled();
  });

  it('lets recently verified staff in without a code', async () => {
    const { service, p } = makeLoginService({
      role: 'STAFF',
      lastVerifiedAt: new Date(),
    });
    await expect(
      service.login({ email: fakeUser.email, password: 'right-password' }),
    ).resolves.toMatchObject({ accessToken: 'mock-access-token' });
    expect(p.emailVerification.create).not.toHaveBeenCalled();
  });

  it('asks staff for a code again once 30 days have passed', async () => {
    const { service, p } = makeLoginService({
      role: 'STAFF',
      lastVerifiedAt: new Date(Date.now() - 31 * 86_400_000),
    });
    await expect(
      service.login({ email: fakeUser.email, password: 'right-password' }),
    ).rejects.toThrow(/code has been sent/);
    expect(p.emailVerification.create).toHaveBeenCalled();
  });

  it('voids earlier codes before sending a new one', async () => {
    const { service, p } = makeLoginService({ role: 'SUPER_ADMIN' });
    await service
      .login({ email: fakeUser.email, password: 'right-password' })
      .catch(() => undefined);
    expect(p.emailVerification.updateMany).toHaveBeenCalledWith({
      where: { userId, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(
      p.emailVerification.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(p.emailVerification.create.mock.invocationCallOrder[0]);
  });

  it('records a wrong code as LOGIN_FAILED so it counts toward the lockout', async () => {
    const { service, p } = makeLoginService({ role: 'SUPER_ADMIN' });
    const challenge = await challengeFor(service);
    p.emailVerification.findFirst.mockResolvedValue({
      id: 'v1',
      code: bcrypt.hashSync('123456', 4),
    });
    await expect(
      service.verifyEmail({ email: fakeUser.email, code: '654321', challenge }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(p.userAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'LOGIN_FAILED' }),
      }),
    );
  });

  it('signs in with a correct code and the challenge from the password step', async () => {
    const { service, p } = makeLoginService({ role: 'SUPER_ADMIN' });
    const challenge = await challengeFor(service);
    p.emailVerification.findFirst.mockResolvedValue({
      id: 'v1',
      code: bcrypt.hashSync('123456', 4),
    });
    await expect(
      service.verifyEmail({ email: fakeUser.email, code: '123456', challenge }),
    ).resolves.toMatchObject({ accessToken: 'mock-access-token' });
  });

  it('refuses a code without a challenge from a correct password', async () => {
    const { service, p } = makeLoginService({ role: 'SUPER_ADMIN' });
    p.emailVerification.findFirst.mockResolvedValue({
      id: 'v1',
      code: bcrypt.hashSync('123456', 4),
    });
    for (const challenge of ['', 'not-a-token']) {
      await expect(
        service.verifyEmail({
          email: fakeUser.email,
          code: '123456',
          challenge,
        }),
      ).rejects.toThrow(/Sign in again/);
    }
    expect(p.emailVerification.findFirst).not.toHaveBeenCalled();
  });

  it('refuses a challenge issued to a different email', async () => {
    const { service } = makeLoginService({ role: 'SUPER_ADMIN' });
    const challenge = await challengeFor(service);
    await expect(
      service.verifyEmail({
        email: 'other@example.gov.ph',
        code: '123456',
        challenge,
      }),
    ).rejects.toThrow(/Sign in again/);
  });

  it('resends a code only for a valid challenge', async () => {
    const { service, p } = makeLoginService({ role: 'SUPER_ADMIN' });
    await service.resendVerification({ email: fakeUser.email, challenge: 'x' });
    expect(p.emailVerification.create).not.toHaveBeenCalled();
    const challenge = await challengeFor(service);
    p.emailVerification.create.mockClear();
    await service.resendVerification({ email: fakeUser.email, challenge });
    expect(p.emailVerification.create).toHaveBeenCalled();
  });

  it('sends a random code under NODE_ENV=development unless AUTH_FIXED_OTP=1', async () => {
    const { service, config, mail } = makeLoginService({ role: 'SUPER_ADMIN' });
    const env: Record<string, string> = { NODE_ENV: 'development' };
    (config.get as jest.Mock).mockImplementation(
      (k: string, def: unknown) => env[k] ?? def,
    );
    await challengeFor(service);
    expect((mail.sendVerificationCode as jest.Mock).mock.calls[0][1]).not.toBe(
      '000000',
    );

    env.AUTH_FIXED_OTP = '1';
    await challengeFor(service);
    expect((mail.sendVerificationCode as jest.Mock).mock.calls[1][1]).toBe(
      '000000',
    );

    env.NODE_ENV = 'staging';
    await challengeFor(service);
    expect((mail.sendVerificationCode as jest.Mock).mock.calls[2][1]).not.toBe(
      '000000',
    );
  });
});

describe('AuthService — deactivated accounts', () => {
  it('issues no tokens to a deactivated account, even from a valid refresh token', async () => {
    const { service, prisma } = makeService();
    const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
    p.user.findUniqueOrThrow.mockResolvedValue({
      ...fakeUser,
      isActive: false,
    });
    p.refreshToken.findUnique.mockResolvedValue({
      id: 'rt',
      userId,
      revokedAt: null,
      expiresAt: future,
    });
    await expect(service.refresh({ refreshToken: rawToken })).rejects.toThrow(
      /deactivated/,
    );
    expect(p.refreshToken.create).not.toHaveBeenCalled();
  });

  it('sends no reset link to a deactivated account', async () => {
    const { service, prisma, mail } = makeService();
    const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
    p.user.findUnique.mockResolvedValue({ ...fakeUser, isActive: false });
    p.passwordResetToken = { create: jest.fn() };
    await service.forgotPassword({ email: fakeUser.email });
    expect(p.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });
});
