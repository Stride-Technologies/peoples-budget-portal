import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Put,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { InviteUserDto } from '../auth/dto/invite-user.dto.js';
import { Role } from '../generated/prisma/index';
import { UsersService } from './users.service.js';
import { UserGrantsService } from './user-grants.service.js';
import { UpdateGrantsDto } from './dto/update-grants.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly grantsService: UserGrantsService,
  ) {}

  // ─── Self-service (account page) ──────────────────────────────────────────
  // NOTE: these `me` routes must be declared before the `:id` routes below,
  // otherwise `/users/me` is captured by the `:id` param routes.

  @Get('me')
  @ApiOperation({ summary: 'Get your own profile' })
  @ApiOkResponse({ description: 'Current user profile.' })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMe(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update your own profile (name only)' })
  @ApiOkResponse({ description: 'Updated profile.' })
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(user.sub, dto);
  }

  @Get('me/audit-logs')
  @ApiOperation({ summary: 'List your own account activity, newest first' })
  @ApiOkResponse({ description: 'Audit log entries.' })
  getMyAuditLogs(@CurrentUser() user: JwtPayload) {
    return this.usersService.findOwnAuditLogs(user.sub);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.HEAD)
  @RequirePermission('users:write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Invite a new user (SUPER_ADMIN or HEAD)' })
  @ApiCreatedResponse({ description: 'Invite sent.' })
  create(@Body() dto: InviteUserDto, @CurrentUser() user: JwtPayload) {
    return this.usersService.create(dto, user);
  }

  @Post('invites/:inviteId/resend')
  @Roles(Role.SUPER_ADMIN, Role.HEAD)
  @RequirePermission('users:write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resend a pending invite' })
  @ApiOkResponse({ description: 'Invite resent.' })
  resendInvite(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.resendInvite(inviteId, user);
  }

  @Post('invites/:inviteId/revoke')
  @Roles(Role.SUPER_ADMIN, Role.HEAD)
  @RequirePermission('users:write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke a pending invite' })
  @ApiOkResponse({ description: 'Invite revoked.' })
  revokeInvite(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.revokeInvite(inviteId, user);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.HEAD)
  @RequirePermission('users:read')
  @ApiOperation({ summary: 'List users (HEAD sees own office only)' })
  @ApiOkResponse({ description: 'User list.' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.usersService.findAll(user);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.HEAD)
  @RequirePermission('users:read')
  @ApiOperation({ summary: 'Get a single user' })
  @ApiOkResponse({ description: 'User details.' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.findOne(id, user);
  }

  @Get(':id/audit-logs')
  @Roles(Role.SUPER_ADMIN, Role.HEAD)
  @RequirePermission('users:read')
  @ApiOperation({ summary: 'List the audit trail for a user' })
  @ApiOkResponse({ description: 'Audit log entries, newest first.' })
  findAuditLogs(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.findUserAuditLogs(id, user);
  }

  @Get(':id/grants')
  @Roles(Role.SUPER_ADMIN, Role.HEAD)
  @RequirePermission('users:read')
  @ApiOperation({
    summary: 'Get a user\u2019s permission keys and office scope',
  })
  @ApiOkResponse({ description: 'Granted permissions and office scope.' })
  getGrants(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.grantsService.get(id, user);
  }

  @Put(':id/grants')
  @Roles(Role.SUPER_ADMIN, Role.HEAD)
  @RequirePermission('users:write')
  @ApiOperation({
    summary: 'Replace a user\u2019s permission keys and/or office scope',
  })
  @ApiOkResponse({ description: 'The grants after the change.' })
  updateGrants(
    @Param('id') id: string,
    @Body() dto: UpdateGrantsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.grantsService.update(id, dto, user);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.HEAD)
  @RequirePermission('users:write')
  @ApiOperation({ summary: 'Update a user (role, name)' })
  @ApiOkResponse({ description: 'Updated user.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @RequirePermission('users:write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a user (SUPER_ADMIN only)' })
  @ApiOkResponse({ description: 'User deleted.' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
