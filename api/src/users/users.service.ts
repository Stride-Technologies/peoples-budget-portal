import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PERMISSION_CATALOG_KEYS } from '../permissions/permission-catalog.js';
import { OfficeScopeService } from '../permissions/office-scope.service.js';
import { EventsService } from '../events/events.service.js';
import {
  assertCanManageUser,
  assertGrantsWithinRequester,
} from './user-access.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { InviteUserDto } from '../auth/dto/invite-user.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import {
  Prisma,
  Role,
  UserAuditAction,
  IdentityType,
  type UserInvite,
} from '../generated/prisma/index.js';

type InviteData = {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  identityType: IdentityType | null;
  officeId: string | null;
  civilSocietyOrganizationId: string | null;
  /** Applied on acceptance, in the transaction that creates the user (§5). */
  permissions?: string[];
  allOfficesScope?: boolean;
  officeScopeIds?: string[];
  invitedByUserId?: string | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly officeScope: OfficeScopeService,
    @Optional() private readonly events?: EventsService,
  ) {}

  async create(
    dto: InviteUserDto,
    requester: JwtPayload,
  ): Promise<{ message: string }> {
    // HEAD can only create STAFF in their own office
    if (requester.role === 'HEAD') {
      if (dto.role !== 'STAFF') {
        throw new ForbiddenException('HEAD can only invite STAFF');
      }
      if (dto.officeId && dto.officeId !== requester.officeId) {
        throw new ForbiddenException(
          'HEAD can only invite users to their own office',
        );
      }
      if (
        dto.civilSocietyOrganizationId &&
        dto.civilSocietyOrganizationId !== requester.civilSocietyOrganizationId
      ) {
        throw new ForbiddenException(
          'HEAD can only invite users to their own organization',
        );
      }
    }

    // Block only if the email belongs to an *active* account. A deactivated
    // account is re-invitable: staff leave and come back, and the admin wants a
    // fresh invite (new password, possibly new office/role/grants) rather than
    // flipping the old row back on. Accepting reuses that same user row, so the
    // person's program authorship and audit history stay attached.
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { isActive: true },
    });
    if (existingUser?.isActive) {
      throw new ConflictException('Email already in use');
    }

    // Block if there is already an active (non-revoked, non-used) invite
    const activeInvite = await this.prisma.userInvite.findFirst({
      where: { email: dto.email, usedAt: null, revokedAt: null },
    });
    if (activeInvite) {
      throw new ConflictException(
        'An active invite already exists for this email',
      );
    }

    if (dto.permissions?.length) {
      const unknown = dto.permissions.filter(
        (k) => !PERMISSION_CATALOG_KEYS.includes(k),
      );
      if (unknown.length > 0) {
        throw new BadRequestException(
          `Unknown permission key(s): ${unknown.join(', ')}`,
        );
      }
    }
    if (dto.officeScopeIds?.length) {
      const found = await this.prisma.office.count({
        where: { id: { in: dto.officeScopeIds } },
      });
      if (found !== dto.officeScopeIds.length) {
        throw new BadRequestException('One or more offices do not exist');
      }
    }
    await assertGrantsWithinRequester(
      this.prisma,
      this.officeScope,
      requester,
      {
        permissions: dto.permissions,
        officeIds: dto.officeScopeIds,
        allOfficesScope: dto.allOfficesScope,
      },
    );

    const isSuperAdmin = dto.role === Role.SUPER_ADMIN;
    // A Developer belongs to no office or CSO: what it can reach is its
    // permissions and office scope alone, so a home office or CSO sent with
    // the invite is dropped rather than quietly widening that.
    const noOrg = isSuperAdmin || dto.identityType === IdentityType.DEVELOPER;

    await this.createAndSendInvite({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      role: dto.role,
      identityType: isSuperAdmin ? null : (dto.identityType ?? null),
      officeId: noOrg ? null : (dto.officeId ?? null),
      civilSocietyOrganizationId: noOrg
        ? null
        : (dto.civilSocietyOrganizationId ?? null),
      // A SUPER_ADMIN bypasses both dimensions, so storing grants for one would
      // be dead data that misleads whoever reads the invite later.
      permissions: isSuperAdmin ? [] : (dto.permissions ?? []),
      allOfficesScope: isSuperAdmin ? false : (dto.allOfficesScope ?? false),
      officeScopeIds: isSuperAdmin ? [] : (dto.officeScopeIds ?? []),
      invitedByUserId: requester.sub,
    });

    return { message: 'User invited. An email has been sent.' };
  }

  async resendInvite(
    inviteId: string,
    requester: JwtPayload,
  ): Promise<{ message: string }> {
    const invite = await this.findPendingInviteOrFail(inviteId);
    this.assertInviteAccess(invite, requester);

    const replacement = await this.createInviteRecord({
      firstName: invite.firstName,
      lastName: invite.lastName,
      email: invite.email,
      role: invite.role,
      identityType: invite.identityType,
      officeId: invite.officeId,
      civilSocietyOrganizationId: invite.civilSocietyOrganizationId,
    });

    try {
      await this.sendInviteEmail(replacement.invite, replacement.rawToken);
    } catch {
      await this.prisma.userInvite.update({
        where: { id: replacement.invite.id },
        data: { revokedAt: new Date() },
      });
      throw new ServiceUnavailableException(
        'The replacement invite email could not be sent. The existing invite remains pending. Please try again later.',
      );
    }

    await this.prisma.userInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });

    return { message: 'Invite resent.' };
  }

  async revokeInvite(
    inviteId: string,
    requester: JwtPayload,
  ): Promise<{ message: string }> {
    const invite = await this.findPendingInviteOrFail(inviteId);
    this.assertInviteAccess(invite, requester);

    await this.prisma.userInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });

    return { message: 'Invite revoked.' };
  }

  async findAll(requester: JwtPayload) {
    // ── Active users ──────────────────────────────────────────────────────
    const userWhere =
      requester.role === 'SUPER_ADMIN'
        ? {}
        : requester.officeId
          ? { lguusers: { some: { officeId: requester.officeId } } }
          : requester.civilSocietyOrganizationId
            ? {
                ncpcusers: {
                  some: {
                    civilSocietyOrganizationId:
                      requester.civilSocietyOrganizationId,
                  },
                },
              }
            : { id: 'none' };

    const users = await this.prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        identityType: true,
        isActive: true,
        createdAt: true,
        lguusers: { select: { officeId: true } },
        ncpcusers: { select: { civilSocietyOrganizationId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // ── Pending / expired invites (not yet accepted, not revoked) ─────────
    const inviteWhere =
      requester.role === 'SUPER_ADMIN'
        ? { userId: null, usedAt: null, revokedAt: null }
        : requester.officeId
          ? {
              userId: null,
              usedAt: null,
              revokedAt: null,
              officeId: requester.officeId,
            }
          : requester.civilSocietyOrganizationId
            ? {
                userId: null,
                usedAt: null,
                revokedAt: null,
                civilSocietyOrganizationId:
                  requester.civilSocietyOrganizationId,
              }
            : { id: 'none' };

    const invites = await this.prisma.userInvite.findMany({
      where: inviteWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        identityType: true,
        officeId: true,
        civilSocietyOrganizationId: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // ── Merge into a unified shape the frontend already understands ────────
    const userRows = users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      identityType: u.identityType,
      isEmailVerified: true,
      isActive: u.isActive,
      createdAt: u.createdAt,
      lguusers: u.lguusers,
      ncpcusers: u.ncpcusers,
      userInvites: [] as { expiresAt: Date }[],
    }));

    const inviteRows = invites.map((inv) => ({
      id: inv.id, // invite ID — used by the frontend for resend/revoke actions
      firstName: inv.firstName,
      lastName: inv.lastName,
      email: inv.email,
      role: inv.role,
      identityType: inv.identityType,
      isEmailVerified: false,
      isActive: true,
      createdAt: inv.createdAt,
      lguusers: inv.officeId ? [{ officeId: inv.officeId }] : [],
      ncpcusers: inv.civilSocietyOrganizationId
        ? [{ civilSocietyOrganizationId: inv.civilSocietyOrganizationId }]
        : [],
      userInvites: [{ expiresAt: inv.expiresAt }],
    }));

    return [...userRows, ...inviteRows].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async findOne(id: string, requester: JwtPayload) {
    const user = await this.findOneOrFail(id);
    this.assertOfficeAccess(user, requester);
    return user;
  }

  async update(
    id: string,
    data: {
      role?: Role;
      firstName?: string;
      lastName?: string;
      officeId?: string;
      civilSocietyOrganizationId?: string;
      isActive?: boolean;
    },
    requester: JwtPayload,
  ) {
    const user = await this.findOneOrFail(id);
    this.assertOfficeAccess(user, requester);

    // SUPER_ADMIN accounts are not managed through this office-scoped editor.
    if (user.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Super admin accounts cannot be edited here',
      );
    }

    const isHead = requester.role === 'HEAD';
    if (isHead && data.role && data.role !== 'STAFF') {
      throw new ForbiddenException('HEAD can only assign the STAFF role');
    }
    if (
      isHead &&
      (data.officeId !== undefined ||
        data.civilSocietyOrganizationId !== undefined)
    ) {
      throw new ForbiddenException(
        'Only a super admin can reassign a user to another office',
      );
    }

    // Guard against an admin locking themselves out.
    if (id === requester.sub) {
      if (data.isActive === false) {
        throw new ForbiddenException('You cannot deactivate your own account');
      }
      if (data.role && data.role !== user.role) {
        throw new ForbiddenException('You cannot change your own role');
      }
    }

    const currentOfficeId = user.lguusers[0]?.officeId ?? null;
    const currentCsoId = user.ncpcusers[0]?.civilSocietyOrganizationId ?? null;

    const logs: Prisma.UserAuditLogCreateManyInput[] = [];
    const actorBase = {
      targetUserId: id,
      actorUserId: requester.sub,
      actorRole: requester.role,
    };

    // ── Profile (name) ────────────────────────────────────────────────────
    if (
      (data.firstName && data.firstName !== user.firstName) ||
      (data.lastName && data.lastName !== user.lastName)
    ) {
      const before = `${user.firstName} ${user.lastName}`;
      const after = `${data.firstName ?? user.firstName} ${data.lastName ?? user.lastName}`;
      logs.push({
        ...actorBase,
        action: UserAuditAction.PROFILE_UPDATED,
        summary: `Renamed "${before}" → "${after}"`,
        metadata: { before, after },
      });
    }

    // ── Role ──────────────────────────────────────────────────────────────
    if (data.role && data.role !== user.role) {
      logs.push({
        ...actorBase,
        action: UserAuditAction.ROLE_CHANGED,
        summary: `Role ${this.formatRole(user.role)} → ${this.formatRole(data.role)}`,
        metadata: { before: user.role, after: data.role },
      });
    }

    // ── Activation ──────────────────────────────────────────────────────────
    if (data.isActive !== undefined && data.isActive !== user.isActive) {
      logs.push({
        ...actorBase,
        action: data.isActive
          ? UserAuditAction.ACTIVATED
          : UserAuditAction.DEACTIVATED,
        summary: data.isActive ? 'Account reactivated' : 'Account deactivated',
        metadata: { before: user.isActive, after: data.isActive },
      });
    }

    // ── Office reassignment (super admin only; validated above) ─────────────
    let officeChange:
      | { kind: 'lgu'; officeId: string }
      | { kind: 'ncpc'; civilSocietyOrganizationId: string }
      | null = null;

    if (data.officeId !== undefined) {
      if (user.ncpcusers.length > 0 || user.lguusers.length === 0) {
        throw new BadRequestException(
          'This user is not an office-based (LGU/LFC) member',
        );
      }
      if (data.officeId !== currentOfficeId) {
        const target = await this.prisma.office.findUnique({
          where: { id: data.officeId },
          select: { id: true, acronym: true, name: true, isActive: true },
        });
        if (!target) throw new NotFoundException('Office not found');
        if (!target.isActive) {
          throw new BadRequestException('Cannot assign to an inactive office');
        }
        const fromLabel = await this.resolveOfficeLabel(currentOfficeId);
        officeChange = { kind: 'lgu', officeId: target.id };
        logs.push({
          ...actorBase,
          action: UserAuditAction.OFFICE_CHANGED,
          summary: `Office ${fromLabel ?? '—'} → ${this.officeLabel(target)}`,
          metadata: { before: currentOfficeId, after: target.id },
        });
      }
    } else if (data.civilSocietyOrganizationId !== undefined) {
      if (user.lguusers.length > 0 || user.ncpcusers.length === 0) {
        throw new BadRequestException('This user is not a CSO (NCPC) member');
      }
      if (data.civilSocietyOrganizationId !== currentCsoId) {
        const target = await this.prisma.civilSocietyOrganization.findUnique({
          where: { id: data.civilSocietyOrganizationId },
          select: { id: true, name: true, isActive: true },
        });
        if (!target) throw new NotFoundException('Organization not found');
        if (!target.isActive) {
          throw new BadRequestException(
            'Cannot assign to an inactive organization',
          );
        }
        const from = currentCsoId
          ? await this.prisma.civilSocietyOrganization.findUnique({
              where: { id: currentCsoId },
              select: { name: true },
            })
          : null;
        officeChange = {
          kind: 'ncpc',
          civilSocietyOrganizationId: target.id,
        };
        logs.push({
          ...actorBase,
          action: UserAuditAction.OFFICE_CHANGED,
          summary: `Organization ${from?.name ?? '—'} → ${target.name}`,
          metadata: { before: currentCsoId, after: target.id },
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: {
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.lastName && { lastName: data.lastName }),
          ...(data.role && { role: data.role }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          identityType: true,
          isActive: true,
          updatedAt: true,
        },
      });

      if (officeChange?.kind === 'lgu') {
        await tx.lGUUser.deleteMany({ where: { userId: id } });
        await tx.lGUUser.create({
          data: { userId: id, officeId: officeChange.officeId },
        });
      } else if (officeChange?.kind === 'ncpc') {
        await tx.nCPCUser.deleteMany({ where: { userId: id } });
        await tx.nCPCUser.create({
          data: {
            userId: id,
            civilSocietyOrganizationId: officeChange.civilSocietyOrganizationId,
          },
        });
      }

      if (logs.length > 0) {
        await tx.userAuditLog.createMany({ data: logs });
      }

      return u;
    });

    // Deactivating a user invalidates their active sessions.
    if (data.isActive === false && data.isActive !== user.isActive) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    // What their live activity stream may show has changed: end it, so the
    // reconnect is authorized afresh.
    if (
      officeChange ||
      (data.role && data.role !== user.role) ||
      (data.isActive !== undefined && data.isActive !== user.isActive)
    ) {
      this.events?.closeForUser(id);
    }

    return updated;
  }

  /** Audit trail for a single user, newest first. Office-scoped for HEAD. */
  async findUserAuditLogs(id: string, requester: JwtPayload) {
    const user = await this.findOneOrFail(id);
    this.assertOfficeAccess(user, requester);

    return this.prisma.userAuditLog.findMany({
      where: { targetUserId: id },
      select: {
        id: true,
        action: true,
        summary: true,
        metadata: true,
        actorRole: true,
        createdAt: true,
        actor: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Self-service (account page) ──────────────────────────────────────────

  /** The signed-in user's own profile, with a resolved office/org label. */
  async getMe(userId: string) {
    const user = await this.findOneOrFail(userId);
    return this.toProfile(user);
  }

  /** Update the caller's own first/last name. Logs a PROFILE_UPDATED entry. */
  async updateMe(userId: string, dto: UpdateProfileDto) {
    const user = await this.findOneOrFail(userId);

    const nextFirst = dto.firstName?.trim() || user.firstName;
    const nextLast = dto.lastName?.trim() || user.lastName;
    const changed = nextFirst !== user.firstName || nextLast !== user.lastName;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { firstName: nextFirst, lastName: nextLast },
      });

      if (changed) {
        const before = `${user.firstName} ${user.lastName}`;
        const after = `${nextFirst} ${nextLast}`;
        await tx.userAuditLog.create({
          data: {
            targetUserId: userId,
            actorUserId: userId,
            actorRole: user.role,
            action: UserAuditAction.PROFILE_UPDATED,
            summary: `Renamed "${before}" → "${after}"`,
            metadata: { before, after },
          },
        });
      }
    });

    return this.getMe(userId);
  }

  /** The caller's own audit trail, newest first (capped). */
  async findOwnAuditLogs(userId: string) {
    return this.prisma.userAuditLog.findMany({
      where: { targetUserId: userId },
      select: {
        id: true,
        action: true,
        summary: true,
        metadata: true,
        actorRole: true,
        createdAt: true,
        actor: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async toProfile(user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: Role;
    identityType: IdentityType | null;
    isEmailVerified: boolean;
    isActive: boolean;
    createdAt: Date;
    lguusers: { officeId: string }[];
    ncpcusers: { civilSocietyOrganizationId: string | null }[];
  }) {
    const officeId = user.lguusers[0]?.officeId ?? null;
    const csoId = user.ncpcusers[0]?.civilSocietyOrganizationId ?? null;

    let officeName: string | null = null;
    if (officeId) {
      officeName = await this.resolveOfficeLabel(officeId);
    } else if (csoId) {
      const cso = await this.prisma.civilSocietyOrganization.findUnique({
        where: { id: csoId },
        select: { name: true },
      });
      officeName = cso?.name ?? null;
    }

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      identityType: user.identityType,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      createdAt: user.createdAt,
      officeName,
    };
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOneOrFail(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'User deleted.' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findOneOrFail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        identityType: true,
        isEmailVerified: true,
        isActive: true,
        createdAt: true,
        lguusers: { select: { officeId: true } },
        ncpcusers: { select: { civilSocietyOrganizationId: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async resolveOfficeLabel(
    officeId: string | null,
  ): Promise<string | null> {
    if (!officeId) return null;
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: { acronym: true, name: true },
    });
    return office ? this.officeLabel(office) : null;
  }

  private officeLabel(office: { acronym: string; name: string }): string {
    return office.name === office.acronym
      ? office.acronym
      : `${office.acronym} — ${office.name}`;
  }

  private async findPendingInviteOrFail(inviteId: string) {
    const invite = await this.prisma.userInvite.findUnique({
      where: { id: inviteId },
    });
    if (!invite || invite.userId !== null || invite.usedAt !== null) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.revokedAt !== null) {
      throw new ForbiddenException('Invite has already been revoked');
    }
    return invite;
  }

  private assertOfficeAccess(
    user: {
      role?: Role;
      lguusers: { officeId: string }[];
      ncpcusers: { civilSocietyOrganizationId: string | null }[];
    },
    requester: JwtPayload,
  ): void {
    assertCanManageUser(user, requester);
  }

  private assertInviteAccess(
    invite: {
      officeId: string | null;
      civilSocietyOrganizationId: string | null;
    },
    requester: JwtPayload,
  ): void {
    if (requester.role === 'SUPER_ADMIN') return;

    const sameOffice =
      requester.officeId && invite.officeId === requester.officeId;
    const sameOrg =
      requester.civilSocietyOrganizationId &&
      invite.civilSocietyOrganizationId ===
        requester.civilSocietyOrganizationId;

    if (!sameOffice && !sameOrg) throw new ForbiddenException();
  }

  private async createAndSendInvite(data: InviteData): Promise<UserInvite> {
    const invite = await this.createInviteRecord(data);

    try {
      await this.sendInviteEmail(invite.invite, invite.rawToken);
      return invite.invite;
    } catch {
      await this.prisma.userInvite.update({
        where: { id: invite.invite.id },
        data: { revokedAt: new Date() },
      });
      throw new ServiceUnavailableException(
        'The invite email could not be sent. The invite was revoked. Please try again later.',
      );
    }
  }

  private async createInviteRecord(
    data: InviteData,
  ): Promise<{ invite: UserInvite; rawToken: string }> {
    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1_000); // 48 hours

    const invite = await this.prisma.userInvite.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        role: data.role,
        identityType: data.identityType ?? undefined,
        officeId: data.officeId ?? undefined,
        civilSocietyOrganizationId:
          data.civilSocietyOrganizationId ?? undefined,
        permissions: data.permissions ?? [],
        allOfficesScope: data.allOfficesScope ?? false,
        officeScopeIds: data.officeScopeIds ?? [],
        invitedByUserId: data.invitedByUserId ?? undefined,
        token: tokenHash,
        expiresAt,
      },
    });

    return { invite, rawToken };
  }

  private async sendInviteEmail(
    invite: Pick<
      UserInvite,
      'email' | 'firstName' | 'role' | 'officeId' | 'civilSocietyOrganizationId'
    >,
    rawToken: string,
  ): Promise<void> {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const inviteUrl = `${frontendUrl}/set-password?token=${rawToken}`;
    const officeName = await this.resolveInviteOfficeName(invite);
    await this.mail.sendInvite(invite.email, invite.firstName, inviteUrl, {
      officeId: invite.officeId,
      civilSocietyOrganizationId: invite.civilSocietyOrganizationId,
      role: this.formatRole(invite.role),
      officeName,
    });
  }

  private async resolveInviteOfficeName(invite: {
    officeId: string | null;
    civilSocietyOrganizationId: string | null;
  }): Promise<string | null> {
    if (invite.officeId) {
      const office = await this.prisma.office.findUnique({
        where: { id: invite.officeId },
        select: { acronym: true, name: true },
      });
      if (!office) return null;
      return office.name === office.acronym
        ? office.acronym
        : `${office.acronym} - ${office.name}`;
    }

    if (invite.civilSocietyOrganizationId) {
      const cso = await this.prisma.civilSocietyOrganization.findUnique({
        where: { id: invite.civilSocietyOrganizationId },
        select: { name: true },
      });
      return cso?.name ?? null;
    }

    return null;
  }

  private formatRole(role: Role): string {
    return role
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
