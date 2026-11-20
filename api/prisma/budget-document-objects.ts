/**
 * The by-object (PAOO / "LBP Form No. 2") tables of an appropriation ordinance,
 * read from the city's .xls (specs/012 P3, OV-5): one sheet per office, rows
 * of `n | object of expenditure | account code | past | current | budget year`.
 *
 *   A. Personal Services:                                     → PS
 *    1 | Salaries & Wages-Regular | 5-01-01-010 | … | 6774862  → one line
 *   SUB-TOTAL                                                 (checked, not stored)
 *   B. Maintenance and Other Operating Expenses               → MOOE
 *   C. Capital Outlays                                         → CO
 *   TOTAL APPROPRIATIONS                                       (checked against Σ lines)
 *
 * The budget-year column is the line's amount; the past year (actual) and the
 * current year (estimate) beside it are kept too (specs/017 FR-004). The money is never coerced to Number beyond the
 * cell itself: a cell arrives as a float from xlrd and is fixed to centavos.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ExpenseClass, Prisma } from '../src/generated/prisma/index';
import { isRollUpName } from './ab-2026-book';

export interface ObjectLinePlan {
  sheet: string;
  officeAcronym: string;
  expenseClass: ExpenseClass;
  uacsCode: string;
  accountTitle: string;
  amount: string;
  pastYearActual: string | null;
  currentYearTotal: string | null;
  /** A scanned book splits the current year by semester; the .xls does not. */
  currentFirstSemActual?: string | null;
  currentSecondSemEstimate?: string | null;
  sourceRef: string;
  /** A scanned book's file and page (the .xls is one file, no pages). */
  sourceFile?: string;
  sourceUrl?: string | null;
  sourcePage?: number | null;
}

export interface ObjectSheetReport {
  sheet: string;
  officeAcronym: string;
  lines: number;
  sum: string;
  printedTotal: string | null;
  /** SPA's roll-up lines, left out of `sum` but inside its printed total. */
  rolledUp?: string;
  matches: boolean | null;
}

/**
 * Which office each by-object sheet is. Keyed on the sheet name as the city
 * named it (whitespace trimmed). Sheets not listed — receipts programs,
 * summaries, LBP 5/6/7, PS schedules — are not office tables and are skipped.
 * A SUMMARY sheet already folds an office's component units into its office.
 */
export const XLS_SHEET_OFFICE: Record<string, string> = {
  'SUMMARY - LBP 2 (CMO)2026': 'CMO',
  'SUMMARY - LBP 2 (SPO) 2026': 'SPO',
  'SUMMARY - LBP 2 (OCA)2026': 'OCA',
  'LEGAL 2026': 'CLO',
  'LBP 2 (CPDO)2026': 'CPDO',
  'CCRO-2026': 'CCRO',
  'BUDGET-2026': 'CBO',
  'CTO-2026': 'CTO',
  'ACCTG-2026': 'CAccO',
  'ASSR-2026': 'CAssO',
  'GSD-2026': 'GSO',
  'HRMO-2026': 'CHRMO',
  'ITO-2026': 'ITO',
  'SUMMARY - LBP 2 (PSO)-2026': 'PSO',
  'LBP 2 (CEPPIO)2026': 'CEPPIO',
  'LBP 2 (NCIASO)2026': 'NCIASO',
  'RSRL-2026': 'RSRL',
  'SUMMARY - LBP 2 (CHO) 2026': 'CHO',
  'CPNO-2026': 'CPNO',
  'SUMMARY - LBP 2 (HSDO)-2026': 'HSDO',
  'SUMMARY - LBP 2 (CSWDO)-2026': 'CSWDO',
  'PDAO 2026': 'PDAO',
  'SUMMARY (LBO)2026': 'LBO',
  'BSTC-2026': 'BSTC',
  'SUMMARY - LBP 2 (ESSO)-2026': 'ESSO',
  'CEO-2026': 'CEO',
  'ENRO-2026': 'CENRO',
  'SUMMARY - LBP 2 (AGRI)-2026': 'CAgO',
  'VET-2026': 'CVO',
  'SUMMARY - LBP 2 (MPESO)2026': 'PESO',
  'ITPO-2026': 'ITPO',
  'SWMO-2026': 'SWMO',
  'LDRRM-2026': 'LDRRMF',
  'LDF-2026': 'LDF',
  'SPA- 2026': 'SPAF',
  'NCGH-2026': 'NCGH',
  'MEPO-2026': 'MEPO',
  'ABAT-2026': 'NCDA',
  'BCS-2026': 'BCS',
  'City COLLEGE-2026': 'CCN',
  'INFIRMARY-2026': 'OLLI',
};

type Cell = string | number;
interface XlsSheet {
  name: string;
  rows: Cell[][];
}

/**
 * Read an .xls through `xls-to-json.py`. Runs it with `uv run --with xlrd` when
 * uv is installed, so it does not depend on which python3 is first on PATH or
 * what it has installed; falls back to plain `python3` (which then needs xlrd).
 */
export function readXls(path: string): XlsSheet[] {
  const script = resolve(__dirname, 'lib/xls-to-json.py');
  const opts = { maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' as const };
  let out: string;
  try {
    out = execFileSync(
      'uv',
      [
        'run',
        '--no-project',
        '--quiet',
        '--with',
        'xlrd==2.0.2',
        'python3',
        '-I',
        script,
        path,
      ],
      opts,
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    out = execFileSync('python3', ['-I', script, path], opts);
  }
  return (JSON.parse(out) as { sheets: XlsSheet[] }).sheets;
}

const text = (c: Cell | undefined) => (c === undefined ? '' : String(c).trim());

/** A cell's amount in centavos, or null when the cell holds no number. */
function centavos(c: Cell | undefined): bigint | null {
  // Through Decimal, not a float: 0.29 * 100 is 28.999… in binary floating point.
  const s = typeof c === 'number' ? String(c) : text(c).replace(/,/g, '');
  if (s === '') return null;
  try {
    return BigInt(new Prisma.Decimal(s).mul(100).toFixed(0));
  } catch {
    return null;
  }
}

export const pesos = (cents: bigint) => {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
};

function classOfHeading(label: string): ExpenseClass | null {
  const l = label.toUpperCase();
  if (/PERSONAL SERVICES/.test(l)) return ExpenseClass.PS;
  if (/MAINT(ENANCE)?\.? *(&|AND)? *OTHER OPERATING|^I\s*-\s*MAINT/.test(l))
    return ExpenseClass.MOOE;
  if (/FINANCIAL EXPENSES/.test(l)) return ExpenseClass.FE;
  if (/CAPITAL OUTLAY/.test(l)) return ExpenseClass.CO;
  return null;
}

/**
 * The class an account code belongs to, from the UACS prefix: 5-01 personal
 * services, 5-02 MOOE, 5-03 financial expenses, 1-xx assets (capital outlay).
 * More reliable than the section heading, which the special-fund sheets use
 * for sectors ("A. SOCIAL DEVELOPMENT") rather than classes. A compound code
 * ("2-01-02-040/5-03-01-03-020", debt service) takes its first expense part.
 */
export function classOfCode(code: string): ExpenseClass | null {
  for (const part of code.split('/')) {
    const c = part.trim();
    if (c.startsWith('5-01')) return ExpenseClass.PS;
    if (c.startsWith('5-02')) return ExpenseClass.MOOE;
    if (c.startsWith('5-03')) return ExpenseClass.FE;
    if (/^1-0\d/.test(c)) return ExpenseClass.CO;
  }
  return null;
}

const TOTAL_ROW = /^TOTAL (APPROPRIATIONS?|OBLIGATIONS?)\b/i;
const SUBTOTAL_ROW = /SUB-?TOTAL|^TOTAL\b/i;
/** "A. 30% QUICK RESPONSE FUND": a lettered heading that states a lump sum. */
const LETTERED_HEADING = /^[A-Z]\.\s+\S/;

/** Every office sheet's lines, plus a per-sheet check against its printed total. */
export function parseObjectSheets(sheets: XlsSheet[]): {
  lines: ObjectLinePlan[];
  reports: ObjectSheetReport[];
  unmapped: string[];
} {
  const lines: ObjectLinePlan[] = [];
  const reports: ObjectSheetReport[] = [];
  const unmapped: string[] = [];

  for (const sheet of sheets) {
    const name = sheet.name.trim();
    const acronym = XLS_SHEET_OFFICE[name];
    if (!acronym) {
      unmapped.push(sheet.name);
      continue;
    }
    // The budget-year column is the one whose header says so; the past and
    // current years sit on the same header row.
    let byCol = -1;
    let pastCol = -1;
    let currentCol = -1;
    for (const row of sheet.rows.slice(0, 20)) {
      const at = row.findIndex((c) => /BUDGET YEAR/i.test(text(c)));
      if (at >= 0) {
        byCol = at;
        pastCol = row.findIndex((c) => /PAST YEAR/i.test(text(c)));
        currentCol = row.findIndex((c) => /CURRENT YEAR/i.test(text(c)));
        break;
      }
    }
    const other = (row: Cell[], col: number) => {
      const c = col >= 0 ? centavos(row[col]) : null;
      return c === null ? null : pesos(c);
    };
    if (byCol < 0) {
      reports.push({
        sheet: name,
        officeAcronym: acronym,
        lines: 0,
        sum: '0.00',
        printedTotal: null,
        matches: null,
      });
      continue;
    }

    let cls: ExpenseClass | null = null;
    let sum = 0n;
    let printed: bigint | null = null;
    let rolledUp = 0n;
    let count = 0;
    for (const [r, row] of sheet.rows.entries()) {
      const first = text(row[0]);
      const title = text(row[1]);
      if (TOTAL_ROW.test(first)) {
        printed = centavos(row[byCol]);
        break;
      }
      if (SUBTOTAL_ROW.test(first) || SUBTOTAL_ROW.test(title)) continue;
      const heading = classOfHeading(first) ?? classOfHeading(title);
      const code = text(row[2]);
      const amount = centavos(row[byCol]);
      if (!code) {
        if (heading) cls = heading;
        // SPA's "H. 20% LOCAL DEVELOPMENT FUND" / "I. 5% LOCAL RISK …": the LDF
        // and LDRRMF sheets again, already stored from their own sheets.
        if (isRollUpName(first)) {
          rolledUp += amount ?? 0n;
          continue;
        }
        // A lettered heading with its own budget-year amount is a lump sum
        // (LDRRMF's 30% Quick Response Fund); it has no account code.
        if (LETTERED_HEADING.test(first) && amount !== null && amount !== 0n) {
          lines.push({
            sheet: name,
            officeAcronym: acronym,
            expenseClass: cls ?? ExpenseClass.MOOE,
            uacsCode: '',
            accountTitle: first,
            amount: pesos(amount),
            pastYearActual: other(row, pastCol),
            currentYearTotal: other(row, currentCol),
            sourceRef: `${name}!r${r + 1}`,
          });
          sum += amount;
          count++;
        }
        continue;
      }
      // A line with no budget-year money still prints its earlier years; keep
      // it only when it has some, so a year's history is complete.
      const past = other(row, pastCol);
      const current = other(row, currentCol);
      const zero = (v: string | null) => v === null || /^-?0\.00$/.test(v);
      if ((amount === null || amount === 0n) && zero(past) && zero(current))
        continue;
      lines.push({
        sheet: name,
        officeAcronym: acronym,
        expenseClass: classOfCode(code) ?? cls ?? ExpenseClass.MOOE,
        uacsCode: code,
        accountTitle: title || first,
        amount: pesos(amount ?? 0n),
        pastYearActual: past,
        currentYearTotal: current,
        sourceRef: `${name}!r${r + 1}`,
      });
      sum += amount ?? 0n;
      count++;
    }
    reports.push({
      sheet: name,
      officeAcronym: acronym,
      lines: count,
      sum: pesos(sum),
      printedTotal: printed === null ? null : pesos(printed),
      ...(rolledUp ? { rolledUp: pesos(rolledUp) } : {}),
      matches: printed === null ? null : printed === sum + rolledUp,
    });
  }
  return { lines, reports, unmapped };
}
