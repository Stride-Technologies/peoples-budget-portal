import {
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/index';
import { PrismaService } from '../prisma/prisma.service.js';
import { explorerLogsQuestions, llmPricePerMTok } from './explorer.config.js';
import type { Decision } from './ports/decision.port.js';
import { sha } from './match.js';
import type { ExplorerView } from './view.js';

export type AnsweredBy =
  | 'cache'
  | 'card'
  | 'model'
  | 'refused'
  | 'resting'
  | 'template';

export interface QuestionRecord {
  text: string;
  lang: string;
  normalisedHash: string;
  answeredBy: AnsweredBy;
  view?: ExplorerView | null;
  refusal?: string;
  catalogueVersion: string;
  promptVersion?: string;
  /** The model calls behind this answer, first call first. */
  decisions?: { decision: Decision; validated: unknown }[];
  /** `ask` (the default) or `chat` (redesign P5). */
  kind?: 'ask' | 'chat';
  /** What was answered when it is not a view: the chat's `{ query, mark }` (specs/020 B1.1). */
  spec?: unknown;
}

/** JSON with keys sorted at every level: the same spec always hashes the same. */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : x,
  );
}

export const specHash = (spec: unknown) => sha(canonicalJson(spec));

/**
 * W27: what looks like an email, a Philippine phone number or an ID number is
 * removed before a question is stored. Names are not guessed at: a name
 * detector would also eat office and barangay names; retention bounds the rest.
 */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[removed]')
    .replace(/(\+?63|\b0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, '[removed]')
    .replace(/\b\d(?:[\s-]?\d){7,}\b/g, '[removed]');
}

export const RETENTION_MONTHS = 12;
const DAY_MS = 86_400_000;

const json = (v: unknown) =>
  v === null || v === undefined
    ? Prisma.JsonNull
    : (v as Prisma.InputJsonValue);

/**
 * The explorer's question, model-call and feedback log (specs/018 R15, R16).
 * Never an IP, user agent, user id or audio clip. With
 * `EXPLORER_LOG_QUESTIONS` off no visitor text is stored at all — not the
 * question, not the copy of it inside a model call's input, not feedback text;
 * the views and counts still are. A nightly job nulls text older than 12 months.
 */
@Injectable()
export class ExplorerLogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExplorerLogService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    // ponytail: an in-process daily timer, no scheduler dependency; one API
    // container in production, and the job is idempotent if two ever run.
    this.timer = setInterval(() => void this.retention(), DAY_MS);
    this.timer.unref();
    setTimeout(() => void this.retention(), 60_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async recordQuestion(r: QuestionRecord): Promise<string> {
    const keepText = explorerLogsQuestions();
    const row = await this.prisma.explorerQuestion.create({
      data: {
        text: keepText && r.text ? scrub(r.text) : null,
        lang: r.lang,
        normalisedHash: r.normalisedHash,
        answeredBy: r.answeredBy,
        view: json(r.view),
        spec: json(r.spec ?? r.view),
        refusal: r.refusal ?? null,
        catalogueVersion: r.catalogueVersion,
        promptVersion: r.promptVersion ?? null,
        calls: {
          create: (r.decisions ?? []).map(({ decision: d, validated }) => ({
            kind: r.kind ?? 'ask',
            model: d.call?.model ?? d.model,
            promptHash: d.promptHash,
            // The system prompt is the versioned file + the catalogue, both
            // recoverable from the hashes; only the user turn varies.
            input: {
              promptVersion: d.promptVersion,
              user: keepText ? scrub(d.input.user) : null,
            },
            rawOutput: d.call?.text ?? d.error ?? null,
            validatedOutput: json(validated),
            ok: validated !== null,
            latencyMs: d.call?.latencyMs ?? 0,
            tokensIn: d.call?.tokensIn ?? null,
            tokensOut: d.call?.tokensOut ?? null,
          })),
        },
      },
      select: { id: true },
    });
    return row.id;
  }

  /**
   * The record a template explanation's feedback hangs on (specs/018 P2).
   * Templates make no model call and the page renders them from the fact
   * sheet, so there is nothing to log until someone rates one: then one row
   * per (view, language, catalogue) holds every verdict on it.
   */
  async templateRecord(
    view: ExplorerView,
    canonical: string,
    lang: string,
    catalogueVersion: string,
  ): Promise<string> {
    const normalisedHash = sha(['template', lang, canonical].join('\n'));
    const found = await this.prisma.explorerQuestion.findFirst({
      where: { normalisedHash, answeredBy: 'template', catalogueVersion },
      select: { id: true },
    });
    if (found) return found.id;
    return this.recordQuestion({
      text: '',
      lang,
      normalisedHash,
      answeredBy: 'template',
      view,
      catalogueVersion,
    });
  }

  /** One verdict per device per answer; a repeat is accepted and ignored. */
  async feedback(f: {
    recordId: string;
    verdict: string;
    reason?: string;
    text?: string;
    deviceKeyHash?: string;
  }): Promise<void> {
    const q = await this.prisma.explorerQuestion.findUnique({
      where: { id: f.recordId },
      select: {
        id: true,
        spec: true,
        calls: {
          select: { id: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!q) throw new NotFoundException('No such answer.');
    if (
      f.deviceKeyHash &&
      (await this.prisma.explorerFeedback.count({
        where: { questionId: q.id, deviceKeyHash: f.deviceKeyHash },
      }))
    )
      return;
    await this.prisma.explorerFeedback.create({
      data: {
        questionId: q.id,
        callId: q.calls[0]?.id ?? null,
        verdict: f.verdict,
        reason: f.reason ?? null,
        text: explorerLogsQuestions() ? (f.text ?? null) : null,
        deviceKeyHash: f.deviceKeyHash ?? null,
        // The answer as rated (specs/020 B1.1): budget-side, no visitor text.
        spec: json(q.spec),
        specHash: q.spec == null ? null : specHash(q.spec),
      },
    });
  }

  /**
   * Staff spend view (W7): per UTC day, model calls by kind and model with
   * tokens and their cost at today's prices, and how questions were answered
   * (cache hits, resting). Counts only: no question text is read.
   */
  async spend(days: number) {
    const since = new Date(Date.now() - days * DAY_MS);
    const [calls, answers] = await Promise.all([
      this.prisma.$queryRaw<
        {
          day: Date;
          kind: string;
          model: string;
          calls: bigint;
          failed: bigint;
          tin: bigint | null;
          tout: bigint | null;
        }[]
      >`SELECT date_trunc('day', created_at) AS day, kind, model, count(*) AS calls,
          count(*) FILTER (WHERE NOT ok) AS failed, sum(tokens_in) AS tin, sum(tokens_out) AS tout
        FROM explorer_model_calls WHERE created_at >= ${since}
        GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2, 3`,
      this.prisma.$queryRaw<{ day: Date; answered_by: string; n: bigint }[]>`
        SELECT date_trunc('day', created_at) AS day, answered_by, count(*) AS n
        FROM explorer_questions WHERE created_at >= ${since}
        GROUP BY 1, 2 ORDER BY 1 DESC`,
    ]);
    const price = llmPricePerMTok();
    const day = (d: Date) => d.toISOString().slice(0, 10);
    return {
      prices: price,
      calls: calls.map((c) => ({
        day: day(c.day),
        kind: c.kind,
        model: c.model,
        calls: Number(c.calls),
        failed: Number(c.failed),
        tokensIn: Number(c.tin ?? 0),
        tokensOut: Number(c.tout ?? 0),
        // ponytail: today's price for past days; store cost per call if prices change often.
        usd:
          (Number(c.tin ?? 0) * price.in + Number(c.tout ?? 0) * price.out) /
          1e6,
      })),
      answers: answers.map((a) => ({
        day: day(a.day),
        answeredBy: a.answered_by,
        n: Number(a.n),
      })),
    };
  }

  /** Staff view (`explorer:read-log`): questions with their calls and verdicts. */
  async list(f: {
    lang?: string;
    answeredBy?: string;
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.ExplorerQuestionWhereInput = {
      ...(f.lang ? { lang: f.lang } : {}),
      ...(f.answeredBy ? { answeredBy: f.answeredBy } : {}),
      ...(f.from || f.to ? { createdAt: { gte: f.from, lt: f.to } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.explorerQuestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
        select: {
          id: true,
          text: true,
          lang: true,
          answeredBy: true,
          view: true,
          refusal: true,
          catalogueVersion: true,
          promptVersion: true,
          createdAt: true,
          // No device hash: staff see what was said, never who said it twice.
          feedback: {
            select: {
              verdict: true,
              reason: true,
              text: true,
              createdAt: true,
            },
          },
          calls: {
            select: {
              model: true,
              ok: true,
              latencyMs: true,
              promptHash: true,
              rawOutput: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.explorerQuestion.count({ where }),
    ]);
    return { items, total };
  }

  /** R15: text older than 12 months goes; the view and the verdict stay. */
  async retention(
    now = new Date(),
  ): Promise<{ questions: number; feedback: number; calls: number }> {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
    try {
      const old = { createdAt: { lt: cutoff } };
      const [questions, feedback, calls] = await Promise.all([
        this.prisma.explorerQuestion.updateMany({
          where: { ...old, text: { not: null } },
          data: { text: null },
        }),
        this.prisma.explorerFeedback.updateMany({
          where: { ...old, text: { not: null } },
          data: { text: null },
        }),
        this.prisma
          .$executeRaw`UPDATE explorer_model_calls SET input = input - 'user' WHERE created_at < ${cutoff} AND input ? 'user'`,
      ]);
      return { questions: questions.count, feedback: feedback.count, calls };
    } catch (err) {
      this.logger.warn(`Retention run failed: ${(err as Error).message}`);
      return { questions: 0, feedback: 0, calls: 0 };
    }
  }
}
