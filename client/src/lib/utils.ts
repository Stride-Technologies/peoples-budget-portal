import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Words that stay lowercase inside a title (never first or last). */
const MINOR_TITLE_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor',
  'of', 'on', 'onto', 'or', 'per', 'the', 'to', 'via', 'vs', 'with',
])

/**
 * Acronyms this portal's program names actually contain. They come back in caps
 * whichever way they were typed; anything else in caps gets normalized, so
 * SHOUTED names pasted out of Excel come out readable. Add to this list when a
 * real name gets mangled — that is the intended maintenance.
 *
 * `titleCaseName` is mirrored in `api/src/common/title-case-name.ts`, which the
 * 2027 workbook import uses. **Edit this list in both places** — an acronym
 * added here and not there mangles the next import.
 */
const TITLE_ACRONYMS = new Set([
  'AIP', 'BCS', 'BFP', 'BHW', 'CAO', 'CBO', 'CENRO', 'CESAR', 'CHO', 'CMO',
  'CPDO', 'CSO', 'CSWDO', 'CTO', 'CVO', 'DBM', 'DILG', 'DOH', 'DOT', 'DPO',
  'DPWH', 'DRRM', 'GAD', 'GSO', 'ICT', 'IT', 'LDRRM', 'LFC', 'LGU', 'LYDP',
  'MFO', 'MOOE', 'NCPC', 'NGO', 'PNP', 'PPA', 'PWD', 'SGLG', 'SK', 'TBI',
  'TBIS', 'TESDA', 'TVET', 'UACS',
])

/**
 * A **well-formed** roman numeral, not merely a word spelled out of the letters
 * roman numerals use. "Made of IVXLCDM" is far too loose: it captures CIVIC,
 * CIVIL, DID and MILL, and the 2027 workbook import duly turned "CIVIC IDENTITY"
 * into "CIVIC Identity". This pattern accepts II/IV/IX/XIV and rejects those.
 */
const ROMAN_NUMERAL = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i

/** One `-`/`/`-delimited piece of a word. */
function caseSegment(segment: string): string {
  const letters = segment.replace(/[^A-Za-z]/g, '')
  if (!letters) return segment

  // Known acronym, however it was typed: "cpdo" and "CPDO" both → "CPDO".
  if (TITLE_ACRONYMS.has(letters.toUpperCase())) return segment.toUpperCase()
  // Roman numerals — "Phase II", not "Phase Ii".
  if (letters.length > 1 && ROMAN_NUMERAL.test(letters)) {
    return segment.toUpperCase()
  }
  // Deliberate internal casing that is neither all-caps nor all-lowercase:
  // "CAgO", "eGovernance", "DepEd". Left exactly as typed.
  if (segment !== segment.toUpperCase() && /[a-z][A-Z]|[A-Z].*[A-Z]/.test(segment)) {
    return segment
  }

  const lower = segment.toLowerCase()
  // A leading digit means the word is not a name to capitalize: "1st", "2026".
  if (/^\d/.test(lower)) return lower
  // First *letter*, so an opening bracket or quote is skipped over, not counted.
  return lower.replace(/[a-z]/, (ch) => ch.toUpperCase())
}

/**
 * Title-case a name the way LGU documents write them: every word capitalized,
 * the rest of each word lowercased, except articles, conjunctions, and short
 * prepositions — those stay lowercase unless they open or close the title.
 *
 * "CONSTRUCTION OF BARANGAY HEALTH CENTER" → "Construction of Barangay Health
 * Center"; "socio-economic profiling" → "Socio-Economic Profiling". Casing that
 * is clearly deliberate is preserved: acronyms in `TITLE_ACRONYMS`, roman
 * numerals, and mixed-case words like "CAgO" or "eGovernance".
 */
export function titleCaseName(value: string): string {
  // Split keeping whitespace so the user's own spacing comes back unchanged.
  const parts = value.split(/(\s+)/)
  const wordIdx = parts.reduce<number[]>(
    (acc, part, i) => (/\S/.test(part) ? [...acc, i] : acc),
    [],
  )
  const first = wordIdx[0]
  const last = wordIdx[wordIdx.length - 1]

  return parts
    .map((part, i) => {
      if (!/\S/.test(part)) return part
      const lower = part.toLowerCase()
      if (MINOR_TITLE_WORDS.has(lower) && i !== first && i !== last) return lower
      // Hyphens and slashes each start a new capitalized piece; the separators
      // come back in place because the split keeps them.
      return part
        .split(/([-–—/])/)
        .map((segment, idx) => (idx % 2 ? segment : caseSegment(segment)))
        .join('')
    })
    .join('')
}

/**
 * Case-insensitive "every word appears somewhere" match. Used as the cmdk filter
 * for the office pickers so "cpdo", "planning", and "office development" all hit
 * "CPDO — City Planning and Development Office"; cmdk's default fuzzy scoring
 * drops multi-word and mid-string queries like those.
 */
export function matchesAllTerms(haystack: string, search: string): boolean {
  const target = haystack.toLowerCase()
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => target.includes(term))
}
