import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import {
  IdentityType,
  Role as RoleEnum,
  UserAuditAction,
} from '../generated/prisma/index';
import type { Prisma, Role } from '../generated/prisma/index';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from './decorators/current-user.decorator.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { InvitePreviewDto } from './dto/invite-preview.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { SetPasswordDto } from './dto/set-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface MessageResponse {
  message: string;
}

export interface InvitePreview {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  identityType: IdentityType | null;
  officeName: string | null;
}

interface UserWithOrg {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  identityType: IdentityType | null;
  officeId: string | null;
  civilSocietyOrganizationId: string | null;
  permissions: string[];
  allOfficesScope: boolean;
  isActive: boolean;
}

/** Failed logins or codes per account before it is locked out for the window. */
const LOCKOUT_FAILURES = 5;
const LOCKOUT_WINDOW_MS = 15 * 60_000;

/** What a sign-in challenge token is for; it opens no other door. */
const CHALLENGE_PURPOSE = 'email-code';

function parseDurationMs(duration: string): number {
  const units: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) throw new Error('Invalid duration format: ' + duration);
  return Number.parseInt(match[1], 10) * (units[match[2]] ?? 1_000);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  // ─── Login ───────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (!user.password) throw new UnauthorizedException('Invalid credentials');

    await this.assertNotLockedOut(user.id);

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      await this.recordSelfAudit(user.id, user.role, {
        action: UserAuditAction.LOGIN_FAILED,
        summary: 'Failed login (incorrect password)',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'This account has been deactivated. Contact your administrator.',
      );
    }

    const verificationDays = this.config.get<number>(
      'EMAIL_VERIFICATION_DAYS',
      30,
    );
    // Administrators confirm an emailed code at every sign-in (MFA); everyone
    // else re-verifies every EMAIL_VERIFICATION_DAYS.
    const needsVerification =
      user.role === RoleEnum.SUPER_ADMIN ||
      !user.isEmailVerified ||
      !user.lastVerifiedAt ||
      this.daysSince(user.lastVerifiedAt) > verificationDays;

    if (needsVerification) {
      await this.sendVerificationCode(user.id, user.email);
      // The client sends the user to the code page when the message says "verification".
      // `challenge` proves the password step passed: verify-email and
      // resend-verification take nothing else, so an email address alone can
      // neither request nor redeem a code.
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: !user.isEmailVerified
          ? 'Email verification required. A code has been sent to your email.'
          : user.role === RoleEnum.SUPER_ADMIN
            ? 'Sign-in verification required. A code has been sent to your email.'
            : 'Periodic re-verification required. A code has been sent to your email.',
        challenge: this.signChallenge(user.id),
      });
    }

    await this.recordSelfAudit(user.id, user.role, {
      action: UserAuditAction.LOGIN,
      summary: 'Signed in',
    });
    return this.issueTokens(user.id);
  }

  // ─── Email verification (2FA) ─────────────────────────────────────────────

  async verifyEmail(dto: VerifyEmailDto): Promise<TokenPair> {
    const userId = this.readChallenge(dto.challenge);
    const user = userId
      ? await this.prisma.user.findUnique({ where: { id: userId } })
      : null;
    if (!user || user.email !== dto.email) {
      throw new UnauthorizedException('Sign-in expired. Sign in again.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'This account has been deactivated. Contact your administrator.',
      );
    }

    await this.assertNotLockedOut(user.id);

    const verification = await this.prisma.emailVerification.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification)
      throw new UnauthorizedException('Code expired or not found');

    const codeValid = await bcrypt.compare(dto.code, verification.code);
    if (!codeValid) {
      await this.recordSelfAudit(user.id, user.role, {
        action: UserAuditAction.LOGIN_FAILED,
        summary: 'Failed sign-in (incorrect verification code)',
      });
      throw new UnauthorizedException('Invalid code');
    }

    await this.prisma.emailVerification.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, lastVerifiedAt: new Date() },
    });

    await this.recordSelfAudit(user.id, user.role, {
      action: UserAuditAction.LOGIN,
      summary: 'Signed in (email verified)',
    });
    return this.issueTokens(user.id);
  }

  async resendVerification(
    dto: ResendVerificationDto,
  ): Promise<MessageResponse> {
    const successMessage = {
      message: 'If an account exists, a verification code has been sent.',
    };

    const userId = this.readChallenge(dto.challenge);
    const user = userId
      ? await this.prisma.user.findUnique({ where: { id: userId } })
      : null;
    if (!user?.password || !user.isActive || user.email !== dto.email) {
      return successMessage;
    }

    await this.sendVerificationCode(user.id, user.email);
    return successMessage;
  }

  // ─── Set password (invite flow) ───────────────────────────────────────────

  async previewInvite(dto: InvitePreviewDto): Promise<InvitePreview> {
    const invite = await this.findUsableInvite(dto.token);
    return this.buildInvitePreview(invite);
  }

  async setPassword(dto: SetPasswordDto): Promise<TokenPair> {
    const invite = await this.findUsableInvite(dto.token);

    // A deactivated account can be re-invited (UsersService.create), so the
    // email may already have a row. Reuse it instead of creating a second one:
    // programs, comments, and audit trails point at that user id and must keep
    // pointing at the same person.
    const existing = await this.prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true, isActive: true },
    });
    // Reactivated between invite and acceptance — the account is live, so its
    // password is not this link's to set.
    if (existing?.isActive) {
      throw new ConflictException(
        'An active account already exists for this email. Sign in, or use "Forgot password" instead.',
      );
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const now = new Date();

    const profile = {
      firstName: dto.firstName ?? invite.firstName,
      lastName: dto.lastName ?? invite.lastName,
      role: invite.role,
      identityType: invite.identityType ?? null,
      password: hashed,
      isEmailVerified: true,
      isActive: true,
      lastVerifiedAt: now,
      allOfficesScope: invite.allOfficesScope,
    };

    // An NCPC invite provisions an endorser, not a proponent: a CSO id makes the
    // user that CSO's representative; a null CSO makes them the NCPC umbrella
    // head (NCPC endorser pivot §3.3, OD-5). The NCPCUser row is created for any
    // NCPC identity, even when the CSO is null.
    const memberships = {
      ...(invite.officeId && {
        lguusers: { create: { officeId: invite.officeId } },
      }),
      ...(invite.identityType === IdentityType.NCPC && {
        ncpcusers: {
          create: {
            civilSocietyOrganizationId:
              invite.civilSocietyOrganizationId ?? null,
          },
        },
      }),
    };

    const user = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        // The invite is the new source of truth for this account's office and
        // access, so the stale rows go before the invite's are written.
        await tx.lGUUser.deleteMany({ where: { userId: existing.id } });
        await tx.nCPCUser.deleteMany({ where: { userId: existing.id } });
        await tx.userPermission.deleteMany({ where: { userId: existing.id } });
        await tx.userOfficeScope.deleteMany({ where: { userId: existing.id } });
      }

      const created = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { ...profile, ...memberships },
          })
        : await tx.user.create({
            data: { email: invite.email, ...profile, ...memberships },
          });

      // Materialize the access the administrator chose at invite time (§5).
      // Same transaction as the user row, so an account never exists in a state
      // where someone expected it to have grants and it silently does not.
      if (invite.permissions.length > 0) {
        await tx.userPermission.createMany({
          data: invite.permissions.map((key) => ({
            userId: created.id,
            key,
            // Whoever sent the invite chose this access, so they are the
            // granter — not the invitee accepting it.
            grantedBy: invite.invitedByUserId ?? created.id,
          })),
          skipDuplicates: true,
        });
      }
      // allOfficesScope is set on the user row above — a reused account has to be
      // able to lose the flag too, not only gain it.
      if (invite.officeScopeIds.length > 0) {
        await tx.userOfficeScope.createMany({
          data: invite.officeScopeIds.map((officeId) => ({
            userId: created.id,
            officeId,
            grantedBy: invite.invitedByUserId ?? created.id,
          })),
          skipDuplicates: true,
        });
      }

      // Reuse takes an account from inactive to active. Every other route to
      // that state writes an audit row, so this one does too — the actor is the
      // admin who sent the invite, not the invitee who redeemed it.
      if (existing) {
        const inviter = invite.invitedByUserId
          ? await tx.user.findUnique({
              where: { id: invite.invitedByUserId },
              select: { role: true },
            })
          : null;
        await tx.userAuditLog.create({
          data: {
            targetUserId: created.id,
            actorUserId: invite.invitedByUserId ?? created.id,
            // Falls back to the invited role only if the inviter's row is gone.
            actorRole: inviter?.role ?? invite.role,
            action: UserAuditAction.ACTIVATED,
            summary: 'Account reactivated by accepting a new invitation',
            metadata: { inviteId: invite.id },
          },
        });
      }

      await tx.userInvite.update({
        where: { id: invite.id },
        data: { usedAt: now, userId: created.id },
      });

      return created;
    });

    return this.issueTokens(user.id);
  }

  // ─── Forgot password / reset ──────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<MessageResponse> {
    const successMessage = {
      message:
        'If an account exists for that email, a reset link has been sent.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    // A deactivated account is re-admitted by a new invite, never by a reset link.
    if (!user?.password || !user.isActive) return successMessage;

    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.sha256(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1_000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token: tokenHash, expiresAt },
    });

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
    await this.mail.sendPasswordReset(user.email, user.firstName, resetUrl);

    await this.recordSelfAudit(user.id, user.role, {
      action: UserAuditAction.PASSWORD_RESET_REQUESTED,
      summary: 'Requested a password reset link',
    });

    return successMessage;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<TokenPair> {
    const tokenHash = this.sha256(dto.token);

    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
    });

    if (!stored || stored.usedAt !== null || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Reset link is invalid or has expired');
    }

    const hashed = await bcrypt.hash(dto.password, 12);

    const [updatedUser] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { password: hashed },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all existing sessions on password reset
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.recordSelfAudit(updatedUser.id, updatedUser.role, {
      action: UserAuditAction.PASSWORD_RESET,
      summary: 'Password reset via reset link',
    });

    return this.issueTokens(updatedUser.id);
  }

  // ─── Change password (authenticated self-service) ─────────────────────────

  /**
   * Verify the caller's current password, set a new one, then revoke every
   * other session and rotate this device onto a fresh token pair (so the
   * current device stays signed in while other devices are forced to re-login).
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const currentValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );
    if (!currentValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const hashed = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password: hashed },
      }),
      // Revoke ALL existing sessions; we re-issue a fresh pair below so the
      // current device stays logged in and every other device is signed out.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.recordSelfAudit(userId, user.role, {
      action: UserAuditAction.PASSWORD_CHANGED,
      summary: 'Changed password',
    });

    return this.issueTokens(userId);
  }

  // ─── Token rotation ───────────────────────────────────────────────────────

  async refresh(dto: RefreshTokenDto): Promise<TokenPair> {
    const tokenHash = this.sha256(dto.refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revokedAt !== null || stored.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'Refresh token has expired or been revoked',
      );
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(stored.userId);
  }

  async logout(refreshToken: string): Promise<MessageResponse> {
    const tokenHash = this.sha256(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
    });
    if (stored?.revokedAt === null) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Logged out' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async issueTokens(userId: string): Promise<TokenPair> {
    const user = await this.loadUserWithOrg(userId);
    // Every token path (login, codes, invites, resets, refresh) comes through
    // here, so deactivation is enforced once for all of them.
    if (!user.isActive) {
      throw new UnauthorizedException(
        'This account has been deactivated. Contact your administrator.',
      );
    }

    const privateKey = this.config
      .getOrThrow<string>('JWT_PRIVATE_KEY')
      .replaceAll('\\n', '\n');
    const accessExpiresIn = this.config.get<string>(
      'JWT_ACCESS_EXPIRES_IN',
      '15m',
    );
    const refreshExpiresIn = this.config.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      identityType: user.identityType,
      officeId: user.officeId,
      civilSocietyOrganizationId: user.civilSocietyOrganizationId,
      permissions: user.permissions,
      allOfficesScope: user.allOfficesScope,
    };

    const accessToken = this.jwt.sign(payload, {
      algorithm: 'RS256',
      privateKey,
      expiresIn: accessExpiresIn as never,
    });

    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.sha256(rawRefreshToken);
    const expiresAt = new Date(Date.now() + parseDurationMs(refreshExpiresIn));

    await this.prisma.refreshToken.create({
      data: { userId: user.id, token: tokenHash, expiresAt },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private async loadUserWithOrg(userId: string): Promise<UserWithOrg> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        lguusers: { select: { officeId: true }, take: 1 },
        ncpcusers: {
          select: { civilSocietyOrganizationId: true },
          take: 1,
        },
        permissions: { select: { key: true } },
      },
    });

    return {
      ...user,
      officeId: user.lguusers[0]?.officeId ?? null,
      civilSocietyOrganizationId:
        user.ncpcusers[0]?.civilSocietyOrganizationId ?? null,
      permissions: user.permissions.map((p) => p.key),
    };
  }

  private async findUsableInvite(rawToken: string) {
    const tokenHash = this.sha256(rawToken);

    const invite = await this.prisma.userInvite.findUnique({
      where: { token: tokenHash },
    });

    if (
      !invite ||
      invite.userId !== null ||
      invite.usedAt !== null ||
      invite.revokedAt !== null ||
      invite.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invite link is invalid or has expired');
    }

    return invite;
  }

  private async buildInvitePreview(invite: {
    firstName: string;
    lastName: string;
    email: string;
    role: Role;
    identityType: IdentityType | null;
    officeId: string | null;
    civilSocietyOrganizationId: string | null;
  }): Promise<InvitePreview> {
    let officeName: string | null = null;

    if (invite.officeId) {
      const office = await this.prisma.office.findUnique({
        where: { id: invite.officeId },
        select: { acronym: true, name: true },
      });
      officeName = office
        ? office.name === office.acronym
          ? office.acronym
          : `${office.acronym} - ${office.name}`
        : null;
    } else if (invite.civilSocietyOrganizationId) {
      const cso = await this.prisma.civilSocietyOrganization.findUnique({
        where: { id: invite.civilSocietyOrganizationId },
        select: { name: true },
      });
      officeName = cso?.name ?? null;
    }

    return {
      firstName: invite.firstName,
      lastName: invite.lastName,
      email: invite.email,
      role: invite.role,
      identityType: invite.identityType,
      officeName,
    };
  }

  /**
   * The fixed code 000000 is a laptop convenience. It used to follow
   * NODE_ENV=development, which the internet-facing dev deployment also runs,
   * so every account there signed in with 000000. Now it needs its own opt-in,
   * and is refused outright wherever NODE_ENV says staging or production.
   */
  private fixedOtpEnabled(): boolean {
    if (this.config.get<string>('AUTH_FIXED_OTP') !== '1') return false;
    const env = this.config.get<string>('NODE_ENV');
    return env !== 'production' && env !== 'staging';
  }

  /** HS256 under a key derived from the RS256 key: JwtGuard (RS256 only) never accepts it. */
  private challengeKey(): Buffer {
    return crypto
      .createHash('sha256')
      .update(
        `${CHALLENGE_PURPOSE}:${this.config.getOrThrow<string>('JWT_PRIVATE_KEY')}`,
      )
      .digest();
  }

  private signChallenge(userId: string): string {
    return this.jwt.sign(
      { sub: userId, purpose: CHALLENGE_PURPOSE },
      { algorithm: 'HS256', secret: this.challengeKey(), expiresIn: '15m' },
    );
  }

  /** The user id a valid, unexpired challenge was issued to, or null. */
  private readChallenge(challenge: string): string | null {
    try {
      const payload = this.jwt.verify<{ sub?: string; purpose?: string }>(
        challenge,
        { algorithms: ['HS256'], secret: this.challengeKey() },
      );
      return payload.purpose === CHALLENGE_PURPOSE && payload.sub
        ? payload.sub
        : null;
    } catch {
      return null;
    }
  }

  private async sendVerificationCode(
    userId: string,
    email: string,
  ): Promise<void> {
    const rawCode = this.fixedOtpEnabled()
      ? '000000'
      : String(crypto.randomInt(100_000, 1_000_000));
    const hashedCode = await bcrypt.hash(rawCode, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);

    // Only the newest code works: a resend voids the ones before it.
    await this.prisma.emailVerification.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.emailVerification.create({
      data: { userId, code: hashedCode, expiresAt },
    });

    await this.mail.sendVerificationCode(email, rawCode);
  }

  /**
   * Too many failed passwords or codes for this account in the last window →
   * 429. Counted from the LOGIN_FAILED audit rows, so it needs no extra state.
   */
  private async assertNotLockedOut(userId: string): Promise<void> {
    const failures = await this.prisma.userAuditLog.count({
      where: {
        targetUserId: userId,
        action: UserAuditAction.LOGIN_FAILED,
        createdAt: { gt: new Date(Date.now() - LOCKOUT_WINDOW_MS) },
      },
    });
    if (failures >= LOCKOUT_FAILURES) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many failed attempts. Try again in 15 minutes.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Record a self-initiated account event (login, password lifecycle). Actor
   * and target are the same user. Audit failures never break the auth flow.
   */
  private async recordSelfAudit(
    userId: string,
    role: Role,
    entry: {
      action: UserAuditAction;
      summary: string;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    try {
      await this.prisma.userAuditLog.create({
        data: {
          targetUserId: userId,
          actorUserId: userId,
          actorRole: role,
          action: entry.action,
          summary: entry.summary,
          ...(entry.metadata !== undefined && { metadata: entry.metadata }),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record audit (${entry.action}) for user ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private daysSince(date: Date): number {
    return (Date.now() - date.getTime()) / 86_400_000;
  }
}
