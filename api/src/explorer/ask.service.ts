import { Inject, Injectable } from '@nestjs/common';
import { CacheService } from '../cache/cache.service.js';
import {
  CatalogueService,
  type Card,
  type Catalogue,
  type Lang,
} from './catalogue.service.js';
import { ASK_DEVICE_LIMITS, ExplorerLimits } from './explorer-limits.js';
import {
  explorerAiEnabled,
  explorerPromptVersion,
  llmPricePerMTok,
} from './explorer.config.js';
import { ExplorerLogService, type AnsweredBy } from './log.service.js';
import {
  CARD_MATCH,
  detectLang,
  normalise,
  rankCards,
  sha,
  validCards,
} from './match.js';
import {
  DECISION_PORT,
  type Decision,
  type DecideInput,
  type DecisionPort,
} from './ports/decision.port.js';
import { ResolveService } from './resolve.service.js';
import { withoutTopicOverlap } from './topics.js';
import { fitYearsToKinds, preferNamedTopics } from './view-repair.js';
import { validateView, type ExplorerView, type ViewError } from './view.js';

export interface AskResult {
  recordId: string;
  answeredBy: AnsweredBy;
  /** Always a view that passed `validateView` against the current catalogue. */
  view?: ExplorerView;
  understood?: string;
  guessed?: string[];
  refusal?: string;
  suggestions?: Card[];
  lang: Lang;
  mode: 'normal' | 'resting';
}

interface Cached {
  view: ExplorerView;
  understood?: string;
  guessed: string[];
}

const ANSWER_TTL = 30 * 86_400;
const SUGGESTIONS = 3;

/** A model call's cost in USD; characters / 4 when the endpoint reports no usage. */
export function callCost(d: Decision): number {
  const price = llmPricePerMTok();
  const tin =
    d.call?.tokensIn ??
    Math.ceil((d.input.system.length + d.input.user.length) / 4);
  const tout = d.call?.tokensOut ?? Math.ceil((d.call?.text.length ?? 0) / 4);
  return d.call || d.error ? (tin * price.in + tout * price.out) / 1e6 : 0;
}

export interface Decided {
  /** Set only when it passed `validateView`. */
  view: ExplorerView | null;
  understood?: string;
  guessed: string[];
  /** The model declined (not a budget question). */
  refusal?: string;
  decisions: { decision: Decision; validated: ExplorerView | null }[];
}

/**
 * Design §5 steps 5–6, shared with the eval: one decision, the validator, and
 * on failure one repair call carrying the error list. Never yields a view that
 * failed validation.
 */
export async function decideValidated(
  decider: DecisionPort,
  question: string,
  lang: Lang,
  cat: Catalogue,
  afterCall: (d: Decision) => Promise<void> | void = () => {},
  hints: DecideInput['hints'] = [],
): Promise<Decided> {
  const decisions: Decided['decisions'] = [];
  let repair: { previous: string; errors: ViewError[] } | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const d = await decider.decide({
      question,
      lang,
      catalogue: cat,
      repair,
      hints,
    });
    await afterCall(d);
    // Settle what the model decides differently run to run (W16), then check.
    if (d.view)
      d.view = fitYearsToKinds(
        preferNamedTopics(d.view, hints, cat),
        cat,
        question,
      );
    const errors = d.view ? validateView(d.view, cat) : [];
    const ok = d.view !== null && errors.length === 0;
    decisions.push({ decision: d, validated: ok ? d.view : null });
    if (ok)
      return {
        // Dropping filters a topic already covers keeps the view valid.
        view: withoutTopicOverlap(d.view!, cat.topicRules),
        understood: d.understood,
        guessed: d.guessed,
        decisions,
      };
    if (!d.view && d.refusal && !d.error)
      return { view: null, guessed: [], refusal: d.refusal, decisions };
    if (!d.call) break; // the endpoint failed: a repair call would fail the same way
    repair = {
      previous: d.call.text,
      errors: errors.length
        ? errors
        : [
            {
              path: 'view',
              code: 'no-view',
              message: d.error ?? 'No view was returned.',
            },
          ],
    };
  }
  return { view: null, guessed: [], decisions };
}

/**
 * Question → validated view (specs/018 design §5). The ladder, cheapest rung
 * first: cache → card → (budget, device limit) → one model call → validator →
 * one repair call → nearest card. A model-written view that fails the
 * validator is never returned; every answer is logged.
 */
@Injectable()
export class AskService {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly cache: CacheService,
    private readonly limits: ExplorerLimits,
    private readonly log: ExplorerLogService,
    private readonly resolver: ResolveService,
    @Inject(DECISION_PORT) private readonly decider: DecisionPort,
  ) {}

  /** `capabilities.mode`: resting once today's model budget is spent (R19). */
  async mode(): Promise<'normal' | 'resting'> {
    return explorerAiEnabled() && (await this.limits.overBudget())
      ? 'resting'
      : 'normal';
  }

  async ask(input: {
    q: string;
    lang?: Lang;
    deviceKey?: string;
  }): Promise<AskResult> {
    const cat = await this.catalogue.get();
    const text = input.q.trim().slice(0, 300);
    const lang = detectLang(text, input.lang ?? 'en');
    const norm = normalise(text);
    const promptVersion = explorerPromptVersion();
    const cacheKey = `explorer:ask:${sha([norm, lang, cat.version, promptVersion].join('\n'))}`;
    const base = {
      text,
      lang,
      normalisedHash: sha(norm),
      catalogueVersion: cat.version,
      promptVersion,
    };
    const ranked = rankCards(text, cat, lang);
    const done = async (
      answeredBy: AnsweredBy,
      out: Omit<AskResult, 'recordId' | 'answeredBy' | 'lang' | 'mode'>,
      decisions: Parameters<
        ExplorerLogService['recordQuestion']
      >[0]['decisions'] = [],
      mode: AskResult['mode'] = 'normal',
    ): Promise<AskResult> => {
      const recordId = await this.log.recordQuestion({
        ...base,
        answeredBy,
        view: out.view,
        refusal: out.refusal,
        decisions,
      });
      return { recordId, answeredBy, lang, mode, ...out };
    };

    // 2. Cache: a question asked before, against the same catalogue and prompt.
    const hit = await this.cache.get<Cached>(cacheKey);
    // The clean-up runs on cached answers too, so a rule change applies to
    // questions answered before it (found on dev: a cached youth view stayed empty).
    if (hit && validateView(hit.view, cat).length === 0)
      return done('cache', {
        ...hit,
        view: withoutTopicOverlap(hit.view, cat.topicRules),
      });

    // 4. A curated card that says the same thing.
    const top = ranked[0];
    if (top && top.score >= CARD_MATCH)
      return done('card', { view: top.card.view });

    // 1. Switched off or out of budget: cards and recent answers only (R19).
    if (!explorerAiEnabled() || (await this.limits.overBudget()))
      return done(
        'resting',
        { suggestions: validCards(cat, 'budget-exhausted').slice(0, 6) },
        [],
        'resting',
      );

    // Device limit (design §12) — only a model call counts against it.
    await this.limits.take(
      this.limits.hashDevice(input.deviceKey),
      'ask',
      ASK_DEVICE_LIMITS,
    );

    // 5–6. One call, the validator, one repair call.
    // The deterministic rung (W16): the words' likely meanings, as hints.
    const { candidates: hints, degraded } = await this.resolver.lookup(
      text,
      cat,
    );
    const out = await decideValidated(
      this.decider,
      text,
      lang,
      cat,
      (d) => this.limits.spend(callCost(d)),
      hints,
    );
    if (out.view) {
      const answer: Cached = {
        view: out.view,
        understood: out.understood,
        guessed: out.guessed,
      };
      // Not cached while the index is down: it would outlive the outage.
      if (!degraded) await this.cache.set(cacheKey, answer, ANSWER_TTL);
      return done('model', answer, out.decisions);
    }
    if (out.refusal)
      return done(
        'refused',
        { refusal: out.refusal, suggestions: this.fallback(ranked, cat) },
        out.decisions,
      );
    const decisions = out.decisions;

    // 6. Still failing: the nearest card, offered as "Not what you meant?".
    const nearest = this.fallback(ranked, cat);
    return done(
      'refused',
      {
        view: nearest[0]?.view,
        refusal: 'not-understood',
        suggestions: nearest,
      },
      decisions,
    );
  }

  private fallback(
    ranked: ReturnType<typeof rankCards>,
    cat: Catalogue,
  ): Card[] {
    const close = ranked.filter((r) => r.score > 0).map((r) => r.card);
    return (close.length ? close : validCards(cat, 'default')).slice(
      0,
      SUGGESTIONS,
    );
  }
}
