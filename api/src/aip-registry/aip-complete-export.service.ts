import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AipSectorGroup,
  ExportStatus,
  ExportType,
  PapClass,
  Prisma,
} from '../generated/prisma/index';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import {
  ALL_OFFICES,
  OfficeScopeService,
} from '../permissions/office-scope.service.js';
import {
  AMOUNT_FORMAT,
  applyBorder,
  applyCellStyle,
  applyFill,
  applyFont,
  assertExportWithinRowLimit,
  DEFAULT_FUNDING_SOURCE,
  formatFundSources,
  FUND_SOURCE_LABELS,
  toExcelAmount,
  toMonthLabel,
  ZERO,
} from './excel-style.js';
import {
  buildProgramRows,
  CLIMATE_TAG_INCLUDE,
  FUND_ALLOCATION_INCLUDE,
  type ExportRow,
} from './export-rows.js';
import {
  resolveSectorGroup,
  SECTOR_GROUP_LABELS,
  SECTOR_GROUP_ORDER,
  SECTOR_GROUP_SHEET_NAMES,
} from './aip-sector-group.js';
import { LIVE_PROGRAM } from '../programs/program-filters.js';

type ExportWorkbook = {
  buffer: Buffer;
  fileName: string;
};

const INFO_SHEET = 'Export Info';
const SUMMARY_SHEET = 'Executive Summary';
const FUND_SOURCE_SHEET = 'Fund Source';

/**
 * The bucket a row's money lands in when the PPA cites more than one fund.
 *
 * `ProjectActivity.fundSources` is amount-less by design — the budget office
 * lists the funds a PPA draws on, it does not split the estimate across them.
 * Dividing evenly would invent a split the data does not contain, so a
 * multi-fund PPA gets its own line instead. In FY2027 that is 41 of 1,326
 * sourced PPAs.
 */
const MULTIPLE_SOURCES = 'MULTIPLE SOURCES';

/** The three AIP appropriation sections, in printed order. */
const SECTIONS = [
  { papClass: PapClass.GAS, label: 'GENERAL ADMINISTRATIVE SERVICES' },
  { papClass: PapClass.STO, label: 'SUPPORT TO OPERATIONS' },
  { papClass: PapClass.OPERATIONS, label: 'OPERATIONS' },
] as const;

const HEADERS = [
  'AIP Reference Code',
  'Program / Project / Activity Description',
  'Implementing Office / Department',
  'From',
  'To',
  'Expected Outputs (Results)',
  'Funding Source',
  'PS',
  'MOOE',
  'FE',
  'Capital Outlay',
  'Total',
  'Climate Change Adaptation',
  'Climate Change Mitigation',
  'Climate Change Typology Code',
] as const;

/** Column widths lifted from the city's own workbook; the rest stay default. */
const COLUMN_WIDTHS: Record<number, number> = {
  1: 28.4,
  2: 40,
  3: 17.8,
  4: 10,
  5: 10,
  6: 40.6,
  7: 12,
  8: 10.4,
  9: 10.4,
  10: 10.4,
  11: 10.4,
  12: 12,
  13: 15.1,
  14: 15.1,
  15: 16,
};

const HEADER_ROW = 3;
const FIRST_DATA_ROW = HEADER_ROW + 1;
/** Money columns H..L (PS, MOOE, FE, CO, Total) plus the two climate columns M..N. */
const TOTALLED_COLUMNS = ['H', 'I', 'J', 'K', 'L', 'M', 'N'] as const;

/**
 * Structural chrome, constant across every sheet: the frozen column header and
 * the grand TOTAL. Deliberately *not* a sector hue — these two rows mean the
 * same thing everywhere, so tying them to the sheet you happen to be on would
 * make the hue decorative rather than informative.
 */
const BAND_CHROME = 'FF1E293B';
/** The chrome's own tint, for rows that roll up to it (Export Info, SUMMARY). */
const SLATE_TINT = 'FFDDE3EC';
/** `papClass` headings keep the city's own grey, as their workbook has them. */
const BAND_SECTION = 'FFCCCCCC';
const INK_ON_DARK = 'FFFFFFFF';
const INK = 'FF000000';
/** The city's workbook is Arial throughout; sizes are ours, scaled for screen. */
const FONT = 'Arial';

/**
 * One hue per sector sheet, carried by its office bands, its subtotals and its
 * Excel tab colour — so which sheet you are on is legible at a glance in a
 * six-tab workbook, rather than something you read off the tab text.
 *
 * The hues are semantic where they can be (environment green, economic amber,
 * social purple) and the portal's own `--primary` for General Public, so the
 * file still looks like it came from this product.
 */
const SECTOR_PALETTE: Record<AipSectorGroup, { band: string; tint: string }> = {
  GENERAL_PUBLIC: { band: 'FF1447E6', tint: 'FFDBE4FD' },
  ECONOMIC: { band: 'FFB45309', tint: 'FFFDECD3' },
  ENVI_INFRA: { band: 'FF15803D', tint: 'FFD5F0DF' },
  SOCIAL: { band: 'FF7E22CE', tint: 'FFEBDCF9' },
};

const OFFICE_TYPE_ORDER: Record<string, number> = {
  MANDATORY: 0,
  OPTIONAL: 1,
  OTHERS: 2,
};

type SheetOffice = {
  id: string;
  name: string;
  acronym: string;
  officeType: string | null;
  officeCode: string | null;
  aipSectorGroup: AipSectorGroup | null;
  papSector: { code: string } | null;
};

/** One office's block on a sector sheet. */
type OfficeBlock = {
  office: SheetOffice;
  rows: ExportRow[];
};

type Money = {
  ps: Prisma.Decimal;
  mooe: Prisma.Decimal;
  fe: Prisma.Decimal;
  co: Prisma.Decimal;
  total: Prisma.Decimal;
  cca: Prisma.Decimal;
  ccm: Prisma.Decimal;
};

/** A sector group's totals, plus how many offices contributed them. */
type GroupSummary = Money & { offices: number };

const emptyMoney = (): Money => ({
  ps: ZERO,
  mooe: ZERO,
  fe: ZERO,
  co: ZERO,
  total: ZERO,
  cca: ZERO,
  ccm: ZERO,
});

/**
 * Exports the whole city's AIP as one workbook: a sheet per `AipSectorGroup`,
 * then a funding-source breakdown.
 *
 * Unlike the cluster export this builds its sheets directly rather than from a
 * committed .xlsx template. The sector sheets are a plain 14-column grid, and
 * driving a template costs the `duplicateRow` shared-style trap and reach-ins to
 * ExcelJS's private `_merges` for no gain here.
 *
 * See docs/design/aip-complete-export.md.
 */
@Injectable()
export class AIPCompleteExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly officeScope: OfficeScopeService,
  ) {}

  async exportComplete(
    cycleId: string | undefined,
    user: JwtPayload,
  ): Promise<ExportWorkbook> {
    if (!cycleId) {
      throw new BadRequestException('cycleId is required');
    }

    // A "complete AIP" narrowed to the caller's own offices would print a city
    // total that is not the city's. Refuse rather than silently export a part.
    const scope = await this.officeScope.effectiveOfficeIds(user);
    if (scope !== ALL_OFFICES) {
      throw new ForbiddenException(
        'The complete AIP export covers every office. Your account is scoped to specific offices — use the cluster export instead.',
      );
    }

    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, fiscalYear: true },
    });
    if (!cycle) {
      throw new NotFoundException('AIP cycle not found');
    }

    const fileName = `aip-${cycle.fiscalYear}-complete-export.xlsx`;
    const log = await this.prisma.aIPExportLog.create({
      data: {
        type: ExportType.COMPLETE_AIP,
        status: ExportStatus.PENDING,
        aipCycleId: cycle.id,
        fileName,
        requestedByUserId: user.sub,
        requestedByRole: user.role,
        filters: { cycleId: cycle.id },
      },
    });

    try {
      const buffer = await this.buildWorkbook(cycle.id, cycle.fiscalYear, user);
      await this.prisma.aIPExportLog.update({
        where: { id: log.id },
        data: { status: ExportStatus.GENERATED },
      });
      return { buffer, fileName };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate export';
      await this.prisma.aIPExportLog.update({
        where: { id: log.id },
        data: { status: ExportStatus.FAILED, errorMessage: message },
      });
      throw error;
    }
  }

  private async buildWorkbook(
    cycleId: string,
    fiscalYear: number,
    user: JwtPayload,
  ): Promise<Buffer> {
    const [programs, exporterOffice] = await Promise.all([
      this.listPrograms(cycleId),
      this.resolveExporterOffice(user),
    ]);

    // Group by the office the program *prints* under. A component program is
    // proposed by one office and printed inside another's block, which is what
    // hostOfficeId is for.
    const blocks = new Map<string, OfficeBlock>();
    for (const program of programs) {
      const office = program.hostOffice ?? program.office;
      if (!office) continue;
      const block = blocks.get(office.id) ?? { office, rows: [] };
      block.rows.push(...buildProgramRows([program]));
      blocks.set(office.id, block);
    }

    assertExportWithinRowLimit(
      [...blocks.values()].reduce((acc, b) => acc + b.rows.length, 0),
    );

    const workbook = new ExcelJS.Workbook();
    const infoSheet = workbook.addWorksheet(INFO_SHEET);
    const summarySheet = workbook.addWorksheet(SUMMARY_SHEET);
    const perGroup = new Map<AipSectorGroup, GroupSummary>();
    const perOffice = new Map<AipSectorGroup, Array<[string, Money]>>();

    for (const group of SECTOR_GROUP_ORDER) {
      const groupBlocks = [...blocks.values()]
        .filter((block) => resolveSectorGroup(block.office) === group)
        .sort((left, right) => this.compareOffices(left.office, right.office));
      const sheet = workbook.addWorksheet(SECTOR_GROUP_SHEET_NAMES[group]);
      this.populateSectorSheet(sheet, fiscalYear, group, groupBlocks);
      perGroup.set(group, {
        ...this.tally(groupBlocks.flatMap((block) => block.rows)),
        offices: groupBlocks.length,
      });
      perOffice.set(
        group,
        groupBlocks.map((block) => [block.office.name, this.tally(block.rows)]),
      );
    }

    this.populateSummarySheet(summarySheet, fiscalYear, perOffice, perGroup);

    this.populateFundSourceSheet(
      workbook.addWorksheet(FUND_SOURCE_SHEET),
      fiscalYear,
      blocks,
    );

    // Populated last because it reports on the sheets that follow it, but it
    // was added first so it opens as the cover page.
    this.populateInfoSheet(infoSheet, {
      fiscalYear,
      user,
      exporterOffice,
      programCount: programs.length,
      officeCount: blocks.size,
      perGroup,
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** The office the exporter belongs to, for the cover page. */
  private async resolveExporterOffice(
    user: JwtPayload,
  ): Promise<string | null> {
    if (!user.officeId) return null;
    const office = await this.prisma.office.findUnique({
      where: { id: user.officeId },
      select: { name: true, acronym: true },
    });
    return office ? `${office.name} (${office.acronym})` : null;
  }

  private listPrograms(cycleId: string) {
    const officeSelect = {
      select: {
        id: true,
        name: true,
        acronym: true,
        officeType: true,
        officeCode: true,
        aipSectorGroup: true,
        papSector: { select: { code: true } },
      },
    } as const;

    return this.prisma.program.findMany({
      // Same scope rule as the cluster export: everything not deleted, no status
      // filter, so the workbook is usable mid-cycle while programs are drafts.
      where: { ...LIVE_PROGRAM, aipCycleId: cycleId },
      // The registry's printed order — papClass first, then the rank inside it.
      orderBy: [
        { papClass: 'asc' },
        { orderIndex: 'asc' },
        { createdAt: 'asc' },
      ],
      include: {
        office: officeSelect,
        hostOffice: officeSelect,
        climateChangeTag: CLIMATE_TAG_INCLUDE,
        fundAllocations: FUND_ALLOCATION_INCLUDE,
        projectActivities: {
          orderBy: { orderIndex: 'asc' },
          include: {
            climateChangeTag: CLIMATE_TAG_INCLUDE,
            fundAllocations: FUND_ALLOCATION_INCLUDE,
          },
        },
      },
    });
  }

  /** The city's coding-sheet order: office type, then office code numerically. */
  private compareOffices(left: SheetOffice, right: SheetOffice): number {
    const byType =
      (OFFICE_TYPE_ORDER[left.officeType ?? ''] ?? 99) -
      (OFFICE_TYPE_ORDER[right.officeType ?? ''] ?? 99);
    if (byType !== 0) return byType;
    // "11 (1)" sorts with 11, not lexically between 1 and 2. An uncoded office
    // (parseInt → NaN) sorts last rather than poisoning every comparison.
    const num = (code: string | null) => {
      const parsed = Number.parseInt(code ?? '', 10);
      return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
    };
    const byCode = num(left.officeCode) - num(right.officeCode);
    if (byCode !== 0) return byCode;
    // Same leading number ("11" vs "11 (1)") — fall back to the written form.
    return (left.officeCode ?? '').localeCompare(right.officeCode ?? '');
  }

  /**
   * Sum a set of rows.
   *
   * Only leaf rows are counted. `buildProgramRows` zeroes the money on program
   * and parent rows so their children are not double-counted, and it rolls the
   * climate amounts *up* into parents — so summing every row would double-count
   * CCA/CCM even though the money columns would come out right.
   */
  private tally(rows: ExportRow[]): Money {
    return rows
      .filter((row) => !row.isParent)
      .reduce<Money>(
        (acc, row) => ({
          ps: acc.ps.plus(row.psAmount),
          mooe: acc.mooe.plus(row.mooeAmount),
          fe: acc.fe.plus(row.feAmount),
          co: acc.co.plus(row.coAmount),
          total: acc.total.plus(row.totalAmount),
          cca: acc.cca.plus(row.ccaTotal),
          ccm: acc.ccm.plus(row.ccmTotal),
        }),
        emptyMoney(),
      );
  }

  /**
   * Cover page: who generated this, when, and what it covers.
   *
   * A workbook like this gets mailed around and printed, and once it leaves the
   * portal nothing else says which cycle it came from or how old it is. Kept to
   * that — provenance, scope, and the two rules a reader needs to interpret the
   * numbers.
   */
  private populateInfoSheet(
    sheet: ExcelJS.Worksheet,
    data: {
      fiscalYear: number;
      user: JwtPayload;
      exporterOffice: string | null;
      programCount: number;
      officeCount: number;
      perGroup: Map<AipSectorGroup, GroupSummary>;
    },
  ) {
    const { fiscalYear, user, exporterOffice, programCount, officeCount } =
      data;
    // The two cross-cutting sheets wear the chrome, so the four coloured tabs
    // between them read as the set they are.
    sheet.properties.tabColor = { argb: BAND_CHROME };
    sheet.columns = [
      { width: 30 },
      { width: 46 },
      { width: 16 },
      { width: 16 },
    ];

    const title = sheet.getCell('A1');
    title.value = `${fiscalYear} COMPLETE AIP EXPORT`;
    applyFont(title, {
      name: FONT,
      size: 16,
      bold: true,
      color: { argb: INK },
    });

    let row = 3;
    const field = (label: string, value: ExcelJS.CellValue) => {
      const labelCell = sheet.getCell(`A${row}`);
      labelCell.value = label;
      applyFont(labelCell, { name: FONT, size: 10, bold: true });
      const valueCell = sheet.getCell(`B${row}`);
      valueCell.value = value;
      applyFont(valueCell, { name: FONT, size: 10 });
      row += 1;
    };
    const heading = (label: string, width = 4) => {
      sheet.getCell(`A${row}`).value = label;
      this.paintBand(sheet, row, width, BAND_CHROME, INK_ON_DARK, 11);
      row += 1;
    };

    // A cover page that reads "undefined (undefined)" is worse than one that
    // names the account id, and this file gets circulated outside the portal.
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    const exportedBy = fullName || user.email || user.sub;
    const contact = user.email ? ` (${user.email})` : '';

    heading('GENERATED');
    // ISO-ish and explicitly UTC: the file outlives the session that made it,
    // and a bare local timestamp is unreadable a month later in another office.
    field(
      'Generated at',
      `${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
    );
    field('Generated by', `${exportedBy}${contact}`);
    field(
      'Role',
      user.identityType ? `${user.role} · ${user.identityType}` : user.role,
    );
    field('Office', exporterOffice ?? '— (no office assigned)');

    row += 1;
    heading('COVERAGE');
    field('Fiscal year', fiscalYear);
    field('Scope', 'All offices');
    field(
      'Programs included',
      `${programCount} across ${officeCount} office(s)`,
    );
    field(
      'Workflow status',
      'Every program in the cycle, drafts included — not approved-only',
    );

    row += 1;
    heading('SHEETS');
    const columnHeader = ['Sheet', 'Sector', 'Offices', 'Total (₱M)'];
    columnHeader.forEach((label, index) => {
      sheet.getCell(row, index + 1).value = label;
    });
    this.paintBand(sheet, row, 4, BAND_SECTION, INK, 10);
    row += 1;

    let grand = ZERO;
    for (const group of SECTOR_GROUP_ORDER) {
      const summary = data.perGroup.get(group);
      if (!summary) continue;
      grand = grand.plus(summary.total);
      const values: ExcelJS.CellValue[] = [
        SECTOR_GROUP_SHEET_NAMES[group],
        SECTOR_GROUP_LABELS[group],
        summary.offices,
        toExcelAmount(summary.total) ?? 0,
      ];
      values.forEach((value, index) => {
        const cell = sheet.getCell(row, index + 1);
        cell.value = value;
        applyFont(cell, { name: FONT, size: 10 });
        if (index === 3) applyCellStyle(cell, {}, AMOUNT_FORMAT);
      });
      row += 1;
    }
    sheet.getCell(`A${row}`).value = 'TOTAL';
    sheet.getCell(`C${row}`).value = officeCount;
    const grandCell = sheet.getCell(`D${row}`);
    grandCell.value = toExcelAmount(grand) ?? 0;
    applyCellStyle(grandCell, {}, AMOUNT_FORMAT);
    this.paintBand(sheet, row, 4, SLATE_TINT, INK, 11);
    row += 2;

    heading('READING THESE NUMBERS');
    field('Amounts', 'In million pesos (₱M), shown to two decimals');
    field(
      'PS + MOOE + FE + CO',
      'May be less than Total: some PPAs carry a proposed budget with no expenditure-class split',
    );
    field(
      'Funding source',
      'A PPA counts wholly against the single fund it cites. PPAs citing several are listed under MULTIPLE SOURCES rather than split',
    );
  }

  private populateSectorSheet(
    sheet: ExcelJS.Worksheet,
    fiscalYear: number,
    group: AipSectorGroup,
    blocks: OfficeBlock[],
  ) {
    for (const [index, width] of Object.entries(COLUMN_WIDTHS)) {
      sheet.getColumn(Number(index)).width = width;
    }

    const palette = SECTOR_PALETTE[group];
    // Excel paints the tab itself, which is the only sheet-level affordance a
    // six-tab workbook has.
    sheet.properties.tabColor = { argb: palette.band };

    sheet.getCell('A1').value = `${fiscalYear} ANNUAL INVESTMENT PLAN`;
    applyCellStyle(sheet.getCell('A1'), { vertical: 'middle' });
    applyFont(sheet.getCell('A1'), {
      name: FONT,
      size: 16,
      bold: true,
      color: { argb: INK },
    });
    sheet.getCell('A2').value = SECTOR_GROUP_LABELS[group];
    applyCellStyle(sheet.getCell('A2'), { vertical: 'middle' });
    // The sector name in its own hue is what ties the sheet to its tab.
    applyFont(sheet.getCell('A2'), {
      name: FONT,
      size: 13,
      bold: true,
      color: { argb: palette.band },
    });

    HEADERS.forEach((header, index) => {
      const cell = sheet.getCell(HEADER_ROW, index + 1);
      cell.value = header;
      applyCellStyle(cell, {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      });
      applyBorder(cell);
    });
    this.paintRow(sheet, HEADER_ROW, BAND_CHROME, INK_ON_DARK, 10);
    sheet.getRow(HEADER_ROW).height = 30;
    sheet.views = [{ state: 'frozen', ySplit: HEADER_ROW }];

    let rowNumber = FIRST_DATA_ROW;
    const subtotalRows: number[] = [];

    for (const block of blocks) {
      sheet.getCell(rowNumber, 1).value = block.office.name.toUpperCase();
      applyCellStyle(sheet.getCell(rowNumber, 1), { vertical: 'middle' });
      this.paintRow(sheet, rowNumber, palette.band, INK_ON_DARK, 12);
      rowNumber++;

      for (const section of SECTIONS) {
        const sectionRows = block.rows.filter(
          (row) => (row.papClass ?? PapClass.OPERATIONS) === section.papClass,
        );
        if (sectionRows.length === 0) continue;
        sheet.getCell(rowNumber, 1).value = section.label;
        applyCellStyle(sheet.getCell(rowNumber, 1), { vertical: 'middle' });
        this.paintRow(sheet, rowNumber, BAND_SECTION, INK, 10);
        rowNumber++;
        for (const row of sectionRows) {
          this.writeRow(sheet, rowNumber, row, fiscalYear);
          rowNumber++;
        }
      }

      const subtotal = this.tally(block.rows);
      this.writeTotalRow(
        sheet,
        rowNumber,
        `SUB-TOTAL, ${block.office.acronym}`,
        subtotal,
      );
      this.paintRow(sheet, rowNumber, palette.tint, INK, 11);
      subtotalRows.push(rowNumber);
      rowNumber += 2; // one blank row between office blocks
    }

    // The grand total adds the subtotal cells rather than re-summing the data
    // range, so a reader can trace it and editing a figure still updates it.
    sheet.getCell(rowNumber, 1).value = 'TOTAL';
    applyCellStyle(sheet.getCell(rowNumber, 1), {}, undefined, true);
    applyBorder(sheet.getCell(rowNumber, 1));
    for (const col of TOTALLED_COLUMNS) {
      const cell = sheet.getCell(`${col}${rowNumber}`);
      cell.value = subtotalRows.length
        ? { formula: subtotalRows.map((r) => `${col}${r}`).join('+') }
        : 0;
      applyCellStyle(cell, { horizontal: 'right' }, AMOUNT_FORMAT, true);
      applyBorder(cell);
    }
    this.paintRow(sheet, rowNumber, BAND_CHROME, INK_ON_DARK, 12);
  }

  /** `paintBand` across a sector sheet's full 15-column width. */
  private paintRow(
    sheet: ExcelJS.Worksheet,
    rowNumber: number,
    fill: string,
    ink: string,
    size: number,
  ) {
    this.paintBand(sheet, rowNumber, HEADERS.length, fill, ink, size);
  }

  private writeRow(
    sheet: ExcelJS.Worksheet,
    rowNumber: number,
    row: ExportRow,
    fiscalYear: number,
  ) {
    const isLeaf = !row.isParent;
    const values: ExcelJS.CellValue[] = [
      row.code,
      row.description,
      row.implementingOfficeLabel,
      toMonthLabel(row.startMonth, row.startYear, fiscalYear),
      toMonthLabel(row.endMonth, row.endYear, fiscalYear),
      row.expectedOutput || null,
      isLeaf ? formatFundSources(row.fundSources) : null,
      isLeaf ? toExcelAmount(row.psAmount) : null,
      isLeaf ? toExcelAmount(row.mooeAmount) : null,
      isLeaf ? toExcelAmount(row.feAmount) : null,
      isLeaf ? toExcelAmount(row.coAmount) : null,
      isLeaf ? toExcelAmount(row.totalAmount) : null,
      isLeaf ? toExcelAmount(row.ccaTotal) : null,
      isLeaf ? toExcelAmount(row.ccmTotal) : null,
      row.climateCodes.join(', ') || null,
    ];

    values.forEach((value, index) => {
      const cell = sheet.getCell(rowNumber, index + 1);
      cell.value = value;
      const isMoney = index >= 7 && index <= 13;
      applyCellStyle(
        cell,
        {
          vertical: 'top',
          horizontal: isMoney ? 'right' : 'left',
          wrapText: index === 1 || index === 5,
          // Nesting depth reads as indentation, the way the printed sheet shows it.
          ...(index === 1 ? { indent: row.level } : {}),
        },
        isMoney ? AMOUNT_FORMAT : undefined,
        row.isParent,
      );
      applyFont(cell, { name: FONT, size: 9 });
      applyBorder(cell);
    });
  }

  private writeTotalRow(
    sheet: ExcelJS.Worksheet,
    rowNumber: number,
    label: string,
    money: Money,
  ) {
    sheet.getCell(rowNumber, 1).value = label;
    applyCellStyle(sheet.getCell(rowNumber, 1), {}, undefined, true);
    applyBorder(sheet.getCell(rowNumber, 1));
    const amounts = [
      money.ps,
      money.mooe,
      money.fe,
      money.co,
      money.total,
      money.cca,
      money.ccm,
    ];
    TOTALLED_COLUMNS.forEach((col, index) => {
      const cell = sheet.getCell(`${col}${rowNumber}`);
      cell.value = toExcelAmount(amounts[index]) ?? 0;
      applyCellStyle(cell, { horizontal: 'right' }, AMOUNT_FORMAT, true);
      applyBorder(cell);
    });
  }

  /**
   * Funding-source breakdown: one block per sector group, then a city-wide
   * SUMMARY.
   *
   * A PPA's amount goes wholly to the single fund it cites. PPAs citing none
   * default to GF — the constant this column carried before the field existed —
   * and PPAs citing several go to MULTIPLE SOURCES rather than being split.
   */
  private populateFundSourceSheet(
    sheet: ExcelJS.Worksheet,
    fiscalYear: number,
    blocks: Map<string, OfficeBlock>,
  ) {
    sheet.properties.tabColor = { argb: BAND_CHROME };
    sheet.getColumn(1).width = 26;
    for (let col = 2; col <= 9; col++) sheet.getColumn(col).width = 15;

    sheet.getCell('A1').value =
      `${fiscalYear} ANNUAL INVESTMENT PLAN — FUNDING SOURCE`;
    applyCellStyle(sheet.getCell('A1'), {}, undefined, true);

    // Labels, not enum keys: the tallies are keyed by label, so keying rows by
    // DONATIONS_GRANTS / TRUST_FUND / JOINT_VENTURE printed those funds as 0.
    const buckets = [...Object.values(FUND_SOURCE_LABELS), MULTIPLE_SOURCES];
    const entries = (tallies: Map<string, Money>): Array<[string, Money]> =>
      buckets.map((bucket) => [bucket, tallies.get(bucket) ?? emptyMoney()]);
    const summary = new Map<string, Money>();
    let rowNumber = 3;

    for (const group of SECTOR_GROUP_ORDER) {
      const rows = [...blocks.values()]
        .filter((block) => resolveSectorGroup(block.office) === group)
        .flatMap((block) => block.rows);
      const tallies = this.tallyByFundSource(rows);
      for (const [bucket, money] of tallies) {
        summary.set(bucket, this.addMoney(summary.get(bucket), money));
      }
      rowNumber = this.writeSummaryBlock(
        sheet,
        rowNumber,
        SECTOR_GROUP_LABELS[group],
        'FUNDING SOURCE',
        entries(tallies),
        SECTOR_PALETTE[group],
        true,
      );
    }

    // The city-wide roll-up wears the chrome, not a fifth hue — it is not
    // another sector, it is what the four above add up to.
    this.writeSummaryBlock(
      sheet,
      rowNumber,
      'SUMMARY',
      'FUNDING SOURCE',
      entries(summary),
      { band: BAND_CHROME, tint: SLATE_TINT },
      true,
    );
  }

  /**
   * The city workbook's "Comparative" sheet for this year alone: one block per
   * sector (office × PS / MOOE / FE / CO / Total / share of the sector), then the
   * sectors against the city total. The prior-year columns and the % change
   * table are left out on purpose; the per-fund summary is the Fund Source sheet.
   *
   * ponytail: values, not formulas linking to the sector sheets' SUB-TOTALs —
   * link them if staff start editing the sector sheets in Excel.
   */
  private populateSummarySheet(
    sheet: ExcelJS.Worksheet,
    fiscalYear: number,
    perOffice: Map<AipSectorGroup, Array<[string, Money]>>,
    perGroup: Map<AipSectorGroup, GroupSummary>,
  ) {
    sheet.properties.tabColor = { argb: BAND_CHROME };
    sheet.getColumn(1).width = 46;
    for (let col = 2; col <= 7; col++) sheet.getColumn(col).width = 15;

    sheet.getCell('A1').value =
      `${fiscalYear} ANNUAL INVESTMENT PLAN — EXECUTIVE SUMMARY`;
    applyCellStyle(sheet.getCell('A1'), {}, undefined, true);
    sheet.getCell('A2').value = 'Amounts in million pesos (₱M)';
    applyFont(sheet.getCell('A2'), { name: FONT, size: 10, italic: true });

    let rowNumber = 4;
    for (const group of SECTOR_GROUP_ORDER) {
      rowNumber = this.writeSummaryBlock(
        sheet,
        rowNumber,
        SECTOR_GROUP_LABELS[group],
        'NAME OF OFFICE',
        perOffice.get(group) ?? [],
        SECTOR_PALETTE[group],
        false,
      );
    }
    this.writeSummaryBlock(
      sheet,
      rowNumber,
      'SECTOR / EXPENDITURE TYPE',
      'SECTOR',
      SECTOR_GROUP_ORDER.map((group) => [
        SECTOR_GROUP_LABELS[group],
        perGroup.get(group) ?? emptyMoney(),
      ]),
      { band: BAND_CHROME, tint: SLATE_TINT },
      false,
    );
  }

  private tallyByFundSource(rows: ExportRow[]): Map<string, Money> {
    const tallies = new Map<string, Money>();
    for (const row of rows) {
      if (row.isParent) continue;
      const bucket =
        row.fundSources.length === 0
          ? DEFAULT_FUNDING_SOURCE
          : row.fundSources.length === 1
            ? FUND_SOURCE_LABELS[row.fundSources[0]]
            : MULTIPLE_SOURCES;
      tallies.set(
        bucket,
        this.addMoney(tallies.get(bucket), {
          ps: row.psAmount,
          mooe: row.mooeAmount,
          fe: row.feAmount,
          co: row.coAmount,
          total: row.totalAmount,
          cca: row.ccaTotal,
          ccm: row.ccmTotal,
        }),
      );
    }
    return tallies;
  }

  private addMoney(base: Money | undefined, add: Money): Money {
    const start = base ?? emptyMoney();
    return {
      ps: start.ps.plus(add.ps),
      mooe: start.mooe.plus(add.mooe),
      fe: start.fe.plus(add.fe),
      co: start.co.plus(add.co),
      total: start.total.plus(add.total),
      cca: start.cca.plus(add.cca),
      ccm: start.ccm.plus(add.ccm),
    };
  }

  /**
   * Writes one titled block (a row per entry, then TOTAL, each with its share of
   * the block) in the given colours, and returns the next free row. Shared by the
   * Executive Summary (no climate columns) and the Fund Source sheet.
   */
  private writeSummaryBlock(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    title: string,
    firstHeader: string,
    entries: Array<[string, Money]>,
    palette: { band: string; tint: string },
    withClimate: boolean,
  ): number {
    const headers = [
      firstHeader,
      'PS',
      'MOOE',
      'FE',
      'CO',
      'Total',
      ...(withClimate
        ? ['Climate Change Adaptation', 'Climate Change Mitigation']
        : []),
      '%',
    ];
    const width = headers.length;

    sheet.getCell(startRow, 1).value = title;
    applyCellStyle(sheet.getCell(startRow, 1), { vertical: 'middle' });
    this.paintBand(sheet, startRow, width, palette.band, INK_ON_DARK, 12);
    let rowNumber = startRow + 1;
    headers.forEach((header, index) => {
      const cell = sheet.getCell(rowNumber, index + 1);
      cell.value = header;
      applyCellStyle(
        cell,
        { horizontal: 'center', wrapText: true },
        undefined,
        true,
      );
      applyBorder(cell);
    });
    this.paintBand(sheet, rowNumber, width, BAND_SECTION, INK, 10);
    sheet.getRow(rowNumber).height = 28;
    rowNumber++;

    const blockTotal = entries.reduce<Money>(
      (acc, [, money]) => this.addMoney(acc, money),
      emptyMoney(),
    );

    for (const [label, money] of entries) {
      const share = blockTotal.total.equals(0)
        ? 0
        : Number(money.total.div(blockTotal.total).toFixed(6));
      this.writeSummaryRow(
        sheet,
        rowNumber,
        label,
        money,
        share,
        false,
        withClimate,
      );
      rowNumber++;
    }
    this.writeSummaryRow(
      sheet,
      rowNumber,
      'TOTAL',
      blockTotal,
      blockTotal.total.equals(0) ? 0 : 1,
      true,
      withClimate,
    );
    this.paintBand(sheet, rowNumber, width, palette.tint, INK, 11);
    // One blank row between blocks.
    return rowNumber + 2;
  }

  /**
   * Solid fill + font across `width` columns.
   *
   * Applied *after* the row's values so it paints the empty cells too — a band
   * that stops at the last written cell reads as a ragged stripe.
   */
  private paintBand(
    sheet: ExcelJS.Worksheet,
    rowNumber: number,
    width: number,
    fill: string,
    ink: string,
    size: number,
  ) {
    for (let col = 1; col <= width; col++) {
      const cell = sheet.getCell(rowNumber, col);
      applyFill(cell, fill);
      applyFont(cell, { name: FONT, size, bold: true, color: { argb: ink } });
      applyBorder(cell);
    }
  }

  private writeSummaryRow(
    sheet: ExcelJS.Worksheet,
    rowNumber: number,
    label: string,
    money: Money,
    share: number,
    bold: boolean,
    withClimate: boolean,
  ) {
    const values: ExcelJS.CellValue[] = [
      label,
      toExcelAmount(money.ps) ?? 0,
      toExcelAmount(money.mooe) ?? 0,
      toExcelAmount(money.fe) ?? 0,
      toExcelAmount(money.co) ?? 0,
      toExcelAmount(money.total) ?? 0,
      ...(withClimate
        ? [toExcelAmount(money.cca) ?? 0, toExcelAmount(money.ccm) ?? 0]
        : []),
      share,
    ];
    const shareIndex = values.length - 1;
    values.forEach((value, index) => {
      const cell = sheet.getCell(rowNumber, index + 1);
      cell.value = value;
      applyCellStyle(
        cell,
        { horizontal: index === 0 ? 'left' : 'right' },
        index === 0
          ? undefined
          : index === shareIndex
            ? '0.00%'
            : AMOUNT_FORMAT,
        bold,
      );
      applyBorder(cell);
    });
  }
}
