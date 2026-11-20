import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/index';

export const ROLES_KEY = 'ROLES_KEY';

/** Restrict a route to users that hold one of the specified roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
