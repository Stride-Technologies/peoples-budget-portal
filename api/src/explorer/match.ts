/**
 * The cheap rungs of the Ask ladder (design §5 steps 2–4): normalising a
 * question, guessing its language, and matching it to a curated card. Pure
 * functions, so the eval and the tests run them without a database.
 */
import { createHash } from 'node:crypto';
import type { Card, Catalogue, Lang } from './catalogue.service.js';
import { DIMENSIONS, validateView } from './view.js';

export const LANGS: readonly Lang[] = ['en', 'fil', 'bcl'];

/** NFKC, lowercase, punctuation → space, spaces collapsed. */
export const normalise = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// tools/translate/translate.py's leak lists: the function words that prove
// which of the two came back. Bikol words in "Filipino" text and vice versa.
const BIKOL = [
  'kan',
  'nin',
  'asin',
  'dai',
  'iyo',
  'sarong',
  'giraray',
  'tanganing',
  'hale',
];
const TAGALOG = ['ang', 'ng', 'hindi', 'ito', 'ay', 'at', 'yung', 'naman'];

const count = (words: string[], tokens: string[]) =>
  tokens.filter((t) => words.includes(t)).length;

/**
 * The page language is the prior (design §5 step 3); only two or more
 * function words of the other language, and more of them than of the
 * prior's, flip it. English shares too few words with either to need a list.
 */
export function detectLang(text: string, prior: Lang): Lang {
  const tokens = normalise(text).split(' ');
  const b = count(BIKOL, tokens);
  const t = count(TAGALOG, tokens);
  if (prior !== 'bcl' && b >= 2 && b > t) return 'bcl';
  if (prior !== 'fil' && t >= 2 && t > b) return 'fil';
  return prior;
}

const YEAR = /\b(?:19|20)\d{2}\b/g;
const years = (s: string) => [...new Set(s.match(YEAR) ?? [])].sort().join(',');

type AliasIndex = [RegExp, string][];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every label and alias → a `dim:id` token, longest phrase first. */
function aliasIndex(cat: Catalogue): AliasIndex {
  const pairs: [string, string][] = [];
  // Topics first: on a phrase two values share ("education" the topic and the
  // cluster, "youth" the topic and the tag) the stable sort keeps the topic,
  // the broader meaning people intend (redesign W16).
  for (const dim of [
    'topic',
    ...DIMENSIONS.filter((d) => d !== 'topic'),
  ] as const)
    for (const v of cat.dimensions[dim]) {
      const phrases = [
        v.label,
        v.sublabel,
        ...LANGS.flatMap((l) => v.aliases[l] ?? []),
      ];
      for (const p of phrases) {
        const n = normalise(p ?? '');
        // ponytail: phrases under 3 letters (PS, CO, GF) collide with ordinary words; skipped.
        if (n.length >= 3 && !/^\d+$/.test(n))
          // Encoded: an id with a space ("CHO II") must stay one token.
          pairs.push([n, `${dim}:${encodeURIComponent(v.id)}`]);
      }
    }
  // A reviewed compound that must not trigger a topic or label is one unit, so no
  // alias inside it fires ("technical assistance" never reaches the "assistance"
  // alias of social welfare). Being longer, it is replaced first (decision #16).
  for (const c of cat.compounds ?? [])
    if (c.not.length)
      pairs.push([
        normalise(c.phrase),
        `compound:${encodeURIComponent(c.phrase)}`,
      ]);
  return pairs
    .sort((a, b) => b[0].length - a[0].length)
    .map(([p, tok]) => [new RegExp(`(?<=^| )${escape(p)}(?= |$)`, 'g'), tok]);
}

function tokens(text: string, index: AliasIndex): Set<string> {
  let s = normalise(text);
  for (const [re, tok] of index) s = s.replace(re, tok);
  return new Set(s.split(' ').filter(Boolean));
}

const dice = (a: Set<string>, b: Set<string>) => {
  let both = 0;
  for (const t of a) if (b.has(t)) both++;
  return a.size + b.size ? (2 * both) / (a.size + b.size) : 0;
};

interface Prepared {
  index: AliasIndex;
  cards: { card: Card; lang: Lang; tokens: Set<string>; years: string }[];
}

// Keyed by catalogue version, a content hash: different content never shares an entry.
const prepared = new Map<string, Prepared>();

function prepare(cat: Catalogue): Prepared {
  let p = prepared.get(cat.version);
  if (!p) {
    const index = aliasIndex(cat);
    p = {
      index,
      cards: cat.cards
        .filter((c) => validateView(c.view, cat).length === 0)
        .flatMap((card) =>
          LANGS.filter((l) => card.question[l]).map((lang) => ({
            card,
            lang,
            tokens: tokens(card.question[lang]!, index),
            years: years(card.question[lang]!),
          })),
        ),
    };
    if (prepared.size > 20) prepared.clear();
    prepared.set(cat.version, p);
  }
  return p;
}

/**
 * Catalogue values the question names outright, through a label or an alias
 * in any language: `dim:id` tokens, in the order they appear.
 */
export function aliasHits(question: string, cat: Catalogue): string[] {
  // A plain word that is a dimension's name ("office") has no `:id`.
  return [...tokens(question, prepare(cat).index)].flatMap((t) => {
    const [dim, id] = t.split(':');
    return id && (DIMENSIONS as readonly string[]).includes(dim)
      ? [`${dim}:${decodeURIComponent(id)}`]
      : [];
  });
}

export const CARD_MATCH = 0.85;

/**
 * Cards ranked by alias-expanded token overlap (Dice) with the question, best
 * first, one entry per card. A card whose question names other years never
 * matches above 0 — "2026" and "2027" differ by one token but not by little.
 */
export function rankCards(question: string, cat: Catalogue, lang: Lang) {
  const p = prepare(cat);
  const q = tokens(question, p.index);
  const qYears = years(normalise(question));
  const best = new Map<string, { card: Card; score: number }>();
  for (const c of p.cards) {
    const score =
      c.years === qYears ? dice(q, c.tokens) + (c.lang === lang ? 1e-6 : 0) : 0;
    if ((best.get(c.card.id)?.score ?? -1) < score)
      best.set(c.card.id, { card: c.card, score });
  }
  return [...best.values()].sort(
    (a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id),
  );
}

/** Cards that pass the validator against this catalogue, by tag. */
export const validCards = (cat: Catalogue, tag?: string) =>
  prepare(cat)
    .cards.map((c) => c.card)
    .filter(
      (c, i, all) => all.indexOf(c) === i && (!tag || c.tags.includes(tag)),
    );
