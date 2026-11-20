import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service.js';
import { Prisma } from '../../generated/prisma/index';
import {
  CatalogueService,
  type Catalogue,
  type Lang,
} from '../catalogue.service.js';
import { ASK_DEVICE_LIMITS, ExplorerLimits } from '../explorer-limits.js';
import { explorerAiEnabled, llmPricePerMTok } from '../explorer.config.js';
import { UNCLASSIFIED } from '../labels/taxonomy.js';
import { ExplorerLogService, type AnsweredBy } from '../log.service.js';
import { detectLang, normalise, sha } from '../match.js';
import type { Decision } from '../ports/decision.port.js';
import { LLM_PORT, type LlmPort, type LlmResult } from '../ports/llm.port.js';
import { OTHER } from '../query/engine.js';
import { fieldOf } from '../query/fields.js';
import { validateQuery, type Query } from '../query/query.js';
import { QueryService, type QueryResult } from '../query/query.service.js';
import { ResolveService } from '../resolve.service.js';
import type { Mark } from '../workbook/workbook.js';
import {
  baseOf,
  CHAT_SCHEMA,
  DRIVER_FIELDS,
  drivers,
  fill,
  isGap,
  MAX_TURNS,
  nextSteps,
  onExisting,
  parseStep,
  percent,
  peso,
  pesoChange,
  soleOption,
  sourceListing,
  tidyStep,
  totalOf,
  unusedFacts,
  usesLabels,
  type Facts,
  type Step,
} from './chat.js';

export const CHAT_PROMPT_VERSION = 'chat.v3';
const ANSWER_TTL = 30 * 86_400;
const PPA_LIST = 5;

export interface ChatInput {
  q: string;
  lang?: Lang;
  /** The open sheet: a follow-up changes it (W6, W27). */
  sheet?: { query: Query; mark: Mark } | null;
  /** Up to the last four turns of this tab; nothing older (W27). */
  turns?: { q: string; reading: string }[];
  deviceKey?: string;
}

export interface ChatAnswer {
  recordId: string;
  mode: 'normal' | 'resting';
  answeredBy: AnsweredBy;
  /** The question's language (W29): the reply is written in it. */
  lang: Lang;
  action: Step['action'];
  reading: string;
  /** A query that passed `validateQuery`; the sheet the workspace should show. */
  query?: Query;
  mark?: Mark;
  /** Figures from the engine only (W26). */
  sentences: string[];
  /** Small print under the answer, rendered in the page's language (W26). */
  coverage?: {
    byLabels: boolean;
    unclassified: { amount: string; count: number } | null;
    draft: boolean;
  };
  /** The PPAs counted, biggest first (W22, W26). */
  ppas?: {
    total: number;
    items: {
      id: string | null;
      name: string;
      office: string | null;
      amount: string | null;
      href: string | null;
    }[];
  };
  /** Next steps the result allows; the client names them in the page's language. */
  steps: { id: string; query: Query }[];
  alternatives: { label: string; query: Query }[];
  askBack?: { question: string; options: { label: string; query: Query }[] };
  refusal?: string;
}

/**
 * The chat (redesign P5): resolve the words, one JSON step from the model
 * (one repair call), the validator, then every figure from the engine.
 */
@Injectable()
export class ChatService {
  private prompt?: string;
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly catalogue: CatalogueService,
    private readonly cache: CacheService,
    private readonly limits: ExplorerLimits,
    private readonly log: ExplorerLogService,
    private readonly resolver: ResolveService,
    private readonly query: QueryService,
    @Inject(LLM_PORT) private readonly llm: LlmPort,
  ) {}

  async chat(input: ChatInput): Promise<ChatAnswer> {
    const cat = await this.catalogue.get();
    const text = input.q.trim().slice(0, 300);
    const lang = detectLang(text, input.lang ?? 'en');
    const sheet = input.sheet ?? null;
    const turns = (input.turns ?? []).slice(-MAX_TURNS);
    const norm = normalise(text);
    const cacheKey = `explorer:chat:${sha(JSON.stringify([norm, sheet, turns, cat.version, CHAT_PROMPT_VERSION]))}`;
    const record = (
      answeredBy: AnsweredBy,
      out: { refusal?: string; lang?: Lang } | Step,
      decisions: { decision: Decision; validated: unknown }[] = [],
    ) => {
      // What the visitor saw answered (specs/020 B1.1), after the same clean-up compose runs.
      const shown = 'action' in out ? soleOption(out) : null;
      return this.log.recordQuestion({
        kind: 'chat',
        text,
        // The model's reading of the language beats the detector's guess.
        lang: out.lang ?? lang,
        normalisedHash: sha(norm),
        answeredBy,
        refusal: out.refusal,
        catalogueVersion: cat.version,
        promptVersion: CHAT_PROMPT_VERSION,
        decisions,
        spec:
          shown?.action === 'answer' && shown.query
            ? { query: shown.query, mark: shown.mark }
            : undefined,
      });
    };

    const cached = await this.cache.get<Step>(cacheKey);
    const hit = cached ? tidyStep(cached, cat) : null;
    if (hit && (!hit.query || !validateQuery(hit.query, cat).length))
      return this.compose(hit, cat, await record('cache', hit), 'cache');

    if (!explorerAiEnabled() || (await this.limits.overBudget()))
      return {
        recordId: await record('resting', {}),
        mode: 'resting',
        answeredBy: 'resting',
        lang,
        action: 'refuse',
        reading: '',
        sentences: [],
        steps: [],
        alternatives: [],
      };
    await this.limits.take(
      this.limits.hashDevice(input.deviceKey),
      'ask',
      ASK_DEVICE_LIMITS,
    );

    const { candidates, degraded } = await this.resolver.lookup(text, cat);
    const system = this.system(cat);
    const user = JSON.stringify({
      question: text,
      openSheet: sheet,
      earlier: turns,
      // The detected language, as a hint: the reply is written in it (W29).
      language: lang,
      // Labels replace topics in the chat (W22): a topic hit is its label.
      candidates: candidates.flatMap((c) =>
        c.dim !== 'topic'
          ? [{ field: c.dim, id: c.id, label: c.label }]
          : cat.dimensions.label.some((l) => l.id === c.id)
            ? [{ field: 'label', id: c.id, label: c.label }]
            : [],
      ),
    });
    const decisions: { decision: Decision; validated: unknown }[] = [];
    let step: Step | null = null;
    let last: Step | null = null;
    let errors: string[] = [];
    for (const attempt of [0, 1]) {
      const u = attempt
        ? `${user}\n\nYour last answer was refused: ${errors.join(' ')} Documents that exist: ${cat.documents.map((d) => `${d.kind} ${d.year}`).join(', ')}. Answer again, fixing exactly that.`
        : user;
      const { call, error } = await this.call(system, u);
      const decision: Decision = {
        view: null,
        guessed: [],
        model: call?.model ?? this.llm.model,
        promptHash: sha(system),
        promptVersion: CHAT_PROMPT_VERSION,
        input: { system, user: u },
        call,
        error,
      };
      let parsed: Step | null = null;
      try {
        parsed = call ? tidyStep(parseStep(call.text), cat) : null;
      } catch {
        parsed = null;
      }
      errors = !parsed
        ? ['The answer was not the JSON asked for.']
        : this.problems(parsed, cat);
      decisions.push({ decision, validated: errors.length ? null : parsed });
      last = parsed ?? last;
      if (parsed && !errors.length) {
        step = this.clean(parsed, cat);
        break;
      }
      if (!call) break;
    }
    // Asked for a year or document the data does not have: say so, and offer the ones it has.
    if (
      !step &&
      last?.query &&
      errors.some((e) => /has no (public|.* data)/.test(e))
    ) {
      const options = onExisting(last.query, cat).filter(
        (o) => !validateQuery(o, cat).length,
      );
      if (options.length) {
        const refusal = 'no-data';
        return {
          recordId: await record(
            'refused',
            { refusal, lang: last.lang },
            decisions,
          ),
          mode: 'normal',
          answeredBy: 'refused',
          lang: last.lang,
          action: 'refuse',
          reading: '',
          sentences: [],
          steps: [],
          alternatives: options.map((query) => ({
            label: query.documents
              .map((d) => `${d.kind.toUpperCase()} FY${d.years.join(', ')}`)
              .join(''),
            query,
          })),
          refusal,
        };
      }
    }
    if (!step) {
      const refusal = 'not-understood';
      return {
        recordId: await record('refused', { refusal }, decisions),
        mode: 'normal',
        answeredBy: 'refused',
        lang,
        action: 'refuse',
        reading: '',
        sentences: [],
        steps: [],
        alternatives: [],
        refusal,
      };
    }
    // Not cached while the index is down: it would outlive the outage.
    if (!degraded) await this.cache.set(cacheKey, step, ANSWER_TTL);
    const answeredBy = step.action === 'refuse' ? 'refused' : 'model';
    return this.compose(
      step,
      cat,
      await record(answeredBy, step, decisions),
      answeredBy,
    );
  }

  private system(cat: Catalogue): string {
    this.prompt ??= readFileSync(
      join(__dirname, '..', 'prompts', `${CHAT_PROMPT_VERSION}.md`),
      'utf8',
    );
    const docs = cat.documents
      .map(
        (d) =>
          `- ${d.kind} ${d.year}: ${d.label} — its figure is called "${d.moneyWord}"${d.draft ? ' (draft, not yet public)' : ''}`,
      )
      .join('\n');
    return this.prompt
      .replace('{{DOCUMENTS}}', docs)
      .replace('{{SOURCES}}', sourceListing());
  }

  private async call(
    system: string,
    user: string,
  ): Promise<{ call?: LlmResult; error?: string }> {
    try {
      const call = await this.llm.complete({
        system,
        user,
        schema: CHAT_SCHEMA,
      });
      const price = llmPricePerMTok();
      await this.limits.spend(
        ((call.tokensIn ?? 0) * price.in + (call.tokensOut ?? 0) * price.out) /
          1e6,
      );
      return { call };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  /** Why a step cannot be shown: the main query's validator errors (options are filtered, not refused). */
  private problems(s: Step, cat: Catalogue): string[] {
    if (s.action === 'refuse') return [];
    if (s.action === 'askBack')
      return s.askBack?.options.some((o) => !validateQuery(o.query, cat).length)
        ? []
        : ['askBack needs at least one option with a valid query.'];
    if (!s.query) return ['action answer needs a query.'];
    return validateQuery(s.query, cat).map((e) => `${e.path}: ${e.message}`);
  }

  /** Options that do not validate are dropped, never shown. */
  private clean(s: Step, cat: Catalogue): Step {
    const ok = (o: { query: Query }) => !validateQuery(o.query, cat).length;
    return {
      ...s,
      alternatives: s.alternatives.filter(ok),
      askBack: s.askBack
        ? { ...s.askBack, options: s.askBack.options.filter(ok) }
        : null,
    };
  }

  /** Every figure, from the engine (W26). */
  private async compose(
    asked: Step,
    cat: Catalogue,
    recordId: string,
    answeredBy: AnsweredBy,
  ): Promise<ChatAnswer> {
    const step = soleOption(asked);
    const base: ChatAnswer = {
      recordId,
      mode: 'normal',
      answeredBy,
      lang: step.lang,
      action: step.action,
      reading: step.reading,
      sentences: [],
      steps: [],
      alternatives: step.alternatives,
      ...(step.askBack ? { askBack: step.askBack } : {}),
      ...(step.refusal && step.action === 'refuse'
        ? { refusal: step.refusal }
        : {}),
    };
    const q = step.action === 'answer' ? step.query : null;
    if (!q) return base;
    const years = q.documents.flatMap((d) => d.years);
    const [main, total, whole] = await Promise.all([
      this.query.run(q),
      this.query.run(totalOf(q)),
      this.query.run(baseOf(q)),
    ]);
    // Nothing matches: say so, never "₱0.00" (W28); offer the question without its name search.
    if (!main.n) {
      const wider = {
        ...q,
        filters: q.filters.filter((f) => f.op !== 'contains'),
      };
      return {
        ...base,
        query: q,
        mark: step.mark,
        sentences: [],
        refusal: 'empty',
        alternatives: [
          ...(wider.filters.length < q.filters.length
            ? [{ label: '', query: wider }]
            : []),
          ...base.alternatives,
        ].slice(0, 3),
      };
    }
    const facts = this.facts(q, main, total, whole);
    Object.assign(facts, await this.driverFacts(q, total));
    let unclassified: { amount: string; count: number } | null = null;
    if (usesLabels(q)) {
      const u = await this.query.run({
        ...baseOf(q),
        filters: [{ field: 'label', op: 'in', values: [UNCLASSIFIED] }],
      });
      const last = u.rows.at(-1);
      const amount = last?.values[0] ?? u.totals?.[0] ?? '0';
      if (u.n) {
        unclassified = { amount, count: u.n };
        facts.unclassified = peso(amount);
        facts['unclassified.count'] = String(u.n);
      }
    }
    const kept = [step.reading, ...step.sentences].filter(
      (t) => fill(t, facts, years) !== null,
    );
    const unused = unusedFacts(kept, facts);
    // B2.3: counts only, never the question (no visitor text in logs).
    if (unused.includes('total') || unused.includes('driver1'))
      this.logger.log(
        `Facts unused (prompt ${CHAT_PROMPT_VERSION}, record ${recordId}): ${unused.join(', ')}`,
      );
    const rows = await this.query.rows(
      {
        ...q,
        dimensions: [],
        sort: { by: 'amount', dir: 'desc' },
        limit: undefined,
        calcs: undefined,
      },
      { offset: 0, size: PPA_LIST },
    );
    const nameField = ['name', 'account', 'particulars'].find((f) =>
      fieldOf(q.source, f),
    );
    const href = (id: string | null) =>
      id && (q.source === 'aip-programs' || q.source === 'budget-ppas')
        ? `/budget/${id}`
        : null;
    return {
      ...base,
      query: q,
      mark: step.mark,
      sentences: kept.map((t) => fill(t, facts, years)!),
      coverage: {
        byLabels: usesLabels(q),
        unclassified,
        draft: main.documents.some((d) => d.draft),
      },
      ppas: {
        total: rows.total,
        items: rows.rows.map((r) => {
          const office = r.office;
          return {
            id: typeof r.id === 'string' ? r.id : null,
            name:
              nameField && typeof r[nameField] === 'string' ? r[nameField] : '',
            office: Array.isArray(office) ? (office[0]?.label ?? null) : null,
            amount: typeof r.amount === 'string' ? r.amount : null,
            href: href(typeof r.id === 'string' ? r.id : null),
          };
        }),
      },
      steps: nextSteps(q, cat),
    };
  }

  /**
   * B2.2: when the answer is a change between years, what drove it — the
   * breakdown (office, then fund, then label) whose biggest mover explains
   * most of the change, first one past half; one query per field tried.
   */
  private async driverFacts(q: Query, total: QueryResult): Promise<Facts> {
    const money =
      q.measures[0]?.agg !== 'count' && q.measures[0]?.agg !== 'countDistinct';
    const yi = total.query.dimensions.indexOf('year');
    if (!money || yi < 0 || total.rows.length < 2) return {};
    const [prev, cur] = total.rows
      .slice(-2)
      .map((r) => Number(r.keys[yi].code ?? r.keys[yi].label));
    const delta = new Prisma.Decimal(total.rows.at(-1)!.values[0]).minus(
      total.rows.at(-2)!.values[0],
    );
    if (delta.isZero() || !Number.isFinite(prev + cur)) return {};
    const pinned = (f: string) =>
      q.filters.some(
        (x) => x.field === f && x.op === 'in' && x.values.length === 1,
      );
    let best: { share: Prisma.Decimal; ds: ReturnType<typeof drivers> } | null =
      null;
    for (const field of DRIVER_FIELDS) {
      if (
        !fieldOf(q.source, field) ||
        q.dimensions.includes(field) ||
        pinned(field)
      )
        continue;
      const res = await this.query.run({
        ...totalOf(q),
        documents: q.documents.map((d) => ({
          ...d,
          years: d.years.filter((y) => y === prev || y === cur),
        })),
        dimensions: ['year', field],
      });
      const ds = drivers(res.rows, [prev, cur]);
      if (!ds.length) continue;
      const share = ds[0].change.abs().div(delta.abs());
      if (!best || share.gt(best.share)) best = { share, ds };
      if (share.gte(0.5)) break;
    }
    if (!best) return {};
    const [d1, d2] = best.ds;
    return {
      driver1: d1.label,
      'driver1.change': pesoChange(d1.change),
      ...(d2 ? { driver2: d2.label } : {}),
    };
  }

  /** The placeholders' values: money as ₱, counts as integers; absent when the result has none. */
  private facts(
    q: Query,
    main: QueryResult,
    total: QueryResult,
    whole: QueryResult,
  ): Facts {
    const money =
      q.measures[0]?.agg !== 'count' && q.measures[0]?.agg !== 'countDistinct';
    // Counts arrive as integer strings already.
    const fmt = (v: string) => (money ? peso(v) : v);
    // One total per year when years are broken down: the latest is "the" figure.
    const last = (r: QueryResult) => r.totals?.[0] ?? r.rows.at(-1)?.values[0];
    const facts: Facts = { count: String(main.n) };
    const t = last(total);
    const b = last(whole);
    if (t !== undefined) facts.total = fmt(t);
    if (b !== undefined) facts.base = fmt(b);
    if (money && t !== undefined && b !== undefined)
      facts.share = percent(t, b);
    if (total.rows.length > 1) {
      const [prev, cur] = total.rows.slice(-2).map((r) => r.values[0]);
      const change = percent(
        new Prisma.Decimal(cur).minus(prev).toFixed(2),
        prev,
      );
      if (change) facts.change = change.startsWith('-') ? change : `+${change}`;
    }
    const i = q.dimensions.findIndex((d) => d !== 'year' && d !== 'kind');
    if (i >= 0) {
      const groups = main.rows
        .filter(
          (r) =>
            !isGap(r.keys[i].code) &&
            r.keys[i].code !== UNCLASSIFIED &&
            r.keys[i].code !== OTHER,
        )
        .sort((a, b) =>
          new Prisma.Decimal(b.values[0]).comparedTo(a.values[0]),
        );
      facts.groups = String(new Set(groups.map((g) => g.keys[i].code)).size);
      const [g1, g2] = groups;
      if (g1) {
        facts.top1 = g1.keys[i].label;
        facts['top1.amount'] = fmt(g1.values[0]);
        if (money && t !== undefined)
          facts['top1.share'] = percent(g1.values[0], t);
      }
      if (g2) {
        facts.top2 = g2.keys[i].label;
        facts['top2.amount'] = fmt(g2.values[0]);
      }
    }
    return facts;
  }
}
