/**
 * Split a printed AIP reference code into its segments.
 *
 * The format is
 * `{sector4}-{lguLevel1}-{officeType2}-{officeCode}-{papClass3}-{prog3}-{pa3}`,
 * optionally with nested ordinals after the last one. Six of those seven are
 * fixed-width digits. **The office code is not**, and in AB 2026 it is not even
 * hyphen-free: Special Purpose Appropriations prints
 * `1000-2-02-1181-4(1)-001-000-000`, whose office code is `1181-4(1)`.
 *
 * That is why nothing may `split('-')` and index positionally. Doing so read the
 * wrong segment on those rows, the code-shape test rejected them, and the two
 * rows — ₱400,000 of the Naga City Anti-Drug Task Force and Resilience Council —
 * fell out of the book entirely, leaving the city total short of the amount the
 * ordinance states.
 *
 * Parsed from both ends instead: three fixed segments at the front, the ordinals
 * at the back, office code is whatever is left in the middle. Where both
 * readings are possible the **shortest** office code wins, so an ordinary code
 * with nested ordinals (`…-11-001-000-000-01`) is unaffected.
 *
 * Deliberately dependency-free — the 2026 importer runs under ts-node and must
 * not pull in the Prisma client, so this cannot live in `ab-2026-book.ts`.
 */

export interface CodeSegments {
  sector: string;
  lguLevel: string;
  officeType: string;
  officeCode: string;
  papClass: string;
  program: string;
  /** The PA ordinal, which may carry a trailing letter (`001a`). */
  pa: string;
  /** Nested ordinals printed after the PA, if any. */
  nested: string[];
}

/** `001-000-000` and any nested ordinals after it. */
const TAIL = /^\d{3}-\d{3}-\d{3}[a-z]?(?:-\d+[a-z]?)*$/i;

export function codeSegments(code: string): CodeSegments | null {
  const parts = code.trim().split('-');
  if (parts.length < 7) return null;
  if (!/^\d{4}$/.test(parts[0])) return null;
  if (!/^\d$/.test(parts[1])) return null;
  if (!/^\d{1,3}$/.test(parts[2])) return null;

  // Grow the office code one segment at a time and stop at the first split that
  // leaves a valid tail — the shortest office code that works.
  for (let end = 4; end <= parts.length - 3; end++) {
    const tail = parts.slice(end);
    if (!TAIL.test(tail.join('-'))) continue;
    return {
      sector: parts[0],
      lguLevel: parts[1],
      officeType: parts[2],
      officeCode: parts.slice(3, end).join('-'),
      papClass: tail[0],
      program: tail[1],
      pa: tail[2],
      nested: tail.slice(3),
    };
  }
  return null;
}

/** The office code segment, or `''` when the code cannot be read. */
export function officeCodeOf(code: string): string {
  return codeSegments(code)?.officeCode ?? '';
}

/**
 * The program a row belongs to: everything up to and including its program
 * ordinal. The grouping key the seed and the verifier both build programs from.
 */
export function programKeyOfCode(code: string): string {
  const s = codeSegments(code);
  if (!s) return code.split('-').slice(0, 6).join('-');
  return [
    s.sector,
    s.lguLevel,
    s.officeType,
    s.officeCode,
    s.papClass,
    s.program,
  ].join('-');
}

/** True when the code names a program row — a `-000` PA ordinal, not nested. */
export function isProgramCode(code: string): boolean {
  const s = codeSegments(code);
  return s !== null && s.pa === '000' && s.nested.length === 0;
}
