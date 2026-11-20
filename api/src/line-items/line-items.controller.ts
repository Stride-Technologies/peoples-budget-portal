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
import { LineItemsService } from './line-items.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { CreateLineItemDto } from './dto/create-line-item.dto.js';
import { UpdateLineItemDto } from './dto/update-line-item.dto.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@ApiTags('line-items')
@ApiBearerAuth('access-token')
@Controller()
export class LineItemsController {
  constructor(private readonly service: LineItemsService) {}

  @Get('project-activities/:paId/line-items')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary:
      'List line items for a Project/Activity (lazy-load path for endorser / reviewer views)',
  })
  listByPA(@Param('paId') paId: string, @CurrentUser() user: JwtPayload) {
    return this.service.listByPA(paId, user);
  }

  @Post('project-activities/:paId/line-items')
  @RequirePermission('aip:write')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Add a line item; recomputes PA + program rollups transactionally',
  })
  create(
    @Param('paId') paId: string,
    @Body() dto: CreateLineItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(paId, dto, user);
  }

  @Patch('line-items/:id')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary: 'Update a line item (parent program must be DRAFT)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLineItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete('line-items/:id')
  @RequirePermission('aip:write')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Hard-delete a line item (parent program must be DRAFT)',
  })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user);
  }
}
