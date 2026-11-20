import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { CatalogueService } from './catalogue.service.js';
import { FlagsQueryDto, LogQueryDto } from './dto/explorer.dto.js';
import { classFlags, FLAG_SOURCE, ppaFlags, type YearRow } from './flags.js';
import { QueryService, type QueryResult } from './query/query.service.js';
import { ExplorerLogService } from './log.service.js';

/** Staff read of the question log (R15, R16). Personal data: permission-gated. */
@ApiTags('explorer')
@UseGuards(ThrottlerGuard)
@Controller('explorer')
export class ExplorerLogController {
  constructor(
    private readonly log: ExplorerLogService,
    private readonly catalogue: CatalogueService,
    private readonly queries: QueryService,
  ) {}

  @Get('log')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @RequirePermission('explorer:read-log')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Explorer questions with their model calls and feedback',
  })
  list(@Query() q: LogQueryDto) {
    return this.log.list({
      ...q,
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 50,
    });
  }

  @Get('spend')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @RequirePermission('explorer:read-log')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Model spend per day (last 30 days): calls, tokens and cost by kind (ask, chat, label) and model, and how questions were answered',
  })
  spend() {
    return this.log.spend(30);
  }

  @Get('flags')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequirePermission('explorer:read-log')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Unusual year-on-year changes for staff (specs/020 B5.2): rule-based, neutral wording, a prompt to ask the office',
  })
  async flags(@Query() q: FlagsQueryDto) {
    const cat = await this.catalogue.get();
    const years = cat.documents
      .filter((d) => d.kind === q.kind && !d.draft)
      .map((d) => d.year)
      .sort();
    const to = q.to ?? years.at(-1);
    const from = q.from ?? years.filter((y) => y < (to ?? 0)).at(-1);
    if (!from || !to || !years.includes(from) || !years.includes(to))
      throw new BadRequestException(
        `Two published ${q.kind} years are needed; have ${years.join(', ') || 'none'}.`,
      );
    const run = (dimensions: string[]) =>
      this.queries.run({
        source: FLAG_SOURCE[q.kind],
        documents: [{ kind: q.kind, years: [from, to] }],
        dimensions,
        measures: [{ field: 'amount', agg: 'sum' }],
        filters: [],
      });
    const rows = (r: QueryResult): YearRow[] =>
      r.rows.map((x) => ({
        office: x.keys[0].label,
        key: x.keys[1].label,
        year: Number(x.keys[2].code ?? x.keys[2].label),
        amount: x.values[0] ?? '0',
      }));
    const [byPpa, byClass] = await Promise.all([
      run(['office', 'name', 'year']),
      run(['office', 'expenseClass', 'year']),
    ]);
    return {
      kind: q.kind,
      years: [from, to],
      flags: [
        ...ppaFlags(rows(byPpa), [from, to]),
        ...classFlags(rows(byClass), [from, to]),
      ],
    };
  }
}
