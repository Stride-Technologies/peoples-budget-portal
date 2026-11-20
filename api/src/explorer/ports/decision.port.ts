import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Card, Catalogue, Lang } from '../catalogue.service.js';
import {
  CHARTS,
  DIMENSIONS,
  DOCUMENTS,
  GROUP_BYS,
  MEASURES,
  type Dimension,
  type ExplorerView,
  type Filters,
  type ViewError,
} from '../view.js';
import type { EmbedPort } from './embed.port.js';
import type { LlmPort, LlmResult } from './llm.port.js';

/**
 * Question → view (design §5 step 5). v1 is one structured-output call on the
 * `LlmPort`; typed-decision models (Jev/Laya, `DECISION_PROVIDER`) plug in
 * here later without touching the harness.
 */
export const DECISION_PORT = Symbol('DECISION_PORT');

export interface DecideInput {
  question: string;
  lang: Lang;
  catalogue: Catalogue;
  /** Catalogue values the question's words most likely mean (ResolveService). */
  hints?: {
    dim: string;
    id: string;
    label: string;
    score: number;
    via: 'alias' | 'vector';
  }[];
  /** Set on the one repair call: what came back and why it failed. */
  repair?: { previous: string; errors: ViewError[] };
}

export interface Decision {
  /** Null when the model refused or its output did not parse. */
  view: ExplorerView | null;
  understood?: string;
  guessed: string[];
  refusal?: string;
  /** What to log (R16). `call` is absent when the call itself failed. */
  model: string;
  promptHash: string;
  promptVersion: string;
  input: { system: string; user: string };
  call?: LlmResult;
  error?: string;
}

export interface DecisionPort {
  decide(input: DecideInput): Promise<Decision>;
}

const LANG_NAME: Record<Lang, string> = {
  en: 'English',
  fil: 'Filipino',
  bcl: 'Central Bikol',
};
export const GUESSABLE = [
  'year',
  'document',
  'groupBy',
  'measure',
  'filters',
  'chart',
] as const;

/** `prompts/ask.v<n>.md` from source in dev and from `dist/` in the image. */
export function loadPrompt(version: string): { text: string; hash: string } {
  const name = `ask.v${version}.md`;
  const file = [
    join(process.cwd(), 'src', 'explorer', 'prompts', name),
    join(process.cwd(), 'dist', 'src', 'explorer', 'prompts', name),
  ].find((f) => existsSync(f));
  if (!file) throw new Error(`Prompt ${name} not found.`);
  const text = readFileSync(file, 'utf8');
  return {
    text,
    hash: createHash('sha256').update(text).digest('hex').slice(0, 16),
  };
}

const q = (card: Card, lang: Lang) =>
  card.question[lang] ?? card.question.en ?? '';

/** The catalogue in the user's language only: ids, labels and aliases. */
export function catalogueText(cat: Catalogue, lang: Lang): string {
  const docs = cat.documents
    .map(
      (d) =>
        `- ${d.kind} ${d.year}: ${d.label} (figure: ${d.moneyWord}; count: ${d.countWord})`,
    )
    .join('\n');
  const dims = DIMENSIONS.map((dim) => {
    const rows = cat.dimensions[dim].map((v) => {
      const aka = [
        ...new Set([
          ...(v.aliases[lang] ?? []),
          ...(lang === 'en' ? [] : (v.aliases.en ?? [])),
        ]),
      ]
        .filter((a) => a.toLowerCase() !== v.label.toLowerCase())
        .slice(0, 6);
      return `  - ${v.id}: ${v.label}${v.sublabel ? ` (${v.sublabel})` : ''}${aka.length ? ` — also: ${aka.join(', ')}` : ''}`;
    });
    return `${dim}:\n${rows.join('\n') || '  (none)'}`;
  }).join('\n');
  return `documents:\n${docs}\n${dims}`;
}

/** The strict JSON schema: every id is an enum taken from the catalogue. */
export function answerSchema(cat: Catalogue): Record<string, unknown> {
  const ids = (dim: Dimension) => {
    const vals = cat.dimensions[dim].map((v) => v.id);
    return vals.length ? vals : ['_none'];
  };
  const years = [...new Set(cat.documents.map((d) => d.year))];
  const filters = {
    type: 'object',
    additionalProperties: false,
    required: [...DIMENSIONS],
    properties: Object.fromEntries(
      DIMENSIONS.map((d) => [
        d,
        { type: 'array', items: { type: 'string', enum: ids(d) } },
      ]),
    ),
  };
  const series = {
    type: 'object',
    additionalProperties: false,
    required: ['document', 'years', 'measure', 'filters', 'label'],
    properties: {
      document: { type: 'string', enum: [...DOCUMENTS] },
      years: {
        type: 'array',
        items: { type: 'integer', enum: years.length ? years : [0] },
      },
      measure: { type: 'string', enum: [...MEASURES] },
      filters,
      label: { type: ['string', 'null'] },
    },
  };
  const view = {
    type: 'object',
    additionalProperties: false,
    required: ['series', 'groupBy', 'chart', 'top'],
    properties: {
      series: { type: 'array', items: series },
      groupBy: { type: 'string', enum: [...GROUP_BYS] },
      chart: { type: 'string', enum: [...CHARTS] },
      top: { type: ['integer', 'null'] },
    },
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['view', 'understood', 'guessed', 'refusal'],
    properties: {
      view: { anyOf: [view, { type: 'null' }] },
      understood: { type: 'string' },
      guessed: {
        type: 'array',
        items: { type: 'string', enum: [...GUESSABLE] },
      },
      refusal: { type: ['string', 'null'] },
    },
  };
}

interface RawSeries {
  document: ExplorerView['series'][number]['document'];
  years: number[];
  measure: ExplorerView['series'][number]['measure'];
  filters?: Record<string, string[] | undefined>;
  label?: string | null;
}
interface RawAnswer {
  view?: {
    series?: RawSeries[];
    groupBy: ExplorerView['groupBy'];
    chart: ExplorerView['chart'];
    top?: number | null;
  } | null;
  understood?: string;
  guessed?: string[];
  refusal?: string | null;
}

/** Model JSON → the engine's view shape: empty filters and nulls dropped. */
export function toView(raw: NonNullable<RawAnswer['view']>): ExplorerView {
  return {
    v: 1,
    series: (raw.series ?? []).map((s) => {
      const filters: Filters = {};
      for (const dim of DIMENSIONS) {
        const vals = s.filters?.[dim];
        if (vals?.length) filters[dim] = [...new Set(vals)];
      }
      return {
        document: s.document,
        years: [...new Set(s.years)],
        measure: s.measure,
        filters,
        ...(s.label ? { label: s.label.slice(0, 80) } : {}),
      };
    }),
    groupBy: raw.groupBy,
    chart: raw.chart,
    ...(raw.top ? { top: raw.top } : {}),
  };
}

/** How many worked examples the prompt carries. */
export const EXAMPLES_K = 6;

/**
 * specs/020 B2.1 (DAIL-SQL, Gao et al. 2024): the `k` approved question → view
 * pairs nearest the question by meaning, best first; ties by id, so the same
 * question always gets the same examples.
 */
export function nearestExamples<T extends { id: string }>(
  qv: number[],
  pool: { item: T; vec: number[] }[],
  k = EXAMPLES_K,
): T[] {
  const dot = (a: number[], b: number[]) =>
    a.reduce((s, x, i) => s + x * b[i], 0);
  return pool
    .map((p) => ({ item: p.item, s: dot(qv, p.vec) }))
    .sort((a, b) => b.s - a.s || (a.item.id < b.item.id ? -1 : 1))
    .slice(0, k)
    .map((p) => p.item);
}

/** The LLM-backed default (`DECISION_PROVIDER=llm`). */
export class LlmDecision implements DecisionPort {
  /** Card vectors per catalogue, model and language: the pool changes only with the catalogue. */
  private readonly pools = new Map<string, { item: Card; vec: number[] }[]>();

  constructor(
    private readonly llm: LlmPort,
    private readonly promptVersion: () => string,
    /** From prompt v3 the examples are retrieved by meaning; without an embedder, the static six. */
    private readonly embedder: EmbedPort | null = null,
  ) {}

  /**
   * v2: the first six default cards, whatever was asked. v3+: the six
   * approved pairs (every card with a question in the language) nearest the
   * question. Eval items are never in the pool: they are the test set.
   */
  private async examples(
    question: string,
    lang: Lang,
    catalogue: Catalogue,
    version: string,
  ): Promise<Card[]> {
    const fixed = () =>
      catalogue.cards
        .filter((c) => c.tags.includes('default') && q(c, lang))
        .slice(0, EXAMPLES_K);
    if (Number(version) < 3 || !this.embedder?.model) return fixed();
    try {
      const key = `${catalogue.version}:${this.embedder.model}:${lang}`;
      let pool = this.pools.get(key);
      if (!pool) {
        const cards = catalogue.cards.filter((c) => q(c, lang));
        const vecs = await this.embedder.embed(
          cards.map((c) => q(c, lang)),
          'passage',
        );
        pool = cards.map((item, i) => ({ item, vec: vecs[i] }));
        if (this.pools.size > 8) this.pools.clear();
        this.pools.set(key, pool);
      }
      const [qv] = await this.embedder.embed([question], 'query');
      return nearestExamples(qv, pool);
    } catch {
      // The embedding endpoint is down: the fixed six still make a valid prompt.
      return fixed();
    }
  }

  async decide({
    question,
    lang,
    catalogue,
    repair,
    hints = [],
  }: DecideInput): Promise<Decision> {
    const version = this.promptVersion();
    const prompt = loadPrompt(version);
    const examples = (await this.examples(question, lang, catalogue, version))
      .map((c) => `Q: ${q(c, lang)}\nview: ${JSON.stringify(c.view)}`)
      .join('\n\n');
    const system = prompt.text
      .replaceAll('{{LANG}}', LANG_NAME[lang])
      .replace('{{CATALOGUE}}', catalogueText(catalogue, lang))
      .replace('{{EXAMPLES}}', examples)
      .replace(
        '{{HINTS}}',
        hints.length
          ? hints
              .map(
                (h) =>
                  `- ${h.dim} ${h.id}: ${h.label} — ${h.via === 'alias' ? 'named in the question' : `possibly related (${h.score})`}`,
              )
              .join('\n')
          : '(none)',
      );
    const user = repair
      ? `${question}\n\nYour previous answer was:\n${repair.previous}\nIt broke these rules:\n${repair.errors.map((e) => `- ${e.path}: ${e.message}`).join('\n')}\nAnswer again, keeping the rules.`
      : question;
    const base = {
      model: this.llm.model,
      promptHash: prompt.hash,
      promptVersion: version,
      input: { system, user },
      guessed: [] as string[],
    };
    let call: LlmResult;
    try {
      call = await this.llm.complete({
        system,
        user,
        schema: { name: 'explorer_view', schema: answerSchema(catalogue) },
        seed: 0,
      });
    } catch (err) {
      return { ...base, view: null, error: (err as Error).message };
    }
    try {
      const raw = JSON.parse(call.text) as RawAnswer;
      return {
        ...base,
        call,
        view: raw.view ? toView(raw.view) : null,
        understood: raw.understood || undefined,
        guessed: raw.guessed ?? [],
        refusal: raw.refusal ?? undefined,
      };
    } catch {
      return { ...base, call, view: null, error: 'Output was not JSON.' };
    }
  }
}
