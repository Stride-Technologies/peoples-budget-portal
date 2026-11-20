/**
 * Every eval item's `expected` passes the validator against a catalogue
 * (specs/020 B2.4). Run before an eval, after editing a set:
 *
 *   pnpm --filter api exec tsx src/explorer/eval/check-sets.ts --catalogue cat.json
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { Catalogue } from '../catalogue.service.js';
import { validateView } from '../view.js';
import { readEval, SETS } from './run.js';

const { values } = parseArgs({ options: { catalogue: { type: 'string' } } });
const cat = JSON.parse(readFileSync(values.catalogue!, 'utf8')) as Catalogue;
let bad = 0;
for (const set of SETS) {
  const items = readEval(set);
  const wrong = items.filter((i) => validateView(i.expected, cat).length);
  bad += wrong.length;
  console.log(`${set}: ${items.length} items, ${wrong.length} invalid`);
  for (const w of wrong)
    console.log(
      `  ${w.q} → ${validateView(w.expected, cat)
        .map((e) => `${e.path}: ${e.message}`)
        .join('; ')}`,
    );
}
process.exitCode = bad ? 1 : 0;
