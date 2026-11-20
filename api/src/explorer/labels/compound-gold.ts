/**
 * Compound cases for the label gold set (specs/020, decision #16). The random
 * gold draw (B1.2) almost never lands on the few rows where a compound decides
 * the label, so this draws them on purpose, from the reviewed compounds
 * (`prisma/data/explorer-compounds.json`):
 *
 * - `compound`: rows whose own name contains the phrase. For a phrase kept out
 *   of a label ("capacity building" ↛ infrastructure) these are the traps; for
 *   one reviewed as meaning what it says ("flood control") they are the controls.
 * - `contrast`: rows whose own name has the word that would trigger the label
 *   without the phrase ("School Building"), so the slice also shows the word
 *   is still read as itself.
 *
 * The case a row belongs to goes in a sidecar file, never on the sheet: the
 * reviewer decides from the text alone, as for every gold row. Pure.
 */
import { createHash } from 'node:crypto';
import { compoundPattern, norm, type Compound } from '../phrases.js';

export interface GoldCase {
  rowId: string;
  phrase: string;
  role: 'compound' | 'contrast';
  /**
   * The labels the phrase is kept out of. A `compound` row should not carry
   * them; a `contrast` row is where they may still be right. Empty for a phrase
   * reviewed as meaning what it says.
   */
  labels: string[];
  /** The word the label's keyword or alias matches, for a contrast row. */
  word: string;
}

/** A row's own name: the first line of its text, without its kind ("Activity: …"). */
export const nameOf = (text: string) => {
  const first = text.split('\n', 1)[0];
  const i = first.indexOf(': ');
  return i >= 0 ? first.slice(i + 2) : first;
};

const rank = (seed: string, id: string) =>
  createHash('sha256').update(`${seed}:${id}`).digest('hex');

/** A label's or topic's word tests: its topic keyword patterns and its aliases. */
export type Triggers = Map<string, ((word: string) => boolean)[]>;

export function triggersOf(
  topics: { id: string; rules: [string, string][] }[],
  labels: { id: string; aliases?: Record<string, string[]> }[],
): Triggers {
  const out: Triggers = new Map();
  const add = (id: string, t: (w: string) => boolean) =>
    (out.get(id) ?? out.set(id, []).get(id)!).push(t);
  for (const t of topics)
    for (const [k, v] of t.rules)
      if (k === 'keyword') {
        const re = new RegExp(v, 'i');
        add(t.id, (w) => re.test(w));
      }
  for (const l of labels)
    for (const a of Object.values(l.aliases ?? {}).flat()) {
      const n = norm(a).trim();
      add(l.id, (w) => w === n);
    }
  return out;
}

/**
 * Up to `perCase` rows for each compound and, for each kept-out compound, up
 * to `perCase` contrast rows: drawn by a seeded hash, so the same rows come
 * out every run. A row is used once, for the first case that takes it.
 */
export function compoundCases(
  rows: { rowId: string; text: string }[],
  compounds: Compound[],
  triggers: Triggers,
  perCase: number,
  seed: string,
): GoldCase[] {
  const named = rows
    .map((r) => ({ rowId: r.rowId, name: norm(nameOf(r.text)) }))
    .sort((a, b) => (rank(seed, a.rowId) < rank(seed, b.rowId) ? -1 : 1));
  const used = new Set<string>();
  const out: GoldCase[] = [];
  const take = (
    hits: { rowId: string }[],
    make: (rowId: string) => GoldCase,
  ) => {
    for (const h of hits.filter((h) => !used.has(h.rowId)).slice(0, perCase)) {
      used.add(h.rowId);
      out.push(make(h.rowId));
    }
  };
  for (const c of [...compounds].sort((a, b) =>
    a.phrase.localeCompare(b.phrase),
  )) {
    const re = compoundPattern(c.phrase);
    const has = (s: string) => {
      re.lastIndex = 0;
      return re.test(s);
    };
    take(
      named.filter((r) => has(r.name)),
      (rowId) => ({
        rowId,
        phrase: c.phrase,
        role: 'compound',
        labels: c.not,
        word: '',
      }),
    );
    // The phrase's words the kept-out labels would fire on.
    const words = norm(c.phrase)
      .trim()
      .split(/\s+/)
      .filter((w) =>
        c.not.some((id) => (triggers.get(id) ?? []).some((t) => t(w))),
      );
    for (const w of words) {
      const wre = new RegExp(`(?<![a-z0-9])${w}(?![a-z0-9])`);
      take(
        named.filter((r) => wre.test(r.name) && !has(r.name)),
        (rowId) => ({
          rowId,
          phrase: c.phrase,
          role: 'contrast',
          labels: c.not,
          word: w,
        }),
      );
    }
  }
  return out;
}

/**
 * How the labeller did on the cases, from its picks: on a kept-out compound,
 * how often it still gave a label it should not (the trap worked); on its
 * contrast rows, how often it gave that label (the word read as itself).
 */
export function compoundScore(
  cases: GoldCase[],
  picks: Map<string, string[]>,
): {
  phrase: string;
  labels: string[];
  trapped: number;
  compounds: number;
  contrastHit: number;
  contrasts: number;
}[] {
  const out = new Map<
    string,
    {
      phrase: string;
      labels: string[];
      trapped: number;
      compounds: number;
      contrastHit: number;
      contrasts: number;
    }
  >();
  for (const c of cases) {
    if (!c.labels.length) continue;
    const e = out.get(c.phrase) ?? {
      phrase: c.phrase,
      labels: c.labels,
      trapped: 0,
      compounds: 0,
      contrastHit: 0,
      contrasts: 0,
    };
    out.set(c.phrase, e);
    const given = new Set(
      (picks.get(c.rowId) ?? []).map((id) => id.split('.')[0]),
    );
    const hit = c.labels.some((id) => given.has(id));
    if (c.role === 'compound') {
      e.compounds++;
      if (hit) e.trapped++;
    } else {
      e.contrasts++;
      if (hit) e.contrastHit++;
    }
  }
  return [...out.values()];
}

/** A sidecar `<sheet>.cases.csv` back into cases. */
export function readCases(csv: string): GoldCase[] {
  const [head, ...lines] = csv.trim().split('\n');
  const at = (n: string) => head.split(',').indexOf(n);
  return lines.map((l) => {
    const c = l.split(',');
    return {
      rowId: c[at('row_id')],
      phrase: c[at('phrase')],
      role: c[at('role')] as GoldCase['role'],
      labels: c[at('labels')] ? c[at('labels')].split(' ') : [],
      word: c[at('word')] ?? '',
    };
  });
}

/**
 * The compound slice of the gold set, against what Stride decided: the live
 * picks' error on these rows (the model's labels at or above `threshold`), and
 * how often a kept-out compound row went live with a label Stride did not give
 * it. Reported beside the calibration, never fitted on: these rows are chosen,
 * not drawn at random, so their error rate is not the run's.
 */
export function compoundSlice(
  rows: {
    rowId: string;
    picks: { id: string; confidence: number }[];
    gold: string[];
  }[],
  cases: GoldCase[],
  threshold: number,
) {
  const role = new Map(cases.map((c) => [c.rowId, c]));
  const top = (id: string) => id.split('.')[0];
  const slice = (r: GoldCase['role']) => {
    const rs = rows.filter((x) => role.get(x.rowId)?.role === r);
    const live = rs.flatMap((x) =>
      x.picks
        .filter((p) => p.confidence >= threshold)
        .map((p) => x.gold.includes(p.id)),
    );
    const kept = rs.filter((x) => role.get(x.rowId)!.labels.length);
    const wrong = kept.filter((x) => {
      const labels = role.get(x.rowId)!.labels;
      const given = x.picks
        .filter((p) => p.confidence >= threshold)
        .map((p) => top(p.id));
      const gold = x.gold.map(top);
      return labels.some((l) => given.includes(l) && !gold.includes(l));
    });
    return {
      rows: rs.length,
      livePicks: live.length,
      liveError: live.length
        ? live.filter((ok) => !ok).length / live.length
        : 0,
      keptOutRows: kept.length,
      keptOutWrong: wrong.length,
    };
  };
  return { compound: slice('compound'), contrast: slice('contrast') };
}
