/**
 * Where a row's money goes, by barangay (specs/020 A3). Read from the row's
 * name with Naga's 27-barangay gazetteer (`prisma/data/naga-barangays.json`),
 * at query time, and never stored: like a derived import warning, it is
 * re-derived every read, so a better gazetteer changes every chart at once.
 *
 * Multi-valued, like labels: a drainage line "Sabang-Igualdad" counts in both
 * barangays, so there is no total across barangays. A row that names none is
 * city-wide (or simply does not say): `CITY_WIDE`, shown beside the map.
 */
import { Prisma } from '../../generated/prisma/index';
import gazetteer from '../../../prisma/data/naga-barangays.json';
import type { QueryRecord } from './engine.js';
import { SOURCES, type SourceId } from './fields.js';

export const CITY_WIDE = '_citywide';
export const CITY_WIDE_LABEL = 'City-wide or no barangay named';

interface Barangay {
  psgc: string;
  name: string;
  aliases: string[];
  population2020: number;
  prefixOnly?: boolean;
}
const LIST = gazetteer.barangays as Barangay[];
export const BARANGAYS: readonly Barangay[] = LIST;
export const CITY_POPULATION = gazetteer.city.population2020;

/** Lower case, no accents, single spaces: "Peñafrancia" and "Penafrancia" match. */
const norm = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole words only ("Abella" is not "Villa Sorabella"). A name that is also a
// festival, church or street (Peñafrancia, San Francisco) counts only after
// Brgy. / Bgy. / Barangay.
const PATTERNS = LIST.map((b) => {
  const names = [b.name, ...b.aliases].map(norm).map(esc).join('|');
  const word = `(?<![a-z0-9])(?:${names})(?![a-z0-9])`;
  return {
    psgc: b.psgc,
    re: new RegExp(
      b.prefixOnly ? `(?:brgy\\.?|bgy\\.?|barangay)\\s*${word}` : word,
    ),
  };
});

/** The PSGC codes of every barangay a text names, in code order; [] when none. */
export function barangayOf(text: string | null | undefined): string[] {
  if (!text) return [];
  const t = norm(text);
  return PATTERNS.filter((p) => p.re.test(t)).map((p) => p.psgc);
}

const BY_CODE = new Map(LIST.map((b) => [b.psgc, b]));
export const barangayLabel = (code: string) =>
  code === CITY_WIDE ? CITY_WIDE_LABEL : (BY_CODE.get(code)?.name ?? code);

/** PSA 2020 population of a barangay, or of the whole city for the city-wide bucket. */
export function populationOf(code: string | null): Prisma.Decimal | null {
  if (code === CITY_WIDE) return new Prisma.Decimal(CITY_POPULATION);
  const b = code ? BY_CODE.get(code) : undefined;
  return b ? new Prisma.Decimal(b.population2020) : null;
}

/** Sources whose rows can name a place: the ones that list a `barangay` field. */
const PLACED = new Set(
  (Object.keys(SOURCES) as SourceId[]).filter((s) =>
    SOURCES[s].fields.some((f) => f.id === 'barangay'),
  ),
);

/** Each record's barangays from its own name; city-wide when it names none. */
export function withBarangay(
  source: SourceId,
  records: QueryRecord[],
): QueryRecord[] {
  if (!PLACED.has(source)) return records;
  return records.map((r) => {
    const name = r.dims.name;
    const found = barangayOf(typeof name === 'string' ? name : null);
    return {
      ...r,
      dims: { ...r.dims, barangay: found.length ? found : [CITY_WIDE] },
    };
  });
}
