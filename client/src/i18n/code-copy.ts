/**
 * Copy whose English is written in code, not `en.json` (specs/014): the budget
 * cycle, the glossary and the AIP reading guide. Each stays in the module that
 * owns it; this file names the catalogue path and the fields that are not copy.
 * `codeSource` hands all of it to `tools/translate` and the catalogue test.
 */
import { GLOSSARY } from '../lib/glossary.ts';
import { AIP_READING_GUIDE_COPY } from '../lib/aip-reading-guide-copy.ts';
import type { Locale } from './locales.ts';
import { collectSource, localize } from './localize.ts';
import { cycleSource } from './budget-cycle.ts';

// Terms and acronyms stay English (FR-003); `source` is a key, not copy.
const GLOSSARY_SKIP = new Set(['term', 'short', 'source']);
const GUIDE_SKIP = new Set(['href']);

export const glossaryCopy = (locale: Locale, vars: Record<string, string>) =>
  localize(GLOSSARY, locale, 'glossary', GLOSSARY_SKIP, vars);

export const readingGuideCopy = (locale: Locale, fiscalYear: number, vars: Record<string, string>) => {
  const copy = AIP_READING_GUIDE_COPY[fiscalYear];
  return copy && localize(copy, locale, `guide.${fiscalYear}`, GUIDE_SKIP, vars);
};

// Glossary entries too generic or compound to match in running text.
const NOT_A_PROSE_TERM = new Set(['Operations', 'Cluster', 'Implementing office', 'Program, project, activity']);

/**
 * The glossary's terms and acronyms: budget vocabulary that stays English in
 * every language (FR-003), merged with `tools/translate/protected-terms.txt`.
 */
export function glossaryTerms(): string[] {
  return GLOSSARY.flatMap((g) => g.entries)
    .flatMap((e) => [e.term, e.short ?? ''])
    .filter((term) => term && !NOT_A_PROSE_TERM.has(term));
}

export function codeSource(): Record<string, string> {
  return {
    ...cycleSource(),
    ...collectSource(GLOSSARY, 'glossary', GLOSSARY_SKIP),
    ...Object.assign(
      {},
      ...Object.entries(AIP_READING_GUIDE_COPY).map(([fy, copy]) =>
        collectSource(copy, `guide.${fy}`, GUIDE_SKIP),
      ),
    ),
  };
}
