import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { ProgramAuditQueryService } from './program-audit-query.service.js';

/**
 * The **edit history** surface. Named `edit-history` rather than `history`
 * because `GET /project-activities/:id/history` is already taken by version
 * snapshots — keeping the distinction visible in the API itself is cheaper than
 * explaining it twice in the client.
 */
@ApiTags('edit-history')
@ApiBearerAuth('access-token')
@Controller()
export class ProgramAuditController {
  constructor(private readonly query: ProgramAuditQueryService) {}

  @Get('programs/:id/edit-history')
  @RequirePermission('aip:audit')
  @ApiOperation({
    summary:
      'Who changed what on this program and every PPA under it, newest first. Append-only; there is no write or delete counterpart.',
  })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'actorUserId', required: false })
  @ApiQuery({ name: 'targetId', required: false })
  @ApiQuery({ name: 'since', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  programHistory(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Query('action') action?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('targetId') targetId?: string,
    @Query('since') since?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.query.forProgram(
      id,
      { action, actorUserId, targetId, since, cursor, limit: toInt(limit) },
      user,
    );
  }

  @Get('admin/edit-history')
  @RequirePermission('aip:audit')
  @ApiOperation({
    summary:
      'Every program the caller can audit, newest first — the cross-program stream. Bounded by office scope; all-offices users see the whole city.',
  })
  @ApiQuery({ name: 'officeId', required: false })
  @ApiQuery({ name: 'programId', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'actorUserId', required: false })
  @ApiQuery({ name: 'since', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  allHistory(
    @CurrentUser() user: JwtPayload,
    @Query('officeId') officeId?: string,
    @Query('programId') programId?: string,
    @Query('action') action?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('since') since?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.query.forAll(
      {
        officeId,
        programId,
        action,
        actorUserId,
        since,
        cursor,
        limit: toInt(limit),
      },
      user,
    );
  }

  @Get('project-activities/:id/edit-history')
  @RequirePermission('aip:audit')
  @ApiOperation({
    summary:
      'The same stream filtered to one Project/Activity — the per-PPA History tab.',
  })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  paHistory(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.query.forProjectActivity(
      id,
      { cursor, limit: toInt(limit) },
      user,
    );
  }

  // GET programs/:id/draft-diff lives in ProgramsController, behind assertCanRead.
}

function toInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}
