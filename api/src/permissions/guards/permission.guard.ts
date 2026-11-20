import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from '../../auth/decorators/public.decorator.js';
import type { JwtPayload } from '../../auth/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator.js';
import { userHasPermission } from '../user-has-permission.js';

/**
 * Checks the permission key declared by `@RequirePermission()` against the
 * caller's granted permissions. Registered globally *after* `JwtGuard`, so
 * `request.user` is populated by the time this runs.
 *
 * This is the "can I do this verb?" half of authorization. The orthogonal half —
 * "on whose records?" — is office scope, checked in the service layer where the
 * resource (and therefore its `officeId`) has been loaded. Both must pass.
 * See docs/design/phase-1-publish-scope.md §5.1.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    // No key on the route: allow. Routes are migrated incrementally and the
    // registry reports coverage, so an unannotated route keeps working.
    if (!required) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;
    if (!user) throw new UnauthorizedException();

    if (!(await userHasPermission(this.prisma, user, required))) {
      throw new ForbiddenException('Insufficient permission');
    }
    return true;
  }
}
