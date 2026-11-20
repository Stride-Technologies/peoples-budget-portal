/**
 * AIP-Extended sheet → Performance Indicator, Target and SDG links
 * (specs/008 US3, contracts/import-cli.md). Pure functions only; the two CLIs
 * (`import-aip-extended.ts`, `seed-aip-extended.ts`) do the I/O.
 *
 * Every office's PPMP workbook carries an "AIP-Extended" sheet in the IAS
 * template's layout: title rows, a two-row header, section rows with no code
 * (GAS / STO / OPERATIONS), then one row per coded PPA. Columns are found by
 * their header text, so an office that inserted a column still parses.
 *
 * Lives in `src/` because the staff upload (`AipExtendedService`) uses it too.
 */
import type ExcelJS from 'exceljs';
import { LIVE_PROGRAM } from '../programs/program-filters.js';

/** A cell as trimmed text: formula results, rich text; a merged slave is empty. */
function cellText(row: ExcelJS.Row, col: number): string {
  const cell = row.getCell(col);
  if (cell.isMerged && cell.master && cell.master.address !== cell.address)
    return '';
  return cell.text.replace(/\s+/g, ' ').trim();
}

export interface ExtendedRow {
  file: string;
  sheet: string;
  row: number;
  aipCode: string;
  description: string;
  indicator: string;
  target: string;
  sdgCodes: string[];
}

export interface ParseResult {
  rows: ExtendedRow[];
  /** Codes appearing more than once in one sheet — reported, never written. */
  duplicates: { code: string; rows: number[] }[];
  /** SDG cells that named no goal number we could read. */
  unreadSdg: { row: number; text: string }[];
}

const CODE = /^\d{4}-\d-\d{2}-[\w()]+-\d{3}-\d{3}-\d{3}$/;

/** The AIP-Extended sheet of a workbook, by name, case- and space-insensitive. */
export function findExtendedSheet(
  workbook: ExcelJS.Workbook,
): ExcelJS.Worksheet | undefined {
  return workbook.worksheets.find((ws) => /aip\s*-?\s*extended/i.test(ws.name));
}

/**
 * "5-Gender Equality, 16 - strong institution, 17-partnership" → SDG-05,
 * SDG-16, SDG-17. A number counts only when a dash or the word "SDG" marks it
 * as a goal, so a stray year or count is not read as one.
 */
export function parseSdgCodes(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/(?:SDG\s*-?\s*)?\b(\d{1,2})\s*[-–:]/gi)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 17) found.add(`SDG-${String(n).padStart(2, '0')}`);
  }
  for (const m of text.matchAll(/SDG\s*-?\s*(\d{1,2})\b/gi)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 17) found.add(`SDG-${String(n).padStart(2, '0')}`);
  }
  return [...found].sort();
}

/** Column numbers by header text, read from the first 15 rows. */
function locateColumns(ws: ExcelJS.Worksheet, year: number) {
  const cols: Partial<
    Record<'code' | 'desc' | 'sdg' | 'indicator' | 'target', number>
  > = {};
  let headerRow = 0;
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const row = ws.getRow(r);
    // The header ends where the data starts: a data cell may well say "SDG".
    const first = [...Array(Math.max(row.cellCount, 1)).keys()].some((i) =>
      CODE.test(cellText(row, i + 1).replace(/\s+/g, '')),
    );
    if (first) break;
    for (let c = 1; c <= Math.max(row.cellCount, 12); c++) {
      const text = cellText(row, c).toLowerCase();
      if (!text) continue;
      const set = (k: keyof typeof cols) => {
        cols[k] ??= c;
        headerRow = Math.max(headerRow, r);
      };
      if (text.includes('aip reference code')) set('code');
      else if (text.includes('program/project/activity')) set('desc');
      else if (text.includes('sdg')) set('sdg');
      else if (text === 'indicator' || text.startsWith('indicator'))
        set('indicator');
      else if (text.includes(`${year} target`)) set('target');
    }
  }
  return { cols, headerRow };
}

export function parseExtendedSheet(
  ws: ExcelJS.Worksheet,
  year: number,
  file: string,
): ParseResult {
  const { cols, headerRow } = locateColumns(ws, year);
  const missing = (['code', 'indicator', 'target'] as const).filter(
    (k) => !cols[k],
  );
  if (missing.length)
    throw new Error(
      `${file} / ${ws.name}: no "${missing.join('", "')}" column in the header`,
    );

  const rows: ExtendedRow[] = [];
  const unreadSdg: ParseResult['unreadSdg'] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const aipCode = cellText(row, cols.code!).replace(/\s+/g, '');
    // Section rows (GAS / STO / OPERATIONS) and totals carry no code.
    if (!CODE.test(aipCode)) continue;
    const sdgText = cols.sdg ? cellText(row, cols.sdg) : '';
    const sdgCodes = parseSdgCodes(sdgText);
    if (sdgText && sdgCodes.length === 0)
      unreadSdg.push({ row: r, text: sdgText });
    rows.push({
      file,
      sheet: ws.name,
      row: r,
      aipCode,
      description: cols.desc ? cellText(row, cols.desc) : '',
      indicator: cellText(row, cols.indicator!).trim(),
      target: cellText(row, cols.target!).trim(),
      sdgCodes,
    });
  }

  const byCode = new Map<string, number[]>();
  for (const row of rows)
    byCode.set(row.aipCode, [...(byCode.get(row.aipCode) ?? []), row.row]);
  const duplicates = [...byCode]
    .filter(([, r]) => r.length > 1)
    .map(([code, r]) => ({ code, rows: r }));
  return { rows, duplicates, unreadSdg };
}

// ─── Matching and the fill-blanks plan ───────────────────────────────────────

export interface ProgramForMatch {
  id: string;
  aipReferenceCode: string | null;
  tentativeAipReferenceCode: string;
  expectedOutput: string | null;
  targetForBudgetYear: string | null;
  sdgCodes: string[];
}

export interface PlannedChange {
  programId: string;
  source: ExtendedRow;
  setExpectedOutput?: string;
  setTarget?: string;
  addSdgCodes: string[];
}

export interface Plan {
  changes: PlannedChange[];
  unmatched: ExtendedRow[];
  /** A code matching several programs (final, then tentative). */
  ambiguous: { row: ExtendedRow; programIds: string[] }[];
  /** The portal already holds a different value; kept, never overwritten. */
  conflicts: {
    row: ExtendedRow;
    field: string;
    portal: string;
    sheet: string;
  }[];
  /** SDG codes the catalog does not know. */
  unknownSdg: { row: ExtendedRow; code: string }[];
}

const same = (a: string, b: string) =>
  a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/** Programs carrying exactly this code: the final code first, then the tentative one. */
export function matchCode<P extends ProgramForMatch>(
  code: string,
  programs: P[],
) {
  const final = programs.filter((p) => p.aipReferenceCode === code);
  return final.length
    ? final
    : programs.filter((p) => p.tentativeAipReferenceCode === code);
}

/**
 * Codes equal on every segment but the office type (segment 3) — the likeliest
 * miss: IAS's sheet writes `02` where the portal codes NCIASO `03`.
 */
export function nearMisses<P extends ProgramForMatch>(
  code: string,
  programs: P[],
) {
  const rest = (c: string) =>
    c
      .split('-')
      .filter((_, i) => i !== 2)
      .join('-');
  return programs.filter((p) => {
    const c = p.aipReferenceCode ?? p.tentativeAipReferenceCode;
    return c !== code && rest(c) === rest(code);
  });
}

/**
 * What one sheet row would write on one program. Fills a field only when the
 * portal's is empty; a different existing value is a conflict, kept. SDG links
 * are only ever added.
 */
export function fillFor(
  row: ExtendedRow,
  program: ProgramForMatch,
  knownSdg: Set<string>,
): {
  change: PlannedChange | null;
  conflicts: Plan['conflicts'];
  unknownSdg: Plan['unknownSdg'];
} {
  const change: PlannedChange = {
    programId: program.id,
    source: row,
    addSdgCodes: [],
  };
  const conflicts: Plan['conflicts'] = [];
  const unknownSdg: Plan['unknownSdg'] = [];
  const fill = (
    field: 'expectedOutput' | 'targetForBudgetYear',
    sheetValue: string,
    key: 'setExpectedOutput' | 'setTarget',
  ) => {
    if (!sheetValue) return;
    const portal = program[field]?.trim() ?? '';
    if (!portal) change[key] = sheetValue;
    else if (!same(portal, sheetValue))
      conflicts.push({ row, field, portal, sheet: sheetValue });
  };
  fill('expectedOutput', row.indicator, 'setExpectedOutput');
  fill('targetForBudgetYear', row.target, 'setTarget');
  for (const code of row.sdgCodes) {
    if (!knownSdg.has(code)) unknownSdg.push({ row, code });
    else if (!program.sdgCodes.includes(code)) change.addSdgCodes.push(code);
  }
  const changed =
    change.setExpectedOutput || change.setTarget || change.addSdgCodes.length;
  return { change: changed ? change : null, conflicts, unknownSdg };
}

/**
 * Exact code, the final code first and then the tentative one. Fills a field
 * only when the portal's is empty; a different existing value is a conflict.
 * SDG links are only ever added. Rows whose code appears twice in their sheet
 * are skipped by the caller (`duplicates`).
 */
export function planChanges(
  rows: ExtendedRow[],
  programs: ProgramForMatch[],
  knownSdg: Set<string>,
): Plan {
  const plan: Plan = {
    changes: [],
    unmatched: [],
    ambiguous: [],
    conflicts: [],
    unknownSdg: [],
  };
  for (const row of rows) {
    const hits = matchCode(row.aipCode, programs);
    if (hits.length === 0) {
      plan.unmatched.push(row);
      continue;
    }
    if (hits.length > 1) {
      plan.ambiguous.push({ row, programIds: hits.map((h) => h.id) });
      continue;
    }
    const fill = fillFor(row, hits[0], knownSdg);
    plan.conflicts.push(...fill.conflicts);
    plan.unknownSdg.push(...fill.unknownSdg);
    if (fill.change) plan.changes.push(fill.change);
  }
  return plan;
}

// ─── Shared by both CLIs ─────────────────────────────────────────────────────

/** Minimal Prisma surface the loader needs, so this file stays importable without a client. */
interface ProgramReader {
  program: {
    findMany(args: unknown): Promise<
      {
        id: string;
        aipReferenceCode: string | null;
        tentativeAipReferenceCode: string;
        expectedOutput: string | null;
        targetForBudgetYear: string | null;
        sdgGoals: { sdgGoal: { code: string } }[];
      }[]
    >;
  };
  sDGGoal: { findMany(args: unknown): Promise<{ code: string }[]> };
}

export async function loadForMatching(prisma: ProgramReader, year: number) {
  const [programs, sdg] = await Promise.all([
    prisma.program.findMany({
      where: { aipCycle: { fiscalYear: year }, ...LIVE_PROGRAM },
      select: {
        id: true,
        aipReferenceCode: true,
        tentativeAipReferenceCode: true,
        expectedOutput: true,
        targetForBudgetYear: true,
        sdgGoals: { select: { sdgGoal: { select: { code: true } } } },
      },
    }),
    prisma.sDGGoal.findMany({ select: { code: true } }),
  ]);
  return {
    programs: programs.map((p) => ({
      ...p,
      sdgCodes: p.sdgGoals.map((g) => g.sdgGoal.code),
    })) as ProgramForMatch[],
    knownSdg: new Set(sdg.map((s) => s.code)),
  };
}

/** Rows whose code is not duplicated within its own sheet. */
export function writableRows(
  rows: ExtendedRow[],
  duplicates: { file: string; code: string }[],
) {
  const dup = new Set(duplicates.map((d) => `${d.file}\u0000${d.code}`));
  return rows.filter((r) => !dup.has(`${r.file}\u0000${r.aipCode}`));
}

export const where = (r: ExtendedRow) => `${r.file} · ${r.sheet}!${r.row}`;
