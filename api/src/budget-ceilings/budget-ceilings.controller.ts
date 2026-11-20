import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../generated/prisma/index';
import { BudgetCeilingsService } from './budget-ceilings.service.js';
import { CreateBudgetCeilingDto } from './dto/create-budget-ceiling.dto.js';
import { UpdateBudgetCeilingDto } from './dto/update-budget-ceiling.dto.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@ApiTags('finish-line-ceilings')
@ApiBearerAuth('access-token')
@Controller('finish-line-ceilings')
export class BudgetCeilingsController {
  constructor(private readonly service: BudgetCeilingsService) {}

  @Post()
  @RequirePermission('ceilings:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Create a finish-line budget ceiling for a PLANNING or OPEN cycle. Hard-partition LGU/CSO split.',
  })
  create(@Body() dto: CreateBudgetCeilingDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.sub);
  }

  @Get()
  @RequirePermission('cycles:read')
  @ApiOperation({ summary: 'List ceilings, optionally filtered by cycle' })
  @ApiQuery({ name: 'cycleId', required: false })
  findAll(@Query('cycleId') cycleId?: string) {
    return this.service.findAll({ cycleId });
  }

  @Get(':id')
  @RequirePermission('cycles:read')
  @ApiOperation({ summary: 'Get one ceiling with recent history' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('ceilings:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Update a ceiling while the cycle is PLANNING or OPEN. Prior state is appended to FinishLineBudgetCeilingHistory.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetCeilingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  @Delete(':id')
  @RequirePermission('ceilings:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Delete a ceiling. Only allowed while the cycle is in PLANNING and no programs reference it.',
  })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
