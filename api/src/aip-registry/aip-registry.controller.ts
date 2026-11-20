import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AIPRegistryService } from './aip-registry.service.js';
import { AIPRegistryExportService } from './aip-registry-export.service.js';
import { ABExportService } from './ab-export.service.js';
import { ExportAnnualBudgetQueryDto } from './dto/export-ab-query.dto.js';
import { ExportClusterQueryDto } from './dto/export-cluster-query.dto.js';
import { AIPCompleteExportService } from './aip-complete-export.service.js';
import { ExportCompleteQueryDto } from './dto/export-complete-query.dto.js';
import {
  ExportLbpForm4QueryDto,
  ExportLbpQueryDto,
} from './dto/export-lbp-query.dto.js';
import { LbpForm7ExportService } from './lbp-form7-export.service.js';
import { LbpForm4ExportService } from './lbp-form4-export.service.js';
import type { RegistryTab } from './aip-registry.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { Response } from 'express';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import {
  NO_FUND_SOURCE,
  normalizeFundSources,
  normalizePapClasses,
} from '../common/pap-class-fund-filters.js';
import { FundSource, PapClass } from '../generated/prisma/index';

const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const TABS: RegistryTab[] = [
  'ALL',
  'DRAFTS',
  'REVISIONS',
  'PUBLISHED',
  'ARCHIVED',
];

/**
 * The catalog itself is small (a handful of beneficiary categories) and every
 * tag id in the filter becomes one more AND'd OR-across-levels condition in
 * the query, so an unbounded array is a cheap way to inflate query cost —
 * reject rather than silently truncate, so a caller never thinks every tag
 * they asked for was honored when only the first N were.
 */
const MAX_THEMATIC_TAG_FILTER_IDS = 20;

function normalizeThematicTagIds(
  raw: string | string[] | undefined,
): string[] | undefined {
  if (!raw) return undefined;
  const ids = Array.isArray(raw) ? raw : [raw];
  if (ids.length > MAX_THEMATIC_TAG_FILTER_IDS) {
    throw new BadRequestException(
      `thematicTagIds accepts at most ${MAX_THEMATIC_TAG_FILTER_IDS} ids`,
    );
  }
  return ids;
}

@ApiTags('aip-registry')
@ApiBearerAuth('access-token')
@Controller('aip-registry')
export class AIPRegistryController {
  constructor(
    private readonly service: AIPRegistryService,
    private readonly exportService: AIPRegistryExportService,
    private readonly abExport: ABExportService,
    private readonly completeExport: AIPCompleteExportService,
    private readonly lbpForm4: LbpForm4ExportService,
    private readonly lbpForm7: LbpForm7ExportService,
  ) {}

  @Get()
  @RequirePermission('aip:read')
  @ApiOperation({
    summary: 'Tabbed AIP registry feed: workflow tabs + tab counts',
  })
  @ApiQuery({ name: 'tab', required: false, enum: TABS })
  @ApiQuery({ name: 'cycleId', required: false })
  @ApiQuery({ name: 'clusterId', required: false })
  @ApiQuery({ name: 'finishLineIds', required: false, isArray: true })
  @ApiQuery({ name: 'officeId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'thematicTagIds', required: false, isArray: true })
  @ApiQuery({
    name: 'papClasses',
    required: false,
    isArray: true,
    enum: Object.values(PapClass),
    description:
      'Any of these; OPERATIONS also matches a program with no class.',
  })
  @ApiQuery({
    name: 'fundSources',
    required: false,
    isArray: true,
    enum: [...Object.values(FundSource), NO_FUND_SOURCE],
    description: `Any of these, on the program or any of its PPAs; ${NO_FUND_SOURCE} matches neither.`,
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('tab') tab?: RegistryTab,
    @Query('cycleId') cycleId?: string,
    @Query('clusterId') clusterId?: string,
    @Query('finishLineIds') finishLineIds?: string | string[],
    @Query('officeId') officeId?: string,
    @Query('search') search?: string,
    @Query('thematicTagIds') thematicTagIds?: string | string[],
    @Query('papClasses') papClasses?: string | string[],
    @Query('fundSources') fundSources?: string | string[],
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list(
      {
        tab: TABS.includes(tab as RegistryTab) ? (tab as RegistryTab) : 'ALL',
        cycleId,
        clusterId,
        finishLineIds: finishLineIds
          ? Array.isArray(finishLineIds)
            ? finishLineIds
            : [finishLineIds]
          : undefined,
        officeId,
        search,
        thematicTagIds: normalizeThematicTagIds(thematicTagIds),
        papClasses: normalizePapClasses(papClasses),
        fundSources: normalizeFundSources(fundSources),
        page: page !== undefined ? Number(page) : undefined,
        pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
      },
      user,
    );
  }

  @Get('exports/annual-budget')
  @RequirePermission('aip:export')
  @ApiOperation({
    summary:
      "Export the city's Annual Budget sheet as a Word document — one office, or the whole book when officeId is omitted.",
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  async exportAnnualBudget(
    @CurrentUser() user: JwtPayload,
    @Query() query: ExportAnnualBudgetQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const document = await this.abExport.exportAnnualBudget(
      query.cycleId,
      query.officeId,
      user,
    );
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.fileName}"`,
    );
    // The size is known exactly, so send it: without a Content-Length the
    // browser has no denominator and the download can only show bytes so far
    // rather than a percentage.
    response.setHeader('Content-Length', document.buffer.length);
    return new StreamableFile(document.buffer);
  }

  @Get('exports/cluster')
  @RequirePermission('aip:export')
  @ApiOperation({
    summary: 'Export the selected cluster workbook as an Excel file',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportCluster(
    @CurrentUser() user: JwtPayload,
    @Query() query: ExportClusterQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const workbook = await this.exportService.exportCluster(
      query.cycleId,
      query.clusterId,
      user,
    );
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${workbook.fileName}"`,
    );
    response.setHeader('Content-Length', workbook.buffer.length);
    return new StreamableFile(workbook.buffer);
  }

  @Get('exports/complete')
  @RequirePermission('aip:export')
  @ApiOperation({
    summary:
      'Export the whole city AIP as an Excel file: an executive summary, a sheet per sector group, then a funding-source breakdown',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportCompleteAIP(
    @CurrentUser() user: JwtPayload,
    @Query() query: ExportCompleteQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const workbook = await this.completeExport.exportComplete(
      query.cycleId,
      user,
    );
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${workbook.fileName}"`,
    );
    response.setHeader('Content-Length', workbook.buffer.length);
    return new StreamableFile(workbook.buffer);
  }

  @Get('exports/lbp-form-4')
  @RequirePermission('aip:export')
  @ApiOperation({
    summary:
      'Export LBP Form No. 4 as a read-only Excel workbook for one fund — one office, or a sheet per office in scope when officeId is omitted.',
  })
  @ApiProduces(XLSX)
  async exportLbpForm4(
    @CurrentUser() user: JwtPayload,
    @Query() query: ExportLbpForm4QueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return sendXlsx(response, await this.lbpForm4.export(query, user));
  }

  @Get('exports/lbp-form-7')
  @RequirePermission('aip:export')
  @ApiOperation({
    summary:
      'Export LBP Form No. 7 (Statement of Fund Allocation by Sector) for one fund as a read-only Excel workbook. City-wide: all-offices users only.',
  })
  @ApiProduces(XLSX)
  async exportLbpForm7(
    @CurrentUser() user: JwtPayload,
    @Query() query: ExportLbpQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return sendXlsx(response, await this.lbpForm7.export(query, user));
  }
}

function sendXlsx(
  response: Response,
  file: { buffer: Buffer; fileName: string },
) {
  response.setHeader('Content-Type', XLSX);
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.fileName}"`,
  );
  response.setHeader('Content-Length', file.buffer.length);
  return new StreamableFile(file.buffer);
}
