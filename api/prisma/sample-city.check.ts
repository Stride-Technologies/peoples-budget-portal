/**
 * Proves the sample city names no real place: no text in `data/sample-city/` matches a place
 * name, a barangay, a local institution or a word that introduces an address. The programs and
 * amounts are a real city's, so this is what keeps the sample from pointing back at it.
 *
 *   pnpm --filter api db:check:sample-city
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PLACES = [
  'Naga',
  'Nagueño',
  'Nagueños',
  'Naguenos',
  'Nagueno',
  'NCPC',
  'Bicol',
  'Bikol',
  'Camarines',
  'CamSur',
  'Isarog',
  'Robredo',
  'JMR',
  'Ateneo',
  'Peñafrancia',
  'Penafrancia',
  'Jesse',
  'Museo',
  'Nueva Caceres',
];
const BARANGAYS = [
  'Abella',
  'Bagumbayan',
  'Balatas',
  'Calauag',
  'Cararayan',
  'Carolina',
  'Concepcion',
  'Dayangdang',
  'Del Rosario',
  'Dinaga',
  'Igualdad',
  'Lerma',
  'Liboton',
  'Mabolo',
  'Pacol',
  'Panicuason',
  'Sabang',
  'San Felipe',
  'San Francisco',
  'San Isidro',
  'Santa Cruz',
  'Sta. Cruz',
  'Tabuco',
  'Tinago',
  'Triangulo',
];
const ADDRESS_WORDS = [
  'St',
  'Street',
  'Road',
  'Rd',
  'Ave',
  'Avenue',
  'Subd',
  'Subdivision',
  'Brgy',
  'Sitio',
  'Zone',
  'Highway',
  'Hwy',
  'Drive',
  'Cmpd',
  'Compound',
  'Creek',
  'River',
  'Village',
  'Ville',
  'Purok',
];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DENY = new RegExp(
  [
    `\\b(${[...PLACES, ...BARANGAYS].map(escape).join('|')})\\b`,
    `\\b(${ADDRESS_WORDS.join('|')})\\b`,
    'Elementary School',
    'High School',
    '\\bBarangay [A-Z][a-z]+',
  ].join('|'),
);

function* strings(o: unknown, path = ''): Generator<[string, string]> {
  if (typeof o === 'string') yield [path, o];
  else if (Array.isArray(o))
    for (const [i, x] of o.entries()) yield* strings(x, `${path}[${i}]`);
  else if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o as Record<string, unknown>))
      yield* strings(v, `${path}.${k}`);
}

const DIR = join(process.cwd(), 'prisma', 'data', 'sample-city');
const problems: string[] = [];
let checked = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const data: unknown = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  for (const [path, text] of strings(data)) {
    checked++;
    const hit = DENY.exec(text);
    if (hit)
      problems.push(`${file}${path}: "${hit[0]}" in "${text.slice(0, 80)}"`);
  }
}
if (problems.length) {
  console.error(
    `sample-city: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`,
  );
  process.exit(1);
}
console.log(`sample-city: ${checked} strings, no place named.`);
