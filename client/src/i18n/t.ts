/**
 * Message lookup for the public site (specs/014).
 *
 * `en.json` is the source: key → English. `fil.json` / `bcl.json` hold
 * key → `{ text, src }`, where `src` is the English the translation was made
 * from. A translation whose `src` no longer equals today's English is stale and
 * is not shown — the English is, until `pnpm translate` and a reviewer catch up
 * (FR-004, FR-008). A missing key falls back to English the same way, so a page
 * never shows a key or a blank.
 *
 * Budget terms and data (program, office and PPA names, codes, amounts) never
 * go through here: they are rendered from the API as they are.
 */
import en from './messages/en.json' with { type: 'json' };
import fil from './messages/fil.json' with { type: 'json' };
import bcl from './messages/bcl.json' with { type: 'json' };
import type { Locale } from './locales.ts';

export type MessageKey = keyof typeof en;
type Translated = Partial<Record<string, { text: string; src: string }>>;

const TRANSLATIONS: Record<Exclude<Locale, 'en'>, Translated> = { fil, bcl };
const ENGLISH = en as Record<string, string>;

/** `{name}` slots, filled from `vars`; an unknown slot is left as written. */
function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const source = ENGLISH[key];
  if (locale !== 'en') {
    const entry = TRANSLATIONS[locale][key];
    if (entry && entry.src === source) return fill(entry.text, vars);
  }
  return fill(source ?? key, vars);
}

/**
 * For copy whose English lives in code rather than `en.json` (the budget
 * cycle in `lib/budget-cycle.ts`): the caller passes the English itself, and
 * the same staleness rule applies — a translation of different English is not
 * shown. See `localize`.
 */
export function translateSource(
  locale: Locale,
  key: string,
  english: string,
  vars?: Record<string, string | number>,
): string {
  if (locale !== 'en') {
    const entry = TRANSLATIONS[locale][key];
    if (entry && entry.src === english) return fill(entry.text, vars);
  }
  return fill(english, vars);
}

/**
 * A `t` bound to one locale — what pages and components call. `base` holds the slots every
 * message may use (the LGU's names: `messageVars`); a call's own `vars` win over them.
 */
export function translator(locale: Locale, base?: Record<string, string | number>) {
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, base ? { ...base, ...vars } : vars);
}

export { fill };
