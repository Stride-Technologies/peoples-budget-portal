import { PayloadTooLargeException } from '@nestjs/common';
import type ExcelJS from 'exceljs';
import { FundSource, Prisma } from '../generated/prisma/index';

/**
 * Cell styling, money conversion and row-cap helpers shared by the AIP .xlsx
 * exports (cluster and complete). Kept out of either service so the two cannot
 * drift on how a peso amount reaches a cell.
 */

export const MILLION = new Prisma.Decimal(1_000_000);
export const ZERO = new Prisma.Decimal(0);

export const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

// Amounts are expressed in million pesos, so a plain two-decimal format matches
// the reference workbook (no thousands separator). Funding source defaults to the
// General Fund, mirroring the "GF" column the reference uses for every entry.
export const AMOUNT_FORMAT = '0.00';
export const DEFAULT_FUNDING_SOURCE = 'GF';

// Column G is narrow, so the short enum names print as-is and the two long ones
// get their conventional abbreviations.
export const FUND_SOURCE_LABELS: Record<FundSource, string> = {
  GF: 'GF',
  SEF: 'SEF',
  LDF: 'LDF',
  LDRRMF: 'LDRRMF',
  SPA: 'SPA',
  PPP: 'PPP',
  NGA: 'NGA',
  DONATIONS_GRANTS: 'DON/GRANTS',
  GAD: 'GAD',
  TRUST_FUND: 'TF',
  SHF: 'SHF',
  EDF: 'EDF',
  CCN: 'CCN',
  JOINT_VENTURE: 'JV',
  BORROWINGS: 'BORROW',
};

// The checked-in cluster template is missing the top border on a few data-row
// cells (e.g. column B/F), which leaves gaps in the printed grid. Re-apply a full
// thin box to every operations cell so the table is consistently bordered.
const THIN_SIDE = { style: 'thin', color: { argb: 'FF000000' } } as const;
export const FULL_BORDER: Partial<ExcelJS.Borders> = {
  top: THIN_SIDE,
  left: THIN_SIDE,
  bottom: THIN_SIDE,
  right: THIN_SIDE,
};

/**
 * Assigns alignment / number format / bold by replacing the cell's whole `style`
 * with a fresh object. This is required because `duplicateRow` makes the cloned
 * data rows SHARE style objects by reference — mutating `cell.font`/`cell.alignment`
 * in place would bleed into sibling rows (last write wins). Spreading into a new
 * `style` object detaches the cell so per-row styling (e.g. bold parents vs plain
 * leaves) persists correctly.
 */
export function applyCellStyle(
  cell: ExcelJS.Cell,
  alignment: Partial<ExcelJS.Alignment>,
  numFmt?: string,
  bold?: boolean,
) {
  cell.style = {
    ...cell.style,
    alignment: { ...cell.alignment, ...alignment },
    ...(bold === undefined ? {} : { font: { ...cell.font, bold } }),
    ...(numFmt ? { numFmt } : {}),
  };
}

/** Apply a full thin box border, detaching from the shared duplicated-row style. */
export function applyBorder(cell: ExcelJS.Cell) {
  cell.style = { ...cell.style, border: FULL_BORDER };
}

/**
 * Solid background fill, given an 8-digit ARGB.
 *
 * Same whole-`style` replacement as `applyCellStyle`, and for the same reason —
 * mutating `cell.fill` in place bleeds into every cell sharing the style object.
 */
export function applyFill(cell: ExcelJS.Cell, argb: string) {
  cell.style = {
    ...cell.style,
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb } },
  };
}

/** Font family / size / colour, merged over whatever the cell already carries. */
export function applyFont(cell: ExcelJS.Cell, font: Partial<ExcelJS.Font>) {
  cell.style = { ...cell.style, font: { ...cell.font, ...font } };
}

export function toExcelAmount(value: Prisma.Decimal): number | null {
  if (value.equals(0)) return null;
  // Keep the exact value in millions (peso amounts carry 2 d.p., so small items
  // like ₱25,000 → 0.025M must not be pre-rounded to 0.03 — that would corrupt the
  // SUM totals). The two-decimal display rounding is handled by the cell number
  // format, exactly as the reference workbook does.
  return Number(value.div(MILLION).toFixed(6));
}

export function toMonthLabel(
  month: number | null,
  year: number | null,
  fallbackYear: number,
): string | null {
  if (!month) return null;
  return `${MONTH_LABELS[month - 1] ?? MONTH_LABELS[0]} ${year ?? fallbackYear}`;
}

/**
 * Column G. Legacy rows and program rows carry no funds and keep printing GF,
 * which is the constant this column held before the field existed.
 */
export function formatFundSources(sources: FundSource[]): string {
  if (sources.length === 0) return DEFAULT_FUNDING_SOURCE;
  // Enum declaration order, not selection order, so the same set always reads
  // the same way down the column.
  return (Object.keys(FUND_SOURCE_LABELS) as FundSource[])
    .filter((source) => sources.includes(source))
    .map((source) => FUND_SOURCE_LABELS[source])
    .join(', ');
}

const DEFAULT_EXPORT_MAX_ROWS = 10_000;

export function resolveExportMaxRows(): number {
  const raw = process.env.AIP_EXPORT_MAX_ROWS;
  if (!raw) return DEFAULT_EXPORT_MAX_ROWS;
  const maxRows = Number(raw);
  if (!Number.isInteger(maxRows) || maxRows <= 0) {
    throw new Error('AIP_EXPORT_MAX_ROWS must be a positive integer');
  }
  return maxRows;
}

export function assertExportWithinRowLimit(rowCount: number) {
  const maxRows = resolveExportMaxRows();
  if (rowCount <= maxRows) return;
  throw new PayloadTooLargeException(
    `AIP export contains ${rowCount} workbook rows, exceeding the configured limit of ${maxRows}. Narrow the export scope or increase AIP_EXPORT_MAX_ROWS.`,
  );
}
