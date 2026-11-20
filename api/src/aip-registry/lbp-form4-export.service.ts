import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ALL_OFFICES,
  OfficeScopeService,
} from '../permissions/office-scope.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { ExportType, type FundSource } from '../generated/prisma/index';
import {
  applyBorder,
  applyCellStyle,
  applyFill,
  applyFont,
  assertExportWithinRowLimit,
} from './excel-style.js';
import {
  gapsOf,
  loadLbpSource,
  moneyOnFund,
  sheetOfficeId,
  type LbpFigures,
  type Money,
} from './lbp-figures.js';
import {
  buildOfficeSheet,
  COMPONENT_BAND,
  type OfficeSheet,
  type SheetRow,
} from './office-sheet.js';
import {
  draftBanner,
  FONT,
  fundLabel,
  headerCells,
  PESO_FORMAT,
  pesoCell,
  protectAll,
  sheetName,
  signatureBlock,
  wideCell,
  withExportLog,
  writeNotesSheet,
} from './lbp-workbook.js';
import { getBrand, getPlaceName } from '../common/brand.js';

/**
 * LBP Form No. 4 — Mandate, Vision/Mission, Major Final Output, Performance
 * Indicators and Targets — as a read-only workbook, one sheet per office
 * (specs/008 US1, contracts/exports.md).
 *
 * The rows are the Word Annual Budget's (`office-sheet.ts`), with an FE column
 * and the money narrowed to one fund. Access follows that export: offices in
 * the caller's scope; the whole book only when `officeId` is omitted.
 */

const WIDTH = 10; // A code … J Total
const MONEY_FROM = 6; // column F
const SECTION_FILL = 'FFD9D9D9';
const BAND_FILL = 'FFBFBFBF';
const TOTAL_FILL = 'FFFCE4D6';

type Office = {
  id: string;
  name: string;
  acronym: string;
  mandateLegalBasis: string | null;
  vision: string | null;
  mission: string | null;
  organizationalOutcomes: string[];
};

export interface LbpWorkbook {
  buffer: Buffer;
  fileName: string;
}

@Injectable()
export class LbpForm4ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly officeScope: OfficeScopeService,
  ) {}

  async export(
    query: {
      cycleId: string;
      officeId?: string;
      fund: FundSource;
      figures: LbpFigures;
      documentId?: string;
    },
    user: JwtPayload,
  ): Promise<LbpWorkbook> {
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id: query.cycleId },
      select: { id: true, fiscalYear: true },
    });
    if (!cycle) throw new NotFoundException('AIP cycle not found');

    const scope = await this.officeScope.effectiveOfficeIds(user);
    if (
      query.officeId &&
      scope !== ALL_OFFICES &&
      !scope.includes(query.officeId)
    )
      throw new ForbiddenException(
        'You can only export an office within your assigned scope',
      );
    const allowed: string[] | 'ALL' = query.officeId
      ? [query.officeId]
      : scope === ALL_OFFICES
        ? 'ALL'
        : scope;

    const offices = await this.prisma.office.findMany({
      where: allowed === 'ALL' ? { isActive: true } : { id: { in: allowed } },
      orderBy: [
        { officeType: { sort: 'asc', nulls: 'last' } },
        { officeCode: { sort: 'asc', nulls: 'last' } },
        { acronym: 'asc' },
      ],
    });
    if (query.officeId && offices.length === 0)
      throw new NotFoundException('Office not found');

    const label = query.officeId ? offices[0].acronym : 'ALL';
    const fileName =
      `LBP4-${cycle.fiscalYear}-${label.replace(/[^A-Za-z0-9-]+/g, '-')}-${query.fund}` +
      `${query.figures === 'working' ? '-DRAFT' : ''}.xlsx`;

    return withExportLog(
      this.prisma,
      {
        type: query.officeId ? ExportType.LBP4_OFFICE : ExportType.LBP4_BOOK,
        cycleId: cycle.id,
        fileName,
        user,
        filters: {
          cycleId: cycle.id,
          officeId: query.officeId ?? null,
          fund: query.fund,
          figures: query.figures,
          ...(query.documentId ? { documentId: query.documentId } : {}),
        },
      },
      async () => ({
        buffer: await this.build(cycle.fiscalYear, cycle.id, offices, {
          ...query,
          scope:
            scope === ALL_OFFICES
              ? 'All offices'
              : offices.map((o) => o.acronym).join(', '),
          single: !!query.officeId,
        }),
        fileName,
      }),
    );
  }

  private async build(
    fiscalYear: number,
    cycleId: string,
    offices: Office[],
    options: {
      fund: FundSource;
      figures: LbpFigures;
      documentId?: string;
      scope: string;
      single: boolean;
    },
  ): Promise<Buffer> {
    const loaded = await loadLbpSource(
      this.prisma,
      { cycleId, figures: options.figures, documentId: options.documentId },
      offices.map((o) => o.id),
    );
    assertExportWithinRowLimit(loaded.rowCount);
    const moneyOf = moneyOnFund(options.fund);

    const workbook = new ExcelJS.Workbook();
    const notes = workbook.addWorksheet('Notes');
    const taken = new Set(['Notes']);
    for (const office of offices) {
      const programs = loaded.programs.filter(
        (p) => sheetOfficeId(p) === office.id,
      );
      // The book prints offices with programs in the cycle; a single office
      // always gets its sheet, empty or not.
      if (!options.single && programs.length === 0) continue;
      const sheet = workbook.addWorksheet(sheetName(office.acronym, taken));
      this.writeOfficeSheet(
        sheet,
        fiscalYear,
        office,
        options,
        buildOfficeSheet(office.id, programs, moneyOf),
      );
    }

    const gaps = gapsOf(loaded.programs, options.figures, loaded.publishedIds);
    writeNotesSheet(notes, {
      form: 'LBP Form No. 4',
      fiscalYear,
      fund: options.fund,
      figures: options.figures,
      sourceLabel: loaded.sourceLabel,
      scope: options.scope,
      gaps: [
        ...(options.figures === 'working'
          ? [{ title: 'Not yet published', rows: gaps.unpublished }]
          : []),
        {
          title: 'No fund source — counted as General Fund',
          rows: gaps.noFund,
        },
        {
          title: 'Left out: several funds, not split',
          rows: gaps.multiFund,
        },
      ],
    });

    await protectAll(workbook);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  writeOfficeSheet(
    sheet: ExcelJS.Worksheet,
    fiscalYear: number,
    office: Office,
    options: { fund: FundSource; figures: LbpFigures },
    model: OfficeSheet,
  ) {
    sheet.columns = [
      { width: 26 },
      { width: 40 },
      { width: 24 },
      { width: 26 },
      { width: 18 },
      { width: 15 },
      { width: 15 },
      { width: 13 },
      { width: 15 },
      { width: 16 },
    ];
    let row = 1;
    if (options.figures === 'working') {
      draftBanner(sheet, WIDTH);
      row += 1;
    }
    const line = (text: string, size: number, bold = true) => {
      const cell = wideCell(sheet, row, WIDTH, text);
      applyCellStyle(cell, { horizontal: 'center' });
      applyFont(cell, { name: FONT, size, bold });
      row += 1;
    };
    line('LBP Form No. 4', 10, false);
    line(
      `MANDATE, VISION/MISSION, MAJOR FINAL OUTPUT, PERFORMANCE INDICATORS AND TARGETS FY ${fiscalYear}`,
      12,
    );
    line(getPlaceName(), 11);
    row += 1;

    const field = (label: string, value: string) => {
      const labelCell = sheet.getCell(row, 1);
      labelCell.value = label;
      applyFont(labelCell, { name: FONT, bold: true });
      sheet.mergeCells(row, 2, row, WIDTH);
      const valueCell = sheet.getCell(row, 2);
      valueCell.value = value;
      applyCellStyle(valueCell, { wrapText: true, vertical: 'top' });
      row += 1;
    };
    field('Department/Office', office.name.toUpperCase());
    field('Fund', fundLabel(options.fund));
    field('Mandate/Legal Basis', office.mandateLegalBasis ?? '');
    field('Vision', office.vision ?? '');
    field('Mission', office.mission ?? '');
    const outcomes = office.organizationalOutcomes.length
      ? office.organizationalOutcomes
      : [''];
    outcomes.forEach((outcome, index) =>
      field(index === 0 ? 'Organizational Outcome' : '', outcome),
    );
    row += 1;

    headerCells(sheet, row, [
      'AIP Reference Code',
      'Program/Project/Activity Description',
      'Major Final Output',
      'Performance Indicator',
      'Target for the Budget Year',
      'PS',
      'MOOE',
      'FE',
      'CO',
      'Total',
    ]);
    sheet.getRow(row).height = 30;
    sheet.views = [{ state: 'frozen', ySplit: row }];
    row += 1;

    for (const section of model.sections) {
      row = this.band(sheet, row, section.code, section.label, SECTION_FILL);
      row = this.dataRows(sheet, row, section.rows);
      row = this.totalRow(
        sheet,
        row,
        `SUB-TOTAL, ${section.label}`,
        section.total,
      );
    }
    row = this.totalRow(sheet, row, 'TOTAL', model.total);

    if (model.components.length) {
      row = this.band(sheet, row, '', COMPONENT_BAND, BAND_FILL);
      for (const group of model.components) {
        if (group.officeName)
          row = this.band(
            sheet,
            row,
            '',
            group.officeName.toUpperCase(),
            TOTAL_FILL,
          );
        row = this.dataRows(sheet, row, group.rows);
      }
      row = this.totalRow(
        sheet,
        row,
        `TOTAL, ${COMPONENT_BAND}`,
        model.componentTotal,
      );
      row = this.totalRow(sheet, row, 'GRAND TOTAL', model.grandTotal);
    }

    const { level, chiefExecutive } = getBrand();
    signatureBlock(sheet, row + 2, [
      { caption: 'Prepared by:', titles: ['Department Head'] },
      {
        caption: 'Reviewed by (Local Finance Committee):',
        titles: [
          `${level} Planning and Development Coordinator`,
          `${level} Budget Officer`,
          `${level} Treasurer`,
        ],
      },
      { caption: 'Approved by:', titles: [chiefExecutive] },
    ]);
  }

  private band(
    sheet: ExcelJS.Worksheet,
    row: number,
    code: string,
    label: string,
    fill: string,
  ): number {
    sheet.getCell(row, 1).value = code || null;
    sheet.mergeCells(row, 2, row, WIDTH);
    sheet.getCell(row, 2).value = label;
    for (let col = 1; col <= WIDTH; col++) {
      const cell = sheet.getCell(row, col);
      applyFill(cell, fill);
      applyFont(cell, { name: FONT, bold: true });
      applyBorder(cell);
    }
    return row + 1;
  }

  private dataRows(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    rows: SheetRow[],
  ): number {
    let row = startRow;
    let mfoStart = row;
    rows.forEach((entry, index) => {
      const values = [
        entry.code,
        entry.description,
        entry.mergedMfo ? null : entry.majorFinalOutput || null,
        entry.performanceIndicator || null,
        entry.target || null,
      ];
      values.forEach((value, i) => {
        const cell = sheet.getCell(row, i + 1);
        cell.value = value;
        applyCellStyle(
          cell,
          { vertical: 'top', wrapText: true },
          undefined,
          i < 2 ? entry.bold : false,
        );
        applyBorder(cell);
      });
      this.money(sheet, row, entry.money, entry.bold);
      // Close an MFO run when the next row starts a new one (or at the end).
      if (!entry.mergedMfo) mfoStart = row;
      const next = rows[index + 1];
      if ((!next || !next.mergedMfo) && row > mfoStart)
        sheet.mergeCells(mfoStart, 3, row, 3);
      row += 1;
    });
    return row;
  }

  private money(
    sheet: ExcelJS.Worksheet,
    row: number,
    money: Money,
    bold: boolean,
  ) {
    [money.ps, money.mooe, money.fe, money.co, money.total].forEach((v, i) => {
      const cell = sheet.getCell(row, MONEY_FROM + i);
      cell.value = pesoCell(v);
      applyCellStyle(
        cell,
        { horizontal: 'right', vertical: 'top' },
        PESO_FORMAT,
        bold,
      );
      applyBorder(cell);
    });
  }

  private totalRow(
    sheet: ExcelJS.Worksheet,
    row: number,
    label: string,
    money: Money,
  ): number {
    sheet.mergeCells(row, 1, row, MONEY_FROM - 1);
    sheet.getCell(row, 1).value = label;
    applyCellStyle(
      sheet.getCell(row, 1),
      { horizontal: 'right' },
      undefined,
      true,
    );
    this.money(sheet, row, money, true);
    for (let col = 1; col <= WIDTH; col++) {
      applyFill(sheet.getCell(row, col), TOTAL_FILL);
      applyBorder(sheet.getCell(row, col));
    }
    return row + 1;
  }
}
