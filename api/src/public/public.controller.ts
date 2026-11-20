import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator.js';
import { PublicService } from './public.service.js';
import { annualBook, annualObjects } from './annual-book.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PublicFeedbackDto } from './dto/public-feedback.dto.js';
import { PublicRegistryFeedbackDto } from './dto/public-registry-feedback.dto.js';
import { PublicPpmpFeedbackDto } from './dto/public-ppmp-feedback.dto.js';
import { RecaptchaGuard } from './guards/recaptcha.guard.js';
import { HoneypotInterceptor } from './interceptors/honeypot.interceptor.js';
import {
  NO_FUND_SOURCE,
  normalizeFundSources,
  normalizePapClasses,
} from '../common/pap-class-fund-filters.js';
import { FundSource, PapClass } from '../generated/prisma/index';

/**
 * The catalog itself is small (a handful of beneficiary categories) and every
 * tag id in the filter becomes one more AND'd OR-across-levels condition in
 * the query, so an unbounded array is a cheap way to inflate query cost on an
 * unauthenticated endpoint — reject rather than silently truncate, so a
 * caller never thinks every tag they asked for was honored when only the
 * first N were.
 */
const MAX_THEMATIC_TAG_FILTER_IDS = 20;

function normalizeThematicTagIds(
  raw: string | string[] | undefined,
): string[] | undefined {
  return normalizeIdList('thematicTagId', raw);
}

/**
 * Every distinct query is its own cache key on an anonymous endpoint, so each
 * filter is bounded and canonical: ids deduplicated and capped, search
 * capped, page a positive integer under a ceiling.
 */
function normalizeIdList(
  name: string,
  raw: string | string[] | undefined,
): string[] | undefined {
  if (!raw) return undefined;
  const ids = [...new Set(Array.isArray(raw) ? raw : [raw])];
  if (ids.length > MAX_THEMATIC_TAG_FILTER_IDS) {
    throw new BadRequestException(
      `${name} accepts at most ${MAX_THEMATIC_TAG_FILTER_IDS} ids`,
    );
  }
  return ids;
}

const MAX_SEARCH_LENGTH = 200;
const MAX_PAGE = 10_000;

function normalizeSearch(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (raw.length > MAX_SEARCH_LENGTH) {
    throw new BadRequestException(
      `search accepts at most ${MAX_SEARCH_LENGTH} characters`,
    );
  }
  return raw;
}

function normalizePositiveInt(
  name: string,
  raw: string | undefined,
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE) {
    throw new BadRequestException(
      `${name} must be a whole number from 1 to ${MAX_PAGE}`,
    );
  }
  return n;
}

/** `section` query: which document of a year to read (specs/012). Anything else is ignored. */
const sectionParam = (v?: string): 'aip' | 'annual' | undefined =>
  v === 'aip' || v === 'annual' ? v : undefined;

function fiscalYearOf(year: string): number {
  const fiscalYear = Number(year);
  if (!Number.isInteger(fiscalYear)) {
    throw new BadRequestException('year must be a fiscal year');
  }
  return fiscalYear;
}

@ApiTags('public')
@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly service: PublicService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('cycles')
  @ApiOperation({ summary: 'List all AIP cycles (unauthenticated)' })
  listCycles() {
    return this.service.listCycles();
  }

  @Get('fund-rules/:fund')
  @ApiOperation({
    summary:
      "A fund's legal basis and minimum as of a fiscal year (unauthenticated)",
  })
  @ApiParam({ name: 'fund', description: 'FundSource, e.g. LDF' })
  @ApiQuery({ name: 'year', required: true, type: Number })
  getFundRule(@Param('fund') fund: string, @Query('year') year: string) {
    const fiscalYear = Number(year);
    if (!Number.isInteger(fiscalYear)) {
      throw new BadRequestException('year must be a fiscal year');
    }
    return this.service.getFundRule(fund, fiscalYear);
  }

  @Get('annual/:year/book')
  @ApiOperation({
    summary:
      "A year's Receipts Program, Forms 5 and 6 and PS ceiling, as printed (unauthenticated)",
  })
  getAnnualBook(@Param('year') year: string) {
    return annualBook(this.prisma, fiscalYearOf(year));
  }

  @Get('annual/:year/objects')
  @ApiOperation({
    summary:
      "A year's spending by object (LBP Form 2): office totals, and one office's lines (unauthenticated)",
  })
  @ApiQuery({ name: 'office', required: false, description: 'Office acronym' })
  getAnnualObjects(
    @Param('year') year: string,
    @Query('office') office?: string,
  ) {
    return annualObjects(this.prisma, fiscalYearOf(year), office || undefined);
  }

  @Get('clusters')
  @ApiOperation({
    summary: 'List clusters with active city offices (unauthenticated)',
  })
  listClusters() {
    return this.service.listClusters();
  }

  @Get('finish-lines')
  @ApiOperation({ summary: 'List finish lines (unauthenticated)' })
  @ApiQuery({ name: 'cycleId', required: false })
  @ApiQuery({ name: 'section', required: false, enum: ['aip', 'annual'] })
  listFinishLines(
    @Query('cycleId') cycleId?: string,
    @Query('section') section?: string,
  ) {
    return this.service.listFinishLines(cycleId, sectionParam(section));
  }

  @Get('pap-sectors')
  @ApiOperation({
    summary:
      'List PAP sectors with publicly visible programs (unauthenticated)',
  })
  @ApiQuery({ name: 'cycleId', required: false })
  @ApiQuery({ name: 'section', required: false, enum: ['aip', 'annual'] })
  listPAPSectors(
    @Query('cycleId') cycleId?: string,
    @Query('section') section?: string,
  ) {
    return this.service.listPAPSectors(cycleId, sectionParam(section));
  }

  @Get('thematic-tags')
  @ApiOperation({
    summary:
      'List active thematic tags (unauthenticated) — populates the registry tag filter',
  })
  listThematicTags() {
    return this.service.listThematicTags();
  }

  @Get('registry')
  @ApiOperation({
    summary: 'List publicly visible programs (PENDING_APPROVAL + APPROVED)',
  })
  @ApiQuery({ name: 'cycleId', required: true })
  @ApiQuery({ name: 'clusterId', required: false })
  @ApiQuery({ name: 'officeId', required: false })
  @ApiQuery({ name: 'finishLineId', required: false, isArray: true })
  @ApiQuery({ name: 'papSectorId', required: false })
  @ApiQuery({ name: 'thematicTagId', required: false, isArray: true })
  @ApiQuery({
    name: 'papClass',
    required: false,
    isArray: true,
    enum: Object.values(PapClass),
    description:
      'Any of these; OPERATIONS also matches a program with no class.',
  })
  @ApiQuery({
    name: 'fundSource',
    required: false,
    isArray: true,
    enum: [...Object.values(FundSource), NO_FUND_SOURCE],
    description: `Any of these, on the program or any of its PPAs; ${NO_FUND_SOURCE} matches neither.`,
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'section', required: false, enum: ['aip', 'annual'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listPrograms(
    @Query('cycleId') cycleId: string,
    @Query('clusterId') clusterId?: string,
    @Query('officeId') officeId?: string,
    @Query('finishLineId') finishLineId?: string | string[],
    @Query('papSectorId') papSectorId?: string,
    @Query('thematicTagId') thematicTagId?: string | string[],
    @Query('papClass') papClass?: string | string[],
    @Query('fundSource') fundSource?: string | string[],
    @Query('search') search?: string,
    @Query('section') section?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listPrograms({
      cycleId,
      clusterId,
      officeId,
      finishLineIds: normalizeIdList('finishLineId', finishLineId),
      papSectorId,
      thematicTagIds: normalizeThematicTagIds(thematicTagId),
      papClasses: normalizePapClasses(papClass),
      fundSources: normalizeFundSources(fundSource),
      search: normalizeSearch(search),
      section: sectionParam(section),
      page: normalizePositiveInt('page', page),
      limit: normalizePositiveInt('limit', limit),
    });
  }

  @Get('registry/:programId')
  @ApiOperation({ summary: 'Get a single publicly visible program' })
  @ApiParam({ name: 'programId' })
  getProgram(@Param('programId') programId: string) {
    return this.service.getProgram(programId);
  }

  @Get('registry/:programId/versions')
  @ApiOperation({ summary: 'List version history for a public program' })
  @ApiParam({ name: 'programId' })
  listVersions(@Param('programId') programId: string) {
    return this.service.listVersions(programId);
  }

  @Get('registry/:programId/versions/:versionId')
  @ApiOperation({ summary: 'Get a specific version snapshot' })
  @ApiParam({ name: 'programId' })
  @ApiParam({ name: 'versionId' })
  getVersion(
    @Param('programId') programId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.service.getVersion(programId, versionId);
  }

  @Get('registry/:programId/project-activities/:paId')
  @ApiOperation({
    summary: 'Get a single project/activity from a publicly visible program',
  })
  @ApiParam({ name: 'programId' })
  @ApiParam({ name: 'paId' })
  getProjectActivity(
    @Param('programId') programId: string,
    @Param('paId') paId: string,
  ) {
    return this.service.getProjectActivity(programId, paId);
  }

  @UseGuards(ThrottlerGuard, RecaptchaGuard)
  @UseInterceptors(HoneypotInterceptor)
  @Post('registry/feedback')
  @ApiOperation({
    summary: 'Submit general registry-level feedback (not tied to a program)',
    description:
      'Rate-limited to 5/10 min per IP; reCAPTCHA v3 + honeypot protected.',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — try again in 10 minutes.',
  })
  @ApiResponse({
    status: 400,
    description: 'Could not verify submission (reCAPTCHA failed).',
  })
  submitRegistryFeedback(@Body() dto: PublicRegistryFeedbackDto) {
    return this.service.submitRegistryFeedback(dto);
  }

  @UseGuards(ThrottlerGuard, RecaptchaGuard)
  @UseInterceptors(HoneypotInterceptor)
  @Post('registry/:programId/feedback')
  @ApiOperation({
    summary: 'Submit anonymous public feedback on a program',
    description:
      'Rate-limited to 5/10 min per IP; reCAPTCHA v3 + honeypot protected.',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — try again in 10 minutes.',
  })
  @ApiResponse({
    status: 400,
    description: 'Could not verify submission (reCAPTCHA failed).',
  })
  @ApiParam({ name: 'programId' })
  submitFeedback(
    @Param('programId') programId: string,
    @Body() dto: PublicFeedbackDto,
  ) {
    return this.service.submitFeedback(programId, dto);
  }

  @Get('registry/:programId/feedback')
  @ApiOperation({ summary: 'List public feedback for a program' })
  @ApiParam({ name: 'programId' })
  listPublicFeedback(@Param('programId') programId: string) {
    return this.service.listPublicFeedback(programId);
  }

  @UseGuards(ThrottlerGuard, RecaptchaGuard)
  @UseInterceptors(HoneypotInterceptor)
  @Post('registry/:programId/project-activities/:paId/feedback')
  @ApiOperation({
    summary: 'Submit anonymous public feedback on a Project/Activity',
    description:
      'Rate-limited to 5/10 min per IP; reCAPTCHA v3 + honeypot protected.',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — try again in 10 minutes.',
  })
  @ApiResponse({
    status: 400,
    description: 'Could not verify submission (reCAPTCHA failed).',
  })
  @ApiParam({ name: 'programId' })
  @ApiParam({ name: 'paId' })
  submitPAFeedback(
    @Param('programId') programId: string,
    @Param('paId') paId: string,
    @Body() dto: PublicFeedbackDto,
  ) {
    return this.service.submitPAFeedback(programId, paId, dto);
  }

  @Get('registry/:programId/project-activities/:paId/feedback')
  @ApiOperation({ summary: 'List public feedback for a Project/Activity' })
  @ApiParam({ name: 'programId' })
  @ApiParam({ name: 'paId' })
  listPAFeedback(
    @Param('programId') programId: string,
    @Param('paId') paId: string,
  ) {
    return this.service.listPAFeedback(programId, paId);
  }

  @Get('ppmp')
  @ApiOperation({ summary: 'List published PPMPs (unauthenticated)' })
  @ApiQuery({ name: 'cycleId', required: true })
  @ApiQuery({ name: 'officeId', required: false })
  listPpmp(
    @Query('cycleId') cycleId: string,
    @Query('officeId') officeId?: string,
  ) {
    return this.service.listPpmp(cycleId, officeId);
  }

  @Get('ppmp/:id')
  @ApiOperation({ summary: 'Get a published PPMP (unauthenticated)' })
  @ApiParam({ name: 'id' })
  getPpmp(@Param('id') id: string) {
    return this.service.getPpmp(id);
  }

  @Get('ppmp/:id/history')
  @ApiOperation({
    summary: 'Get the activity history for a published Project',
  })
  @ApiParam({ name: 'id' })
  getPpmpHistory(@Param('id') id: string) {
    return this.service.getPpmpHistory(id);
  }

  @Get('ppmp/:id/feedback')
  @ApiOperation({ summary: 'List public feedback for a published Project' })
  @ApiParam({ name: 'id' })
  listPpmpFeedback(@Param('id') id: string) {
    return this.service.listPublicPpmpFeedback(id);
  }

  @UseGuards(ThrottlerGuard, RecaptchaGuard)
  @UseInterceptors(HoneypotInterceptor)
  @Post('ppmp/:id/feedback')
  @ApiOperation({
    summary: 'Submit anonymous public feedback on a specific published Project',
    description:
      'Rate-limited to 5/10 min per IP; reCAPTCHA v3 + honeypot protected. 404 if the Project is not published.',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — try again in 10 minutes.',
  })
  @ApiResponse({
    status: 400,
    description: 'Could not verify submission (reCAPTCHA failed).',
  })
  @ApiParam({ name: 'id' })
  submitPpmpFeedback(
    @Param('id') id: string,
    @Body() dto: PublicPpmpFeedbackDto,
  ) {
    return this.service.submitPpmpFeedback(id, dto);
  }
}
