import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { Prisma } from '../generated/prisma/index';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { BudgetDocumentsService } from './budget-documents.service.js';

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

/** `POST /budget-documents/carry-forward`. */
export class CarryForwardDto {
  @IsString()
  @IsNotEmpty()
  aipCycleId!: string;

  /** Pesos, as a decimal string: what the city can appropriate this year. */
  @Matches(MONEY, {
    message: 'allocableTotal must be an amount like 1234567.89',
  })
  allocableTotal!: string;
}

/** `PATCH /budget-documents/:id/allocable`. */
export class AllocableTotalDto {
  @Matches(MONEY, {
    message: 'allocableTotal must be an amount like 1234567.89',
  })
  allocableTotal!: string;
}

/**
 * Staff reads and review actions on LEPs and Ordinances (specs/012). Imports
 * run through the CLI (`db:import:document` → `db:seed:document`), not HTTP;
 * the one document made here is a draft LEP carried forward from the AIP.
 */
@ApiTags('budget-documents')
@ApiBearerAuth('access-token')
@Controller('budget-documents')
export class BudgetDocumentsController {
  constructor(private readonly service: BudgetDocumentsService) {}

  @Get()
  @RequirePermission('budget:read')
  @ApiOperation({
    summary: 'List LEPs and Ordinances, optionally for one budget cycle',
  })
  @ApiQuery({ name: 'budgetCycleId', required: false })
  list(@Query('budgetCycleId') budgetCycleId?: string) {
    return this.service.list(budgetCycleId);
  }

  @Post('carry-forward')
  @RequirePermission('budget:write')
  @ApiOperation({
    summary:
      "Start the year's DRAFT LEP from its adopted AIP and approved PPMPs. 409 AIP_NOT_ADOPTED / AIP_EMPTY / LEP_EXISTS",
  })
  @ApiBody({
    schema: {
      properties: {
        aipCycleId: { type: 'string' },
        allocableTotal: { type: 'string', example: '2600000000.00' },
      },
    },
  })
  carryForward(@Body() body: CarryForwardDto, @CurrentUser() user: JwtPayload) {
    return this.service.carryForward(
      body.aipCycleId,
      user.sub,
      new Prisma.Decimal(body.allocableTotal),
    );
  }

  @Patch(':id/allocable')
  @RequirePermission('budget:write')
  @ApiOperation({ summary: "Revise a draft LEP's total allocable budget" })
  @ApiBody({ schema: { properties: { allocableTotal: { type: 'string' } } } })
  setAllocable(
    @Param('id') id: string,
    @Body() body: AllocableTotalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.setAllocableTotal(
      id,
      new Prisma.Decimal(body.allocableTotal),
      user.sub,
    );
  }

  @Get(':id')
  @RequirePermission('budget:read')
  @ApiOperation({
    summary:
      'One document: header, root total, and how many PPAs still need import review',
  })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/items')
  @RequirePermission('budget:read')
  @ApiOperation({
    summary:
      "A document's PPAs (by-PPA table) within the caller's office scope",
  })
  @ApiQuery({ name: 'officeId', required: false })
  @ApiQuery({ name: 'rootItemId', required: false })
  @ApiQuery({ name: 'flagged', required: false, type: Boolean })
  items(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Query('officeId') officeId?: string,
    @Query('rootItemId') rootItemId?: string,
    @Query('flagged', new ParseBoolPipe({ optional: true })) flagged?: boolean,
  ) {
    return this.service.items(id, user, { officeId, rootItemId, flagged });
  }

  @Get(':id/object-lines')
  @RequirePermission('budget:read')
  @ApiOperation({
    summary:
      "A document's by-object table (office × UACS account) within the caller's office scope",
  })
  @ApiQuery({ name: 'officeId', required: false })
  objectLines(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Query('officeId') officeId?: string,
  ) {
    return this.service.objectLines(id, user, officeId);
  }

  @Get(':id/compare-previous')
  @RequirePermission('budget:read')
  @ApiOperation({
    summary:
      "Each object and receipt line's current-year column against the year before's own budget-year figure (specs/017 FR-010)",
  })
  comparePrevious(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.comparePrevious(id, user);
  }

  @Get(':id/audit')
  @RequirePermission('budget:read')
  @ApiOperation({
    summary: "A document's history: imports, reviews, finalization",
  })
  audit(@Param('id') id: string) {
    return this.service.audit(id);
  }

  @Post(':id/items/:itemId/acknowledge-import')
  @RequirePermission('budget:write')
  @ApiOperation({
    summary: "Mark one PPA's import warnings reviewed (DRAFT documents only)",
  })
  acknowledge(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.acknowledgeImport(id, itemId, user.sub);
  }

  @Post(':id/finalize')
  @RequirePermission('budget:write')
  @ApiOperation({
    summary:
      'Finalize: an LEP becomes SUBMITTED, an Ordinance ENACTED. 409 DOCUMENT_HAS_IMPORT_WARNINGS (with the PPAs) or DOCUMENT_FROZEN.',
  })
  finalize(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.finalize(id, user.sub);
  }
}
