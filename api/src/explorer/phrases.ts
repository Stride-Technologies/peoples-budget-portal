/**
 * Compound phrases (specs/020, decision #16): text is segmented into learned
 * phrases before anything counts or matches it, so "human resource" is one
 * term, not "human" and "resource", and "capacity building" is not a building.
 *
 * - `learnPhrases`: adjacent words that occur together far more than chance,
 *   by normalised PMI over rows (Bouma 2009), merged in two passes (Mikolov et
 *   al. 2013), never across punctuation or a stop word, at most three words.
 * - `termsOf`: a name as its phrases and remaining words; a word inside a
 *   phrase is not counted again there (C-value, Frantzi et al. 2000).
 * - `Compound` / `masker`: reviewed phrases that must not trigger a topic's
 *   keyword or a label's alias although they contain one ("technical
 *   assistance" is not social welfare). `prisma/data/explorer-compounds.json`.
 *
 * Pure: the word map (`query/terms.ts`), topic rules (`topics.ts`), question
 * matching (`match.ts`) and the compounds report all use it.
 */

const BASE_STOP = `
  a an and are as at be by for from in into is it of on or the to with without per via
  all any each other others more most new old one two three including incl etc
  ang ng mga sa na at ay para kay ni nang mula hanggang
  city cities barangay barangays brgy bgy zone sitio
  program programs programme project projects activity activities services service
  management implementation operation operations operating support provision maintenance
  office offices department division unit section various general administration
  administrative institutional enhancement inter
  conduct establishment proposed completion phase year annual fy cy lgu local government
  january february march april may june july august september october november december
  jan feb mar apr jun jul aug sep sept oct nov dec days day
  `;

/**
 * Words that say nothing about what money is for: English, Filipino, budget boilerplate, and
 * the LGU's own name (in its own budget, "San Isidro" is on every other row).
 */
export const stopWords = (lguShortName = ''): Set<string> =>
  new Set(
    `${BASE_STOP} ${lguShortName}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );

export const STOP = stopWords(process.env.LGU_SHORT_NAME);

export const norm = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Words of a name with stop words and punctuation left as gaps, so a phrase never spans one. */
export function tokens(name: string): (string | null)[] {
  return norm(name)
    .replace(/[,;:()/&|.]+/g, ' | ')
    .split(/[^a-z|]+/)
    .filter(Boolean)
    .map((w) => (w === '|' || w.length < 3 || STOP.has(w) ? null : w));
}

/** A word pair is a phrase when its normalised PMI over rows reaches this (Bouma 2009). */
export const NPMI_MIN = 0.5;
/** Merge passes: the second lets a phrase take one more word ("disaster risk" + "reduction"). */
export const PHRASE_PASSES = 2;
/**
 * A phrase must occur in at least this many rows: NPMI rates a pair seen twice
 * whose words occur nowhere else as a perfect phrase ("soriano ave"), the
 * rare-pair bias Mikolov et al.'s `min_count` exists for.
 */
export const MIN_PHRASE_ROWS = 3;

/** One pass of greedy, left-to-right merging of known phrases. */
function merge(
  seq: (string | null)[],
  phrases: Set<string>,
): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < seq.length; i++) {
    const pair = seq[i] && seq[i + 1] ? `${seq[i]} ${seq[i + 1]}` : '';
    if (pair && phrases.has(pair)) {
      out.push(pair);
      i++;
    } else out.push(seq[i]);
  }
  return out;
}

/**
 * The phrases of a set of names (specs/020, compounds): adjacent words that
 * occur together far more than chance, by normalised PMI over rows,
 * NPMI(a, b) = ln(p(ab) / (p(a) p(b))) / -ln p(ab), in at least `MIN_PHRASE_ROWS`
 * rows. Run twice over the merged text, as word2vec's phrase pass is
 * (Mikolov et al. 2013), so three-word terms form. Deterministic.
 */
export function learnPhrases(names: string[]): Set<string> {
  const phrases = new Set<string>();
  let seqs = names.map(tokens);
  const N = Math.max(1, seqs.length);
  for (let pass = 0; pass < PHRASE_PASSES; pass++) {
    const words = new Map<string, number>();
    const pairs = new Map<string, { a: string; b: string; n: number }>();
    for (const s of seqs) {
      const seenW = new Set<string>();
      const seenP = new Set<string>();
      s.forEach((w, i) => {
        if (!w) return;
        if (!seenW.has(w)) {
          seenW.add(w);
          words.set(w, (words.get(w) ?? 0) + 1);
        }
        const b = s[i + 1];
        const k = b ? `${w} ${b}` : '';
        if (!b || seenP.has(k)) return;
        seenP.add(k);
        const e = pairs.get(k) ?? pairs.set(k, { a: w, b, n: 0 }).get(k)!;
        e.n += 1;
      });
    }
    for (const [k, { a, b, n }] of pairs) {
      // At most three words: a second pass adds a word to a phrase, never joins two.
      if (n < MIN_PHRASE_ROWS || (a.includes(' ') && b.includes(' '))) continue;
      const pab = n / N;
      const npmi =
        pab >= 1
          ? 1
          : Math.log(pab / ((words.get(a)! / N) * (words.get(b)! / N))) /
            -Math.log(pab);
      if (npmi >= NPMI_MIN) phrases.add(k);
    }
    seqs = seqs.map((s) => merge(s, phrases));
  }
  return phrases;
}

/**
 * The distinct terms of a name: its phrases whole, and its other words. A word
 * inside a phrase is not counted again on its own there, as C-value discounts
 * a term nested in a longer one (Frantzi, Ananiadou & Mima 2000): "Human
 * Resource Development" is "human resource" and "development", not "human".
 */
export function termsOf(
  name: string,
  phrases: Set<string> = new Set(),
): string[] {
  let seq = tokens(name);
  for (let pass = 0; pass < PHRASE_PASSES; pass++) seq = merge(seq, phrases);
  return [...new Set(seq.filter((w): w is string => !!w))];
}

/** A reviewed compound: a phrase and the topics and labels it must not trigger. */
export interface Compound {
  phrase: string;
  /** Topic or label ids its words would otherwise match (`social-welfare`, `infrastructure`). */
  not: string[];
  /** Why, in a few words, for the reviewer. */
  why?: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A compound as a pattern over normalised text: its words in order, across spaces or hyphens. */
export const compoundPattern = (phrase: string) =>
  new RegExp(
    `(?<![a-z0-9])${norm(phrase).trim().split(/\s+/).map(escape).join('[\\s-]+')}(?![a-z0-9])`,
    'g',
  );

/**
 * For a topic or label id, the text with every compound that must not trigger
 * it blanked out, so a keyword pattern sees "capacity ________" and never
 * "capacity building". Text comes back lower-case without accents (`norm`),
 * which every keyword and alias here is matched against anyway.
 */
export function masker(
  compounds: Compound[],
): (id: string, text: string) => string {
  const by = new Map<string, RegExp[]>();
  for (const c of compounds)
    for (const id of c.not)
      (by.get(id) ?? by.set(id, []).get(id)!).push(compoundPattern(c.phrase));
  return (id, text) => {
    const res = by.get(id);
    if (!res) return text;
    let t = norm(text);
    for (const re of res) t = t.replace(re, (m) => ' '.repeat(m.length));
    return t;
  };
}
