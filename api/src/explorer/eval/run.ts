/**
 * The Ask eval (specs/018 T035, gate R20).
 *
 *   pnpm --filter api exec tsx src/explorer/eval/run.ts [--api http://localhost:8000] [--catalogue cat.json] [--lang en] [--once]
 *
 * Reads `specs/018-data-explorer/eval/{en,fil,bcl}.jsonl` (`{q, lang, expected}`),
 * answers each question with the same card matcher, decision port, validator
 * and repair call the API uses (no cache, no log, no budget), and reports per
 * language: exact match, field F1, how often each rung answered, invented
 * figures (numbers in `understood` that are neither a year of the view nor in
 * the question), and — run twice — how many answers differed (determinism).
 *
 * The catalogue comes from a running API (`GET /public/explorer/catalogue`)
 * or a saved copy of that response. Without `LLM_BASE_URL` the model rung
 * fails and the run measures cards + fallback only.
 *
 * specs/020: sets are en, fil, taglish (code-switched, `lang: fil`) and bcl
 * (`--set` picks one). With an embedder the run first reports threshold-free
 * hint recall@8 (the swap rule's first test) and passes the resolver's hints to
 * the model as the API does. `--backend openai|sidecar|stride` picks who embeds
 * (and decides); `--no-model` stops after recall; `--out file.json` writes
 * per-item results for paired bootstrap between backends.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { CacheService } from '../../cache/cache.service.js';
import { inferenceFromEnv } from '../adapters/sidecar.js';
import { cosine } from '../labels/labelling.js';
import type { EmbedPort } from '../ports/embed.port.js';
import { INDEXED, ResolveService, textOf } from '../resolve.service.js';
import { decideValidated } from '../ask.service.js';
import type {
  Catalogue,
  CatalogueService,
  Lang,
} from '../catalogue.service.js';
import { explorerPromptVersion } from '../explorer.config.js';
import { CARD_MATCH, detectLang, normalise, rankCards } from '../match.js';
import { LlmDecision } from '../ports/decision.port.js';
import { validateView, type ExplorerView } from '../view.js';

export interface EvalItem {
  q: string;
  lang: Lang;
  expected: ExplorerView;
}

/** A view as a set of facts; labels and `top` are presentation, not meaning. */
export function facts(v: ExplorerView | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!v) return out;
  out.add(`groupBy:${v.groupBy}`);
  out.add(`chart:${v.chart}`);
  v.series.forEach((s, i) => {
    out.add(`s${i}:doc:${s.document}`);
    out.add(`s${i}:measure:${s.measure}`);
    for (const y of s.years) out.add(`s${i}:year:${y}`);
    for (const [dim, vals] of Object.entries(s.filters))
      for (const val of vals ?? []) out.add(`s${i}:${dim}:${val}`);
  });
  return out;
}

export function f1(expected: Set<string>, got: Set<string>): number {
  if (!expected.size && !got.size) return 1;
  let tp = 0;
  for (const f of got) if (expected.has(f)) tp++;
  const p = got.size ? tp / got.size : 0;
  const r = expected.size ? tp / expected.size : 0;
  return p + r ? (2 * p * r) / (p + r) : 0;
}

const canonical = (v: ExplorerView | null | undefined) =>
  [...facts(v)].sort().join('|');

/** Numbers the model wrote that it could not have read from the view or the question. */
export function invented(
  understood: string | undefined,
  view: ExplorerView | null,
  q: string,
): number {
  if (!understood) return 0;
  const allowed = new Set([
    ...(view?.series.flatMap((s) => s.years.map(String)) ?? []),
    ...(q.match(/\d[\d,.]*/g) ?? []),
  ]);
  return (understood.match(/\d[\d,.]*/g) ?? []).filter((n) => !allowed.has(n))
    .length;
}

type Answer = {
  view: ExplorerView | null;
  by: 'card' | 'model' | 'refused' | 'fallback';
  inventedFigures: number;
};

async function answer(
  item: EvalItem,
  cat: Catalogue,
  decider: LlmDecision,
  resolver: ResolveService | null,
): Promise<Answer> {
  const lang = detectLang(item.q, item.lang);
  const ranked = rankCards(item.q, cat, lang);
  if (ranked[0] && ranked[0].score >= CARD_MATCH)
    return { view: ranked[0].card.view, by: 'card', inventedFigures: 0 };
  // The API's own hints (aliases + vectors above its cut-offs), as Ask sends them.
  const hints = resolver ? (await resolver.lookup(item.q, cat)).candidates : [];
  const out = await decideValidated(
    decider,
    item.q,
    lang,
    cat,
    () => {},
    hints,
  );
  if (out.view)
    return {
      view: out.view,
      by: 'model',
      inventedFigures: invented(out.understood, out.view, item.q),
    };
  if (out.refusal) return { view: null, by: 'refused', inventedFigures: 0 };
  return {
    view: ranked.find((r) => r.score > 0)?.card.view ?? null,
    by: 'fallback',
    inventedFigures: 0,
  };
}

async function loadCatalogue(api?: string, file?: string): Promise<Catalogue> {
  if (file) return JSON.parse(readFileSync(file, 'utf8')) as Catalogue;
  const res = await fetch(
    `${(api ?? 'http://localhost:8000').replace(/\/$/, '')}/api/v1/public/explorer/catalogue`,
  );
  if (!res.ok)
    throw new Error(
      `Catalogue: ${res.status} (is EXPLORER_ENABLED=1 on the API?)`,
    );
  return (await res.json()) as Catalogue;
}

/** In-memory stand-in for Redis: the eval caches nothing between runs. */
const memoryCache = () => {
  const m = new Map<string, unknown>();
  return {
    async getOrSet<T>(key: string, _ttl: number, fn: () => Promise<T>) {
      if (!m.has(key)) m.set(key, await fn());
      return m.get(key) as T;
    },
  } as unknown as CacheService;
};

/** The (dimension, id) pairs a view filters on that the resolver indexes: what hints should find. */
export function expectedValues(v: ExplorerView): string[] {
  return [
    ...new Set(
      v.series.flatMap((s) =>
        Object.entries(s.filters).flatMap(([dim, ids]) =>
          (INDEXED as string[]).includes(dim)
            ? (ids ?? []).map((id) => `${dim}:${id}`)
            : [],
        ),
      ),
    ),
  ];
}

/**
 * Threshold-free hint recall@k (specs/020 decision 11): of the values the
 * expected view filters on, the share among the k catalogue values nearest
 * the question by vector alone. Fair across models whose cosines differ in scale.
 */
export async function hintRecall(
  embedder: EmbedPort,
  cat: Catalogue,
  items: EvalItem[],
  k = 8,
): Promise<{ q: string; expected: number; found: number }[]> {
  const refs = INDEXED.flatMap((dim) =>
    cat.dimensions[dim].map((v) => ({
      key: `${dim}:${v.id}`,
      text: textOf(v),
    })),
  );
  const index = await embedder.embed(
    refs.map((r) => r.text),
    'passage',
  );
  const out: { q: string; expected: number; found: number }[] = [];
  for (const item of items) {
    const want = expectedValues(item.expected);
    if (!want.length) continue;
    const [qv] = await embedder.embed([normalise(item.q)], 'query');
    const top = new Set(
      index
        .map((v, i) => ({ key: refs[i].key, s: cosine(qv, v) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, k)
        .map((x) => x.key),
    );
    out.push({
      q: item.q,
      expected: want.length,
      found: want.filter((w) => top.has(w)).length,
    });
  }
  return out;
}

/** Eval sets: one per language, plus Taglish (code-switched, `lang: fil`; specs/020 B2.4). */
export const SETS = ['en', 'fil', 'taglish', 'bcl'] as const;

export function readEval(
  set: string,
  dir = join(process.cwd(), '..', 'specs', '018-data-explorer', 'eval'),
): EvalItem[] {
  const file = join(dir, `${set}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as EvalItem);
}

async function main() {
  const { values } = parseArgs({
    options: {
      api: { type: 'string' },
      catalogue: { type: 'string' },
      lang: { type: 'string' },
      set: { type: 'string' },
      once: { type: 'boolean', default: false },
      /** specs/020 B2.4: which backend embeds (and decides); chat stays on LLM_* unless stride. */
      backend: { type: 'string', default: 'openai' },
      /** Embedding only: hint recall, no chat-model calls (cheap; the swap rule's first test). */
      'no-model': { type: 'boolean', default: false },
      /** Per-item results as JSON, for paired bootstrap between backends. */
      out: { type: 'string' },
    },
  });
  const cat = await loadCatalogue(values.api, values.catalogue);
  if (values.backend !== 'openai') {
    process.env.EXPLORER_INFERENCE_EMBED = values.backend;
    process.env.EXPLORER_INFERENCE_DECIDE = values.backend;
  }
  const inference = inferenceFromEnv();
  // The resolver's vector rung needs the AI switch; the eval is never a public request.
  process.env.EXPLORER_ENABLED = '1';
  process.env.EXPLORER_AI_ENABLED = '1';
  const resolver = inference.embedder
    ? new ResolveService(
        {} as CatalogueService,
        memoryCache(),
        inference.embedder,
      )
    : null;
  const decider = new LlmDecision(
    inference.llm,
    explorerPromptVersion,
    inference.embedder,
  );
  const perItem: Record<string, unknown>[] = [];
  const sets: string[] = values.set
    ? [values.set]
    : values.lang
      ? [values.lang]
      : [...SETS];
  console.log(
    `catalogue ${cat.version} · model ${process.env.LLM_MODEL || '(none)'} · prompt v${explorerPromptVersion()} · embed ${values.backend} ${inference.embedder?.model ?? '(none)'}\n`,
  );
  if (inference.embedder) {
    console.log('| set | items with filters | hint recall@8 (vector only) |');
    console.log('|---|---|---|');
    for (const set of sets) {
      const r = await hintRecall(inference.embedder, cat, readEval(set));
      const want = r.reduce((a, x) => a + x.expected, 0);
      const got = r.reduce((a, x) => a + x.found, 0);
      perItem.push(...r.map((x) => ({ set, kind: 'recall', ...x })));
      console.log(
        `| ${set} | ${r.length} | ${want ? (got / want).toFixed(3) : '–'} (${got}/${want}) |`,
      );
    }
    console.log();
  }
  if (values['no-model']) {
    if (values.out) writeFileSync(values.out, JSON.stringify(perItem, null, 1));
    return;
  }
  console.log(
    '| set | n | exact | F1 | card | model | refused | fallback | invalid expected | invented figures | changed on rerun |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const lang of sets) {
    const items = readEval(lang);
    if (!items.length) continue;
    let exact = 0,
      f1sum = 0,
      inventedFigures = 0,
      changed = 0,
      badExpected = 0;
    const by: Record<Answer['by'], number> = {
      card: 0,
      model: 0,
      refused: 0,
      fallback: 0,
    };
    for (const item of items) {
      if (validateView(item.expected, cat).length) badExpected++;
      const a = await answer(item, cat, decider, resolver);
      by[a.by]++;
      perItem.push({
        set: lang,
        kind: 'answer',
        q: item.q,
        by: a.by,
        exact: canonical(a.view) === canonical(item.expected),
        f1: f1(facts(item.expected), facts(a.view)),
      });
      inventedFigures += a.inventedFigures;
      if (canonical(a.view) === canonical(item.expected)) exact++;
      f1sum += f1(facts(item.expected), facts(a.view));
      if (!values.once) {
        const b = await answer(item, cat, decider, resolver);
        if (canonical(b.view) !== canonical(a.view)) changed++;
      }
    }
    const pct = (n: number) => `${((100 * n) / items.length).toFixed(1)}%`;
    console.log(
      `| ${lang} | ${items.length} | ${pct(exact)} | ${(f1sum / items.length).toFixed(3)} | ${by.card} | ${by.model} | ${by.refused} | ${by.fallback} | ${badExpected} | ${inventedFigures} | ${values.once ? '–' : changed} |`,
    );
  }
  if (values.out) writeFileSync(values.out, JSON.stringify(perItem, null, 1));
}

if (process.argv[1]?.endsWith('run.ts'))
  void main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
