import assert from 'node:assert/strict'
import { test } from 'node:test'
import { titleCaseName } from './utils.ts'

/**
 * Run with `pnpm --filter client test` (Node's built-in runner — no test
 * framework in this workspace on purpose). `.husky/pre-push` already invokes it.
 *
 * The first version of `titleCaseName` only uppercased leading letters, so a name
 * pasted in caps came back as "CONSTRUCTION of BARANGAY HEALTH CENTER". These
 * cases pin both halves: normalize the rest of the word, but leave casing that
 * was clearly deliberate alone.
 *
 * This table is duplicated in `api/src/common/title-case-name.spec.ts`, which
 * runs it against the api's mirror of `titleCaseName`. Keep them identical.
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
  ['SOCIO-ECONOMIC DEVELOPMENT PROFILING', 'Socio-Economic Development Profiling'],
  [
    'socio-economic development profiling & roadmap',
    'Socio-Economic Development Profiling & Roadmap',
  ],
  ['drrm training/workshop for lgu staff', 'DRRM Training/Workshop for LGU Staff'],
  // Known acronyms come back in caps however they were typed.
  ['repair of cpdo building', 'Repair of CPDO Building'],
  ['MOOE for ICT equipment', 'MOOE for ICT Equipment'],
  // Casing that is deliberate, and things that are not names.
  ['ROAD CONCRETING PHASE II', 'Road Concreting Phase II'],
  // Words spelled out of roman-numeral letters are still words: CIVIC, CIVIL,
  // DID and MILL all pass a naive /^[IVXLCDM]+$/ test.
  ['CULTURAL EDUCATION, CIVIC IDENTITY', 'Cultural Education, Civic Identity'],
  ['CIVIL WORKS AND MILL REHABILITATION', 'Civil Works and Mill Rehabilitation'],
  ['CAgO livelihood program', 'CAgO Livelihood Program'],
  ['eGovernance rollout for the city', 'eGovernance Rollout for the City'],
  ['1st quarter GAD activities', '1st Quarter GAD Activities'],
  // Punctuation and the user's own spacing survive.
  ['("bayanihan" fund)', '("Bayanihan" Fund)'],
  ['  spaced   out  WORDS  ', '  Spaced   Out  Words  '],
  ['', ''],
]

test('titleCaseName', () => {
  for (const [input, expected] of cases) {
    assert.equal(titleCaseName(input), expected, `input: ${JSON.stringify(input)}`)
  }
})
