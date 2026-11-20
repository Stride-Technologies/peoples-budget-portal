import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  /**
   * City-wide by design — every authenticated user sees the same figures.
   *
   * Do **not** add `@Roles`, `@RequirePermission`, or service-layer office
   * scoping here. The tracker exists so offices can compare their progress
   * against the rest of the city; scoping it would hand each role a different
   * denominator and make the percentages meaningless.
   */
  @Get('summary')
  @ApiOperation({
    summary:
      'City-wide AIP progress: program counts, proposed budget, and submission progress by cluster and office. Not scoped to the caller’s office.',
  })
  @ApiQuery({
    name: 'cycleId',
    required: false,
    description: 'Defaults to the active cycle (OPEN → PLANNING → newest).',
  })
  @ApiOkResponse({ description: 'Dashboard summary for one AIP cycle.' })
  summary(@Query('cycleId') cycleId?: string) {
    return this.service.summary(cycleId);
  }
}
