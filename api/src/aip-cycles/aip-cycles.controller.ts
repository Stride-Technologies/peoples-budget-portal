import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../generated/prisma/index';
import { AIPCyclesService } from './aip-cycles.service.js';
import { CreateAIPCycleDto } from './dto/create-aip-cycle.dto.js';
import { UpdatePublicComparisonDto } from './dto/update-public-comparison.dto.js';
import { UpdatePublicOverviewDto } from './dto/update-public-overview.dto.js';
import { UpdateOpenDataDto } from './dto/update-open-data.dto.js';
import { UpdateAIPCycleStatusDto } from './dto/update-aip-cycle.dto.js';
import { PublishClusterDto } from './dto/publish-cluster.dto.js';
import { SetSpecialFundDto } from './dto/set-special-fund.dto.js';
import { SpecialFundsService } from './special-funds.service.js';
import { AipExtendedService } from './aip-extended.service.js';
import { ApplyAipExtendedDto } from './dto/apply-aip-extended.dto.js';
import { ProgramPublishService } from '../programs/program-publish.service.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@ApiTags('aip-cycles')
@ApiBearerAuth('access-token')
@Controller('aip-cycles')
export class AIPCyclesController {
  constructor(
    private readonly service: AIPCyclesService,
    private readonly publish: ProgramPublishService,
    private readonly specialFunds: SpecialFundsService,
    private readonly aipExtended: AipExtendedService,
  ) {}

  @Post()
  @RequirePermission('cycles:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new AIP cycle (PLANNING)' })
  create(@Body() dto: CreateAIPCycleDto) {
    return this.service.create(dto);
  }

  // `aip:read`, not `cycles:read`: every staff screen that reads the AIP picks
  // its year from this list, and the registry rendered empty for anyone whose
  // template lacked `cycles:read` — NCPC, Office Head, CMO, CBO, even the CPDO
  // Secretariat (#102). The list is already public at `GET /public/cycles`.
  // A cycle's detail and ceilings stay on `cycles:read`.
  @Get()
  @RequirePermission('aip:read')
  @ApiOperation({ summary: 'List all AIP cycles, newest fiscal year first' })
  @ApiOkResponse({ description: 'AIP cycle list with counts.' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermission('cycles:read')
  @ApiOperation({ summary: 'Get one AIP cycle with ceilings' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermission('aip:publish')
  @ApiOperation({
    summary:
      'Publish every ready program in the given clusters. One transaction per program: blocked entries are skipped, not failed, and a failure part-way leaves earlier publishes intact.',
  })
  publishCluster(
    @Param('id') id: string,
    @Body() dto: PublishClusterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.publish.publishCluster(id, dto.clusterIds, user);
  }

  @Post(':id/acknowledge-imports')
  @HttpCode(200)
  @RequirePermission('aip:publish')
  @ApiOperation({
    summary:
      'Confirm the import decisions on every flagged program in the given clusters, so a bulk-imported cycle can be published. Each program still gets its own IMPORT_REVIEWED audit row.',
  })
  acknowledgeImports(
    @Param('id') id: string,
    @Body() dto: PublishClusterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.publish.acknowledgeImportsForClusters(id, dto.clusterIds, user);
  }

  @Get(':id/publishable-counts')
  @RequirePermission('aip:publish')
  @ApiOperation({
    summary:
      'Count of unpublished entries (DRAFT + PUBLISHED_REVISION) per cluster, keyed by cluster id.',
  })
  publishableCounts(@Param('id') id: string) {
    return this.publish.publishableCounts(id);
  }

  @Post(':id/publish-preview')
  @HttpCode(200)
  @RequirePermission('aip:publish')
  @ApiOperation({
    summary:
      'Dry run of the same preconditions, so the readiness screen cannot disagree with what the publish button does.',
  })
  publishPreview(@Param('id') id: string, @Body() dto: PublishClusterDto) {
    return this.publish.publishPreview(id, dto.clusterIds);
  }

  @Patch(':id/status')
  @RequirePermission('cycles:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Transition cycle status. Allowed: PLANNING→OPEN, OPEN→CLOSED, CLOSED→ADOPTED (LOCKED accepted as the old name).',
  })
  transitionStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAIPCycleStatusDto,
  ) {
    return this.service.transitionStatus(id, dto.status);
  }

  @Patch(':id/public-comparison')
  @RequirePermission('cycles:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Show or hide the year-on-year comparison on the public Overview. Off until enough offices have published for the figure to be fair.',
  })
  setPublicComparison(
    @Param('id') id: string,
    @Body() dto: UpdatePublicComparisonDto,
  ) {
    return this.service.setPublicComparison(id, dto.enabled);
  }

  @Patch(':id/public-overview')
  @RequirePermission('cycles:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Show or hide one public section’s Overview tab (AIP, Annual Budget or PPMP) for this year. Hidden: the Overview URL redirects to Browse.',
  })
  setPublicOverview(
    @Param('id') id: string,
    @Body() dto: UpdatePublicOverviewDto,
  ) {
    return this.service.setPublicOverview(id, dto.section, dto.enabled);
  }

  @Patch(':id/open-data')
  @RequirePermission('cycles:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      "Open or close this cycle's open data: the yearly download and the /open-data API for that year. Off until a super admin switches it on.",
  })
  setOpenData(@Param('id') id: string, @Body() dto: UpdateOpenDataDto) {
    return this.service.setOpenData(id, dto.enabled);
  }

  // ─── Special funds (specs/008) ────────────────────────────────────────────

  @Get(':id/special-funds')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary:
      "Each special fund's stated amount, live program sum and the figure LBP Form 7 prints, with derived flags. Staff-only; never public.",
  })
  listSpecialFunds(@Param('id') id: string) {
    return this.specialFunds.list(id);
  }

  @Put(':id/special-funds/:fund')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      "Set or clear (null) a special fund's stated amount for this cycle. `fund` is SPA, LDF or LDRRMF.",
  })
  setSpecialFund(
    @Param('id') id: string,
    @Param('fund') fund: string,
    @Body() dto: SetSpecialFundDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.specialFunds.setStated(
      id,
      fund,
      dto.statedAmount,
      dto.note,
      user.sub,
    );
  }

  // ─── AIP-Extended upload (specs/008 US3) ──────────────────────────────────

  @Post(':id/aip-extended/preview')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      "Read an office's AIP-Extended sheet and match each row to an AIP entry by exact code, with near-miss suggestions. Writes nothing.",
  })
  previewAipExtended(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!file.originalname.toLowerCase().endsWith('.xlsx'))
      throw new BadRequestException('Upload the office workbook as .xlsx');
    return this.aipExtended.preview(id, file.buffer, file.originalname);
  }

  @Post(':id/aip-extended/apply')
  @RequirePermission('reference:write')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Fill blank Performance Indicators and Targets, and add SDG links, on the chosen AIP entries. Existing values are kept and returned as conflicts.',
  })
  applyAipExtended(
    @Param('id') id: string,
    @Body() dto: ApplyAipExtendedDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.aipExtended.apply(id, dto, user);
  }

  // ─── Batch approval submit ────────────────────────────────────────────────

  // ─── Endorser view ────────────────────────────────────────────────────────

  @Get(':id/endorser-offices')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary:
      'List proponent city offices with ≥1 endorsable program (SUBMITTED…PENDING_APPROVAL) in the cycle. Auth: HEAD of canEndorse=true office.',
  })
  getEndorserOffices(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.getEndorserOffices(id, user);
  }

  @Get(':id/offices/:officeId/programs')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary:
      'Endorsable programs (SUBMITTED…PENDING_APPROVAL) for a given proponent office in the cycle, with PAs included (line items excluded) and the caller office’s endorsement state. Auth: HEAD of canEndorse=true office.',
  })
  getProgramsForEndorserView(
    @Param('id') id: string,
    @Param('officeId') officeId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getProgramsForEndorserView(id, officeId, user);
  }
}
