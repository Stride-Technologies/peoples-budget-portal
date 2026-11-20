import { Body, Controller, Delete, HttpCode, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClimateTagsService } from './climate-tags.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { UpsertClimateTagDto } from './dto/upsert-climate-tag.dto.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@ApiTags('climate-tags')
@ApiBearerAuth('access-token')
@Controller()
export class ClimateTagsController {
  constructor(private readonly service: ClimateTagsService) {}

  @Put('project-activities/:paId/climate-tag')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary: 'Upsert the climate change tag for a Project/Activity',
  })
  upsert(
    @Param('paId') paId: string,
    @Body() dto: UpsertClimateTagDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.upsert(paId, dto, user);
  }

  @Delete('project-activities/:paId/climate-tag')
  @RequirePermission('aip:write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove the climate tag from a Project/Activity' })
  remove(@Param('paId') paId: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(paId, user);
  }

  @Put('programs/:programId/climate-tag')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary:
      'Upsert the climate change tag on a Program itself (one that states its own costs, or a parent row)',
  })
  upsertForProgram(
    @Param('programId') programId: string,
    @Body() dto: UpsertClimateTagDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.upsertForProgram(programId, dto, user);
  }

  @Delete('programs/:programId/climate-tag')
  @RequirePermission('aip:write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove the climate tag from a Program' })
  removeForProgram(
    @Param('programId') programId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeForProgram(programId, user);
  }
}
