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
import {
  ExportType,
  Form7Column,
  FundSource,
  type Prisma,
} from '../generated/prisma/index';
import {
  applyBorder,
  applyCellStyle,
  applyFill,
  applyFont,
  assertExportWithinRowLimit,
  ZERO,
} from './excel-style.js';
import {
  addMoney,
  gapsOf,
  loadLbpSource,
  moneyOnFund,
  sheetOfficeId,
  zeroMoney,
  type GapRow,
  type LbpFigures,
  type Money,
} from './lbp-figures.js';
import { programMoney } from './office-sheet.js';
import {
  moneyOnSpecialFund,
  SPECIAL_FUNDS,
  specialFundFigure,
} from '../aip-cycles/special-funds.service.js';
import {
  draftBanner,
  FONT,
  fundLabel,
  headerCells,
  PESO_FORMAT,
  pesoCell,
  protectAll,
  signatureBlock,
  wideCell,
  withExportLog,
  writeNotesSheet,
} from './lbp-workbook.js';
import type { LbpWorkbook } from './lbp-form4-export.service.js';
import { getBrand, getPlaceName } from '../common/brand.js';

/**
 * LBP Form No. 7 — Statement of Fund Allocation by Sector — for one fund, as a
 * read-only workbook (specs/008 US4, contracts/exports.md).
 *
 * Each office's money lands in the column set on the office
 * (`Office.form7Column`). On the General Fund's form the special funds (SPA,
 * LDF, LDRRMF) print as the three lump sums under TOTAL APPROPRIATIONS, built
 * from whatever any office's rows put on those funds (specs/016); their own
 * rows are not General Fund money, so they are in no column. The receipts block and the
 * per-account-code rows are laid out but blank until object-level (PPMP) data
 * exists (D4). City-wide by definition, so only all-offices users may export it.
 */

const COLUMNS: { key: Form7Column; label: string }[] = [
  { key: Form7Column.GENERAL_PUBLIC, label: 'General Public Services' },
  { key: Form7Column.SOCIAL, label: 'Social Services' },
  { key: Form7Column.ECONOMIC, label: 'Economic Services' },
  { key: Form7Column.ECONOMIC_ENTERPRISE, label: 'Economic Enterprises' },
];
const WIDTH = 2 + COLUMNS.length + 1; // Particulars, Account Code, 4 columns, Total

const CLASSES: { key: keyof Omit<Money, 'total'>; label: string }[] = [
  { key: 'ps', label: 'A. Personal Services' },
  { key: 'mooe', label: 'B. Maintenance and Other Operating Expenses' },
  { key: 'fe', label: 'C. Financial Expenses' },
  { key: 'co', label: 'D. Capital Outlay' },
];

export interface Form7Figures {
  byColumn: Record<Form7Column, Money>;
  appropriations: Money;
  lumpSums: { label: string; fund: FundSource; amount: Prisma.Decimal }[];
  grandTotal: Prisma.Decimal;
  unassigned: GapRow[];
  specialFundFlags: GapRow[];
}

@Injectable()
export class LbpForm7ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly officeScope: OfficeScopeService,
  ) {}

  async export(
    query: {
      cycleId: string;
      fund: FundSource;
      figures: LbpFigures;
      documentId?: string;
    },
    user: JwtPayload,
  ): Promise<LbpWorkbook> {
    if ((await this.officeScope.effectiveOfficeIds(user)) !== ALL_OFFICES)
      throw new ForbiddenException(
        'LBP Form 7 covers the whole LGU: only users who see every office can export it',
      );
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id: query.cycleId },
      select: { id: true, fiscalYear: true },
    });
    if (!cycle) throw new NotFoundException('AIP cycle not found');

    const fileName =
      `LBP7-${cycle.fiscalYear}-${query.fund}` +
      `${query.figures === 'working' ? '-DRAFT' : ''}.xlsx`;
    return withExportLog(
      this.prisma,
      {
        type: ExportType.LBP7,
        cycleId: cycle.id,
        fileName,
        user,
        filters: {
          cycleId: cycle.id,
          officeId: null,
          fund: query.fund,
          figures: query.figures,
          ...(query.documentId ? { documentId: query.documentId } : {}),
        },
      },
      async () => ({
        buffer: await this.build(cycle.fiscalYear, cycle.id, query),
        fileName,
      }),
    );
  }

  /** Every figure the form prints, kept apart from the writer so it can be checked. */
  async figures(
    cycleId: string,
    fund: FundSource,
    figures: LbpFigures,
    documentId?: string,
  ): Promise<
    Form7Figures & { loaded: Awaited<ReturnType<typeof loadLbpSource>> }
  > {
    const [offices, stated, loaded] = await Promise.all([
      this.prisma.office.findMany({
        select: { id: true, acronym: true, form7Column: true },
      }),
      this.prisma.fundStatedAmount.findMany({
        where: { aipCycleId: cycleId },
      }),
      loadLbpSource(this.prisma, { cycleId, figures, documentId }, 'ALL'),
    ]);
    assertExportWithinRowLimit(loaded.rowCount);
    const onFund = moneyOnFund(fund);

    const byColumn = Object.fromEntries(
      COLUMNS.map((c) => [c.key, zeroMoney()]),
    ) as Record<Form7Column, Money>;
    const unassigned: GapRow[] = [];
    const specialFundFlags: GapRow[] = [];

    for (const office of offices) {
      const money = loaded.programs
        .filter((p) => sheetOfficeId(p) === office.id)
        .map((p) => programMoney(p, onFund))
        .reduce(addMoney, zeroMoney());
      if (!office.form7Column) {
        if (!money.total.isZero())
          unassigned.push({
            officeAcronym: office.acronym,
            code: '',
            name: 'No Form 7 column set — left out of the columns',
            amount: money.total,
          });
        continue;
      }
      byColumn[office.form7Column] = addMoney(
        byColumn[office.form7Column],
        money,
      );
    }

    // The three rows always print, in the ordinance's order. Only the General
    // Fund's form fills them: on a special fund's own form its money is
    // already in the office columns.
    const lumpSums = SPECIAL_FUNDS.map(({ fund: lumpFund, name }) => {
      if (fund !== FundSource.GF)
        return { fund: lumpFund, label: name, amount: ZERO };
      const { total, count } = moneyOnSpecialFund(loaded.programs, lumpFund);
      const statedRow = stated.find((s) => s.fundSource === lumpFund);
      const { figure, flags } = specialFundFigure(
        total,
        count,
        statedRow?.statedAmount ?? null,
      );
      for (const flag of flags)
        specialFundFlags.push({
          officeAcronym: lumpFund,
          code:
            flag === 'STATED_WITHOUT_PPAS'
              ? 'stated, no PPAs'
              : 'stated ≠ programs',
          name: `Stated ₱${statedRow?.statedAmount.toFixed(2)}; programs ₱${total.toFixed(2)}`,
          amount: figure,
        });
      return { fund: lumpFund, label: name, amount: figure };
    });

    const appropriations = Object.values(byColumn).reduce(
      addMoney,
      zeroMoney(),
    );
    const grandTotal = lumpSums.reduce(
      (sum, l) => sum.plus(l.amount),
      appropriations.total,
    );
    return {
      byColumn,
      appropriations,
      lumpSums,
      grandTotal,
      unassigned,
      specialFundFlags,
      loaded,
    };
  }

  private async build(
    fiscalYear: number,
    cycleId: string,
    query: { fund: FundSource; figures: LbpFigures; documentId?: string },
  ): Promise<Buffer> {
    const f = await this.figures(
      cycleId,
      query.fund,
      query.figures,
      query.documentId,
    );
    const workbook = new ExcelJS.Workbook();
    const notes = workbook.addWorksheet('Notes');
    const sheet = workbook.addWorksheet('LBP Form 7');
    this.writeForm(sheet, fiscalYear, query, f);

    const gaps = gapsOf(
      f.loaded.programs,
      query.figures,
      f.loaded.publishedIds,
    );
    writeNotesSheet(notes, {
      form: 'LBP Form No. 7',
      sourceLabel: f.loaded.sourceLabel,
      fiscalYear,
      fund: query.fund,
      figures: query.figures,
      scope: 'All offices',
      gaps: [
        ...(query.figures === 'working'
          ? [{ title: 'Not yet published', rows: gaps.unpublished }]
          : []),
        {
          title: 'No fund source — counted as General Fund',
          rows: gaps.noFund,
        },
        { title: 'Left out: several funds, not split', rows: gaps.multiFund },
        { title: 'Offices with no Form 7 column', rows: f.unassigned },
        { title: 'Special funds: stated amounts', rows: f.specialFundFlags },
      ],
    });
    await protectAll(workbook);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private writeForm(
    sheet: ExcelJS.Worksheet,
    fiscalYear: number,
    query: { fund: FundSource; figures: LbpFigures },
    f: Form7Figures,
  ) {
    sheet.columns = [
      { width: 52 },
      { width: 16 },
      ...COLUMNS.map(() => ({ width: 20 })),
      { width: 20 },
    ];
    let row = 1;
    if (query.figures === 'working') {
      draftBanner(sheet, WIDTH);
      row += 1;
    }
    const line = (text: string, size: number, bold = true) => {
      const cell = wideCell(sheet, row, WIDTH, text);
      applyCellStyle(cell, { horizontal: 'center' });
      applyFont(cell, { name: FONT, size, bold });
      row += 1;
    };
    line('LBP Form No. 7', 10, false);
    line(`STATEMENT OF FUND ALLOCATION BY SECTOR, FY ${fiscalYear}`, 12);
    line(`${getPlaceName()} — ${fundLabel(query.fund)}`, 11);
    row += 1;

    headerCells(sheet, row, [
      'Particulars',
      'Account Code',
      ...COLUMNS.map((c) => c.label),
      'Total',
    ]);
    sheet.getRow(row).height = 30;
    row += 1;

    const amounts = (values: (Prisma.Decimal | null)[], bold = false) => {
      values.forEach((v, i) => {
        const cell = sheet.getCell(row, 3 + i);
        cell.value = v === null ? null : pesoCell(v);
        applyCellStyle(cell, { horizontal: 'right' }, PESO_FORMAT, bold);
        applyBorder(cell);
      });
    };
    const label = (text: string, bold = false, indent = 0) => {
      const cell = sheet.getCell(row, 1);
      cell.value = text;
      applyCellStyle(cell, { indent, wrapText: true }, undefined, bold);
      applyBorder(cell);
      applyBorder(sheet.getCell(row, 2));
    };
    const blank = (text: string, indent = 1) => {
      label(text, false, indent);
      amounts(COLUMNS.map(() => null).concat([null]));
      row += 1;
    };
    const tinted = (fill: string) => {
      for (let col = 1; col <= WIDTH; col++)
        applyFill(sheet.getCell(row, col), fill);
    };

    // Receipts: blank until the portal holds income (D4).
    for (const text of [
      'Beginning Balance',
      'Add: Income',
      'Subsidies / Transfers',
    ])
      blank(text);

    for (const cls of CLASSES) {
      label(cls.label, true);
      row += 1;
      blank('(per account code — available once object-level data exists)', 2);
      label(`Sub-total, ${cls.label.slice(3)}`, true, 1);
      const values = COLUMNS.map((c) => f.byColumn[c.key][cls.key]);
      amounts([...values, f.appropriations[cls.key]], true);
      row += 1;
    }

    label('TOTAL APPROPRIATIONS', true);
    amounts(
      [...COLUMNS.map((c) => f.byColumn[c.key].total), f.appropriations.total],
      true,
    );
    tinted('FFFCE4D6');
    row += 1;

    for (const lump of f.lumpSums) {
      label(lump.label, false, 1);
      // General Public Services column, as the FY2026 ordinance prints them.
      amounts([lump.amount, null, null, null, lump.amount]);
      row += 1;
    }

    label('GRAND TOTAL', true);
    const gps = f.lumpSums.reduce(
      (sum, l) => sum.plus(l.amount),
      f.byColumn[Form7Column.GENERAL_PUBLIC].total,
    );
    amounts(
      [
        gps,
        ...COLUMNS.slice(1).map((c) => f.byColumn[c.key].total),
        f.grandTotal,
      ],
      true,
    );
    tinted('FFFCE4D6');
    row += 1;

    const { level, chiefExecutive } = getBrand();
    signatureBlock(sheet, row + 2, [
      { caption: 'Prepared by:', titles: [`${level} Budget Officer`] },
      { caption: 'Approved by:', titles: [chiefExecutive] },
    ]);
  }
}
