/**
 * specs/020 B1: what the labelling run learns from Stride's review. Pure: no
 * database, no network. The scripts in `prisma/label-*.ts` read and write.
 *
 * - `stratifiedSample`: the gold-set export, stratified by office (B1.2).
 * - `fitIsotonic` / `calibrated` / `reviewThreshold`: isotonic calibration of
 *   the model's stated confidence on the gold set, and the review threshold
 *   that keeps live labels under a target error rate (B1.3; Guo et al. 2017).
 * - `reviewOrder`: the review queue, neighbour disagreement first, then
 *   calibrated uncertainty, kept diverse (B1.4; Northcutt et al. 2021).
 */
import { createHash } from 'node:crypto';
import { cosine } from './labelling.js';

// ─── B1.2 gold set ────────────────────────────────────────────────────────────

/** The office a row's text names (`textOf` writes `Office: …`), or `(none)`. */
export const officeOf = (text: string) =>
  /^Office: (.+)$/m.exec(text)?.[1]?.trim() ?? '(none)';

/** Same seed, same order: the sample can be drawn again and checked. */
const rank = (seed: string, id: string) =>
  createHash('sha256').update(`${seed}:${id}`).digest('hex');

/**
 * `n` items, allocated to strata in proportion to their size (largest
 * remainder), at least one per stratum while `n` allows, then drawn by a
 * seeded hash. Deterministic for the same input and seed.
 */
export function stratifiedSample<T>(
  xs: T[],
  idOf: (x: T) => string,
  stratumOf: (x: T) => string,
  n: number,
  seed = 'gold-v1',
): T[] {
  const strata = new Map<string, T[]>();
  for (const x of xs) {
    const k = stratumOf(x);
    strata.set(k, [...(strata.get(k) ?? []), x]);
  }
  const keys = [...strata.keys()].sort();
  const total = xs.length;
  if (!total || n <= 0) return [];
  if (n >= total) return [...xs];
  // One per stratum first (the small offices are what a random draw misses).
  const take = new Map(keys.map((k) => [k, keys.length <= n ? 1 : 0]));
  let left = n - [...take.values()].reduce((a, b) => a + b, 0);
  const quota = keys.map((k) => {
    const room = strata.get(k)!.length - take.get(k)!;
    const exact = (left * strata.get(k)!.length) / total;
    return { k, room, base: Math.min(room, Math.floor(exact)), rem: exact % 1 };
  });
  for (const q of quota) {
    take.set(q.k, take.get(q.k)! + q.base);
    left -= q.base;
  }
  // Largest remainder; ties broken by key, so the allocation is stable.
  for (const q of [...quota].sort(
    (a, b) => b.rem - a.rem || (a.k < b.k ? -1 : 1),
  )) {
    if (left <= 0) break;
    if (take.get(q.k)! < strata.get(q.k)!.length) {
      take.set(q.k, take.get(q.k)! + 1);
      left--;
    }
  }
  // Rounding can leave a few over when a stratum filled up: hand them round.
  for (const k of keys) {
    while (left > 0 && take.get(k)! < strata.get(k)!.length) {
      take.set(k, take.get(k)! + 1);
      left--;
    }
  }
  return keys.flatMap((k) =>
    [...strata.get(k)!]
      .sort((a, b) => (rank(seed, idOf(a)) < rank(seed, idOf(b)) ? -1 : 1))
      .slice(0, take.get(k)),
  );
}

// ─── B1.3 calibration ─────────────────────────────────────────────────────────

/** One model pick checked against the gold set: its stated confidence, and whether it was right. */
export interface Scored {
  confidence: number;
  correct: boolean;
}

/**
 * A step function: at confidence ≥ `x[i]` (and below `x[i+1]`) the pick is
 * right with probability `y[i]`. Non-decreasing in `y` by construction.
 */
export interface Curve {
  x: number[];
  y: number[];
  /** Picks per step, for the report. */
  n: number[];
}

/** Pool-adjacent-violators: the least-squares non-decreasing fit of correctness on confidence. */
export function fitIsotonic(points: Scored[]): Curve {
  const sorted = [...points].sort((a, b) => a.confidence - b.confidence);
  // Equal confidences share a block first (the model states round numbers).
  const blocks: { x: number; sum: number; n: number }[] = [];
  for (const p of sorted) {
    const last = blocks.at(-1);
    if (last && last.x === p.confidence) {
      last.sum += +p.correct;
      last.n++;
    } else blocks.push({ x: p.confidence, sum: +p.correct, n: 1 });
  }
  const stack: { x: number; sum: number; n: number }[] = [];
  for (const b of blocks) {
    stack.push({ ...b });
    while (
      stack.length > 1 &&
      stack.at(-2)!.sum / stack.at(-2)!.n >= stack.at(-1)!.sum / stack.at(-1)!.n
    ) {
      const top = stack.pop()!;
      const prev = stack.at(-1)!;
      prev.sum += top.sum;
      prev.n += top.n;
    }
  }
  return {
    x: stack.map((b) => b.x),
    y: stack.map((b) => b.sum / b.n),
    n: stack.map((b) => b.n),
  };
}

/** The calibrated probability that a pick at this confidence is right. */
export function calibrated(curve: Curve, confidence: number): number {
  if (!curve.x.length) return confidence;
  let i = 0;
  while (i + 1 < curve.x.length && curve.x[i + 1] <= confidence) i++;
  return confidence < curve.x[0] ? curve.y[0] : curve.y[i];
}

/**
 * The lowest stated confidence whose calibrated precision is at least
 * `1 − targetError`: below it a pick goes to review. `1.01` (nothing live)
 * when no step is that good; never below the lowest confidence seen.
 */
export function reviewThreshold(curve: Curve, targetError: number): number {
  const i = curve.y.findIndex((y) => y >= 1 - targetError);
  return i < 0 ? 1.01 : curve.x[i];
}

/** Expected calibration error over `bins` equal-width bins (Guo et al. 2017). */
export function ece(
  points: Scored[],
  prob: (c: number) => number = (c) => c,
  bins = 10,
): number {
  if (!points.length) return 0;
  let total = 0;
  for (let b = 0; b < bins; b++) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const inBin = points.filter((p) => {
      const q = prob(p.confidence);
      return q >= lo && (b === bins - 1 ? q <= hi : q < hi);
    });
    if (!inBin.length) continue;
    const acc = inBin.filter((p) => p.correct).length / inBin.length;
    const conf =
      inBin.reduce((s, p) => s + prob(p.confidence), 0) / inBin.length;
    total += (inBin.length / points.length) * Math.abs(acc - conf);
  }
  return total;
}

/** A seeded uniform in [0, 1): bootstrap draws that come out the same each run. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 2 ** 32;
  };
}

/** Percentile bootstrap 95% interval of `stat` over resamples of `xs` (rows, not picks). */
export function bootstrap<T>(
  xs: T[],
  stat: (sample: T[]) => number,
  reps = 1000,
  seed = 20261113,
): { value: number; lo: number; hi: number } {
  const r = rng(seed);
  const vals: number[] = [];
  for (let i = 0; i < reps; i++)
    vals.push(stat(xs.map(() => xs[Math.floor(r() * xs.length)])));
  vals.sort((a, b) => a - b);
  return {
    value: stat(xs),
    lo: vals[Math.floor(0.025 * reps)],
    hi: vals[Math.min(reps - 1, Math.floor(0.975 * reps))],
  };
}

/** A gold row: what the model picked, and what Stride decided. */
export interface GoldRow {
  rowId: string;
  picks: { id: string; confidence: number }[];
  gold: string[];
}

/** Every model pick on a gold row, scored: right when Stride kept that label. */
export const scorePicks = (rows: GoldRow[]): Scored[] =>
  rows.flatMap((r) =>
    r.picks.map((p) => ({
      confidence: p.confidence,
      correct: r.gold.includes(p.id),
    })),
  );

// ─── B1.4 review order ────────────────────────────────────────────────────────

export interface QueueRow {
  rowId: string;
  vec: number[];
  /** The row's labels as the model gave them (live and in review). */
  labels: string[];
  /** Its least certain pick's calibrated probability (raw confidence without a curve). */
  certainty: number;
}

export interface Neighbour {
  vec: number[];
  /** Reviewed rows' gold labels where there are any; else the model's live labels. */
  labels: string[];
}

/**
 * How much a row's nearest neighbours disagree with it: the share of its `k`
 * nearest that carry none of its labels (confident learning's noisy-neighbour
 * signal, in its simplest form). 0 when the row has no labels to disagree with.
 */
export function disagreement(row: QueueRow, pool: Neighbour[], k = 10): number {
  if (!row.labels.length || !pool.length) return 0;
  const near = pool
    .map((n) => ({ n, s: cosine(row.vec, n.vec) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k);
  const off = near.filter(
    ({ n }) => !n.labels.some((l) => row.labels.includes(l)),
  );
  return off.length / near.length;
}

/**
 * The review queue: highest neighbour disagreement first, then least certain;
 * among the next candidates, the one least like anything already queued wins
 * (maximal marginal relevance, λ weighting priority against novelty).
 */
export function reviewOrder(
  rows: QueueRow[],
  pool: Neighbour[],
  opts: { k?: number; lambda?: number; window?: number } = {},
): { rowId: string; disagreement: number; certainty: number }[] {
  const { k = 10, lambda = 0.7, window = 50 } = opts;
  const scored = rows
    .map((r) => ({ r, d: disagreement(r, pool, k) }))
    // Priority: disagreement, then uncertainty; rowId keeps ties stable.
    .map((x) => ({ ...x, p: x.d + (1 - x.r.certainty) / 2 }))
    .sort((a, b) => b.p - a.p || (a.r.rowId < b.r.rowId ? -1 : 1));
  const out: typeof scored = [];
  const left = [...scored];
  while (left.length) {
    const cands = left.slice(0, window);
    let best = 0;
    let bestScore = -Infinity;
    cands.forEach((c, i) => {
      const sim = out.length
        ? Math.max(...out.slice(-window).map((o) => cosine(c.r.vec, o.r.vec)))
        : 0;
      const score = lambda * c.p - (1 - lambda) * sim;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    out.push(left.splice(best, 1)[0]);
  }
  return out.map((x) => ({
    rowId: x.r.rowId,
    disagreement: x.d,
    certainty: x.r.certainty,
  }));
}

/**
 * A filled review sheet (`reviewCsv`) → gold rows: the model's picks from
 * its `picks` column and Stride's decision. Rows left undecided are skipped;
 * `none` is a decision (no label is right).
 */
export function readGold(
  csv: string,
  parse: (text: string) => string[][],
): GoldRow[] {
  const [head, ...rows] = parse(csv);
  const at = (name: string) => head.indexOf(name);
  if (at('row_id') < 0 || at('decision') < 0 || at('picks') < 0)
    throw new Error('A gold sheet needs row_id, picks and decision columns.');
  return rows.flatMap((r) => {
    const d = (r[at('decision')] ?? '').trim();
    if (!d) return [];
    const picks = JSON.parse(r[at('picks')] || '[]') as {
      id: string;
      confidence: number;
    }[];
    return [
      {
        rowId: r[at('row_id')],
        picks,
        gold: /^(none|-)$/i.test(d) ? [] : d.split(/[\s,;]+/).filter(Boolean),
      },
    ];
  });
}

/**
 * Out-of-fold calibration: each row's picks are calibrated by a curve fitted
 * on the other folds, so the reported ECE is not the in-sample one. Folds are
 * by row (a seeded hash), never by pick.
 */
export function crossFitted(
  rows: GoldRow[],
  k = 5,
  seed = 'cv-v1',
): { confidence: number; p: number; correct: boolean }[] {
  const fold = (id: string) => parseInt(rank(seed, id).slice(0, 8), 16) % k;
  return Array.from({ length: k }, (_, f) => {
    const curve = fitIsotonic(
      scorePicks(rows.filter((r) => fold(r.rowId) !== f)),
    );
    return scorePicks(rows.filter((r) => fold(r.rowId) === f)).map((s) => ({
      ...s,
      p: calibrated(curve, s.confidence),
    }));
  }).flat();
}
