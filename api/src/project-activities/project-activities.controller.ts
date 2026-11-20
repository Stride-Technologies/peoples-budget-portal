import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectActivitiesService } from './project-activities.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { CreateProjectActivityDto } from './dto/create-project-activity.dto.js';
import { UpdateProjectActivityDto } from './dto/update-project-activity.dto.js';
import { ReorderProjectActivitiesDto } from './dto/reorder-project-activities.dto.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@ApiTags('project-activities')
@ApiBearerAuth('access-token')
@Controller()
export class ProjectActivitiesController {
  constructor(private readonly service: ProjectActivitiesService) {}

  @Post('programs/:programId/project-activities')
  @RequirePermission('aip:write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a Project/Activity to a DRAFT program' })
  create(
    @Param('programId') programId: string,
    @Body() dto: CreateProjectActivityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(programId, dto, user);
  }

  @Patch('programs/:programId/project-activities/reorder')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary:
      'Reorder a sibling group of Projects/Activities, renumbering their AIP codes',
  })
  reorder(
    @Param('programId') programId: string,
    @Body() dto: ReorderProjectActivitiesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reorder(programId, dto, user);
  }

  @Get('project-activities/:id')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary: 'Get one Project/Activity with line items and climate tag',
  })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user);
  }

  @Patch('project-activities/:id')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary: 'Update a Project/Activity (parent program must be DRAFT)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectActivityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete('project-activities/:id')
  @RequirePermission('aip:write')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Hard-delete a Project/Activity (parent program must be DRAFT)',
  })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user);
  }

  @Get('project-activities/:id/activity-stream')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary: 'Get comment activity stream for a Project/Activity',
  })
  paActivityStream(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.paActivityStream(id, user);
  }

  @Get('project-activities/:id/history')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary: 'Get version history snapshots for a Project/Activity',
  })
  history(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.history(id, user);
  }

  @Post('project-activities/:id/thematic-tags')
  @HttpCode(200)
  @RequirePermission('aip:tag')
  @ApiOperation({
    summary:
      'Apply a thematic tag directly to this Project/Activity (idempotent). Only while the parent program is editable.',
  })
  applyThematicTag(
    @Param('id') id: string,
    @Body('tagId') tagId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.applyThematicTag(id, tagId, user);
  }

  @Delete('project-activities/:id/thematic-tags/:tagId')
  @HttpCode(200)
  @RequirePermission('aip:tag')
  @ApiOperation({
    summary:
      "Remove a thematic tag directly applied to this Project/Activity. Rejected if the tag is only present through the parent program's inheritance.",
  })
  removeThematicTag(
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeThematicTag(id, tagId, user);
  }
}
