import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Inject,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { AskService } from './ask.service.js';
import { ChatService, type ChatInput } from './chat/chat.service.js';
import { CatalogueService } from './catalogue.service.js';
import {
  AskDto,
  ChatDto,
  FeedbackDto,
  ResolveQueryDto,
  TranscribeDto,
} from './dto/explorer.dto.js';
import { ResolveService } from './resolve.service.js';
import type { Query as ExplorerQuery } from './query/query.js';
import { QueryService, sourceList } from './query/query.service.js';
import { STT_PORT, type SttPort } from './ports/stt.port.js';
import {
  DeviceLimitError,
  ExplorerLimits,
  FEEDBACK_DEVICE_LIMITS,
  TRANSCRIBE_DEVICE_LIMITS,
} from './explorer-limits.js';
import {
  explorerAiEnabled,
  explorerEnabled,
  explorerLogsQuestions,
  explorerTrainingCapture,
} from './explorer.config.js';
import { ExplorerLogService } from './log.service.js';
import { ExplorerTrainingService } from './training.service.js';
import { ViewService } from './view.service.js';
import { SnapshotService } from './workbook/snapshot.service.js';
import {
  defaultView,
  parseViewQuery,
  validateView,
  viewToQuery,
} from './view.js';

const TEN_MINUTES = 600_000;
/**
 * Design §6: a question, not a speech. 10 s, not the design's 15: on a small shared VM
 * the model takes ~0.7 s per second of audio, so 10 s keeps the wait near 7 s
 * (card questions are 2–6 s spoken). 10 s of opus is ~40 KB; 1 MB is generous.
 */
const MAX_CLIP_BYTES = 1_000_000;
const MAX_CLIP_SECONDS = 10;

/** A device over its limit answers 429 with `Retry-After` (design §12). */
async function deviceLimited<T>(
  res: Response,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof DeviceLimitError)) throw err;
    res.setHeader('Retry-After', String(err.retryAfterSeconds));
    throw new HttpException(
      { message: err.message, retryAfterSeconds: err.retryAfterSeconds },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * The public Data Explorer (specs/018). Anonymous, read-only, every route
 * throttled per visitor IP (design §12), and the model-backed routes per
 * device too. With `EXPLORER_ENABLED` off every route is a 404, so a
 * deployment that has not switched the feature on exposes nothing.
 */
@ApiTags('explorer')
@Public()
@UseGuards(ThrottlerGuard)
@Controller('public/explorer')
export class ExplorerController {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly views: ViewService,
    private readonly asker: AskService,
    private readonly chatter: ChatService,
    private readonly resolver: ResolveService,
    private readonly queries: QueryService,
    private readonly log: ExplorerLogService,
    private readonly limits: ExplorerLimits,
    private readonly snapshots: SnapshotService,
    @Inject(STT_PORT) private readonly stt: SttPort | null,
    private readonly training: ExplorerTrainingService,
  ) {}

  private gate() {
    if (!explorerEnabled()) throw new NotFoundException();
  }

  @Get('catalogue')
  @Throttle({ default: { limit: 600, ttl: TEN_MINUTES } })
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary:
      'Public years, dimensions and question cards, versioned by content',
  })
  async getCatalogue(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.gate();
    const cat = await this.catalogue.get();
    const etag = `"${cat.version}"`;
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.status(304);
      return;
    }
    return cat;
  }

  @Get('capabilities')
  @Throttle({ default: { limit: 600, ttl: TEN_MINUTES } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Which parts of the explorer this deployment has switched on',
  })
  async getCapabilities() {
    this.gate();
    return {
      explorer: true,
      ai: explorerAiEnabled(),
      stt: {
        enabled: this.sttOn(),
        languages: this.sttOn() ? this.stt!.languages : [],
        maxSeconds: MAX_CLIP_SECONDS,
      },
      mode: await this.asker.mode(),
      logQuestions: explorerLogsQuestions(),
      // specs/020 B4: show the "help improve" box (unticked) only when the LGU opted in.
      trainingCapture: explorerTrainingCapture(),
    };
  }

  @Get('sources')
  @Throttle({ default: { limit: 300, ttl: TEN_MINUTES } })
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'The data sources and their fields (redesign P2)',
    description:
      'What the workspace field list shows: each source, its grain, the document kinds it has, and its fields (dimension or money, the kinds each exists on, the glossary term for its tooltip).',
  })
  getSources() {
    this.gate();
    return { sources: sourceList() };
  }

  @Post('query')
  @Throttle({ default: { limit: 300, ttl: TEN_MINUTES } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Run a query on one source (redesign P2)',
    description:
      'Up to three breakdowns, one to three measures, filters, sort and top N. 400 with `errors[]` for a query that breaks a rule (years or document kinds added together, a field the source lacks, two money splits…). Money is decimal strings; `totals` is null when a breakdown can count a row twice or documents differ.',
  })
  runQuery(@Body() body: ExplorerQuery) {
    this.gate();
    return this.queries.run(body);
  }

  @Post('query/rows')
  @Throttle({ default: { limit: 300, ttl: TEN_MINUTES } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'The data grid: the rows behind a query, paged (redesign P2)',
    description:
      "Body `{ query, offset?, size? ≤ 200 }`. The records that pass the query's filters — one per program, PPA or account line — with every public field labelled, sorted by `query.sort` (default: amount, largest first). Nothing is added up, so several years and documents may be listed together.",
  })
  queryRows(
    @Body() body: { query: ExplorerQuery; offset?: number; size?: number },
  ) {
    this.gate();
    if (!body?.query || typeof body.query !== 'object')
      throw new BadRequestException('Body must be { query, offset?, size? }.');
    return this.queries.rows(body.query, {
      offset: body.offset ?? 0,
      size: body.size ?? 50,
    });
  }

  @Post('snapshots')
  @Throttle({ default: { limit: 30, ttl: TEN_MINUTES } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Store a workbook for a share link (redesign P3)',
    description:
      'Body `{ workbook }`. Only named fields are kept; every sheet must be a query the engine accepts (400 with `errors[]`), at most 64 KB. Returns `{ id }`, a hash of the state: the same workbook always gets the same id. Stored rows never change and do not expire; no personal data is kept.',
  })
  saveSnapshot(@Body() body: unknown) {
    this.gate();
    return this.snapshots.save(body);
  }

  @Get('snapshots/:id')
  @Throttle({ default: { limit: 300, ttl: TEN_MINUTES } })
  @Header('Cache-Control', 'public, max-age=86400, immutable')
  @ApiOperation({
    summary: 'A shared workbook (redesign P3)',
    description:
      '`{ workbook }` for a share link `/explore/w/<id>`, or 404. Immutable.',
  })
  loadSnapshot(@Param('id') id: string) {
    this.gate();
    return this.snapshots.load(id);
  }

  @Get('view')
  @Throttle({ default: { limit: 300, ttl: TEN_MINUTES } })
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    summary:
      'Resolve a view (design §1 URL grammar) into series, rows and a fact sheet',
    description:
      'Every figure the explorer shows comes from here. 400 with `errors[]` for a view that breaks a rule (mixed document kinds in one series, a stack across kinds or themes…); 404 for a year that is not public.',
  })
  async getView(@Query() query: Record<string, string | string[] | undefined>) {
    this.gate();
    const cat = await this.catalogue.get();
    const parsed = parseViewQuery(query);
    if (parsed.errors.length) {
      const fallback = defaultView(cat);
      throw new BadRequestException({
        message: 'Invalid view.',
        errors: parsed.errors,
        fallback,
      });
    }
    return this.views.resolve(parsed.view, 'public');
  }

  @Get('default')
  @Throttle({ default: { limit: 300, ttl: TEN_MINUTES } })
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    summary: 'The view a visitor lands on: the latest public AIP by sector',
  })
  async getDefault() {
    this.gate();
    const view = defaultView(await this.catalogue.get());
    if (!view) throw new NotFoundException('No public year yet.');
    return this.views.resolve(view, 'public');
  }

  @Get('resolve')
  @Throttle({ default: { limit: 60, ttl: TEN_MINUTES } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Words → the catalogue values they most likely mean',
    description:
      'Named aliases (any language) first, then the nearest labels, topics and aliases by meaning when an embedding model is configured and AI is on. Deterministic for a given catalogue and model. What Ask hands the model as hints.',
  })
  async resolve(@Query() query: ResolveQueryDto) {
    this.gate();
    return { candidates: await this.resolver.resolve(query.q) };
  }

  @Post('ask')
  @Throttle({ default: { limit: 60, ttl: TEN_MINUTES } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'A question in English, Filipino or Bikol → a validated view',
    description:
      'Cache, then a curated card, then one model call checked by the view validator (one repair call). Never returns an unvalidated view. `answeredBy: resting` with cards when AI is off or the daily budget is spent; 429 with `Retry-After` when this device is over its limit.',
  })
  async ask(@Body() body: AskDto, @Res({ passthrough: true }) res: Response) {
    this.gate();
    const out = await deviceLimited(res, () => this.asker.ask(body));
    if (out.view)
      void this.training.capture({
        consent: body.trainingConsent,
        text: body.q,
        lang: out.lang,
        kind: 'ask',
        spec: out.view,
      });
    return out;
  }

  @Post('chat')
  @Throttle({ default: { limit: 60, ttl: TEN_MINUTES } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'The workspace chat (redesign P5): a question and the open sheet → a validated sheet and an answer whose every figure comes from the engine',
    description:
      "One JSON step from the model (one repair call), checked by the query validator; figures are filled into the model's placeholders from the engine, never written by the model. Returns the PPAs counted (top 5 and the total), next steps and other readings. `mode: resting` when AI is off or the daily budget is spent; 429 with `Retry-After` when this device is over its limit.",
  })
  async chat(@Body() body: ChatDto, @Res({ passthrough: true }) res: Response) {
    this.gate();
    const out = await deviceLimited(res, () =>
      this.chatter.chat({
        ...body,
        sheet: body.sheet as ChatInput['sheet'],
      }),
    );
    if (out.query)
      void this.training.capture({
        consent: body.trainingConsent,
        text: body.q,
        lang: out.lang,
        kind: 'chat',
        spec: { query: out.query, mark: out.mark },
      });
    return out;
  }

  /** The mic rides on the AI switch (design §10) and needs a provider. */
  private sttOn() {
    return explorerAiEnabled() && this.stt !== null;
  }

  @Post('transcribe')
  @Throttle({ default: { limit: 30, ttl: TEN_MINUTES } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  // Multer stops reading at the limit instead of buffering the whole body. The
  // clip stays in memory for this request only: never written, never logged.
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: MAX_CLIP_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'A spoken question (≤ 10 s, ≤ 1 MB) → its words, for the visitor to check before asking',
    description:
      'Multipart `audio` + `lang`. `{ text: "" }` when nothing was heard; 413 when too large; 404 when the mic is off. Not stored.',
  })
  async transcribe(
    @UploadedFile() audio: Express.Multer.File | undefined,
    @Body() body: TranscribeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.gate();
    if (!this.sttOn() || !this.stt!.languages.includes(body.lang))
      throw new NotFoundException();
    if (!audio?.buffer.length) throw new BadRequestException('No audio.');
    if (audio.size > MAX_CLIP_BYTES) throw new PayloadTooLargeException();
    await deviceLimited(res, () =>
      this.limits.take(
        this.limits.hashDevice(body.deviceKey),
        'transcribe',
        TRANSCRIBE_DEVICE_LIMITS,
      ),
    );
    const text = await this.stt!.transcribe(
      audio.buffer,
      audio.mimetype,
      body.lang,
    );
    return { text, lang: body.lang, by: this.stt!.name };
  }

  @Post('feedback')
  @Throttle({ default: { limit: 30, ttl: TEN_MINUTES } })
  @HttpCode(204)
  @ApiOperation({
    summary:
      'A verdict on an Ask answer or a template explanation (once per device)',
  })
  async feedback(
    @Body() body: FeedbackDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.gate();
    const deviceKeyHash = this.limits.hashDevice(body.deviceKey);
    await deviceLimited(res, () =>
      this.limits.take(deviceKeyHash, 'feedback', FEEDBACK_DEVICE_LIMITS),
    );
    const recordId = body.view
      ? await this.templateRecord(body.view, body.lang ?? 'en')
      : body.recordId!;
    await this.log.feedback({ ...body, recordId, deviceKeyHash });
  }

  /** A template explanation's record, for a view that resolves today. */
  private async templateRecord(query: string, lang: string) {
    const cat = await this.catalogue.get();
    const q: Record<string, string[]> = {};
    for (const [k, v] of new URLSearchParams(query)) (q[k] ??= []).push(v);
    const { view, errors } = parseViewQuery(q);
    const all = errors.length ? errors : validateView(view, cat);
    if (all.length)
      throw new BadRequestException({ message: 'Invalid view.', errors: all });
    return this.log.templateRecord(
      view,
      viewToQuery(view).toString(),
      lang,
      cat.version,
    );
  }
}
