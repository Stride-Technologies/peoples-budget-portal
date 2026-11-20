/**
 * The shape of `prisma/data/ab-2026-book.json`, and the rules that turn its rows
 * into records.
 *
 * Extracted from `seed-ab-2026.ts` so `verify-ab-2026.ts` can group the book the
 * **same** way the seed does. A verifier that re-implements the grouping would
 * report a mismatch every time the two drifted, and the drift — not the
 * database — would be the thing it found.
 *
 * That is only safe because grouping correctness is checked independently:
 * `import-ab-2026-doc.ts` reconciles every sheet's leaf rows against the GRAND
 * TOTAL the document itself prints, and all 36 seedable sheets land on ₱0.00.
 * The shared code decides *which rows become which records*; the document's own
 * arithmetic decides whether the money adds up.
 *
 * Nothing here touches a database or parses a document.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FundSource, PapClass } from '../src/generated/prisma/index';
import {
  codeSegments,
  isProgramCode,
  officeCodeOf,
  programKeyOfCode,
} from './aip-code-segments';

// ─── The import's output, as both scripts read it ────────────────────────────

export interface BookRow {
  code: string;
  kind:
    | 'PAP_CLASS_HEADING'
    | 'PROGRAM'
    | 'PROJECT_ACTIVITY'
    | 'NESTED_ACTIVITY';
  papClassSegment: string;
  programOrdinal: string;
  paOrdinal: string;
  name: string;
  majorFinalOutput: string;
  performanceIndicator: string;
  targetForBudgetYear: string;
  ps: string | null;
  mooe: string | null;
  /** Financial Expenses (specs/008). No printed book so far has the column; optional so they still parse. */
  fe?: string | null;
  co: string | null;
  total: string | null;
  isComponent: boolean;
  groupHeading: string | null;
  componentOffice: { code: string; name: string; source: string } | null;
  sourceRow: string;
  /** The page of the source file, when it has pages (a scanned PDF). */
  sourcePage?: number;
  /** Doubts the import could not resolve (an OCR row that did not balance, a repaired code): stored as the PPA's import warnings. */
  warnings?: string[];
}

export interface UncodedRow {
  name: string;
  total: string | null;
  componentOffice: { code: string; name: string; source: string } | null;
  /** The coded row this one was printed under, if any. */
  afterCode: string | null;
  /** Where it was read, when known (the OCR import). */
  sourceRow?: string;
  sourcePage?: number;
}

export interface SheetTotals {
  label: string;
  ps: string | null;
  mooe: string | null;
  co: string | null;
  total: string | null;
}

export interface BookSheet {
  officeName: string;
  mandateLegalBasis: string | null;
  vision: string | null;
  mission: string | null;
  organizationalOutcomes: string[];
  rows: BookRow[];
  printedTotals: SheetTotals[];
  officeCodes: string[];
  uncodedMoneyRows: UncodedRow[];
  /** The file this sheet was read from, when the book has one file per sheet (the portal's PDFs). */
  sourceFile?: string;
  /** Where that file is hosted, for staff to open it at the row's page. */
  sourceUrl?: string | null;
}

export interface Book {
  fiscalYear: number;
  /** The city's file the book was read from, as the city named it. */
  sourceFile?: string;
  sheets: BookSheet[];
}

export const BOOK_PATH = resolve(__dirname, 'data/ab-2026-book.json');

export function readBook(path: string = BOOK_PATH): Book {
  return JSON.parse(readFileSync(path, 'utf8')) as Book;
}

/**
 * The sheet's own bottom line, in the same preference order the import's
 * reconciliation uses: GRAND TOTAL, then the pre-component TOTAL, then the label
 * the economic-enterprise sheets use.
 */
export function printedGrandTotal(sheet: BookSheet): string | null {
  const grand =
    sheet.printedTotals.find((t) => t.label === 'GRAND TOTAL') ??
    sheet.printedTotals.find((t) => t.label === 'TOTAL') ??
    sheet.printedTotals.find((t) => t.label === 'TOTAL APPROPRIATIONS');
  return grand?.total ?? null;
}

/**
 * A sheet's leaf money, in centavos — the same rule `import-ab-2026-doc.ts`
 * reconciles with.
 *
 * The condition on uncoded rows is the whole subtlety: one counts when the coded
 * row above it carries no money of its own, because then it *is* that heading's
 * amount. When the row above does carry money the uncoded line is a breakdown of
 * it, already counted, and adding it again overstates the Local Development Fund
 * by ₱23.2M.
 */
export function parsedTotalOf(sheet: BookSheet): bigint {
  const toCentavos = (value: string | null): bigint => {
    if (!value) return 0n;
    const [whole, fraction = ''] = value.replace(/,/g, '').trim().split('.');
    return (
      BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
    );
  };
  const codedMoney = new Map(
    sheet.rows.map((row) => [row.code, hasMoney(row)]),
  );
  const rows = sheet.rows.reduce(
    (sum, row) =>
      sum +
      (row.total !== null
        ? toCentavos(row.total)
        : toCentavos(row.ps) + toCentavos(row.mooe) + toCentavos(row.co)),
    0n,
  );
  const uncoded = sheet.uncodedMoneyRows.reduce((sum, row) => {
    if (!row.total || codedMoney.get(row.afterCode ?? '')) return sum;
    return sum + toCentavos(row.total);
  }, 0n);
  return rows + uncoded;
}

// ─── Row rules ───────────────────────────────────────────────────────────────

const PAP_CLASS_BY_SEGMENT: Record<string, PapClass> = {
  '001': PapClass.GAS,
  '002': PapClass.STO,
  '003': PapClass.OPERATIONS,
};

/**
 * `004` is the city's component bucket and `009` is a stray. Neither is one of
 * the three appropriation sections, so the program is left unclassified rather
 * than filed under a section it does not belong to. The printed code is kept
 * verbatim either way, so nothing about the export changes.
 */
export function papClassOf(segment: string): PapClass | null {
  return PAP_CLASS_BY_SEGMENT[segment] ?? null;
}

export function hasMoney(row: BookRow): boolean {
  return Boolean(row.ps || row.mooe || row.co || row.total);
}

/** The program a row belongs to: everything up to and including its ordinal. */
export function programKeyOf(row: BookRow): string {
  return programKeyOfCode(row.code);
}

/** An uncoded money row, shaped like every other row so it can be seeded. */
export function uncodedBookRow(row: UncodedRow, isComponent: boolean): BookRow {
  return {
    code: '',
    kind: 'PROGRAM',
    papClassSegment: '',
    programOrdinal: '',
    paOrdinal: '000',
    name: row.name.trim() || '(untitled)',
    majorFinalOutput: '',
    performanceIndicator: '',
    targetForBudgetYear: '',
    ps: null,
    mooe: null,
    co: null,
    total: row.total,
    isComponent,
    groupHeading: null,
    componentOffice: null,
    sourceRow: row.sourceRow ?? 'uncoded row',
    ...(row.sourcePage ? { sourcePage: row.sourcePage } : {}),
  };
}

export const normalizeCode = (code: string) => code.replace(/\s+/g, '');

/** What a row is called when the Annual Budget prints no description for it. */
export const UNTITLED = '(untitled)';

// ─── Outline numbering ───────────────────────────────────────────────────────

/**
 * The city numbers its rows as an outline — `C.1.1.1.`, `A.`, `ii.`, `1.)` —
 * and that numbering is the **only** record of the sheet's hierarchy. The
 * reference code numbers rows sequentially within a program; it does not nest
 * them. So `C.1.1.1` sits under `C.1.1` because the label says so and for no
 * other reason.
 *
 * Which is why the label is read *first*, to build the PPA tree, and stripped
 * *second*. Strip it first and the structure is unrecoverable.
 *
 * `prisma/data/ab-2026-book.json` keeps every name exactly as printed — it is
 * the record of the book, and a record you have edited is not one. The cleaning
 * lives here instead, where `paNameOf` and `programIdentity` are already the
 * single pair of functions the seed and the verifier both name their rows
 * through. Moving them moves both at once, so the two cannot disagree.
 */
const OUTLINE = new RegExp(
  [
    // "A. ", "C.1.1.1. ", "ii. ", "1.) " — trailing dot, maybe a paren, space.
    String.raw`^\s*((?:[A-Za-z]|[ivxlcdmIVXLCDM]{2,}|\d+)(?:\.\d+)*)\.\)?\s+`,
    // "1.HOT LUNCH FEEDING", "a.Digital Innovation Fund" — the city sometimes
    // omits the space. Digits and lowercase only: allowing an uppercase letter
    // here would eat the "R." of "R.A. No. 11861 Solo Parent Monthly Subsidy".
    String.raw`^\s*(\d+(?:\.\d+)*|[a-z])\.(?=[A-Z])`,
    // "C.2 Arts and Culture Services" — no trailing dot, but internally dotted.
    String.raw`^\s*((?:[A-Za-z]|\d+)(?:\.\d+)+)\s+`,
  ].join('|'),
);

function outlineMatch(name: string): { label: string; rest: string } | null {
  const match = OUTLINE.exec(name);
  if (!match) return null;
  const rest = name.slice(match[0].length).trim();
  // A row is never stripped down to nothing: a name that is only its outline
  // number keeps it, because "" is not a better name than "A.".
  if (!rest) return null;
  return { label: match[1] ?? match[2] ?? match[3], rest };
}

/** The outline label a name carries — `C.1.1`, `A`, `ii` — or null. */
export function outlineLabelOf(name: string): string | null {
  return outlineMatch(name)?.label ?? null;
}

/** The name without its outline number. Applied once, never repeatedly. */
export function cleanName(name: string): string {
  return outlineMatch(name)?.rest ?? name.trim();
}

/**
 * For each PPA row, the index of the row it nests under, or null for a root.
 *
 * A row nests under the nearest earlier row whose label is a strict prefix of
 * its own, so `C.1.1.1` finds `C.1.1` and, failing that, nothing. Applied per
 * program group, because that is the set of rows that becomes one program's
 * PPAs.
 *
 * Every parent this produces carries **no money of its own** in the book — all
 * eight of them are headings printed above their dated activities. That is what
 * makes nesting safe: a parent's amount is derived from its children, so a
 * parent with a stated amount would have that amount silently discarded. If a
 * future book breaks that assumption, `seedProgram` is where it will show up,
 * as a row whose printed total stops matching what the verifier expects.
 */
export function paParentIndices(rows: readonly BookRow[]): (number | null)[] {
  const labels = rows.map((row) => outlineLabelOf(row.name));
  return labels.map((label, index) => {
    if (!label) return null;
    for (let j = index - 1; j >= 0; j--) {
      const parent = labels[j];
      if (parent && label.startsWith(`${parent}.`)) return j;
    }
    return null;
  });
}

/**
 * Names the budget office supplied for rows the book prints blank, by printed code.
 *
 * The book has three money rows with an empty description cell (verified against
 * the document — the cells really are blank, this is not a parse gap). Until the
 * city states a name, the row is `(untitled)` and carries a warning; filling an
 * entry in here is how that name arrives.
 *
 * It lives beside `paNameOf` rather than in `prisma/data/ab-2026-book.json`
 * because the JSON is the record of the book, and a record you have edited is not
 * one. The book printed nothing; the city said this afterwards. Keeping the two
 * apart is what lets `db:verify:2026` still check the seed against what was
 * actually printed.
 *
 * An entry must be the city's own words. Deriving one from the office or the
 * heading above it would put a title the city never wrote on a public budget
 * document, which is exactly what the `(untitled)` marker exists to prevent.
 */
export interface BookCorrection {
  name: string;
  /**
   * What the book prints in the row's cell below the title. Only set where the
   * cell holds more than a name — the seed writes no description otherwise.
   */
  description?: string;
}

export const NAME_CORRECTIONS: Record<string, BookCorrection> = {
  // Public Safety Office — the Dangerous Drugs Board's ₱3,395,940 Operations
  // line. Office code 52 prints exactly two rows: `-001-` (GAS, ₱1,507,662) and
  // this one, and the city gives both the same name.
  '1000-2-03-52-003-000-000': {
    name: 'Naga City Anti-Drug Abuse Program/ Naga City Dangerous Drugs Board',
  },

  // City Population & Nutrition Office — ₱100,000, the `b.` item under RPFP.
  // The book prints no title in this cell, only the sub-activities, so the name
  // is the city's and the list below is what the cell actually holds.
  '3000-2-02-20-003-001-002': {
    name: 'Family Health Care Services',
    // Verbatim, including the book's jump from 2. to 4. — renumbering it here
    // would quietly correct a document this cycle exists to reproduce.
    description: [
      '1. Family Health Class',
      '2. "Chat Group"',
      '4. KATROPA (Kalalakihang Tapat sa Responsibilidad at Obligasyon sa Pamilya)',
      '5. "USAPAN" Series',
      '6. Pre-Marriage Orientation and Counseling (PMOC)',
      '7. Family Planning Hotline',
    ].join('\n'),
  },

  // City Population & Nutrition Office — ₱1,500,000. The book merges this row's
  // description cell with `-003-001` above it, so both lines are HOT LUNCH
  // FEEDING and only the amounts differ.
  '3000-2-02-20-003-003-001a': { name: 'HOT LUNCH FEEDING' },
};

/**
 * Program names the budget office supplied, keyed by the group's **desired
 * code** — the `-000` slot `programIdentity` already computes, whether or not
 * the book prints a row there.
 *
 * Separate from `NAME_CORRECTIONS` because the two answer different questions:
 * that map fixes a *row*, and its entry follows the row into the PA the seed
 * mirrors it into. This one names the *program* a group of rows adds up to, and
 * must leave every one of those rows its own printed name.
 *
 * Needed because `groupHeading` is misaligned on some sheets — the extractor
 * filed the section title as the heading and left the description prose in
 * `name`, so the derived program name comes out as a fragment mid-sentence. It
 * is an override rather than a change to the naming rule on purpose: only 35 of
 * the book's 489 groups are named from a heading and about 28 of those are
 * already right, so re-deriving would regress more than it repairs.
 */
export const PROGRAM_NAME_CORRECTIONS: Record<string, string> = {
  // CPNO. The sheet's headings are shifted: `POPULATION AND DEVELOPMENT` is the
  // section band, and the two programs under it are titled in their own first
  // rows ("I. Responsible Parenthood…", "II. ADOLESCENT HEALTH…").
  '3000-2-02-20-003-001-000':
    'Responsible Parenthood and Family Planning (RPFP)',
  '3000-2-02-20-003-002-000': 'Adolescent Health and Development (AHD)',
  // These three print their title in the heading cell and their description in
  // the name cell, so the derived name is a sentence fragment.
  '3000-2-02-20-003-005-000': 'NUTRITION EDUCATION FOR BEHAVIOR CHANGE PROGRAM',
  '3000-2-02-20-003-006-000': 'CAPACITY BUILDING',
  '3000-2-02-20-003-007-000':
    'STRENGTHENING, COORDINATING, MONITORING, EVALUATION & MANAGEMENT',
};

/** The city-supplied correction for a printed row, or null if none was given. */
export function correctionFor(code: string): BookCorrection | null {
  if (!code) return null;
  return NAME_CORRECTIONS[normalizeCode(code)] ?? null;
}

/** The city-supplied name for a blank row, or null if none has been given yet. */
export function correctedNameOf(code: string): string | null {
  return correctionFor(code)?.name ?? null;
}

/** The city-supplied program name for a group's `-000` slot, or null. */
export function correctedProgramNameOf(desiredCode: string): string | null {
  if (!desiredCode) return null;
  return PROGRAM_NAME_CORRECTIONS[normalizeCode(desiredCode)] ?? null;
}

/**
 * The name a PPA row carries.
 *
 * Three money rows in the book print an empty description cell — the Public
 * Safety Office's ₱3,395,940 Dangerous Drugs Board operations line and two City
 * Population & Nutrition Office activities. Checked against the document: the
 * cells really are blank, this is not a parse gap.
 *
 * They used to inherit their **program's** name, which reads as a duplicate row
 * in the printed Annual Budget and asserts a title the city never wrote. The
 * heading above them is not a safe substitute either — for one row it is the
 * line's own text, for another it is the block heading it shares with its
 * siblings — so no heuristic is applied. The row is marked untitled and carries
 * a warning that says the book left it blank, which is a decision nothing in the
 * row can re-derive (invariant 20) and the only thing that gets someone to ask
 * the budget office.
 *
 * `NAME_CORRECTIONS` is that answer coming back: once the city states a name it
 * wins, and the row stops being untitled.
 */
export function paNameOf(row: BookRow): string {
  return correctedNameOf(row.code) ?? (cleanName(row.name) || UNTITLED);
}

/**
 * The sentence a blank-description row carries, or null when it has a name.
 *
 * A corrected row returns null: the warning exists because nothing in the row
 * could re-derive the blank, and a recorded correction *is* that record. The
 * condition genuinely leaves the data rather than being suppressed — which is
 * what invariant 20 asks of any stored warning.
 */
export function blankNameWarning(row: BookRow): string | null {
  if (row.name.trim()) return null;
  if (correctedNameOf(row.code)) return null;
  return row.code
    ? `The Annual Budget prints row ${row.code} with an amount but no description, so this PPA has no name of its own.`
    : 'The Annual Budget prints this row with an amount but no description, so it has no name of its own.';
}

// ─── Sheet → office ──────────────────────────────────────────────────────────

/**
 * Which office each printed sheet belongs to, by acronym.
 *
 * Explicit rather than derived, for the same reason the 2027 importer keeps
 * `WORKBOOK_OFFICE_ALIASES`: neither the sheet's heading nor its codes are
 * reliable on their own.
 *
 *  - the **codes** are not, because the city copy-pastes. Every row on the City
 *    Veterinary Office's sheet carries the City Health Office's `11`, so
 *    resolving by code seeded the whole veterinary budget as CHO's;
 *  - the **heading** is not, because it does not match the catalog's wording —
 *    "CITY VETERINARY OFFICE" against "Office of the City Veterinarian" — and
 *    fuzzy matching put the City Mayor's Office under its own Sports Division.
 *
 * Thirty-nine lines, checked once, is cheaper than either.
 */
export const SHEET_OFFICE: Record<string, string> = {
  'CITY MAYOR’S OFFICE': 'CMO',
  'SANGGUNIANG PANLUNGSOD OFFICE': 'SPO',
  'OFFICE OF THE CITY ADMINISTRATOR': 'OCA',
  'CITY LEGAL OFFICE': 'CLO',
  'CITY PLANNING AND DEVELOPMENT OFFICE': 'CPDO',
  'CITY CIVIL REGISTRY OFFICE': 'CCRO',
  // Both of these print inside the preceding office's object-of-expenditure
  // table, so they were invisible until `sheetSegments` split them out — and
  // both are exactly why this map is explicit. The Budget Office resolves by
  // code anyway; the other does not, because its rows are mostly `40(1)` while
  // the catalog holds `40`, and the book calls it Tourism where the catalog
  // says Trade.
  'CITY BUDGET OFFICE': 'CBO',
  'INVESTMENT AND TOURISM PROMOTION OFFICE': 'ITPO',
  'OFFICE OF THE CITY TREASURER': 'CTO',
  "CITY ASSESSOR'S OFFICE": 'CAssO',
  'GENERAL SERVICES OFFICE': 'GSO',
  'CITY HUMAN RESOURCE MANAGEMENT OFFICE': 'CHRMO',
  'INFORMATION TECHNOLOGY OFFICE': 'ITO',
  'PUBLIC SAFETY OFFICE': 'PSO',
  'CITY EVENTS, PROTOCOL AND PUBLIC INFORMATION OFFICE': 'CEPPIO',
  'NAGA CITY INTERNAL AUDIT SERVICES OFFICE': 'NCIASO',
  'RAUL S. ROCO - NAGA CITY PUBLIC LIBRARY': 'RSRL',
  'CITY HEALTH OFFICE': 'CHO',
  'CITY POPULATION & NUTRITION OFFICE': 'CPNO',
  'HOUSING & SETTLEMENTS DEVELOPMENT OFFICE': 'HSDO',
  'CITY SOCIAL WELFARE & DEVELOPMENT OFFICE': 'CSWDO',
  'PERSONS WITH DISABILITY AFFAIRS OFFICE': 'PDAO',
  'LINGKOD BARANGAY OFFICE': 'LBO',
  'BICOL SCIENCE AND TECHNOLOGY CENTRUM': 'BSTC',
  'EDUCATION, SCHOLARSHIPS AND SPORTS OFFICE': 'ESSO',
  "CITY ENGINEER'S OFFICE": 'CEO',
  'CITY ENVIRONMENT AND NATURAL RESOURCES OFFICE': 'CENRO',
  'CITY AGRICULTURIST OFFICE': 'CAgO',
  'CITY VETERINARY OFFICE': 'CVO',
  'METRO NAGA PUBLIC EMPLOYMENT SERVICE OFFICE': 'PESO',
  'Solid Waste Management Office, Naga City Motorpool, Special Concerns Office':
    'SWMO',
  'NAGA CITY GENERAL HOSPITAL': 'NCGH',
  'MARKET ENTERPRISE AND PROMOTIONS OFFICE': 'MEPO',
  'NAGA CITY DISTRICT ABATTOIR': 'NCDA',
  'BICOL CENTRAL STATION': 'BCS',
  'CITY COLLEGE OF NAGA': 'CCN',
  'OUR LADY OF LOURDES INFIRMARY': 'OLLI',
  "CITY ACCOUNTANT'S OFFICE": 'CAccO',
};

/**
 * The sheets that belong to a special fund, not to an office (specs/016).
 *
 * Their rows are seeded only for a year with a checked-in office mapping
 * (`data/special-fund-offices-<fy>.json`): a special-fund sheet names no office,
 * so each row's office comes from that file. A year without one leaves them out,
 * as every year did before specs/016. The SPA sheet's GRAND TOTAL already
 * contains the LDF and 5% LDRRMF sheets in full, through two roll-up lines
 * (`isRollUp`), so its own figure is `TOTAL, SPA` (`ownPrintedTotal`).
 */
export const SPECIAL_FUND_SHEETS: Record<string, FundSource> = {
  'LOCAL DEVELOPMENT FUND': FundSource.LDF,
  'SPECIAL PURPOSE APPROPRIATIONS': FundSource.SPA,
  // Named on the portal's scans (FY2025 on); the 2026 book leaves it unnamed,
  // and it is the only unnamed sheet.
  'LOCAL DISASTER RISK REDUCTION AND MANAGEMENT FUND': FundSource.LDRRMF,
  '': FundSource.LDRRMF,
};

export function specialFundOf(sheet: BookSheet): FundSource | null {
  return SPECIAL_FUND_SHEETS[sheet.officeName.trim()] ?? null;
}

/** An office's sheet; a special fund's sheet is seeded only with a mapping. */
export function isOfficeSheet(sheet: BookSheet): boolean {
  return specialFundOf(sheet) === null;
}

/** A sheet's own printed figure: SPA's GRAND TOTAL also holds LDF and LDRRMF. */
export function ownPrintedTotal(sheet: BookSheet): string | null {
  return (
    sheet.printedTotals.find((t) => t.label === 'TOTAL, SPA')?.total ??
    printedGrandTotal(sheet)
  );
}

/**
 * SPA's lettered "20% LOCAL DEVELOPMENT FUND" and "5% L(D)RRMF" lines: the LDF
 * and LDRRMF sheets printed again as one sum each. Not rows and not object
 * lines. The by-PPA book prints "I. 20% … / J. 5% LOCAL DISASTER RISK …";
 * the by-object .xls prints "H. 20% … / I. 5% LOCAL RISK REDUCTION …"; a
 * scan's OCR drops the spaces ("D.20%LOCALDEVELOPMENTFUND").
 */
const ROLL_UP =
  /^[A-Z]\.+\s*(20%\s*LOCAL\s*DEVELOPMENT\s*FUND|5%\s*(LOCAL\s*)?(DISASTER\s*)?(RISK|LDRRM))/i;

export function isRollUpName(name: string): boolean {
  return ROLL_UP.test(name.trim());
}

export function isRollUp(row: UncodedRow): boolean {
  return isRollUpName(row.name);
}

/**
 * A special-fund sheet as the planner reads it:
 *
 *  - SPA's two roll-up lines are dropped — they are the LDF and LDRRMF sheets,
 *    which are seeded from their own rows (checked as printed totals instead);
 *  - an uncoded line whose only text is a code (all 40 of FY2026's LDRRMF rows)
 *    becomes a coded row, named by `names[code]` or else by its code, with a
 *    warning — the ordinance gives no description;
 *  - an uncoded line printed under a row that carries money is a sum already
 *    counted, and is dropped — `parsedTotalOf`'s rule. On the LDF sheet
 *    "Infrastructure Assets - Road Networks" (₱16.9M) and "… Flood Control
 *    Systems" (₱6.3M) are the CO of the road and drainage rows below them;
 *  - any other uncoded line is a row of its own.
 */
export function specialSheet(
  sheet: BookSheet,
  names: Record<string, { name?: string }> = {},
): BookSheet {
  const coded: BookRow[] = [];
  const uncoded: UncodedRow[] = [];
  const codedMoney = new Map(sheet.rows.map((r) => [r.code, hasMoney(r)]));
  for (const row of sheet.uncodedMoneyRows) {
    if (isRollUp(row) || codedMoney.get(row.afterCode ?? '')) continue;
    const code = row.name.trim();
    // `…-016-000; …-019-000`: two codes printed for one amount.
    const segments = codeSegments(code.split(';')[0].trim());
    if (!segments) {
      uncoded.push({ ...row, afterCode: null });
      continue;
    }
    const name = names[code]?.name;
    coded.push({
      code,
      kind: segments.program === '000' ? 'PAP_CLASS_HEADING' : 'PROGRAM',
      papClassSegment: segments.papClass,
      programOrdinal: segments.program,
      paOrdinal: segments.pa,
      name: name ?? code,
      majorFinalOutput: '',
      performanceIndicator: '',
      targetForBudgetYear: '',
      ps: null,
      mooe: null,
      co: null,
      total: row.total,
      isComponent: false,
      groupHeading: null,
      componentOffice: null,
      sourceRow: row.sourceRow ?? 'uncoded row',
      ...(row.sourcePage ? { sourcePage: row.sourcePage } : {}),
      warnings: name
        ? []
        : [
            `The ordinance prints only the code ${code} for this row, with no description; it is named by its code until the City Budget Office gives one.`,
          ],
    });
  }
  return {
    ...sheet,
    rows: [...sheet.rows, ...coded],
    uncodedMoneyRows: uncoded,
  };
}

/** The office columns both scripts need, in the shape both read them. */
export type OfficeRow = {
  id: string;
  acronym: string;
  name: string;
  officeCode: string | null;
  papSectorId: string | null;
  clusterId: string;
};

/**
 * Look an office up by the code the book prints.
 *
 * **`officeCode` does not identify an office.** `offices.check.ts` pins the
 * duplicates deliberately: `01` is shared by CMO, CMO-MNDC and CMO-SPORTS, and
 * `31` by CMO-NCYDO and ITO. A `Map<code, office>` therefore keeps whichever
 * row `findMany` happened to return last — and with no `orderBy`, Postgres is
 * free to return them in a different order on the next call. That made the
 * fourteen Naga City Youth Development Office rows on the City Mayor's sheet
 * land under either NCYDO or the Information & Technology Office depending on
 * nothing at all.
 *
 * So the name the import already resolved against the catalog breaks the tie —
 * it is the whole reason `componentOffice` carries one — and a tie with no name
 * to settle it falls to the first acronym alphabetically rather than to row
 * order.
 */
export interface OfficeIndex {
  /** Every office sharing a code, acronym-sorted. */
  byCode: Map<string, OfficeRow[]>;
  resolve(code: string, name?: string | null): OfficeRow | undefined;
  /**
   * The offices a code could mean when the name did not settle it, or `null`
   * when the pick was unambiguous. A non-null answer means `resolve` fell back
   * to the first acronym alphabetically — a decision taken on the city's behalf
   * with nothing in the book behind it, which is a finding rather than a note.
   */
  unsettled(code: string, name?: string | null): OfficeRow[] | null;
}

export function buildOfficeIndex(offices: OfficeRow[]): OfficeIndex {
  const byCode = new Map<string, OfficeRow[]>();
  for (const office of offices) {
    if (!office.officeCode) continue;
    const key = normalizeCode(office.officeCode);
    byCode.set(key, [...(byCode.get(key) ?? []), office]);
  }
  for (const list of byCode.values()) {
    list.sort((a, b) => a.acronym.localeCompare(b.acronym));
  }

  const norm = (text: string) => text.trim().toLowerCase();

  const named = (code: string, name?: string | null) => {
    const candidates = byCode.get(normalizeCode(code)) ?? [];
    const match = name
      ? candidates.find((o) => norm(o.name) === norm(name))
      : undefined;
    return { candidates, match };
  };

  return {
    byCode,
    resolve(code, name) {
      const { candidates, match } = named(code, name);
      return match ?? candidates[0];
    },
    unsettled(code, name) {
      const { candidates, match } = named(code, name);
      return candidates.length > 1 && !match ? candidates : null;
    },
  };
}

/**
 * The sentence for a component block whose office code the book cannot settle.
 *
 * `officeCode` does not identify an office — `31` is CMO-NCYDO *and* ITO — so
 * when the band's declared name matches neither, the office is chosen by sort
 * order. That is exactly how fourteen Youth Development Office rows once landed
 * under the IT Office, and the only reason it is visible now is that somebody
 * happened to look. Say it out loud instead.
 */
export function unsettledOfficeProblem(
  component: { code: string; name: string } | null,
  offices: OfficeIndex,
): string | null {
  if (!component) return null;
  const candidates = offices.unsettled(component.code, component.name);
  if (!candidates) return null;
  const named = component.name
    ? `names “${component.name}”, which matches none of them`
    : 'names no office at all';
  return (
    `component office code ${component.code} is shared by ` +
    `${candidates.map((o) => o.acronym).join(' and ')}, and the book ${named} — ` +
    `filed under ${candidates[0].acronym} because it sorts first, not because the book says so`
  );
}

/**
 * The office a group of rows belongs to: the component entity named by the
 * band it sits under, or the sheet's own office.
 *
 * The seed and the verifier must agree on this exactly — it is the "mapped to
 * the correct office" half of the cross-check.
 */
export function ownerOf(
  anchor: BookRow,
  host: OfficeRow,
  offices: OfficeIndex,
): OfficeRow {
  const component = anchor.componentOffice;
  if (!anchor.isComponent || !component) return host;
  return offices.resolve(component.code, component.name) ?? host;
}

/**
 * The office code a sheet belongs to.
 *
 * Read from its **non-component** rows only. `officeCodes` is ranked by
 * frequency across the whole sheet, and a component block routinely outnumbers
 * the office's own rows — the City Mayor's sheet carries 19 rows for the
 * Cooperative Development Office against a handful of its own, and taking the
 * commonest code made CMO's entire sheet belong to NCCDO. A sheet with nothing
 * but component rows falls back to the ranked list.
 */
export function hostCodeOf(sheet: BookSheet): string | undefined {
  const counts = new Map<string, number>();
  for (const row of sheet.rows) {
    if (row.isComponent) continue;
    const code = normalizeCode(officeCodeOf(row.code));
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] ?? sheet.officeCodes[0];
}

/**
 * Decide which sheet keeps a printed code that appears on more than one.
 *
 * Seven codes in AB 2026 are printed on two sheets — the City Veterinary
 * Office's rows carry the City Health Office's `11`, and Naga City General
 * Hospital's carry the Market Enterprise Office's `43`. They are transcription
 * slips, but `aipReferenceCode` is unique per cycle, so only one row can hold
 * each. The sheet whose own office code matches the code's office segment wins;
 * the other keeps its data and its money, loses only the final code, and says
 * so in a warning.
 */
export function resolveCodeOwners(sheets: BookSheet[]): Map<string, number> {
  const claims = new Map<string, number[]>();
  for (const [index, sheet] of sheets.entries()) {
    for (const row of sheet.rows) {
      const seen = claims.get(row.code) ?? [];
      if (!seen.includes(index)) claims.set(row.code, [...seen, index]);
    }
  }

  const owners = new Map<string, number>();
  for (const [code, indexes] of claims) {
    if (indexes.length === 1) {
      owners.set(code, indexes[0]);
      continue;
    }
    // Prefer the sheet whose own code segment matches. `hostCodeOf` is the
    // sheet's *printed* code, which is exactly what is being disputed here, so
    // it is the right test: the sheet that copy-pasted somebody else's code
    // loses, and the sheet that owns it keeps it.
    const segment = officeCodeOf(code);
    const match = indexes.find((i) => hostCodeOf(sheets[i]) === segment);
    owners.set(code, match ?? indexes[0]);
  }
  return owners;
}

// ─── Rows → programs ─────────────────────────────────────────────────────────

export interface RowGroup {
  /** The `-000` row that names the program, when the book prints one. */
  programRow: BookRow | null;
  /** Everything else in the group, in printed order. */
  rows: BookRow[];
}

export interface GroupedSheet {
  groups: Map<string, RowGroup>;
  /** Uncoded money rows with nothing coded above them to belong to. */
  orphanRows: UncodedRow[];
}

/**
 * Group one sheet's rows into programs, exactly as the seed writes them.
 *
 * The single source of truth for "which rows become one program", shared by the
 * seed and the verifier.
 */
export function groupSheet(sheet: BookSheet): GroupedSheet {
  const groups = new Map<string, RowGroup>();
  for (const row of sheet.rows) {
    const key = programKeyOf(row);
    const group = groups.get(key) ?? { programRow: null, rows: [] };
    const isProgramRow = row.paOrdinal === '000' && isProgramCode(row.code);
    if (isProgramRow && !group.programRow) {
      // The first `-000` row for a key is the program. A repeat is a duplicate
      // code in the source (CEPPIO prints A.1 and A.1.1 on the same one), and
      // becomes an activity beneath it rather than fighting for the slot.
      group.programRow = row;
    } else {
      group.rows.push(row);
    }
    groups.set(key, group);
  }

  // An uncoded money row belongs to whatever the book printed above it:
  // "CHILDREN'S FESTIVAL Celebration of National Children's Day" is an
  // activity of "PARTICIPATION TO SOCIO-CULTURAL ACTIVITIES", not a program
  // of its own. Only a row with no coded row above it stays standalone.
  const orphanRows: UncodedRow[] = [];
  for (const row of sheet.uncodedMoneyRows) {
    const after = row.afterCode;
    const group = after ? groups.get(programKeyOfCode(after)) : undefined;
    if (!after || !group) {
      orphanRows.push(row);
      continue;
    }
    // Slotted in where the book prints it, not appended: a group can print
    // more coded rows after this one, and the order is the export's order.
    const at = group.rows.findLastIndex((r) => r.code === after);
    group.rows.splice(at + 1, 0, uncodedBookRow(row, false));
  }

  return { groups, orphanRows };
}

/**
 * The program name for a group, and the code it should carry.
 *
 * A group with no `-000` row of its own takes the uncoded heading the book
 * prints above it ("A. ADVOCACY AND POLICY DEVELOPMENT"). Falling back to the
 * first activity's name made the program and its first child identical — which
 * printed as a duplicate row.
 *
 * Both of those read the sheet, and on a sheet whose headings are misaligned
 * both read it wrong, so `PROGRAM_NAME_CORRECTIONS` overrides them — keyed on
 * the `desiredCode` computed here, which is why that is worked out first.
 */
export function programIdentity(
  key: string,
  group: RowGroup,
): { anchor: BookRow | null; name: string; desiredCode: string } {
  const anchor = group.programRow ?? group.rows[0] ?? null;
  if (!anchor) return { anchor: null, name: '', desiredCode: '' };
  // The book leaves a spanning heading's code cell blank, but the group's
  // `-000` slot is unambiguously its.
  const desiredCode = group.programRow ? anchor.code : `${key}-000`;
  const name =
    correctedProgramNameOf(desiredCode) ??
    // A `-000` row that prints no description names the program too, not just
    // its mirrored PA — so the city's correction has to reach both.
    correctedNameOf(anchor.code) ??
    ((group.programRow
      ? cleanName(group.programRow.name)
      : cleanName(anchor.groupHeading ?? '') || cleanName(anchor.name)) ||
      UNTITLED);
  return { anchor, name, desiredCode };
}

/**
 * The rows that become this program's PPAs, in order.
 *
 * A program carrying money of its own gets a PA mirroring it, because money
 * lives on PAs in this schema and a program's total is the sum of its **root**
 * PAs. Only the program row is added on top — when there is no program row the
 * anchor *is* `rows[0]`, and adding it here as well billed its money twice.
 */
export function paRowsOf(group: RowGroup): BookRow[] {
  const rows: BookRow[] = [];
  if (group.programRow && hasMoney(group.programRow))
    rows.push(group.programRow);
  rows.push(...group.rows);
  return rows;
}
