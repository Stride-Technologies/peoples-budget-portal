import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from './decorators/require-permission.decorator.js';
import { ALL_OFFICES, OfficeScopeService } from './office-scope.service.js';
import {
  PERMISSION_CATALOG,
  PERMISSION_TEMPLATES,
} from './permission-catalog.js';

@ApiTags('permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly officeScope: OfficeScopeService) {}

  /**
   * The offices the caller may act *on* — the second authorization dimension the
   * JWT deliberately does not carry (see `OfficeScopeService`). The UI needs it
   * to offer the right implementing-office choices; the API re-checks on write.
   */
  @Get('me/offices')
  @ApiOperation({ summary: 'List the offices in your effective scope' })
  async getMyOffices(@CurrentUser() user: JwtPayload) {
    const scope = await this.officeScope.effectiveOfficeIds(user);
    return scope === ALL_OFFICES
      ? { allOffices: true, officeIds: [] }
      : { allOffices: false, officeIds: scope };
  }
  /**
   * Served from the in-code catalog rather than the `permissions` table: the code
   * is the source of truth and the table is its mirror, so reading the code
   * cannot show the UI a key the guard does not recognise.
   */
  @Get('catalog')
  @RequirePermission('users:read')
  @ApiOperation({
    summary: 'List the permission catalog and the seed templates',
  })
  getCatalog() {
    return {
      permissions: PERMISSION_CATALOG.map((p) => ({
        key: p.key,
        label: p.label,
        module: p.module,
        description: p.description,
        enforced: p.enforced ?? false,
      })),
      templates: PERMISSION_TEMPLATES,
    };
  }
}
