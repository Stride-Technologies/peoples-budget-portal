import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OfficeScopeService } from '../permissions/office-scope.service.js';
import { EventsService } from '../events/events.service.js';
import { PERMISSION_CATALOG_KEYS } from '../permissions/permission-catalog.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { UpdateGrantsDto } from './dto/update-grants.dto.js';
import {
  assertCanManageUser,
  assertGrantsWithinRequester,
} from './user-access.js';
import { Prisma, Role, UserAuditAction } from '../generated/prisma/index.js';

export interface UserGrants {
  permissions: string[];
  allOfficesScope: boolean;
  officeIds: string[];
}

/**
 * Reads and replaces a user's two authorization dimensions: granted permission
 * keys and office scope (Phase 1 D11 / D2).
 *
 * Both are **replace-set**: the payload is the complete list, so the control
 * panel can send exactly what the checkboxes show. An omitted field is left
 * alone, which lets the permissions grid and the office picker save
 * independently.
 *
 * Kept out of `UsersService` for the same reason `programs/` splits by concern —
 * grants have their own audit actions, their own cache invalidation, and their
 * own lockout guard.
 */
@Injectable()
export class UserGrantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly officeScope: OfficeScopeService,
    @Optional() private readonly events?: EventsService,
  ) {}

  /** A HEAD reads and edits grants only for users in their own office or CSO. */
  async get(userId: string, requester: JwtPayload): Promise<UserGrants> {
    await this.assertCanManage(userId, requester);
    return this.read(userId);
  }

  private async assertCanManage(userId: string, requester: JwtPayload) {
    if (requester.role === Role.SUPER_ADMIN) return;
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        lguusers: { select: { officeId: true } },
        ncpcusers: { select: { civilSocietyOrganizationId: true } },
      },
    });
    if (!target) throw new NotFoundException('User not found');
    assertCanManageUser(target, requester);
  }

  private async read(userId: string): Promise<UserGrants> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        allOfficesScope: true,
        permissions: { select: { key: true } },
        officeScopes: { select: { officeId: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      permissions: user.permissions.map((p) => p.key).sort(),
      allOfficesScope: user.allOfficesScope,
      officeIds: user.officeScopes.map((o) => o.officeId),
    };
  }

  async update(
    userId: string,
    dto: UpdateGrantsDto,
    requester: JwtPayload,
  ): Promise<UserGrants> {
    const before = await this.get(userId, requester);

    if (dto.permissions) {
      const unknown = dto.permissions.filter(
        (k) => !PERMISSION_CATALOG_KEYS.includes(k),
      );
      if (unknown.length > 0) {
        throw new BadRequestException(
          `Unknown permission key(s): ${unknown.join(', ')}`,
        );
      }

      // Same shape as the existing self-deactivation guard: an admin must not be
      // able to lock themselves out of the screen they are standing on.
      if (
        userId === requester.sub &&
        requester.role !== Role.SUPER_ADMIN &&
        before.permissions.includes('users:write') &&
        !dto.permissions.includes('users:write')
      ) {
        throw new ForbiddenException(
          'You cannot remove your own user-management permission',
        );
      }
    }

    if (dto.officeIds?.length) {
      const found = await this.prisma.office.count({
        where: { id: { in: dto.officeIds } },
      });
      if (found !== dto.officeIds.length) {
        throw new BadRequestException('One or more offices do not exist');
      }
    }

    await assertGrantsWithinRequester(
      this.prisma,
      this.officeScope,
      requester,
      {
        permissions: dto.permissions?.filter(
          (k) => !before.permissions.includes(k),
        ),
        officeIds: dto.officeIds?.filter(
          (id) => !before.officeIds.includes(id),
        ),
        allOfficesScope:
          dto.allOfficesScope === true && !before.allOfficesScope,
      },
    );

    const logs: Prisma.UserAuditLogCreateManyInput[] = [];
    const actorBase = {
      targetUserId: userId,
      actorUserId: requester.sub,
      actorRole: requester.role,
    };

    if (dto.permissions) {
      const added = dto.permissions.filter(
        (k) => !before.permissions.includes(k),
      );
      const removed = before.permissions.filter(
        (k) => !dto.permissions!.includes(k),
      );
      if (added.length > 0 || removed.length > 0) {
        logs.push({
          ...actorBase,
          action: UserAuditAction.PERMISSIONS_CHANGED,
          summary: summarizeDelta('permission', added, removed),
          metadata: { added, removed, after: dto.permissions },
        });
      }
    }

    const allOfficesChanged =
      dto.allOfficesScope !== undefined &&
      dto.allOfficesScope !== before.allOfficesScope;
    const officesAdded = dto.officeIds
      ? dto.officeIds.filter((id) => !before.officeIds.includes(id))
      : [];
    const officesRemoved = dto.officeIds
      ? before.officeIds.filter((id) => !dto.officeIds!.includes(id))
      : [];

    if (
      allOfficesChanged ||
      officesAdded.length > 0 ||
      officesRemoved.length > 0
    ) {
      const parts: string[] = [];
      if (allOfficesChanged) {
        parts.push(
          dto.allOfficesScope
            ? 'Granted access to all offices'
            : 'Revoked all-offices access',
        );
      }
      if (officesAdded.length > 0 || officesRemoved.length > 0) {
        parts.push(summarizeDelta('office', officesAdded, officesRemoved));
      }
      logs.push({
        ...actorBase,
        action: UserAuditAction.OFFICE_SCOPE_CHANGED,
        summary: parts.join('; '),
        metadata: {
          allOfficesScope: dto.allOfficesScope ?? before.allOfficesScope,
          added: officesAdded,
          removed: officesRemoved,
          after: dto.officeIds ?? before.officeIds,
        },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.permissions) {
        await tx.userPermission.deleteMany({
          where: { userId, key: { notIn: dto.permissions } },
        });
        await tx.userPermission.createMany({
          data: dto.permissions.map((key) => ({
            userId,
            key,
            grantedBy: requester.sub,
          })),
          skipDuplicates: true,
        });
      }

      if (dto.allOfficesScope !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: { allOfficesScope: dto.allOfficesScope },
        });
      }

      if (dto.officeIds) {
        await tx.userOfficeScope.deleteMany({
          where: { userId, officeId: { notIn: dto.officeIds } },
        });
        await tx.userOfficeScope.createMany({
          data: dto.officeIds.map((officeId) => ({
            userId,
            officeId,
            grantedBy: requester.sub,
          })),
          skipDuplicates: true,
        });
      }

      if (logs.length > 0) {
        await tx.userAuditLog.createMany({ data: logs });
      }
    });

    // The JWT carries a stale permission list until it expires; the guard's DB
    // fallback covers additions. Office scope is cached, so it must be dropped.
    await this.officeScope.invalidate(userId);
    this.events?.closeForUser(userId);

    return this.read(userId);
  }
}

function summarizeDelta(
  noun: string,
  added: string[],
  removed: string[],
): string {
  const parts: string[] = [];
  if (added.length > 0) parts.push(`+${added.length} ${noun}(s)`);
  if (removed.length > 0) parts.push(`-${removed.length} ${noun}(s)`);
  return parts.join(', ');
}
