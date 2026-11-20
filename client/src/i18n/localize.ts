/**
 * Translate a copy structure whose English is written in code (specs/014):
 * every string is looked up by its path (`cycle.stage.2.who.0.role`), so the
 * English stays in one place — the module that owns it — and `en.json` does
 * not duplicate it. `collectSource` walks the same paths to hand the English
 * to the translation script, so the two can never disagree about a key.
 *
 * Fields that are not copy (ids, numbers, layout) are named in `SKIP`.
 */
import type { Locale } from './locales.ts';
import { fill, translateSource } from './t.ts';

// `name`: office and document names stay in English (spec FR-003); `official`
// is what the documents call a stage, so it stays as they print it. `unconfirmed`
// shows only on dev and staging, in English; production shows `fallback`.
const SKIP = new Set(['n', 'lane', 'box', 'stages', 'name', 'official', 'unconfirmed']);

/**
 * `skip` replaces the default: a structure whose `term` or `href` is not copy names its own.
 * `vars` fills the `{placeName}`-style slots (`messageVars`), in English too.
 */
export function localize<T>(
  value: T,
  locale: Locale,
  path: string,
  skip = SKIP,
  vars?: Record<string, string | number>,
): T {
  if (locale === 'en' && !vars) return value;
  return walk(
    value,
    path,
    skip,
    (key, english) => (locale === 'en' ? fill(english, vars) : translateSource(locale, key, english, vars)),
    // A skipped field is not translated, but an office name still follows the LGU's type:
    // "{LguAdj} Budget Office".
    (raw) => fill(raw, vars),
  ) as T;
}

/** key → English, for every string `localize` would translate under `path`. */
export function collectSource(value: unknown, path: string, skip = SKIP): Record<string, string> {
  const out: Record<string, string> = {};
  walk(value, path, skip, (key, english) => {
    out[key] = english;
    return english;
  });
  return out;
}

function walk(
  value: unknown,
  path: string,
  skip: Set<string>,
  visit: (key: string, english: string) => string,
  skipped: (raw: string) => string = (raw) => raw,
): unknown {
  if (typeof value === 'string') return value.trim() === '' ? value : visit(path, value);
  if (Array.isArray(value)) return value.map((v, i) => walk(v, `${path}.${i}`, skip, visit, skipped));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        skip.has(k) ? (typeof v === 'string' ? skipped(v) : v) : walk(v, `${path}.${k}`, skip, visit, skipped),
      ]),
    );
  }
  return value;
}
