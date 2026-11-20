import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIMENSIONS } from '../view.js';
import { SOURCE_IDS, SOURCES } from './fields.js';
import { GOAL } from '../../common/brand.js';

/** Every tooltip term is a real glossary entry (W6), or the tooltip would be empty. */
const glossary = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'client',
    'src',
    'lib',
    'glossary.ts',
  ),
  'utf8',
);

describe('source fields', () => {
  it.each(SOURCE_IDS.map((id) => [id]))(
    '%s: fields are unique and well formed',
    (id) => {
      const fields = SOURCES[id].fields;
      expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length);
      expect(fields.some((f) => f.role === 'money')).toBe(true);
      for (const f of fields) {
        if (f.catalogue) expect(DIMENSIONS).toContain(f.catalogue);
        // The goal's glossary term is the configured word, a constant in the glossary's source.
        if (f.term)
          expect(glossary).toContain(
            f.term === GOAL ? 'term: GOAL' : `term: '${f.term}'`,
          );
        for (const k of f.kinds ?? []) expect(SOURCES[id].kinds).toContain(k);
      }
    },
  );
});
