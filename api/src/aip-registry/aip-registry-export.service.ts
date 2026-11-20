import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { readFile, realpath } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ExportStatus,
  ExportType,
  IdentityType,
  PapClass,
  Prisma,
  Role,
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
  assertExportWithinRowLimit,
  formatFundSources,
  FULL_BORDER,
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
import { LIVE_PROGRAM } from '../programs/program-filters.js';

type ExportOrganization = {
  id: string;
  sheetLabel: string;
  displayName: string;
  implementingOfficeLabel: string;
};

type ExportWorkbook = {
  buffer: Buffer;
  fileName: string;
};

/** An entry and the Basic-sheet row it was assigned. */
type PlacedRow = { entry: ExportRow; row: number };

/**
 * Where every row goes on the Basic sheet, resolved before anything is written.
 * The Extended sheet points at Basic rows by formula, so both sheets read this
 * rather than each deriving positions of their own.
 */
type BasicLayout = {
  sections: {
    label: string;
    headerRow: number;
    /** Set only when the section has no entries and keeps a single blank row. */
    blankRow: number | null;
    placed: PlacedRow[];
  }[];
  /** Every placed entry, in printed order. */
  placed: PlacedRow[];
  /** Data rows written, excluding the TOTAL row. */
  rowCount: number;
  totalRow: number;
};

type WorksheetWithMerges = ExcelJS.Worksheet & {
  _merges?: Record<string, { range: string }>;
};

type ExportProgram = Awaited<
  ReturnType<AIPRegistryExportService['listProgramsForExport']>
>[number];

// The .xlsx export template is committed under `api/templates/` and shipped into
// the Docker image (see api/Dockerfile). It is read from `<api workspace
// root>/templates/`, which maps to the process cwd in every run context (dev
// `nest start`, jest, and the Docker runtime whose WORKDIR is the api root).
// It is a *generic* cluster form — the GOALS/finish-line content is filled in at
// export time. Override the file name via AIP_TEMPLATE_FILE when the template is
// re-issued for a new fiscal year.
const TEMPLATE_DIR_NAME = 'templates';
const DEFAULT_TEMPLATE_FILE = 'AIP Cluster Template.xlsx';
const BASIC_TEMPLATE_SHEET = 'TEMPLATE - Basic AIP Form';
const EXTENDED_TEMPLATE_SHEET = 'TEMPLATE - Extended AIP Form';
const GOALS_TEMPLATE_SHEET = 'GOALS';
const BASIC_DATA_START_ROW = 8;
const BASIC_TEMPLATE_DATA_ROWS = 6;
// The three AIP appropriation sections, in printed order. A program's papClass
// decides which one it lands in; legacy rows have none and fall through to
// OPERATIONS, which is where the sheet already put everything.
const BASIC_SECTIONS = [
  { papClass: PapClass.GAS, label: 'I. GENERAL ADMINISTRATIVE SERVICES' },
  { papClass: PapClass.STO, label: 'II. SUPPORT TO OPERATIONS' },
  { papClass: PapClass.OPERATIONS, label: 'III. OPERATIONS' },
] as const;
const EXTENDED_DATA_START_ROW = 8;
const EXTENDED_TEMPLATE_DATA_ROWS = 6;
const BASIC_ROW_COLUMNS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
] as const;

@Injectable()
export class AIPRegistryExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly officeScope: OfficeScopeService,
  ) {}

  async exportCluster(
    cycleId: string | undefined,
    requestedClusterId: string | undefined,
    user: JwtPayload,
  ): Promise<ExportWorkbook> {
    if (!cycleId) {
      throw new BadRequestException('cycleId is required');
    }

    const cluster = await this.resolveAuthorizedCluster(
      requestedClusterId,
      user,
    );
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, fiscalYear: true },
    });
    if (!cycle) {
      throw new NotFoundException('AIP cycle not found');
    }

    const fileName = this.buildFileName(cycle.fiscalYear, cluster.name);
    const log = await this.prisma.aIPExportLog.create({
      data: {
        type: ExportType.CLUSTER,
        status: ExportStatus.PENDING,
        aipCycleId: cycle.id,
        clusterId: cluster.id,
        fileName,
        requestedByUserId: user.sub,
        requestedByRole: user.role,
        filters: { cycleId: cycle.id, clusterId: cluster.id },
      },
    });

    try {
      const workbook = await this.buildClusterWorkbook(
        cluster.id,
        cycle.id,
        cycle.fiscalYear,
        user,
      );
      await this.prisma.aIPExportLog.update({
        where: { id: log.id },
        data: { status: ExportStatus.GENERATED },
      });
      return workbook;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate export';
      await this.prisma.aIPExportLog.update({
        where: { id: log.id },
        data: {
          status: ExportStatus.FAILED,
          errorMessage: message,
        },
      });
      throw error;
    }
  }

  private async buildClusterWorkbook(
    clusterId: string,
    cycleId: string,
    fiscalYear: number,
    user: JwtPayload,
  ): Promise<ExportWorkbook> {
    // A cluster the caller only partly holds exports only the offices they hold.
    // Writing the whole cluster would hand them every other office's figures,
    // which is the same leak the read path had.
    const scope = await this.officeScope.effectiveOfficeIds(user);
    const officeFilter: Prisma.OfficeWhereInput =
      scope === ALL_OFFICES
        ? { isActive: true }
        : { isActive: true, id: { in: scope } };

    const [cluster, programs] = await Promise.all([
      this.prisma.cluster.findUnique({
        where: { id: clusterId },
        include: {
          finishLineClusters: {
            include: {
              finishLine: {
                select: {
                  id: true,
                  name: true,
                  fullName: true,
                  visionNumber: true,
                },
              },
            },
            orderBy: [
              { finishLine: { visionNumber: 'asc' } },
              { finishLine: { name: 'asc' } },
            ],
          },
          offices: {
            where: officeFilter,
            orderBy: { acronym: 'asc' },
            select: { id: true, acronym: true, name: true },
          },
        },
      }),
      this.listProgramsForExport(clusterId, cycleId, scope),
    ]);

    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    const organizations = this.buildOrganizations(cluster);
    const groupedPrograms = new Map<string, ExportProgram[]>();
    for (const program of programs) {
      const ownerId = program.officeId;
      if (!ownerId) continue;
      const existing = groupedPrograms.get(ownerId) ?? [];
      existing.push(program);
      groupedPrograms.set(ownerId, existing);
    }
    const groupedRows = new Map<string, ExportRow[]>();
    let exportRowCount = 0;
    for (const organization of organizations) {
      const rows = buildProgramRows(groupedPrograms.get(organization.id) ?? []);
      groupedRows.set(organization.id, rows);
      exportRowCount += rows.length;
    }
    assertExportWithinRowLimit(exportRowCount);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await this.loadTemplateBuffer()) as any);

    const templateSheets = new Set([
      GOALS_TEMPLATE_SHEET,
      BASIC_TEMPLATE_SHEET,
      EXTENDED_TEMPLATE_SHEET,
    ]);
    for (const sheet of [...workbook.worksheets]) {
      if (!templateSheets.has(sheet.name)) {
        workbook.removeWorksheet(sheet.id);
      }
    }

    const goalsSheet = workbook.getWorksheet(GOALS_TEMPLATE_SHEET);
    if (!goalsSheet) {
      throw new Error('Goals template sheet is missing');
    }
    this.populateGoalsSheet(
      goalsSheet,
      cluster.name,
      cluster.finishLineClusters,
    );

    for (const organization of organizations) {
      const entries = groupedRows.get(organization.id) ?? [];
      const basicName = this.makeUniqueSheetName(
        workbook,
        `${organization.sheetLabel} - Basic AIP Form`,
      );
      const extendedName = this.makeUniqueSheetName(
        workbook,
        `${organization.sheetLabel} - Extended AIP Form`,
      );
      const basicSheet = this.cloneTemplateSheet(
        workbook,
        BASIC_TEMPLATE_SHEET,
        basicName,
      );
      const extendedSheet = this.cloneTemplateSheet(
        workbook,
        EXTENDED_TEMPLATE_SHEET,
        extendedName,
      );
      const layout = this.buildBasicLayout(entries);
      this.populateBasicSheet(basicSheet, fiscalYear, organization, layout);
      this.populateExtendedSheet(
        extendedSheet,
        fiscalYear,
        organization,
        layout,
        basicName,
      );
    }

    const basicTemplate = workbook.getWorksheet(BASIC_TEMPLATE_SHEET);
    if (basicTemplate) workbook.removeWorksheet(basicTemplate.id);
    const extendedTemplate = workbook.getWorksheet(EXTENDED_TEMPLATE_SHEET);
    if (extendedTemplate) workbook.removeWorksheet(extendedTemplate.id);

    // Cover sheet with export provenance + stats, placed before GOALS.
    const metaSheet = workbook.addWorksheet('Export Info');
    this.populateMetadataSheet(metaSheet, {
      fiscalYear,
      clusterName: cluster.name,
      clusterFullName: cluster.fullName,
      user,
      organizations,
      groupedPrograms,
      programs,
    });
    // `orderNo` drives sheet order on write but is absent from ExcelJS's types.
    const orderOf = (sheet: ExcelJS.Worksheet) =>
      (sheet as unknown as { orderNo?: number }).orderNo ?? 0;
    const minOrderNo = Math.min(...workbook.worksheets.map(orderOf));
    (metaSheet as unknown as { orderNo: number }).orderNo = minOrderNo - 1;

    // Make the workbook read-only: protect every sheet (cells stay selectable
    // and copyable, but cannot be edited without removing protection).
    for (const sheet of workbook.worksheets) {
      await sheet.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
      });
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer()) as Buffer;
    return {
      buffer,
      fileName: this.buildFileName(fiscalYear, cluster.name),
    };
  }

  private populateMetadataSheet(
    worksheet: ExcelJS.Worksheet,
    data: {
      fiscalYear: number;
      clusterName: string;
      clusterFullName: string | null;
      user: JwtPayload;
      organizations: ExportOrganization[];
      groupedPrograms: Map<string, ExportProgram[]>;
      programs: ExportProgram[];
    },
  ) {
    const {
      fiscalYear,
      clusterName,
      clusterFullName,
      user,
      organizations,
      groupedPrograms,
      programs,
    } = data;

    const paCount = programs.reduce(
      (sum, program) => sum + program.projectActivities.length,
      0,
    );
    const totalOf = (
      pick: (p: ExportProgram) => Prisma.Decimal,
    ): Prisma.Decimal =>
      programs.reduce((acc, program) => acc.plus(pick(program)), ZERO);
    const exportedBy =
      `${user.firstName} ${user.lastName}`.trim() || user.email;
    const exportedAt = `${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`;

    worksheet.columns = [{ width: 30 }, { width: 50 }, { width: 14 }];

    const title = worksheet.getCell('A1');
    title.value = `${fiscalYear} AIP CLUSTER EXPORT`;
    title.font = { bold: true, size: 14 };
    worksheet.mergeCells('A1:C1');

    let row = 3;
    const field = (label: string, value: string | number) => {
      const labelCell = worksheet.getCell(`A${row}`);
      labelCell.value = label;
      labelCell.font = { bold: true };
      worksheet.getCell(`B${row}`).value = value;
      row += 1;
    };
    const money = (label: string, amount: Prisma.Decimal) => {
      const labelCell = worksheet.getCell(`A${row}`);
      labelCell.value = label;
      labelCell.font = { bold: true };
      const valueCell = worksheet.getCell(`B${row}`);
      valueCell.value = Number(amount.toFixed(2));
      valueCell.numFmt = '#,##0.00';
      row += 1;
    };
    const sectionHeader = (label: string) => {
      const cell = worksheet.getCell(`A${row}`);
      cell.value = label;
      cell.font = { bold: true };
      row += 1;
    };

    field(
      'Cluster',
      clusterFullName ? `${clusterName} — ${clusterFullName}` : clusterName,
    );
    field('Fiscal Year', fiscalYear);
    field('Exported At', exportedAt);
    field('Exported By', `${exportedBy} (${user.email})`);
    field(
      'Requested By Role',
      user.identityType ? `${user.role} · ${user.identityType}` : user.role,
    );

    row += 1;
    sectionHeader('SUMMARY');
    field('Programs', programs.length);
    field('Projects & Activities', paCount);
    // Phase 1 D17: the proposed family, matching the registry — the line-item
    // rollups (grandTotal/psTotal/…) are structurally 0.
    money(
      'Total Budget (₱)',
      totalOf((p) => p.proposedTotal),
    );
    money(
      '  Personnel Services (PS)',
      totalOf((p) => p.psProposedTotal),
    );
    money(
      '  MOOE',
      totalOf((p) => p.mooeProposedTotal),
    );
    money(
      '  Financial Expenses (FE)',
      totalOf((p) => p.feProposedTotal),
    );
    money(
      '  Capital Outlay (CO)',
      totalOf((p) => p.coProposedTotal),
    );

    row += 1;
    sectionHeader('OFFICES INCLUDED');
    ['Office', 'Department / Organization', 'Programs'].forEach(
      (heading, i) => {
        const cell = worksheet.getCell(row, i + 1);
        cell.value = heading;
        cell.font = { bold: true };
        cell.border = FULL_BORDER;
      },
    );
    row += 1;
    for (const organization of organizations) {
      const count = groupedPrograms.get(organization.id)?.length ?? 0;
      worksheet.getCell(row, 1).value = organization.sheetLabel;
      worksheet.getCell(row, 2).value = organization.displayName;
      worksheet.getCell(row, 3).value = count;
      for (let col = 1; col <= 3; col += 1) {
        worksheet.getCell(row, col).border = FULL_BORDER;
      }
      row += 1;
    }
  }

  private populateGoalsSheet(
    worksheet: ExcelJS.Worksheet,
    clusterName: string,
    finishLines: Array<{
      finishLine: {
        id: string;
        name: string;
        fullName: string;
        visionNumber: number | null;
      };
    }>,
  ) {
    worksheet.getCell('A1').value = clusterName.toUpperCase();
    for (const cell of ['B1', 'C1', 'D1']) {
      worksheet.getCell(cell).value = clusterName.toUpperCase();
    }

    for (let row = 3; row <= worksheet.rowCount; row += 1) {
      for (const col of ['A', 'B', 'C', 'D']) {
        worksheet.getCell(`${col}${row}`).value = null;
      }
    }

    finishLines.forEach(({ finishLine }, index) => {
      const row = 3 + index;
      worksheet.getCell(`A${row}`).value = finishLine.visionNumber
        ? `Vision ${finishLine.visionNumber}: ${finishLine.fullName}`
        : finishLine.fullName;
      worksheet.getCell(`B${row}`).value = null;
      worksheet.getCell(`C${row}`).value = null;
      worksheet.getCell(`D${row}`).value = null;
    });
  }

  /**
   * Assign every row its absolute sheet position, once, before anything is
   * written.
   *
   * Sections are variable-length, so an entry's row is no longer
   * `START + index` — and the Extended sheet cross-references Basic rows by
   * formula, so it has to read the same numbers this produces rather than
   * recompute them. An empty section still occupies one blank row, which keeps
   * it visible as a section and makes the all-Operations case come out at
   * `entries.length + 5` rows, exactly as before.
   */
  private buildBasicLayout(entries: ExportRow[]): BasicLayout {
    const sections = BASIC_SECTIONS.map((section) => ({
      label: section.label,
      // Legacy rows carry no papClass and belong to Operations.
      entries: entries.filter(
        (entry) => (entry.papClass ?? PapClass.OPERATIONS) === section.papClass,
      ),
      headerRow: 0,
      blankRow: null as number | null,
      placed: [] as PlacedRow[],
    }));

    let row = BASIC_DATA_START_ROW;
    for (const section of sections) {
      section.headerRow = row;
      row += 1;
      if (section.entries.length === 0) {
        section.blankRow = row;
        row += 1;
        continue;
      }
      for (const entry of section.entries) {
        section.placed.push({ entry, row });
        row += 1;
      }
    }

    return {
      sections,
      placed: sections.flatMap((section) => section.placed),
      rowCount: row - BASIC_DATA_START_ROW,
      totalRow: row,
    };
  }

  private populateBasicSheet(
    worksheet: ExcelJS.Worksheet,
    fiscalYear: number,
    organization: ExportOrganization,
    layout: BasicLayout,
  ) {
    worksheet.getCell('A1').value =
      `${fiscalYear} ANNUAL INVESTMENT PROGRAM (AIP)`;
    worksheet.getCell('A4').value =
      `Department/Office: ${organization.displayName.toUpperCase()}`;

    this.resizeBasicSheet(worksheet, Math.max(layout.rowCount, 6));
    for (const section of layout.sections) {
      this.populateBasicCategoryRow(
        worksheet,
        section.headerRow,
        section.label,
      );
      if (section.blankRow !== null) {
        this.clearBasicRow(section.blankRow, worksheet);
      }
    }

    for (const { entry, row: rowNumber } of layout.placed) {
      // Re-apply a full box border to every cell first; later style edits spread
      // the (now bordered) style, so the border survives. Parent rows null their
      // C–O values but keep this border.
      for (const col of BASIC_ROW_COLUMNS) {
        applyBorder(worksheet.getCell(`${col}${rowNumber}`));
      }

      const codeCell = worksheet.getCell(`A${rowNumber}`);
      codeCell.value = entry.code;
      applyCellStyle(codeCell, { vertical: 'top', wrapText: true });

      const descCell = worksheet.getCell(`B${rowNumber}`);
      descCell.value = this.formatNumberedDescription(entry);
      // Only parent grouping rows are bold (mirrors the reference workbook).
      applyCellStyle(
        descCell,
        { indent: 0, horizontal: 'left', vertical: 'top', wrapText: true },
        undefined,
        entry.isParent,
      );

      if (entry.isParent) {
        // Parent rows show code + bold description only; budget, schedule and
        // funding columns roll up from the leaf rows below and stay blank here.
        for (const col of [
          'C',
          'D',
          'E',
          'F',
          'G',
          'H',
          'I',
          'J',
          'K',
          'L',
          'M',
          'N',
          'O',
        ]) {
          worksheet.getCell(`${col}${rowNumber}`).value = null;
        }
        continue;
      }

      const centerTop = {
        horizontal: 'center',
        vertical: 'top',
        wrapText: true,
      } as const;
      const amountAlign = { horizontal: 'center', vertical: 'top' } as const;
      this.setLeafCell(
        worksheet,
        `C${rowNumber}`,
        entry.implementingOfficeLabel,
        centerTop,
      );
      this.setLeafCell(
        worksheet,
        `D${rowNumber}`,
        toMonthLabel(entry.startMonth, entry.startYear, fiscalYear),
        centerTop,
        '@',
      );
      this.setLeafCell(
        worksheet,
        `E${rowNumber}`,
        toMonthLabel(entry.endMonth, entry.endYear, fiscalYear),
        centerTop,
        '@',
      );
      this.setLeafCell(
        worksheet,
        `F${rowNumber}`,
        entry.expectedOutput || null,
        {
          horizontal: 'left',
          vertical: 'top',
          wrapText: true,
        },
      );
      this.setLeafCell(
        worksheet,
        `G${rowNumber}`,
        formatFundSources(entry.fundSources),
        { horizontal: 'center', vertical: 'top', wrapText: true },
      );
      this.setLeafCell(
        worksheet,
        `H${rowNumber}`,
        toExcelAmount(entry.psAmount),
        amountAlign,
        AMOUNT_FORMAT,
      );
      this.setLeafCell(
        worksheet,
        `I${rowNumber}`,
        toExcelAmount(entry.mooeAmount),
        amountAlign,
        AMOUNT_FORMAT,
      );
      this.setLeafCell(
        worksheet,
        `J${rowNumber}`,
        toExcelAmount(entry.feAmount),
        amountAlign,
        AMOUNT_FORMAT,
      );
      this.setLeafCell(
        worksheet,
        `K${rowNumber}`,
        toExcelAmount(entry.coAmount),
        amountAlign,
        AMOUNT_FORMAT,
      );
      // Not SUM(H:K): most rows carry a proposedBudget with no per-expense-class
      // split, so a column sum would render the whole export as 0.00.
      this.setLeafCell(
        worksheet,
        `L${rowNumber}`,
        toExcelAmount(entry.totalAmount),
        amountAlign,
        AMOUNT_FORMAT,
      );
      this.setLeafCell(
        worksheet,
        `M${rowNumber}`,
        toExcelAmount(entry.ccaTotal),
        amountAlign,
        AMOUNT_FORMAT,
      );
      this.setLeafCell(
        worksheet,
        `N${rowNumber}`,
        toExcelAmount(entry.ccmTotal),
        amountAlign,
        AMOUNT_FORMAT,
      );
      this.setLeafCell(
        worksheet,
        `O${rowNumber}`,
        entry.climateCodes.length > 0 ? entry.climateCodes.join(', ') : null,
        centerTop,
      );
    }

    const totalRow = layout.totalRow;
    for (const col of BASIC_ROW_COLUMNS) {
      applyBorder(worksheet.getCell(`${col}${totalRow}`));
    }
    const totalLabel = worksheet.getCell(`A${totalRow}`);
    totalLabel.value = 'TOTAL';
    applyCellStyle(totalLabel, {}, undefined, true);
    for (const col of ['H', 'I', 'J', 'K', 'L']) {
      const cell = worksheet.getCell(`${col}${totalRow}`);
      // Spans the section headers too, which is harmless — they are merged rows
      // with no value in the amount columns — and keeps one range across all
      // three sections rather than a sum of per-section sums.
      cell.value =
        layout.placed.length === 0
          ? 0
          : {
              formula: `SUM(${col}${BASIC_DATA_START_ROW}:${col}${totalRow - 1})`,
            };
      applyCellStyle(cell, { horizontal: 'center' }, AMOUNT_FORMAT, false);
    }
    // The reference TOTAL row stops at column L; clear any cloned climate cells.
    for (const col of ['M', 'N', 'O']) {
      worksheet.getCell(`${col}${totalRow}`).value = null;
    }
  }

  private setLeafCell(
    worksheet: ExcelJS.Worksheet,
    address: string,
    value: ExcelJS.CellValue,
    alignment: Partial<ExcelJS.Alignment>,
    numFmt?: string,
  ) {
    const cell = worksheet.getCell(address);
    cell.value = value;
    applyCellStyle(cell, alignment, numFmt, false);
  }

  private populateExtendedSheet(
    worksheet: ExcelJS.Worksheet,
    fiscalYear: number,
    organization: ExportOrganization,
    layout: BasicLayout,
    basicSheetName: string,
  ) {
    worksheet.getCell('A1').value =
      `${fiscalYear} ANNUAL INVESTMENT PROGRAM (AIP)`;
    worksheet.getCell('A4').value =
      `Department/Office: ${organization.displayName.toUpperCase()}`;

    const rowCount = Math.max(layout.placed.length, 1);
    this.resizeExtendedSheet(worksheet, rowCount);
    for (let index = 0; index < rowCount; index += 1) {
      const rowNumber = EXTENDED_DATA_START_ROW + index;
      // Rows here are contiguous, but the Basic rows they point at are not:
      // section headers sit between them. Read the position off the layout
      // instead of assuming `start + index`, or the formulas drift by one per
      // preceding section and land on a header.
      const placed = layout.placed[index];
      if (!placed) {
        this.clearExtendedRow(rowNumber, worksheet);
        continue;
      }
      const basicRow = placed.row;

      worksheet.getCell(`A${rowNumber}`).value = {
        formula: `${this.quoteSheetName(basicSheetName)}!A${basicRow}`,
      };
      const descCell = worksheet.getCell(`B${rowNumber}`);
      descCell.value = {
        formula: `${this.quoteSheetName(basicSheetName)}!B${basicRow}`,
      };
      // The template underlines the first description row; clear it (detached
      // style, since duplicated rows share style objects — see applyCellStyle).
      descCell.style = {
        ...descCell.style,
        font: { ...descCell.font, underline: false },
      };
      // Column C is the template's "SDG / CDP Goal Being Addressed" heading.
      // Codes come off the owning program, already sorted by the query.
      const { sdgCodes } = placed.entry;
      worksheet.getCell(`C${rowNumber}`).value =
        sdgCodes.length > 0 ? sdgCodes.join(', ') : null;
      worksheet.getCell(`D${rowNumber}`).value = null;
      worksheet.getCell(`E${rowNumber}`).value = {
        formula: `${this.quoteSheetName(basicSheetName)}!F${basicRow}`,
      };
      worksheet.getCell(`F${rowNumber}`).value = null;
      worksheet.getCell(`G${rowNumber}`).value = null;
      worksheet.getCell(`H${rowNumber}`).value = {
        formula: `${this.quoteSheetName(basicSheetName)}!L${basicRow}`,
      };
      worksheet.getCell(`I${rowNumber}`).value = null;
      worksheet.getCell(`J${rowNumber}`).value = null;
    }
  }

  private resizeBasicSheet(worksheet: ExcelJS.Worksheet, rowCount: number) {
    if (rowCount > BASIC_TEMPLATE_DATA_ROWS) {
      worksheet.duplicateRow(
        BASIC_DATA_START_ROW + BASIC_TEMPLATE_DATA_ROWS - 1,
        rowCount - BASIC_TEMPLATE_DATA_ROWS,
        true,
      );
      return;
    }

    if (rowCount < BASIC_TEMPLATE_DATA_ROWS) {
      worksheet.spliceRows(
        BASIC_DATA_START_ROW + rowCount,
        BASIC_TEMPLATE_DATA_ROWS - rowCount,
      );
    }
  }

  private resizeExtendedSheet(worksheet: ExcelJS.Worksheet, rowCount: number) {
    if (rowCount > EXTENDED_TEMPLATE_DATA_ROWS) {
      worksheet.duplicateRow(
        EXTENDED_DATA_START_ROW + EXTENDED_TEMPLATE_DATA_ROWS - 1,
        rowCount - EXTENDED_TEMPLATE_DATA_ROWS,
        true,
      );
      return;
    }

    if (rowCount < EXTENDED_TEMPLATE_DATA_ROWS) {
      worksheet.spliceRows(
        EXTENDED_DATA_START_ROW + rowCount,
        EXTENDED_TEMPLATE_DATA_ROWS - rowCount,
      );
    }
  }

  private populateBasicCategoryRow(
    worksheet: ExcelJS.Worksheet,
    rowNumber: number,
    label: string,
  ) {
    this.unmergeRow(worksheet, rowNumber);
    for (const col of BASIC_ROW_COLUMNS) {
      const cell = worksheet.getCell(`${col}${rowNumber}`);
      cell.value = null;
      // Detach from the shared (duplicated-row) style before editing — see applyCellStyle.
      const style = {
        ...cell.style,
        font: { ...cell.font, bold: true },
        border: FULL_BORDER,
      };
      delete (style as Partial<ExcelJS.Style>).fill;
      cell.style = style;
    }
    worksheet.mergeCells(rowNumber, 1, rowNumber, BASIC_ROW_COLUMNS.length);
    const labelCell = worksheet.getCell(`A${rowNumber}`);
    labelCell.value = label;
    applyCellStyle(
      labelCell,
      { horizontal: 'left', vertical: 'middle' },
      undefined,
      true,
    );
  }

  private formatNumberedDescription(entry: ExportRow): string {
    if (entry.continuation) return '';
    // Strip a leading outline prefix (e.g. "3.1.2 ", "II. ") only when it is
    // followed by whitespace — otherwise names that legitimately start with a
    // number ("79th Charter Anniversary", "41st Anniversary…") get truncated.
    const name = entry.description
      .replace(/^\s*(?:[IVXLCDM]+\.|\d+(?:\.\d+)*\.?)\s+/i, '')
      .trim();
    return `3.${entry.numbering.join('.')} ${name}`;
  }

  private buildOrganizations(cluster: {
    offices: Array<{ id: string; acronym: string; name: string }>;
  }): ExportOrganization[] {
    // Programs are LGU-only: a cluster's proponents are its city offices.
    return cluster.offices.map((office) => ({
      id: office.id,
      sheetLabel: office.acronym,
      displayName: office.name,
      implementingOfficeLabel: office.acronym,
    }));
  }

  private cloneTemplateSheet(
    workbook: ExcelJS.Workbook,
    sourceSheetName: string,
    targetSheetName: string,
  ): ExcelJS.Worksheet {
    const source = workbook.getWorksheet(sourceSheetName);
    if (!source) {
      throw new Error(`Template sheet ${sourceSheetName} is missing`);
    }
    const clone = workbook.addWorksheet(targetSheetName);
    const model = JSON.parse(
      JSON.stringify(source.model),
    ) as typeof source.model;
    model.name = targetSheetName;
    clone.model = model;
    const sourceMerges = (source as WorksheetWithMerges)._merges ?? {};
    for (const merge of Object.values(sourceMerges)) {
      clone.mergeCells(merge.range);
    }
    return clone;
  }

  private makeUniqueSheetName(
    workbook: ExcelJS.Workbook,
    requestedName: string,
  ): string {
    const limit = 31;
    const existing = new Set(workbook.worksheets.map((sheet) => sheet.name));
    const base = requestedName.slice(0, limit);
    if (!existing.has(base)) return base;

    let index = 2;
    while (index < 100) {
      const suffix = ` (${index})`;
      const candidate = `${base.slice(0, limit - suffix.length)}${suffix}`;
      if (!existing.has(candidate)) return candidate;
      index += 1;
    }

    throw new Error('Unable to create a unique worksheet name');
  }

  private async resolveAuthorizedCluster(
    requestedClusterId: string | undefined,
    user: JwtPayload,
  ) {
    if (
      user.role === Role.SUPER_ADMIN ||
      user.identityType === IdentityType.LFC
    ) {
      if (!requestedClusterId) {
        throw new BadRequestException('clusterId is required for this export');
      }
      const cluster = await this.prisma.cluster.findUnique({
        where: { id: requestedClusterId },
        select: { id: true, name: true },
      });
      if (!cluster) {
        throw new NotFoundException('Cluster not found');
      }
      return cluster;
    }

    /**
     * A requested cluster is honoured when the caller's office scope reaches into
     * it. Previously the request was **discarded** for everyone but SUPER_ADMIN
     * and LFC, and replaced with the caller's home-office cluster — so a CPDO
     * encoder scoped to the eight Economy offices picked "Economy" and silently
     * received the Governance workbook, because CPDO sits in Governance.
     *
     * Scope, not home office, is the authority: it is what an admin actually
     * assigned. The home cluster stays as the fallback for a user with no grants,
     * which is every user this endpoint served correctly before.
     */
    const scope = await this.officeScope.effectiveOfficeIds(user);

    if (requestedClusterId) {
      const cluster = await this.prisma.cluster.findUnique({
        where: { id: requestedClusterId },
        select: { id: true, name: true },
      });
      if (!cluster) throw new NotFoundException('Cluster not found');

      const reachable =
        scope === ALL_OFFICES ||
        (await this.prisma.office.count({
          where: { clusterId: cluster.id, id: { in: scope } },
        })) > 0;
      if (!reachable) {
        throw new ForbiddenException(
          `You have no offices in ${cluster.name}, so it cannot be exported`,
        );
      }
      return cluster;
    }

    const clusterId = await this.resolveUserClusterId(user);
    if (!clusterId) {
      throw new ForbiddenException(
        'User is not linked to an exportable cluster',
      );
    }
    const cluster = await this.prisma.cluster.findUnique({
      where: { id: clusterId },
      select: { id: true, name: true },
    });
    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }
    return cluster;
  }

  private async resolveUserClusterId(user: JwtPayload): Promise<string | null> {
    if (user.officeId) {
      const office = await this.prisma.office.findUnique({
        where: { id: user.officeId },
        select: { clusterId: true },
      });
      return office?.clusterId ?? null;
    }
    if (user.civilSocietyOrganizationId) {
      const cso = await this.prisma.civilSocietyOrganization.findUnique({
        where: { id: user.civilSocietyOrganizationId },
        select: { clusterId: true },
      });
      return cso?.clusterId ?? null;
    }
    return null;
  }

  private async listProgramsForExport(
    clusterId: string,
    cycleId: string,
    scope: typeof ALL_OFFICES | string[],
  ) {
    const where: Prisma.ProgramWhereInput = {
      ...LIVE_PROGRAM,
      aipCycleId: cycleId,
      office:
        scope === ALL_OFFICES
          ? { clusterId }
          : { clusterId, id: { in: scope } },
    };

    return this.prisma.program.findMany({
      where,
      orderBy: [{ office: { acronym: 'asc' } }, { createdAt: 'asc' }],
      include: {
        office: {
          select: { id: true, acronym: true, name: true },
        },
        supportingOffices: {
          include: {
            office: {
              select: { id: true, acronym: true, name: true },
            },
          },
        },
        sdgGoals: {
          include: { sdgGoal: { select: { code: true } } },
          orderBy: { sdgGoal: { code: 'asc' } },
        },
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

  private buildFileName(fiscalYear: number, clusterName: string): string {
    const safeCluster = clusterName
      .trim()
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return `aip-${fiscalYear}-${safeCluster || 'cluster'}-export.xlsx`;
  }

  private clearBasicRow(rowNumber: number, worksheet: ExcelJS.Worksheet) {
    this.unmergeRow(worksheet, rowNumber);
    for (const col of BASIC_ROW_COLUMNS) {
      const cell = worksheet.getCell(`${col}${rowNumber}`);
      cell.value = null;
      applyBorder(cell);
    }
  }

  private clearExtendedRow(rowNumber: number, worksheet: ExcelJS.Worksheet) {
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
      worksheet.getCell(`${col}${rowNumber}`).value = null;
    }
  }

  private unmergeRow(worksheet: ExcelJS.Worksheet, rowNumber: number) {
    const merges = (worksheet as WorksheetWithMerges)._merges ?? {};
    for (const merge of Object.values(merges)) {
      const [start, end] = merge.range.split(':');
      if (!start || !end) continue;
      const startCell = worksheet.getCell(start);
      const endCell = worksheet.getCell(end);
      const startRow = Number(startCell.row);
      const endRow = Number(endCell.row);
      if (startRow <= rowNumber && endRow >= rowNumber) {
        worksheet.unMergeCells(merge.range);
      }
    }
  }

  private quoteSheetName(sheetName: string): string {
    return `'${sheetName.replace(/'/g, "''")}'`;
  }

  private async loadTemplateBuffer(): Promise<Buffer> {
    const fileName = process.env.AIP_TEMPLATE_FILE ?? DEFAULT_TEMPLATE_FILE;
    const templateDir = resolve(process.cwd(), TEMPLATE_DIR_NAME);
    if (fileName !== basename(fileName)) {
      throw new Error(
        'Invalid AIP template file name. Configure AIP_TEMPLATE_FILE with a ' +
          'file name from the templates directory.',
      );
    }
    const filePath = resolve(templateDir, fileName);
    try {
      const [realTemplateDir, realFilePath] = await Promise.all([
        realpath(templateDir),
        realpath(filePath),
      ]);
      // Containment guard: a misconfigured AIP_TEMPLATE_FILE or symlink under
      // templates/ must never let us read outside the templates directory.
      const prefix = realTemplateDir + sep;
      if (
        realFilePath !== realTemplateDir &&
        !realFilePath.startsWith(prefix)
      ) {
        throw new Error('Template path escaped templates directory');
      }
      return await readFile(realFilePath);
    } catch {
      throw new Error(
        'AIP export template not found. Ensure the template file is present ' +
          'in the templates directory or configure AIP_TEMPLATE_FILE correctly.',
      );
    }
  }
}
