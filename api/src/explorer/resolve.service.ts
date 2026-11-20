import { Inject, Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service.js';
import {
  CatalogueService,
  type Catalogue,
  type DimensionValue,
} from './catalogue.service.js';
import { explorerAiEnabled } from './explorer.config.js';
import { aliasHits, LANGS, normalise, sha } from './match.js';
import { EMBED_PORT, type EmbedPort } from './ports/embed.port.js';
import { DIMENSIONS, type Dimension } from './view.js';

export interface Candidate {
  dim: Dimension;
  id: string;
  label: string;
  /** 1 for a named alias; the cosine similarity for a vector match. */
  score: number;
  via: 'alias' | 'vector';
}

const TOP_K = 8;
/** Below this a vector match is noise (text-embedding-3-small on short phrases). */
const MIN_SCORE = 0.3;
/**
 * Once the question names a value outright, only a strong vector match adds
 * anything; weaker ones were look-alikes ("kalusugan" ~ "kaligtasan").
 * ponytail: fixed cut-offs tuned on text-embedding-3-small; re-tune per model.
 */
const STRONG = 0.38;
const TTL = 30 * 86_400;
// Values worth matching by meaning; sub-finish lines and expense classes are
// few and named outright, so aliases cover them.
export const INDEXED: Dimension[] = DIMENSIONS.filter(
  (d) => d !== 'subFinishLine' && d !== 'expenseClass',
);

/** What a value is embedded as: its name, description and every alias. */
export const textOf = (v: DimensionValue) =>
  [v.label, v.sublabel, LANGS.flatMap((l) => v.aliases[l] ?? []).join(', ')]
    .filter(Boolean)
    .join('. ');

/** Fewer digits in the cache; ranking does not need more. */
const round = (v: number[]) => v.map((x) => Math.round(x * 1e5) / 1e5);
const dot = (a: number[], b: number[]) =>
  a.reduce((acc, x, i) => acc + x * b[i], 0);

/**
 * Words → catalogue values (redesign W16): the deterministic rung of the Ask
 * ladder. Named aliases first, then the nearest values by meaning from an
 * embedding index of every label, description and alias. Same question, same
 * model, same catalogue → same candidates: both vectors are cached by content.
 * The model then chooses among these instead of the whole catalogue.
 */
@Injectable()
export class ResolveService {
  private readonly log = new Logger(ResolveService.name);
  /** Index per catalogue version + model, so Redis is read once per process. */
  private readonly memo = new Map<
    string,
    { refs: [Dimension, DimensionValue][]; vectors: number[][] }
  >();

  constructor(
    private readonly catalogue: CatalogueService,
    private readonly cache: CacheService,
    @Inject(EMBED_PORT) private readonly embedder: EmbedPort | null,
  ) {}

  async resolve(question: string, cat?: Catalogue): Promise<Candidate[]> {
    return (await this.lookup(question, cat)).candidates;
  }

  /**
   * `degraded` when the embedding index could not be reached: the hints are
   * aliases only, and an answer built on them should not be cached (on dev,
   * 2026-11-10, a hint-less "20% development fund" answer had no fund filter).
   */
  async lookup(
    question: string,
    cat?: Catalogue,
  ): Promise<{ candidates: Candidate[]; degraded: boolean }> {
    cat ??= await this.catalogue.get();
    const out = new Map<string, Candidate>();
    const label = (dim: Dimension, id: string) =>
      cat.dimensions[dim].find((v) => v.id === id)?.label ?? id;
    for (const tok of aliasHits(question, cat)) {
      const [dim, id] = tok.split(':') as [Dimension, string];
      out.set(tok, { dim, id, label: label(dim, id), score: 1, via: 'alias' });
    }
    const named = out.size > 0;
    const near = await this.nearest(question, cat);
    for (const c of near.candidates)
      if (!out.has(`${c.dim}:${c.id}`) && (!named || c.score >= STRONG))
        out.set(`${c.dim}:${c.id}`, c);
    return {
      candidates: [...out.values()]
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
        .slice(0, TOP_K),
      degraded: near.degraded,
    };
  }

  private async nearest(question: string, cat: Catalogue) {
    if (!this.embedder?.model || !explorerAiEnabled())
      return { candidates: [], degraded: false };
    try {
      const index = await this.index(cat);
      const q = normalise(question);
      const [qv] = await this.cache.getOrSet(
        `explorer:embed:q:${sha(`${this.embedder.model}\n${q}`)}`,
        TTL,
        async () => (await this.embedder!.embed([q], 'query')).map(round),
      );
      const candidates = index.refs
        .map(([dim, v], i) => ({
          dim,
          id: v.id,
          label: v.label,
          score: Math.round(dot(qv, index.vectors[i]) * 1000) / 1000,
          via: 'vector' as const,
        }))
        .filter((c) => c.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_K);
      return { candidates, degraded: false };
    } catch (e) {
      // Matching by alias still works; the model sees fewer hints.
      this.log.warn(`Embedding failed: ${(e as Error).message}`);
      return { candidates: [], degraded: true };
    }
  }

  private async index(cat: Catalogue) {
    const key = `${cat.version}:${this.embedder!.model}`;
    const hit = this.memo.get(key);
    if (hit) return hit;
    const refs = INDEXED.flatMap((dim) =>
      cat.dimensions[dim].map((v) => [dim, v] as [Dimension, DimensionValue]),
    );
    const texts = refs.map(([, v]) => textOf(v));
    const vectors = await this.cache.getOrSet(
      `explorer:embed:index:${sha(`${this.embedder!.model}\n${texts.join('\n')}`)}`,
      TTL,
      async () => (await this.embedder!.embed(texts, 'passage')).map(round),
    );
    if (this.memo.size > 4) this.memo.clear();
    const entry = { refs, vectors };
    this.memo.set(key, entry);
    return entry;
  }
}
