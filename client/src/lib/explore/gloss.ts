/**
 * Budget terms in a sentence (specs/018 redesign W6, W26): the glossary's
 * terms and acronyms, each marked at its first use so the page can explain
 * it on hover, tap or focus. Pure; matched longest term first, whole words,
 * acronyms by case ("CO" the class, never "co-").
 */
import { GLOSSARY, type GlossaryEntry } from '../glossary.ts';

export type Piece = { text: string; entry?: GlossaryEntry };

/** Terms too common as plain words to mark. */
const SKIP = new Set(['Operations', 'Veto', 'Cluster']);

const ENTRIES = GLOSSARY.flatMap((g) => g.entries).filter((e) => !SKIP.has(e.term));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KEYS = ENTRIES.flatMap((e) => [
  { key: e.term, entry: e, cased: false },
  ...(e.short && e.short.length > 1 ? [{ key: e.short, entry: e, cased: true }] : []),
]).sort((a, b) => b.key.length - a.key.length);
const RE = new RegExp(`\\b(${KEYS.map((k) => esc(k.key)).join('|')})\\b`, 'gi');

export function gloss(text: string, seen: Set<string> = new Set()): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const m of text.matchAll(RE)) {
    const hit = KEYS.find((k) => (k.cased ? k.key === m[0] : k.key.toLowerCase() === m[0].toLowerCase()));
    if (!hit || seen.has(hit.entry.term)) continue;
    seen.add(hit.entry.term);
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push({ text: m[0], entry: hit.entry });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
