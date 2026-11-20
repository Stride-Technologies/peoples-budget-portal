import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service.js';
import { OfficeScopeService } from '../permissions/office-scope.service.js';
import { Prisma } from '../generated/prisma/index';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { ListPpmpDto } from './dto/list-ppmp.dto.js';
import {
  applyBorder,
  applyCellStyle,
  AMOUNT_FORMAT,
  assertExportWithinRowLimit,
  FUND_SOURCE_LABELS,
} from '../aip-registry/excel-style.js';

type ExportWorkbook = { buffer: Buffer; fileName: string };

const HEADER_ROW = [
  'PPMP',
  'Line Item Name',
  'Funding AIP Program',
  'Type of Project',
  'Mode of Procurement',
  'UACS Code',
  'UACS Description',
  'Quantity',
  'Unit',
  'Unit Cost',
  'Line Total',
  'Fund Source',
  'Expense Class',
  'Pre-Procurement Conference, if applicable',
  'Start of Procurement Activity',
  'End of Procurement Activity',
  'Expected Delivery/Implementation Period',
  'Remarks',
  'Attached Supporting Document',
];

const MONTH_LABELS = [
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
];

function monthYear(month: number, year: number): string {
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

/** "SMALL_VALUE_PROCUREMENT" -> "Small Value Procurement". */
function humanizeEnum(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Excel sheet names: max 31 chars, no `* ? : \ / [ ]`. */
function sheetNameFor(acronym: string, seen: Set<string>): string {
  const base = acronym.replace(/[*?:\\/[\]]/g, '').slice(0, 31) || 'Office';
  let name = base;
  let suffix = 2;
  while (seen.has(name)) {
    name = `${base.slice(0, 28)}-${suffix++}`;
  }
  seen.add(name);
  return name;
}

@Injectable()
export class PpmpExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly officeScope: OfficeScopeService,
  ) {}

  async exportAll(
    opts: ListPpmpDto,
    user: JwtPayload,
  ): Promise<ExportWorkbook> {
    const scopeWhere = await this.officeScope.officeScopeWhere(user);
    const ppmps = await this.prisma.pPMP.findMany({
      where: {
        AND: [scopeWhere, opts.officeId ? { officeId: opts.officeId } : {}],
        ...(opts.aipCycleId ? { aipCycleId: opts.aipCycleId } : {}),
        ...(opts.isPublished !== undefined
          ? { isPublished: opts.isPublished }
          : {}),
      },
      include: {
        office: { select: { id: true, name: true, acronym: true } },
        aipCycle: { select: { fiscalYear: true } },
        lineItems: { orderBy: { orderIndex: 'asc' } },
      },
      orderBy: [{ office: { acronym: 'asc' } }, { createdAt: 'asc' }],
    });

    assertExportWithinRowLimit(
      ppmps.reduce((acc, p) => acc + Math.max(p.lineItems.length, 1), 0),
    );

    const fiscalYear = ppmps[0]?.aipCycle.fiscalYear;
    const fileName = fiscalYear
      ? `ppmp-${fiscalYear}-export.xlsx`
      : 'ppmp-export.xlsx';

    const workbook = new ExcelJS.Workbook();
    const byOffice = new Map<string, typeof ppmps>();
    for (const ppmp of ppmps) {
      const bucket = byOffice.get(ppmp.office.id) ?? [];
      bucket.push(ppmp);
      byOffice.set(ppmp.office.id, bucket);
    }

    const seenSheetNames = new Set<string>();
    for (const [, officePpmps] of byOffice) {
      const office = officePpmps[0].office;
      const sheet = workbook.addWorksheet(
        sheetNameFor(office.acronym, seenSheetNames),
      );
      this.populateOfficeSheet(sheet, office.name, officePpmps);
    }

    if (byOffice.size === 0) {
      workbook.addWorksheet('PPMP').addRow(['No PPMPs match this export.']);
    }

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    return { buffer, fileName };
  }

  private populateOfficeSheet(
    sheet: ExcelJS.Worksheet,
    officeName: string,
    ppmps: Array<Prisma.PPMPGetPayload<{ include: { lineItems: true } }>>,
  ) {
    // Widths only — no `header` key. Setting one makes ExcelJS auto-write a
    // header row at row 1, which then collides with the office title row and
    // the explicit header row added below (three rows fighting for row 1/2).
    sheet.columns = HEADER_ROW.map((header) => ({
      width: [
        'PPMP',
        'Line Item Name',
        'UACS Description',
        'Attached Supporting Document',
      ].includes(header)
        ? 32
        : 18,
    }));

    const titleRow = sheet.addRow([officeName]);
    sheet.mergeCells(titleRow.number, 1, titleRow.number, HEADER_ROW.length);
    applyCellStyle(
      titleRow.getCell(1),
      { horizontal: 'left' },
      undefined,
      true,
    );

    const headerRow = sheet.addRow(HEADER_ROW);
    headerRow.eachCell((cell) => {
      applyCellStyle(cell, { horizontal: 'center' }, undefined, true);
      applyBorder(cell);
    });

    for (const ppmp of ppmps) {
      const nameRow = sheet.addRow([
        `${ppmp.name} (${ppmp.fundingProgram})${ppmp.isPublished ? ' — Published' : ''}`,
      ]);
      sheet.mergeCells(nameRow.number, 1, nameRow.number, HEADER_ROW.length);
      applyCellStyle(
        nameRow.getCell(1),
        { horizontal: 'left' },
        undefined,
        true,
      );

      if (ppmp.lineItems.length === 0) {
        sheet.addRow(['No line items yet']);
        continue;
      }

      for (const li of ppmp.lineItems) {
        const row = sheet.addRow([
          '',
          li.lineItemName,
          ppmp.fundingProgram,
          li.typeOfProject ? humanizeEnum(li.typeOfProject) : '',
          li.modeOfProcurement ? humanizeEnum(li.modeOfProcurement) : '',
          li.uacsCode,
          li.uacsDescription,
          li.quantity.toNumber(),
          li.unit,
          li.unitCost.toNumber(),
          li.lineTotal.toNumber(),
          FUND_SOURCE_LABELS[li.fundSource] ?? li.fundSource,
          li.expenseClass,
          li.preProcurementConferenceRequired ? 'Yes' : 'No',
          monthYear(li.procurementStartMonth, li.procurementStartYear),
          monthYear(li.procurementEndMonth, li.procurementEndYear),
          li.deliveryPeriod ?? '',
          li.remarks ?? '',
          li.supportingDocumentName ?? '',
        ]);
        row.eachCell((cell, colNumber) => {
          applyBorder(cell);
          if ([8, 10, 11].includes(colNumber)) {
            applyCellStyle(cell, { horizontal: 'right' }, AMOUNT_FORMAT);
          }
        });
      }

      const total = ppmp.lineItems.reduce(
        (acc, li) => acc.plus(li.lineTotal),
        new Prisma.Decimal(0),
      );
      const totalRow = sheet.addRow([
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'Estimated Budget / Authorized Budgetary Allocation (PhP)',
        total.toNumber(),
      ]);
      applyCellStyle(
        totalRow.getCell(10),
        { horizontal: 'right' },
        undefined,
        true,
      );
      applyCellStyle(
        totalRow.getCell(11),
        { horizontal: 'right' },
        AMOUNT_FORMAT,
        true,
      );
    }
  }
}
