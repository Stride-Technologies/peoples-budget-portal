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
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ClimatePillar, ExpenseClass, Role } from '../generated/prisma/index';
import { ReferenceService } from './reference.service.js';
import { UpdateClusterDto } from './dto/update-cluster.dto.js';
import { UpdateFinishLineDto } from './dto/update-finish-line.dto.js';
import {
  CreateSubFinishLineDto,
  UpdateSubFinishLineDto,
} from './dto/create-sub-finish-line.dto.js';
import { CreateOfficeDto, UpdateOfficeDto } from './dto/create-office.dto.js';
import { CreateCsoDto, UpdateCsoDto } from './dto/create-cso.dto.js';
import {
  CreatePapSectorDto,
  UpdatePapSectorDto,
} from './dto/create-pap-sector.dto.js';
import {
  CreateUacsObjectDto,
  UpdateUacsObjectDto,
} from './dto/create-uacs-object.dto.js';
import {
  CreateClimateTypologyCodeDto,
  UpdateClimateTypologyCodeDto,
} from './dto/create-climate-typology-code.dto.js';
import {
  CreateSglgIndicatorDto,
  UpdateSglgIndicatorDto,
} from './dto/create-sglg-indicator.dto.js';
import {
  CreateSdgGoalDto,
  UpdateSdgGoalDto,
} from './dto/create-sdg-goal.dto.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@ApiTags('reference')
@ApiBearerAuth('access-token')
@Controller('reference')
export class ReferenceController {
  constructor(private readonly service: ReferenceService) {}

  // ─── Cache ────────────────────────────────────────────────────────────────

  @Post('flush-cache')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(204)
  @ApiOperation({
    summary: 'Flush all reference data caches (SUPER_ADMIN only)',
  })
  flushCache() {
    return this.service.flushCache();
  }

  // ─── Clusters ─────────────────────────────────────────────────────────────

  @Get('clusters')
  @ApiOperation({
    summary: 'List clusters with active offices and finish lines',
  })
  @ApiOkResponse({ description: 'Cluster list.' })
  findAllClusters() {
    return this.service.findAllClusters();
  }

  @Get('clusters/all')
  @RequirePermission('reference:read')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List clusters including inactive offices (admin)' })
  @ApiOkResponse({ description: 'Cluster list with all offices.' })
  findAllClustersAdmin() {
    return this.service.findAllClustersAdmin();
  }

  @Patch('clusters/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a cluster name' })
  @ApiOkResponse({ description: 'Updated cluster.' })
  updateCluster(@Param('id') id: string, @Body() dto: UpdateClusterDto) {
    return this.service.updateCluster(id, dto);
  }

  // ─── Offices ──────────────────────────────────────────────────────────────

  // Intentionally open to all authenticated users — office names are non-sensitive
  // reference data required by the supporting-office picker for all proponent types.
  @Get('offices')
  @ApiOperation({ summary: 'List active offices with their cluster' })
  @ApiOkResponse({ description: 'Office list.' })
  findAllOffices() {
    return this.service.findAllOffices();
  }

  @Get('offices/all')
  @RequirePermission('reference:read')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all offices including inactive (admin)' })
  findAllOfficesAll() {
    return this.service.findAllOfficesAll();
  }

  @Post('offices')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(201)
  @ApiOperation({ summary: 'Add an office to a cluster' })
  createOffice(@Body() dto: CreateOfficeDto) {
    return this.service.createOffice(dto);
  }

  @Patch('offices/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Update an office (editing officeCode/officeType resyncs AIP codes)',
  })
  updateOffice(@Param('id') id: string, @Body() dto: UpdateOfficeDto) {
    return this.service.updateOffice(id, dto);
  }

  @Delete('offices/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate an office (soft delete)' })
  deactivateOffice(@Param('id') id: string) {
    return this.service.deactivateOffice(id);
  }

  // ─── Civil society organizations ──────────────────────────────────────────

  @Get('civil-society-organizations')
  @ApiOperation({
    summary: 'List active civil society organizations with their cluster',
  })
  @ApiOkResponse({ description: 'CSO list.' })
  findAllCivilSocietyOrganizations() {
    return this.service.findAllCivilSocietyOrganizations();
  }

  @Get('civil-society-organizations/all')
  @RequirePermission('reference:read')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List all civil society organizations including inactive (admin)',
  })
  findAllCsosAll() {
    return this.service.findAllCsosAll();
  }

  @Post('civil-society-organizations')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a civil society organization' })
  createCso(@Body() dto: CreateCsoDto) {
    return this.service.createCso(dto);
  }

  @Patch('civil-society-organizations/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a civil society organization' })
  updateCso(@Param('id') id: string, @Body() dto: UpdateCsoDto) {
    return this.service.updateCso(id, dto);
  }

  @Delete('civil-society-organizations/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Deactivate a civil society organization (soft delete)',
  })
  deactivateCso(@Param('id') id: string) {
    return this.service.deactivateCso(id);
  }

  // ─── Finish lines ─────────────────────────────────────────────────────────

  @Get('finish-lines')
  @ApiOperation({ summary: 'List all finish lines ordered by vision number' })
  @ApiOkResponse({ description: 'Finish line list.' })
  findAllFinishLines() {
    return this.service.findAllFinishLines();
  }

  @Patch('finish-lines/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a finish line' })
  @ApiOkResponse({ description: 'Updated finish line.' })
  updateFinishLine(@Param('id') id: string, @Body() dto: UpdateFinishLineDto) {
    return this.service.updateFinishLine(id, dto);
  }

  // ─── Sub-finish lines ─────────────────────────────────────────────────────

  @Get('sub-finish-lines')
  @ApiOperation({ summary: 'List active sub-finish lines' })
  @ApiOkResponse({ description: 'Sub-finish line list.' })
  findAllSubFinishLines() {
    return this.service.findAllSubFinishLines();
  }

  @Get('sub-finish-lines/all')
  @RequirePermission('reference:read')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List all sub-finish lines including inactive (admin)',
  })
  findAllSubFinishLinesAll() {
    return this.service.findAllSubFinishLinesAll();
  }

  @Post('sub-finish-lines')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a sub-finish line' })
  createSubFinishLine(@Body() dto: CreateSubFinishLineDto) {
    return this.service.createSubFinishLine(dto);
  }

  @Patch('sub-finish-lines/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a sub-finish line' })
  @ApiOkResponse({ description: 'Updated sub-finish line.' })
  updateSubFinishLine(
    @Param('id') id: string,
    @Body() dto: UpdateSubFinishLineDto,
  ) {
    return this.service.updateSubFinishLine(id, dto);
  }

  @Delete('sub-finish-lines/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate a sub-finish line (soft delete)' })
  deactivateSubFinishLine(@Param('id') id: string) {
    return this.service.deactivateSubFinishLine(id);
  }

  // ─── PAP sectors ──────────────────────────────────────────────────────────

  @Get('pap-sectors')
  @ApiOperation({ summary: 'List active PAP sectors (DBM BOM Annex 2)' })
  findAllPAPSectors() {
    return this.service.findAllPAPSectors();
  }

  @Get('pap-sectors/all')
  @RequirePermission('reference:read')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all PAP sectors including inactive (admin)' })
  findAllPAPSectorsAll() {
    return this.service.findAllPAPSectorsAll();
  }

  @Post('pap-sectors')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a PAP sector' })
  createPapSector(@Body() dto: CreatePapSectorDto) {
    return this.service.createPapSector(dto);
  }

  @Patch('pap-sectors/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a PAP sector' })
  updatePapSector(@Param('id') id: string, @Body() dto: UpdatePapSectorDto) {
    return this.service.updatePapSector(id, dto);
  }

  @Delete('pap-sectors/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate a PAP sector (soft delete)' })
  deactivatePapSector(@Param('id') id: string) {
    return this.service.deactivatePapSector(id);
  }

  // ─── UACS objects ─────────────────────────────────────────────────────────

  @Get('uacs-objects')
  @ApiOperation({
    summary:
      'Search active UACS objects (capped at 200). Filter by expense class.',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'expenseClass', required: false, enum: ExpenseClass })
  findAllUACSObjects(
    @Query('search') search?: string,
    @Query('expenseClass') expenseClass?: ExpenseClass,
  ) {
    return this.service.findAllUACSObjects({ search, expenseClass });
  }

  @Get('uacs-objects/all')
  @RequirePermission('reference:read')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all UACS objects including inactive (admin)' })
  findAllUACSObjectsAll() {
    return this.service.findAllUACSObjectsAll();
  }

  @Post('uacs-objects')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a UACS object' })
  createUacsObject(@Body() dto: CreateUacsObjectDto) {
    return this.service.createUacsObject(dto);
  }

  @Patch('uacs-objects/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a UACS object' })
  updateUacsObject(@Param('id') id: string, @Body() dto: UpdateUacsObjectDto) {
    return this.service.updateUacsObject(id, dto);
  }

  @Delete('uacs-objects/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate a UACS object (soft delete)' })
  deactivateUacsObject(@Param('id') id: string) {
    return this.service.deactivateUacsObject(id);
  }

  // ─── SGLG indicators ──────────────────────────────────────────────────────

  @Get('sglg-indicators')
  @ApiOperation({ summary: 'List SGLG indicators (DILG framework)' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAllSGLGIndicators(
    @Query('year') year?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.findAllSGLGIndicators({
      year: year !== undefined ? Number(year) : undefined,
      isActive:
        isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
  }

  @Get('sglg-indicators/all')
  @RequirePermission('reference:read')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List all SGLG indicators including inactive (admin)',
  })
  findAllSGLGIndicatorsAll() {
    return this.service.findAllSGLGIndicatorsAll();
  }

  @Post('sglg-indicators')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create an SGLG indicator' })
  createSglgIndicator(@Body() dto: CreateSglgIndicatorDto) {
    return this.service.createSglgIndicator(dto);
  }

  @Patch('sglg-indicators/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update an SGLG indicator' })
  updateSglgIndicator(
    @Param('id') id: string,
    @Body() dto: UpdateSglgIndicatorDto,
  ) {
    return this.service.updateSglgIndicator(id, dto);
  }

  @Delete('sglg-indicators/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate an SGLG indicator (soft delete)' })
  deactivateSglgIndicator(@Param('id') id: string) {
    return this.service.deactivateSglgIndicator(id);
  }

  // ─── SDG goals ────────────────────────────────────────────────────────────

  @Get('sdg-goals')
  @ApiOperation({ summary: 'List SDG goals (UN 2030 Agenda)' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAllSDGGoals(@Query('isActive') isActive?: string) {
    return this.service.findAllSDGGoals({
      isActive:
        isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
  }

  @Get('sdg-goals/all')
  @RequirePermission('reference:read')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all SDG goals including inactive (admin)' })
  findAllSDGGoalsAll() {
    return this.service.findAllSDGGoalsAll();
  }

  @Post('sdg-goals')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create an SDG goal' })
  createSdgGoal(@Body() dto: CreateSdgGoalDto) {
    return this.service.createSdgGoal(dto);
  }

  @Patch('sdg-goals/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update an SDG goal' })
  updateSdgGoal(@Param('id') id: string, @Body() dto: UpdateSdgGoalDto) {
    return this.service.updateSdgGoal(id, dto);
  }

  @Delete('sdg-goals/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate an SDG goal (soft delete)' })
  deactivateSdgGoal(@Param('id') id: string) {
    return this.service.deactivateSdgGoal(id);
  }

  // ─── Climate typology codes ───────────────────────────────────────────────

  @Get('climate-typology-codes')
  @ApiOperation({ summary: 'List CCET climate typology codes (DBM-CCC memo)' })
  @ApiQuery({ name: 'pillar', required: false, enum: ClimatePillar })
  findAllClimateTypologyCodes(@Query('pillar') pillar?: ClimatePillar) {
    return this.service.findAllClimateTypologyCodes({ pillar });
  }

  @Get('climate-typology-codes/all')
  @RequirePermission('reference:read')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List all climate typology codes including inactive (admin)',
  })
  findAllClimateTypologyCodesAll() {
    return this.service.findAllClimateTypologyCodesAll();
  }

  @Post('climate-typology-codes')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a climate typology code' })
  createClimateTypologyCode(@Body() dto: CreateClimateTypologyCodeDto) {
    return this.service.createClimateTypologyCode(dto);
  }

  @Patch('climate-typology-codes/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a climate typology code' })
  updateClimateTypologyCode(
    @Param('id') id: string,
    @Body() dto: UpdateClimateTypologyCodeDto,
  ) {
    return this.service.updateClimateTypologyCode(id, dto);
  }

  @Delete('climate-typology-codes/:id')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate a climate typology code (soft delete)' })
  deactivateClimateTypologyCode(@Param('id') id: string) {
    return this.service.deactivateClimateTypologyCode(id);
  }
}
