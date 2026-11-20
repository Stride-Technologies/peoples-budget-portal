import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ThematicTagsService } from './thematic-tags.service.js';
import { CreateThematicTagDto } from './dto/create-thematic-tag.dto.js';
import { UpdateThematicTagDto } from './dto/update-thematic-tag.dto.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/index';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';

@ApiTags('thematic-tags')
@ApiBearerAuth('access-token')
@Controller('thematic-tags')
export class ThematicTagsController {
  constructor(private readonly service: ThematicTagsService) {}

  @Get()
  @RequirePermission('aip:read')
  @ApiOperation({
    summary:
      'Search the thematic tag catalog (the picker calls this as the user types)',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  list(
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.service.list({
      search,
      activeOnly:
        activeOnly === 'false'
          ? false
          : activeOnly === 'true'
            ? true
            : undefined,
    });
  }

  @Get('all')
  @RequirePermission('reference:read')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'List every thematic tag, active and inactive, with usage counts (admin)',
  })
  listAll() {
    return this.service.listAll();
  }

  @Post()
  @RequirePermission('aip:tag')
  @ApiOperation({
    summary:
      'Find an existing tag by normalized name, or create a new one; 409s with a close-match hint unless confirmNew is set',
  })
  async create(
    @Body() dto: CreateThematicTagDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { tag, created } = await this.service.findOrCreate(dto, user);
    response.status(created ? 201 : 200);
    return tag;
  }

  @Patch(':id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Rename or activate/deactivate a tag (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateThematicTagDto) {
    return this.service.update(id, dto);
  }
}
