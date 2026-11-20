/**
 * The words the budget spends on (specs/020 A4.1): words and learned phrases
 * ("human resource", "solid waste") from row names, sized by the pesos of the rows that use them. Deterministic:
 * a fixed stop-list, then class-based TF-IDF (Grootendorst 2022, BERTopic's
 * c-TF-IDF) with each label as a class, so a word every label uses ("program",
 * "services") does not crowd out the words that say what the money is for.
 *
 * One record per (row, term). `term` is multi-valued in `fields.ts`, so the
 * engine never totals or takes shares across terms; a terms query must break
 * down by term (`validateQuery`), and the row count is distinct rows.
 */
import type { QueryRecord } from './engine.js';
import { UNCLASSIFIED } from '../labels/taxonomy.js';
import { learnPhrases, termsOf } from '../phrases.js';

export { learnPhrases, termsOf, STOP } from '../phrases.js';

/** How many distinctive terms each label keeps. */
export const TOP_PER_LABEL = 40;
/** A term must appear in at least this many rows. */
export const MIN_ROWS = 2;

/**
 * Each term's c-TF-IDF in each class, and the class it is most distinctive
 * of: score(t, c) = tf(t, c) / |c| · log(1 + A / f(t)), with |c| the class's
 * term count, A the mean of |c| and f(t) the term's count over all classes.
 * A row with several labels counts in each; a row with none is Not classified.
 */
export function distinctive(
  rows: { name: string; labels: string[] }[],
  phrases: Set<string> = learnPhrases(rows.map((r) => r.name)),
): Map<string, { home: string; score: number }> {
  const tf = new Map<string, Map<string, number>>(); // class → term → count
  const f = new Map<string, number>();
  const rowsOf = new Map<string, number>();
  for (const r of rows) {
    const ts = termsOf(r.name, phrases);
    for (const t of ts) rowsOf.set(t, (rowsOf.get(t) ?? 0) + 1);
    for (const c of r.labels.length ? r.labels : [UNCLASSIFIED]) {
      const m = tf.get(c) ?? tf.set(c, new Map()).get(c)!;
      for (const t of ts) {
        m.set(t, (m.get(t) ?? 0) + 1);
        f.set(t, (f.get(t) ?? 0) + 1);
      }
    }
  }
  const size = new Map(
    [...tf].map(([c, m]) => [c, [...m.values()].reduce((a, b) => a + b, 0)]),
  );
  const A =
    [...size.values()].reduce((a, b) => a + b, 0) / Math.max(1, size.size);
  const best = new Map<string, { home: string; score: number }>();
  // Classes in code order, so a tie goes to the same class every run.
  for (const c of [...tf.keys()].sort()) {
    for (const [t, n] of tf.get(c)!) {
      if ((rowsOf.get(t) ?? 0) < MIN_ROWS) continue;
      const score = (n / size.get(c)!) * Math.log(1 + A / f.get(t)!);
      const b = best.get(t);
      if (!b || score > b.score) best.set(t, { home: c, score });
    }
  }
  // Keep each class's top terms (ties by the term, alphabetically).
  const byHome = new Map<string, [string, number][]>();
  for (const [t, { home, score }] of best)
    (byHome.get(home) ?? byHome.set(home, []).get(home)!).push([t, score]);
  const keep = new Map<string, { home: string; score: number }>();
  for (const [home, list] of byHome)
    list
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP_PER_LABEL)
      .forEach(([t, score]) => keep.set(t, { home, score }));
  return keep;
}

/** A source's records → one record per (row, kept term), with the term's home label. */
export function termRecords(records: QueryRecord[]): QueryRecord[] {
  const name = (r: QueryRecord) =>
    typeof r.dims.name === 'string' ? r.dims.name : '';
  const labels = (r: QueryRecord) =>
    (Array.isArray(r.dims.label) ? r.dims.label : []).filter(
      (l) => l !== UNCLASSIFIED,
    );
  const phrases = learnPhrases(records.map(name));
  const keep = distinctive(
    records.map((r) => ({ name: name(r), labels: labels(r) })),
    phrases,
  );
  return records.flatMap((r) =>
    termsOf(name(r), phrases)
      .filter((t) => keep.has(t))
      .map((t) => ({
        dims: { ...r.dims, term: t, termLabel: keep.get(t)!.home },
        money: r.money,
      })),
  );
}
