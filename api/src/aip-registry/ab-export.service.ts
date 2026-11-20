import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TableLayoutType,
  VerticalMergeType,
  WidthType,
} from 'docx';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ALL_OFFICES,
  OfficeScopeService,
} from '../permissions/office-scope.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import {
  BudgetDocumentKind,
  BudgetDocumentStatus,
  ExportStatus,
  ExportType,
  type Prisma,
} from '../generated/prisma/index';
import {
  loadDocumentPrograms,
  sheetOfficeId,
  toSheetProgram,
  type Costed,
  type Money,
  type SheetProgram,
} from './lbp-figures.js';
import {
  buildOfficeSheet,
  COMPONENT_BAND,
  specialFundOf,
  type OfficeSheet,
  type SheetRow,
} from './office-sheet.js';
import { SPECIAL_FUNDS } from '../common/special-funds.js';
import { getPlaceName } from '../common/brand.js';
import { LIVE_PROGRAM } from '../programs/program-filters.js';

/**
 * The city's own Annual Budget sheet, as a Word document.
 *
 * One sheet per office — "Mandate, Vision/Mission, Major Final Output,
 * Performance Indicators and Targets FY <year>" — reproducing the layout of
 * `AB_YEAR_TEMPLATE.docx`, which is itself the City Events, Protocol and Public
 * Information Office's real FY2026 sheet.
 *
 * Built rather than templated. `docxtemplater` fills placeholders and loops
 * table rows, but every row here is formatted by *type* — a PAP-class heading,
 * a program, an activity, a subtotal, the component band — and the Major Final
 * Output column is merged vertically across runs of rows that share a value.
 * A flat loop cannot express either.
 *
 * Money comes from the **estimate/proposed family**, never the line-item
 * rollups, which are structurally 0 while line-item entry is deferred. Same
 * rule as `AIPRegistryExportService`.
 */

/**
 * The printed sheet's own geometry, read straight out of `AB_YEAR_TEMPLATE.docx`.
 *
 * Legal paper, portrait — not A4 landscape, which is what this produced before
 * anyone compared the two side by side. The column widths are the template's to
 * the twip, so a generated sheet lines up with a printed one.
 */
const PAGE = { width: 12240, height: 20160 };
const MARGINS = { top: 547, right: 1080, bottom: 2835, left: 1620 };
// The template's four money columns (4830 twips) now hold five — PS, MOOE, FE,
// CO, Total — split evenly, so the table keeps its printed width.
const COLUMNS = [1560, 1179, 1134, 1479, 647, 966, 966, 966, 966, 966];
const TABLE_WIDTH = COLUMNS.reduce((sum, width) => sum + width, 0);
/** A header-block statement spans everything right of its two label columns. */
const STATEMENT_SPAN = COLUMNS.length - 2;

/**
 * The table is wider than the text column its margins leave (10829 twips
 * against 9540), so the template pulls it back into the left margin. Without
 * this the last column runs off the page — which is exactly what the printed
 * output did before anyone looked at page 1.
 */
const TABLE_INDENT = -318;

/**
 * The template's fills. The printed sheet uses four, and the distinction is the
 * point: the pink marks the rows that name something (column headers, TOTALs,
 * and each component office), the darker grey opens the COMPONENT PROGRAMS
 * band, and the lighter grey is an ordinary PAP-class heading inside it.
 */
const SHADE_HEADER = 'FCE4D6';
const SHADE_SECTION = 'D9D9D9';
const SHADE_BAND = 'BFBFBF';

/**
 * The header block above the PPA table carries no rules at all in the printed
 * sheet — it reads as a letterhead, not a grid.
 */
/**
 * Rules on every cell of the PPA table. Set at table level so the grid comes
 * from one place; the header block above it overrides back to none, which is
 * how the printed sheet reads — a letterhead, then a grid.
 */
const GRID_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4 },
  bottom: { style: BorderStyle.SINGLE, size: 4 },
  left: { style: BorderStyle.SINGLE, size: 4 },
  right: { style: BorderStyle.SINGLE, size: 4 },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4 },
  insideVertical: { style: BorderStyle.SINGLE, size: 4 },
} as const;

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
} as const;

const DEFAULT_MAX_ROWS = 10_000;

/**
 * The printed sheet's typeface. `docx` measures in half-points, so 8pt is 16 —
 * getting that wrong silently doubles the size rather than failing.
 *
 * Applied as the document default *and* on the heading style, because a
 * heading carries its own run properties and would otherwise keep the theme's
 * font and size.
 */
const FONT = 'Arial';
const FONT_HALF_POINTS = 16;

const DOCUMENT_STYLES = {
  default: {
    document: { run: { font: FONT, size: FONT_HALF_POINTS } },
    heading1: { run: { font: FONT, size: FONT_HALF_POINTS, bold: true } },
    heading2: { run: { font: FONT, size: FONT_HALF_POINTS, bold: true } },
  },
};

/** The Word book prints every fund: a row's whole figure. */
const allFunds = (row: Costed): Money => ({
  ps: row.ps,
  mooe: row.mooe,
  fe: row.fe,
  co: row.co,
  total: row.total,
});

export interface GeneratedDocument {
  buffer: Buffer;
  fileName: string;
}

@Injectable()
export class ABExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly officeScope: OfficeScopeService,
  ) {}

  /**
   * One office's sheet, or the whole book when `officeId` is omitted.
   *
   * Office scope is enforced here rather than at the route: a caller who holds
   * part of the city exports only their own offices, which is the same leak the
   * cluster export had to fix once already.
   */
  async exportAnnualBudget(
    cycleId: string,
    officeId: string | undefined,
    user: JwtPayload,
  ): Promise<GeneratedDocument> {
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, fiscalYear: true },
    });
    if (!cycle) throw new NotFoundException('AIP cycle not found');

    const allowed = await this.authorizedOfficeIds(officeId, user);
    const fileName = await this.fileNameFor(cycle.fiscalYear, officeId);

    const log = await this.prisma.aIPExportLog.create({
      data: {
        type: officeId ? ExportType.AB_OFFICE : ExportType.AB_BOOK,
        status: ExportStatus.PENDING,
        aipCycleId: cycle.id,
        fileName,
        requestedByUserId: user.sub,
        requestedByRole: user.role,
        filters: { cycleId: cycle.id, officeId: officeId ?? null },
      },
    });

    try {
      const buffer = await this.build(cycle.fiscalYear, cycle.id, allowed);
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

  /** The offices this caller may export, narrowed to one when asked. */
  private async authorizedOfficeIds(
    officeId: string | undefined,
    user: JwtPayload,
  ): Promise<string[] | 'ALL'> {
    const scope = await this.officeScope.effectiveOfficeIds(user);
    if (!officeId) return scope === ALL_OFFICES ? 'ALL' : scope;

    if (scope !== ALL_OFFICES && !scope.includes(officeId)) {
      throw new ForbiddenException(
        'You can only export an office within your assigned scope',
      );
    }
    return [officeId];
  }

  private async fileNameFor(fiscalYear: number, officeId?: string) {
    if (!officeId) return `AB-${fiscalYear}-all-offices.docx`;
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: { acronym: true },
    });
    const safe = (office?.acronym ?? 'office').replace(/[^A-Za-z0-9-]+/g, '-');
    return `AB-${fiscalYear}-${safe}.docx`;
  }

  // ─── Document ──────────────────────────────────────────────────────────────

  private async build(
    fiscalYear: number,
    cycleId: string,
    allowed: string[] | 'ALL',
  ): Promise<Buffer> {
    const offices = await this.prisma.office.findMany({
      where: {
        isActive: true,
        ...(allowed === 'ALL' ? {} : { id: { in: allowed } }),
      },
      orderBy: [
        { officeType: { sort: 'asc', nulls: 'last' } },
        { officeCode: { sort: 'asc', nulls: 'last' } },
        { acronym: 'asc' },
      ],
    });

    // Once the year's Ordinance is enacted, the Annual Budget *is* that
    // document (specs/012): print its PPAs. Before that, the AIP's programs.
    const ordinance = await this.prisma.budgetDocument.findFirst({
      where: {
        kind: BudgetDocumentKind.ORDINANCE,
        status: BudgetDocumentStatus.ENACTED,
        budgetCycle: { aipCycle: { id: cycleId } },
      },
      select: { id: true },
    });
    const programs = ordinance
      ? await this.ordinancePrograms(ordinance.id, offices)
      : await this.aipPrograms(cycleId, offices);

    // Special-fund rows print on their fund's sheet, after the offices, as the
    // city's book prints them (specs/016 US2.3). They stay owned by their office
    // everywhere else; this is presentation only.
    const officeRows = programs.filter((p) => !specialFundOf(p));
    const officeSheets = offices.map((office) => ({
      header: office,
      key: office.id,
      programs: officeRows.filter((p) => sheetOfficeId(p) === office.id),
    }));
    const fundSheets = await this.fundSheets(fiscalYear, programs);

    const sections = [...officeSheets, ...fundSheets]
      // An office with nothing in this cycle gets no sheet. The book does not
      // print empty ones either.
      .filter((s) => s.programs.length > 0)
      .map(({ header, key, programs: own }) => ({
        properties: {
          page: { size: PAGE, margin: MARGINS },
        },
        children: this.sheet(
          fiscalYear,
          header,
          buildOfficeSheet(key, own, allFunds),
        ),
      }));

    if (sections.length === 0) {
      throw new NotFoundException(
        'No programs to export for this cycle and office',
      );
    }

    return Packer.toBuffer(new Document({ styles: DOCUMENT_STYLES, sections }));
  }

  /**
   * One sheet per special fund with rows, in Form 7's order (SPA, LDF,
   * LDRRMF). The header names the fund and cites its law (`FundRule`); a
   * component program's host is dropped, because the fund's sheet has no
   * component band.
   */
  private async fundSheets(fiscalYear: number, programs: SheetProgram[]) {
    const rules = await this.prisma.fundRule.findMany({
      where: {
        fundSource: { in: SPECIAL_FUNDS.map((f) => f.fund) },
        effectiveFrom: { lte: fiscalYear },
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { fundSource: true, legalBasis: true },
    });
    return SPECIAL_FUNDS.map(({ fund, name }) => ({
      header: {
        name,
        mandateLegalBasis:
          rules.find((r) => r.fundSource === fund)?.legalBasis ?? null,
        vision: null,
        mission: null,
        organizationalOutcomes: [],
      },
      key: fund,
      programs: programs
        .filter((p) => specialFundOf(p) === fund)
        .map((p) => ({ ...p, hostOfficeId: null })),
    }));
  }

  private async ordinancePrograms(
    documentId: string,
    offices: { id: string }[],
  ): Promise<SheetProgram[]> {
    const loaded = await loadDocumentPrograms(
      this.prisma,
      documentId,
      offices.map((o) => o.id),
    );
    this.assertWithinRowLimit(loaded.rowCount);
    return loaded.programs;
  }

  private async aipPrograms(
    cycleId: string,
    offices: { id: string }[],
  ): Promise<SheetProgram[]> {
    // A program prints under its host when it has one, so the query has to
    // reach programs this office does not own.
    const rows = await this.prisma.program.findMany({
      where: {
        aipCycleId: cycleId,
        ...LIVE_PROGRAM,
        OR: [
          { officeId: { in: offices.map((o) => o.id) } },
          { hostOfficeId: { in: offices.map((o) => o.id) } },
        ],
      },
      include: {
        office: { select: { id: true, acronym: true, name: true } },
        projectActivities: { orderBy: { orderIndex: 'asc' } },
      },
      orderBy: [
        { papClass: { sort: 'asc', nulls: 'last' } },
        { orderIndex: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    this.assertWithinRowLimit(
      rows.reduce((n, p) => n + 1 + p.projectActivities.length, 0),
    );
    return rows.map((row) =>
      toSheetProgram(row as unknown as Record<string, unknown>, row.office),
    );
  }

  /**
   * One office's sheet: title, header block and PPA table, **all in one
   * 9-column table** — which is how the printed sheet is built. Emitting the
   * header block as its own 2-column table gave it a different grid, so the two
   * halves of the page did not line up at all.
   */
  private sheet(
    fiscalYear: number,
    office: {
      name: string;
      mandateLegalBasis: string | null;
      vision: string | null;
      mission: string | null;
      organizationalOutcomes: string[];
    },
    sheet: OfficeSheet,
  ) {
    const body: TableRow[] = [
      this.fullWidthRow(
        'Mandate, Vision/Mission, Major Final Output, Performance ' +
          `Indicators and Targets FY ${fiscalYear}`,
        { bold: true, align: AlignmentType.CENTER },
      ),
      this.fullWidthRow(getPlaceName(), {
        bold: true,
        align: AlignmentType.CENTER,
      }),
      this.spacerRow(),
      ...this.headerBlock(office),
      this.spacerRow(),
      this.headerRow(),
      this.moneyHeaderRow(),
    ];

    for (const section of sheet.sections) {
      body.push(this.headingRow(section.code, section.label));
      for (const row of section.rows) body.push(this.dataRow(row));
    }
    body.push(this.totalRow('TOTAL', sheet.total));

    if (sheet.components.length > 0) {
      body.push(this.headingRow('', COMPONENT_BAND, SHADE_BAND));
      for (const group of sheet.components) {
        if (group.officeName)
          body.push(
            this.headingRow('', group.officeName.toUpperCase(), SHADE_HEADER),
          );
        for (const row of group.rows) body.push(this.dataRow(row));
      }
      body.push(
        this.totalRow(`TOTAL, ${COMPONENT_BAND}`, sheet.componentTotal),
      );
      body.push(this.totalRow('GRAND TOTAL', sheet.grandTotal));
    }

    return [
      new Table({
        columnWidths: COLUMNS,
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        indent: { size: TABLE_INDENT, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        borders: GRID_BORDERS,
        rows: body,
      }),
    ];
  }

  /**
   * The header block, as rows of the sheet's own 10-column table.
   *
   * The spans are the printed sheet's: the office name sits across five
   * columns, and every statement across the rest — which is what puts the label
   * column and the AIP Reference Code column on the same left edge.
   */
  private headerBlock(office: {
    name: string;
    mandateLegalBasis: string | null;
    vision: string | null;
    mission: string | null;
    organizationalOutcomes: string[];
  }): TableRow[] {
    const label = (text: string, span = 1) =>
      new TableCell({
        columnSpan: span,
        borders: NO_BORDERS,
        children: [new Paragraph({ children: [new TextRun({ text })] })],
      });
    const value = (text: string, span: number, bold = false) =>
      new TableCell({
        columnSpan: span,
        borders: NO_BORDERS,
        children: [new Paragraph({ children: [new TextRun({ text, bold })] })],
      });

    const rows: TableRow[] = [
      // Department/Office: label, a blank, the name across five, three blanks.
      new TableRow({
        children: [
          label('Department/Office'),
          label(''),
          value(office.name.toUpperCase(), 5, true),
          label(''),
          label(''),
          label(''),
        ],
      }),
      new TableRow({
        children: [
          label('Mandate/Legal Basis', 2),
          value(office.mandateLegalBasis ?? '', STATEMENT_SPAN),
        ],
      }),
      new TableRow({
        children: [
          label('Vision'),
          label(''),
          value(office.vision ?? '', STATEMENT_SPAN),
        ],
      }),
      new TableRow({
        children: [
          label('Mission'),
          label(''),
          value(office.mission ?? '', STATEMENT_SPAN),
        ],
      }),
    ];

    // One row per outcome: the label on the first, continuations after it.
    const outcomes = office.organizationalOutcomes;
    if (outcomes.length === 0) {
      rows.push(
        new TableRow({
          children: [
            label('Organizational Outcome', 2),
            value('', STATEMENT_SPAN),
          ],
        }),
      );
    }
    outcomes.forEach((outcome, index) => {
      rows.push(
        index === 0
          ? new TableRow({
              children: [
                label('Organizational Outcome', 2),
                value(outcome, STATEMENT_SPAN),
              ],
            })
          : new TableRow({
              children: [label(''), label(''), value(outcome, STATEMENT_SPAN)],
            }),
      );
    });
    return rows;
  }

  /** A single cell spanning the whole grid — the two title lines. */
  private fullWidthRow(
    text: string,
    options: {
      bold?: boolean;
      align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    } = {},
  ): TableRow {
    return new TableRow({
      children: [
        new TableCell({
          columnSpan: COLUMNS.length,
          borders: NO_BORDERS,
          children: [
            new Paragraph({
              alignment: options.align,
              children: [new TextRun({ text, bold: options.bold })],
            }),
          ],
        }),
      ],
    });
  }

  /** The blank separator the printed sheet leaves above and below the block. */
  private spacerRow(): TableRow {
    return new TableRow({
      children: COLUMNS.map(
        () =>
          new TableCell({
            borders: NO_BORDERS,
            children: [new Paragraph({ text: '' })],
          }),
      ),
    });
  }

  /**
   * A section heading — its reference code, then the label across the two
   * description columns, then empty cells. Matches the printed sheet, which
   * gives these rows a code rather than treating them as decoration.
   */
  private headingRow(
    code: string,
    label: string,
    fill = SHADE_SECTION,
  ): TableRow {
    const shading = { fill };
    return new TableRow({
      children: [
        new TableCell({
          shading,
          children: [
            new Paragraph({
              children: [new TextRun({ text: code, bold: true })],
            }),
          ],
        }),
        new TableCell({
          columnSpan: 2,
          shading,
          children: [
            new Paragraph({
              children: [new TextRun({ text: label, bold: true })],
            }),
          ],
        }),
        ...COLUMNS.slice(3).map(
          () =>
            new TableCell({ shading, children: [new Paragraph({ text: '' })] }),
        ),
      ],
    });
  }

  // ─── Rows ──────────────────────────────────────────────────────────────────

  private headerRow(): TableRow {
    const head = (text: string, span?: number) =>
      new TableCell({
        columnSpan: span,
        shading: { fill: SHADE_HEADER },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text, bold: true })],
          }),
        ],
      });
    return new TableRow({
      tableHeader: true,
      children: [
        head('AIP Reference Code'),
        head('Program/Project/ Activity Description'),
        head('Major Final Output'),
        head('Performance Indicator'),
        head('Target for the Budget Year'),
        head('Proposed Budget for the Year', 5),
      ],
    });
  }

  private moneyHeaderRow(): TableRow {
    const blank = () =>
      new TableCell({
        verticalMerge: VerticalMergeType.CONTINUE,
        shading: { fill: SHADE_HEADER },
        children: [new Paragraph({ text: '' })],
      });
    const head = (text: string) =>
      new TableCell({
        shading: { fill: SHADE_HEADER },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text, bold: true })],
          }),
        ],
      });
    return new TableRow({
      tableHeader: true,
      children: [
        blank(),
        blank(),
        blank(),
        blank(),
        blank(),
        head('PS'),
        head('MOOE'),
        head('FE'),
        head('CO'),
        head('Total'),
      ],
    });
  }

  /** A full-width label: a PAP-class heading, or the component band. */
  private bandRow(label: string): TableRow {
    return new TableRow({
      children: [
        new TableCell({
          columnSpan: COLUMNS.length,
          shading: { fill: 'F1F5F9' },
          children: [
            new Paragraph({
              children: [new TextRun({ text: label, bold: true })],
            }),
          ],
        }),
      ],
    });
  }

  /**
   * `mergedMfo` continues the Major Final Output cell above instead of
   * repeating it, which is how the printed sheet reads: the value is written
   * once and spans the run of rows that share it.
   */
  private dataRow(row: SheetRow): TableRow {
    const mfoCell = row.mergedMfo
      ? new TableCell({
          verticalMerge: VerticalMergeType.CONTINUE,
          children: [new Paragraph({ text: '' })],
        })
      : new TableCell({
          verticalMerge: row.majorFinalOutput
            ? VerticalMergeType.RESTART
            : undefined,
          children: [
            new Paragraph({
              children: [new TextRun({ text: row.majorFinalOutput })],
            }),
          ],
        });
    const text = (value: string, bold: boolean) =>
      new TableCell({
        children: [
          new Paragraph({ children: [new TextRun({ text: value, bold })] }),
        ],
      });
    const money = (value: Prisma.Decimal, bold: boolean) =>
      new TableCell({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: this.peso(value), bold })],
          }),
        ],
      });
    return new TableRow({
      children: [
        text(row.code, row.bold),
        text(row.description, row.bold),
        mfoCell,
        text(row.performanceIndicator, false),
        text(row.target, false),
        money(row.money.ps, row.bold),
        money(row.money.mooe, row.bold),
        money(row.money.fe, row.bold),
        money(row.money.co, row.bold),
        money(row.money.total, row.bold),
      ],
    });
  }

  private totalRow(label: string, total: Money): TableRow {
    const money = (value: Prisma.Decimal) =>
      new TableCell({
        shading: { fill: SHADE_HEADER },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: this.peso(value), bold: true })],
          }),
        ],
      });
    return new TableRow({
      children: [
        new TableCell({
          columnSpan: 5,
          shading: { fill: SHADE_HEADER },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: label, bold: true })],
            }),
          ],
        }),
        money(total.ps),
        money(total.mooe),
        money(total.fe),
        money(total.co),
        money(total.total),
      ],
    });
  }

  /**
   * The sheet's own number format: thousands separated, two decimals, and a
   * blank cell rather than a printed zero — which is how the book reads.
   */
  private peso(value: Prisma.Decimal): string {
    if (value.isZero()) return '';
    const [whole, fraction = '00'] = value.toFixed(2).split('.');
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
  }

  private assertWithinRowLimit(rowCount: number) {
    const raw = process.env.AIP_EXPORT_MAX_ROWS;
    const maxRows = raw ? Number(raw) : DEFAULT_MAX_ROWS;
    if (!Number.isInteger(maxRows) || maxRows <= 0) {
      throw new Error('AIP_EXPORT_MAX_ROWS must be a positive integer');
    }
    if (rowCount <= maxRows) return;
    throw new PayloadTooLargeException(
      `Annual Budget export contains ${rowCount} rows, exceeding the configured limit of ${maxRows}. ` +
        'Export a single office, or increase AIP_EXPORT_MAX_ROWS.',
    );
  }
}
