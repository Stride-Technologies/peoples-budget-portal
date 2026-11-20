import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/index';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { BudgetCyclesService } from './budget-cycles.service.js';
import { SetStageDto } from './dto/set-stage.dto.js';

@ApiTags('budget-cycles')
@ApiBearerAuth('access-token')
@Controller('budget-cycles')
export class BudgetCyclesController {
  constructor(private readonly service: BudgetCyclesService) {}

  @Get()
  @RequirePermission('cycles:read')
  @ApiOperation({
    summary: 'List budget cycles (one per fiscal year), newest first',
  })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermission('cycles:read')
  @ApiOperation({ summary: 'Get one budget cycle with its AIP stage' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/stage')
  @RequirePermission('cycles:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      "Set the cycle's stage (0–9). Execution and later need an enacted budget (409 STAGE_REQUIRES_ENACTED_ORDINANCE).",
  })
  setStage(@Param('id') id: string, @Body() dto: SetStageDto) {
    return this.service.setStage(id, dto);
  }
}
