import type ExcelJS from 'exceljs';
import {
  ExportStatus,
  type ExportType,
  type FundSource,
  type Prisma,
} from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { FUND_SOURCE_NAMES } from '../open-data/open-data.mapper.js';
import {
  applyBorder,
  applyCellStyle,
  applyFill,
  applyFont,
} from './excel-style.js';
import type { GapRow, LbpFigures } from './lbp-figures.js';

/**
 * What LBP Forms 4 and 7 share: the Notes sheet, the DRAFT banner, the blank
 * signature lines, read-only protection and the export log (specs/008
 * contracts/exports.md).
 */

export const PESO_FORMAT = '#,##0.00;-#,##0.00;"-"';
export const FONT = 'Arial';
const DRAFT_FILL = 'FFFDE68A';
const HEADER_FILL = 'FFFCE4D6';

export const fundLabel = (fund: FundSource) =>
  `${FUND_SOURCE_NAMES[fund] ?? fund} (${fund})`;

/**
 * Pesos as an Excel number. The cell needs a JS number; the value is already
 * rounded to the centavo, so nothing is summed in floating point here — totals
 * are Decimal sums written once.
 */
export const pesoCell = (value: Prisma.Decimal): number =>
  Number(value.toFixed(2));

/** Excel sheet names: ≤ 31 chars, none of []:*?/\ ("NCCW/NCGADC"). */
export function sheetName(name: string, taken: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || 'Sheet';
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  taken.add(candidate);
  return candidate;
}

/** A full-width line across `width` columns at `row`, returned for styling. */
export function wideCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  width: number,
  value: string,
): ExcelJS.Cell {
  sheet.mergeCells(row, 1, row, width);
  const cell = sheet.getCell(row, 1);
  cell.value = value;
  applyCellStyle(cell, { vertical: 'middle', wrapText: true });
  return cell;
}

/** The DRAFT banner a working-figures form carries on its first row. */
export function draftBanner(sheet: ExcelJS.Worksheet, width: number) {
  const cell = wideCell(
    sheet,
    1,
    width,
    'DRAFT — working figures, including programs not yet published. Not for submission.',
  );
  applyFill(cell, DRAFT_FILL);
  applyFont(cell, { name: FONT, bold: true, size: 11 });
}

export function headerCells(
  sheet: ExcelJS.Worksheet,
  row: number,
  labels: string[],
) {
  labels.forEach((label, index) => {
    const cell = sheet.getCell(row, index + 1);
    cell.value = label;
    applyCellStyle(
      cell,
      { horizontal: 'center', vertical: 'middle', wrapText: true },
      undefined,
      true,
    );
    applyFill(cell, HEADER_FILL);
    applyBorder(cell);
  });
}

/**
 * Signature lines: each signatory's title under a blank name line. Names are
 * deliberately blank until signatories have a home (#164).
 */
export function signatureBlock(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  blocks: { caption: string; titles: string[] }[],
): number {
  let row = startRow;
  for (const block of blocks) {
    const caption = sheet.getCell(row, 1);
    caption.value = block.caption;
    applyFont(caption, { name: FONT, bold: true });
    row += 2;
    for (const title of block.titles) {
      sheet.getCell(row, 2).value = '______________________________';
      sheet.getCell(row + 1, 2).value = title;
      applyFont(sheet.getCell(row + 1, 2), { name: FONT, italic: true });
      row += 3;
    }
  }
  return row;
}

export interface NotesInput {
  form: string;
  fiscalYear: number;
  fund: FundSource;
  figures: LbpFigures;
  /** Names the budget document when `figures` is `document`. */
  sourceLabel?: string | null;
  scope: string;
  /** Titled gap tables; an empty one prints "None". */
  gaps: { title: string; rows: GapRow[] }[];
}

/** The Notes sheet: what this file is, then every gap that shaped it. */
export function writeNotesSheet(sheet: ExcelJS.Worksheet, notes: NotesInput) {
  sheet.columns = [{ width: 34 }, { width: 30 }, { width: 60 }, { width: 18 }];
  const title = sheet.getCell('A1');
  title.value = `${notes.form} — NOTES`;
  applyFont(title, { name: FONT, size: 14, bold: true });

  let row = 3;
  const field = (label: string, value: string) => {
    sheet.getCell(row, 1).value = label;
    applyFont(sheet.getCell(row, 1), { name: FONT, bold: true });
    sheet.getCell(row, 2).value = value;
    row += 1;
  };
  field('Fiscal year', String(notes.fiscalYear));
  field('Fund', fundLabel(notes.fund));
  field(
    'Figures',
    notes.sourceLabel ??
      (notes.figures === 'working'
        ? 'Working figures (drafts included) — DRAFT'
        : 'Published figures only'),
  );
  field(
    'Generated at',
    `${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
  );
  field('Exported by scope', notes.scope);
  row += 1;

  for (const gap of notes.gaps) {
    const heading = sheet.getCell(row, 1);
    heading.value = `${gap.title} (${gap.rows.length})`;
    applyFont(heading, { name: FONT, bold: true });
    row += 1;
    if (gap.rows.length === 0) {
      sheet.getCell(row, 1).value = 'None';
      row += 2;
      continue;
    }
    headerCells(sheet, row, [
      'Office',
      'AIP Reference Code',
      'Name',
      'Amount (₱)',
    ]);
    row += 1;
    for (const entry of gap.rows) {
      sheet.getCell(row, 1).value = entry.officeAcronym;
      sheet.getCell(row, 2).value = entry.code;
      sheet.getCell(row, 3).value = entry.name;
      const amount = sheet.getCell(row, 4);
      amount.value = pesoCell(entry.amount);
      amount.numFmt = PESO_FORMAT;
      row += 1;
    }
    row += 1;
  }
}

/** Every sheet read-only: selectable and copyable, not editable (FR-002). */
export async function protectAll(workbook: ExcelJS.Workbook) {
  for (const sheet of workbook.worksheets)
    await sheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
    });
}

/** Run `build` under an export-log row: PENDING → GENERATED, or FAILED. */
export async function withExportLog<T>(
  prisma: PrismaService,
  entry: {
    type: ExportType;
    cycleId: string;
    fileName: string;
    user: JwtPayload;
    filters: Prisma.InputJsonValue;
  },
  build: () => Promise<T>,
): Promise<T> {
  const log = await prisma.aIPExportLog.create({
    data: {
      type: entry.type,
      status: ExportStatus.PENDING,
      aipCycleId: entry.cycleId,
      fileName: entry.fileName,
      requestedByUserId: entry.user.sub,
      requestedByRole: entry.user.role,
      filters: entry.filters,
    },
  });
  try {
    const result = await build();
    await prisma.aIPExportLog.update({
      where: { id: log.id },
      data: { status: ExportStatus.GENERATED },
    });
    return result;
  } catch (error) {
    await prisma.aIPExportLog.update({
      where: { id: log.id },
      data: {
        status: ExportStatus.FAILED,
        errorMessage:
          error instanceof Error ? error.message : 'Failed to generate export',
      },
    });
    throw error;
  }
}
