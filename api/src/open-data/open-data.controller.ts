import { createHash } from 'node:crypto';
import {
  All,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Injectable,
  MethodNotAllowedException,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { OpenDataService } from './open-data.service.js';
import { bundleName } from './open-data.metadata.js';

export const RATE_LIMIT_MESSAGE =
  'Too many requests. Please wait a minute and try again, or use the yearly download for bulk data.';

/** The shared throttler, with the open-data contract's 429 body. */
@Injectable()
export class OpenDataThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(): Promise<void> {
    throw new HttpException(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: RATE_LIMIT_MESSAGE },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

const CACHE = 'public, max-age=60';

/** `?document=` on every year route: which of the year's documents. */
const DocumentQuery = () =>
  ApiQuery({
    name: 'document',
    required: false,
    enum: ['aip', 'annual'],
    description:
      'aip = Annual Investment Program, annual = enacted Annual Budget. Default: the AIP while the year has one, otherwise the Annual Budget. A document the year lacks is a 404.',
  });

/**
 * Open data API v1 (specs/007, contracts/open-data-api.md). Anonymous,
 * read-only, and the only API prefix open to other origins (`main.ts`). The
 * `v1` in the global prefix is this contract's version: a breaking change is a
 * new controller at /api/v2/open-data, never an edit here.
 */
@ApiTags('open-data')
@Public()
@UseGuards(OpenDataThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('open-data')
export class OpenDataController {
  constructor(private readonly service: OpenDataService) {}

  @Get('cycles')
  @Header('Cache-Control', CACHE)
  @ApiOperation({
    summary: 'Every budget year, open or not, with its download link when open',
  })
  listCycles() {
    return this.service.listCycles();
  }

  @Get('cycles/:year')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'One open year: counts and totals' })
  @DocumentQuery()
  getCycle(@Param('year') year: string, @Query('document') document?: string) {
    return this.service.getCycle(Number(year), document);
  }

  @Get('cycles/:year/programs')
  @Header('Cache-Control', CACHE)
  @ApiOperation({
    summary:
      'Published programs of an open year, without activities, in registry order',
  })
  @ApiQuery({ name: 'office', required: false, description: 'Office acronym' })
  @ApiQuery({ name: 'sector', required: false, description: 'PAP sector code' })
  @ApiQuery({ name: 'finishLine', required: false, description: '1–8' })
  @ApiQuery({ name: 'code', required: false, description: 'Exact AIP code' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Default 100, max 500',
  })
  @DocumentQuery()
  listPrograms(
    @Param('year') year: string,
    @Query('office') office?: string,
    @Query('sector') sector?: string,
    @Query('finishLine') finishLine?: string,
    @Query('code') code?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('document') document?: string,
  ) {
    return this.service.listPrograms(
      Number(year),
      {
        office,
        sector,
        code,
        finishLine: finishLine === undefined ? undefined : Number(finishLine),
        page: page === undefined ? undefined : Number(page),
        limit: limit === undefined ? undefined : Number(limit),
      },
      document,
    );
  }

  @Get('cycles/:year/programs/:id')
  @Header('Cache-Control', CACHE)
  @ApiOperation({
    summary:
      'One published program with its funds, climate tag and nested activities',
  })
  @DocumentQuery()
  getProgram(
    @Param('year') year: string,
    @Param('id') id: string,
    @Query('document') document?: string,
  ) {
    return this.service.getProgram(Number(year), id, document);
  }

  @Get('cycles/:year/programs/:id/versions')
  @Header('Cache-Control', CACHE)
  @ApiOperation({
    summary:
      'Published versions of a program, newest first (office, never a person). An enacted budget has none: 404.',
  })
  @DocumentQuery()
  listVersions(
    @Param('year') year: string,
    @Param('id') id: string,
    @Query('document') document?: string,
  ) {
    return this.service.listVersions(Number(year), id, document);
  }

  @Get('cycles/:year/programs/:id/versions/:version')
  @Header('Cache-Control', CACHE)
  @ApiOperation({
    summary:
      'One published version of a program, in the same shape as the program',
  })
  @DocumentQuery()
  getVersion(
    @Param('year') year: string,
    @Param('id') id: string,
    @Param('version') version: string,
    @Query('document') document?: string,
  ) {
    return this.service.getVersion(Number(year), id, Number(version), document);
  }

  @Get('cycles/:year/projects')
  @Header('Cache-Control', CACHE)
  @ApiOperation({
    summary: 'Published procurement projects (PPMP) of an open year',
  })
  @DocumentQuery()
  listProjects(
    @Param('year') year: string,
    @Query('document') document?: string,
  ) {
    return this.service.listProjects(Number(year), document);
  }

  @Get('cycles/:year/bundle.zip')
  @ApiOperation({
    summary: 'The whole year as a zip: five CSVs, nested JSON and METADATA.md',
  })
  @ApiProduces('application/zip')
  @DocumentQuery()
  async bundle(
    @Param('year') year: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('document') document?: string,
  ) {
    const { dataAsOf, zip } = await this.service.getBundle(
      Number(year),
      document,
    );
    const etag = `"${createHash('sha256').update(dataAsOf).digest('hex').slice(0, 32)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=60');
    if (req.headers['if-none-match'] === etag) {
      res.status(HttpStatus.NOT_MODIFIED);
      return;
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${bundleName(Number(year))}${document ? `-${document}` : ''}.zip"`,
    );
    res.setHeader('Content-Length', zip.length);
    return new StreamableFile(zip);
  }

  @Get('reference/offices')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Active city offices' })
  offices() {
    return this.service.referenceOffices();
  }

  @Get('reference/finish-lines')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'The city’s finish lines (vision areas)' })
  finishLines() {
    return this.service.referenceFinishLines();
  }

  @Get('reference/pap-sectors')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'DBM PAP sectors' })
  papSectors() {
    return this.service.referencePapSectors();
  }

  @Get('reference/ccet-codes')
  @Header('Cache-Control', CACHE)
  @ApiOperation({
    summary: 'Climate Change Expenditure Tagging codes (local typology)',
  })
  ccetCodes() {
    return this.service.referenceCcetCodes();
  }

  @Get('reference/fund-sources')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Fund codes and names' })
  fundSources() {
    return this.service.referenceFundSources();
  }

  /** Read-only: anything but GET/HEAD on this prefix is a 405, an unknown GET a 404. */
  @All('*path')
  @ApiExcludeEndpoint()
  other(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      throw new NotFoundException();
    }
    res.setHeader('Allow', 'GET, HEAD');
    throw new MethodNotAllowedException();
  }
}
