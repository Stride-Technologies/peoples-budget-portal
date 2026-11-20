import {
  isShoutedName,
  normalizeShoutedName,
  titleCaseName,
} from './title-case-name.js';

/**
 * The `cases` table below is the **same table** as `client/src/lib/utils.test.ts`.
 * `titleCaseName` is duplicated across the two workspaces on purpose (see the
 * header of `title-case-name.ts`), and running identical cases on both copies is
 * what stops them drifting. If you change one, change both.
 */
const cases: ReadonlyArray<readonly [string, string]> = [
  // Normalizes SHOUTED input, keeps minor words down.
  [
    'CONSTRUCTION OF BARANGAY HEALTH CENTER',
    'Construction of Barangay Health Center',
  ],
  ['THE BARANGAY ROAD PROJECT', 'The Barangay Road Project'],
  // Minor words: lowercase inside, capitalized when they open or close.
  ['aid to the poor', 'Aid to the Poor'],
  ['programs for all', 'Programs for All'],
  // Hyphen and slash each start a new capitalized piece.
  [
    'SOCIO-ECONOMIC DEVELOPMENT PROFILING',
    'Socio-Economic Development Profiling',
  ],
  [
    'socio-economic development profiling & roadmap',
    'Socio-Economic Development Profiling & Roadmap',
  ],
  [
    'drrm training/workshop for lgu staff',
    'DRRM Training/Workshop for LGU Staff',
  ],
  // Known acronyms come back in caps however they were typed.
  ['repair of cpdo building', 'Repair of CPDO Building'],
  ['MOOE for ICT equipment', 'MOOE for ICT Equipment'],
  // Casing that is deliberate, and things that are not names.
  ['ROAD CONCRETING PHASE II', 'Road Concreting Phase II'],
  // Words spelled out of roman-numeral letters are still words: CIVIC, CIVIL,
  // DID and MILL all pass a naive /^[IVXLCDM]+$/ test.
  ['CULTURAL EDUCATION, CIVIC IDENTITY', 'Cultural Education, Civic Identity'],
  [
    'CIVIL WORKS AND MILL REHABILITATION',
    'Civil Works and Mill Rehabilitation',
  ],
  ['CAgO livelihood program', 'CAgO Livelihood Program'],
  ['eGovernance rollout for the city', 'eGovernance Rollout for the City'],
  ['1st quarter GAD activities', '1st Quarter GAD Activities'],
  // Punctuation and the user's own spacing survive.
  ['("bayanihan" fund)', '("Bayanihan" Fund)'],
  ['  spaced   out  WORDS  ', '  Spaced   Out  Words  '],
  ['', ''],
];

describe('titleCaseName', () => {
  it.each(cases)('%j → %j', (input, expected) => {
    expect(titleCaseName(input)).toBe(expected);
  });

  /**
   * The acronyms below appear inside the 2027 workbook's all-caps program names.
   * Without them in `TITLE_ACRONYMS` the import writes "Tbi Development" and
   * "Cesar Institutional Development", which is worse than leaving the caps
   * alone — hence a case per acronym rather than a comment saying to add them.
   */
  it.each([
    ['CESAR INSTITUTIONAL DEVELOPMENT', 'CESAR Institutional Development'],
    ['TBI AND TBIS DEVELOPMENT PROGRAM', 'TBI and TBIS Development Program'],
    ['BCS OPERATIONS PROGRAM', 'BCS Operations Program'],
    ['DPO CAPACITY BUILDING', 'DPO Capacity Building'],
    ['LYDP FORMULATION', 'LYDP Formulation'],
    ['DOT ACCREDITATION SUPPORT', 'DOT Accreditation Support'],
  ])('keeps workbook acronyms in caps: %j → %j', (input, expected) => {
    expect(titleCaseName(input)).toBe(expected);
  });
});

describe('normalizeShoutedName', () => {
  it('title-cases a name that has no lowercase letter', () => {
    expect(normalizeShoutedName('PUBLIC ORDER AND ORDINANCE ENFORCEMENT')).toBe(
      'Public Order and Ordinance Enforcement',
    );
  });

  /** Four names in the 2027 workbook shout everything but the conjunction. */
  it('still counts as shouted when only a minor word is lower case', () => {
    expect(
      normalizeShoutedName('CITY FLEET MAINTENANCE and EQUIPMENT MANAGEMENT'),
    ).toBe('City Fleet Maintenance and Equipment Management');
    expect(
      normalizeShoutedName('HUMAN RESOURCE and ADMINISTRATIVE SUPPORT'),
    ).toBe('Human Resource and Administrative Support');
  });

  /** One properly-written word is enough to leave the whole name alone. */
  it('is not fooled by a single lower-case content word', () => {
    expect(isShoutedName('CITY FLEET maintenance AND EQUIPMENT')).toBe(false);
  });

  /**
   * The whole point of the `isShoutedName` guard. This real workbook activity
   * name would come back with "SG22" mangled to "Sg22" under blanket
   * title-casing, so a name the office already wrote in mixed case is left
   * exactly as it is.
   */
  it('leaves a name that already has lowercase completely alone', () => {
    const asTyped =
      'Rationalization of ABE Structure - Engineer IV (Division Head) - SG22';
    expect(normalizeShoutedName(asTyped)).toBe(asTyped);
    expect(isShoutedName(asTyped)).toBe(false);
  });

  it('treats a name with no letters at all as not shouted', () => {
    expect(isShoutedName('2027 - 001')).toBe(false);
    expect(normalizeShoutedName('2027 - 001')).toBe('2027 - 001');
  });
});
