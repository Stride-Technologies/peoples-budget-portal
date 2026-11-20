import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { ProgramAuditAction } from '../generated/prisma/index';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramAuditLogService } from '../program-audit/program-audit-log.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { FieldDiff } from '../program-audit/audit-fields.js';
import {
  fillFor,
  findExtendedSheet,
  matchCode,
  nearMisses,
  parseExtendedSheet,
  type ExtendedRow,
  type ProgramForMatch,
} from './aip-extended.js';
import type { ApplyAipExtendedDto } from './dto/apply-aip-extended.dto.js';
import { LIVE_PROGRAM } from '../programs/program-filters.js';

/** An AIP entry as the matching screen shows it. Budget columns only. */
export interface AipEntry extends ProgramForMatch {
  code: string;
  name: string;
  officeId: string | null;
  officeAcronym: string | null;
  status: string;
  proposedTotal: string;
  majorFinalOutput: string | null;
}

/**
 * Staff upload of one office's AIP-Extended sheet (specs/008 US3, decision 14).
 *
 * The sheet's codes are meant to be the AIP's own. Where they are not — IAS
 * writes office type `02` where the portal codes NCIASO `03` — preview lists
 * the row unmatched with the near-miss entries, and the staff member picks the
 * entry. Apply then fills blanks exactly as `db:seed:aip-extended` does.
 * Nothing is stored between the two calls: apply re-reads every program.
 */
@Injectable()
export class AipExtendedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ProgramAuditLogService,
  ) {}

  private async cycleYear(cycleId: string) {
    const cycle = await this.prisma.aIPCycle.findUnique({
      where: { id: cycleId },
      select: { fiscalYear: true },
    });
    if (!cycle) throw new NotFoundException('AIP cycle not found');
    return cycle.fiscalYear;
  }

  private async entries(cycleId: string): Promise<AipEntry[]> {
    const programs = await this.prisma.program.findMany({
      where: { aipCycleId: cycleId, ...LIVE_PROGRAM },
      select: {
        id: true,
        aipReferenceCode: true,
        tentativeAipReferenceCode: true,
        name: true,
        status: true,
        proposedTotal: true,
        majorFinalOutput: true,
        expectedOutput: true,
        targetForBudgetYear: true,
        officeId: true,
        office: { select: { acronym: true } },
        sdgGoals: { select: { sdgGoal: { select: { code: true } } } },
      },
    });
    return programs
      .map((p) => ({
        id: p.id,
        aipReferenceCode: p.aipReferenceCode,
        tentativeAipReferenceCode: p.tentativeAipReferenceCode,
        code: p.aipReferenceCode ?? p.tentativeAipReferenceCode,
        name: p.name,
        officeId: p.officeId,
        officeAcronym: p.office?.acronym ?? null,
        status: p.status,
        proposedTotal: p.proposedTotal.toFixed(2),
        majorFinalOutput: p.majorFinalOutput,
        expectedOutput: p.expectedOutput,
        targetForBudgetYear: p.targetForBudgetYear,
        sdgCodes: p.sdgGoals.map((g) => g.sdgGoal.code).sort(),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  private async knownSdg() {
    const goals = await this.prisma.sDGGoal.findMany({
      select: { id: true, code: true },
    });
    return new Map(goals.map((g) => [g.code, g.id]));
  }

  /** Parse the sheet and match each row by exact code; writes nothing. */
  async preview(cycleId: string, buffer: Buffer, fileName: string) {
    const year = await this.cycleYear(cycleId);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as never);
    } catch {
      throw new BadRequestException('Not a readable .xlsx workbook');
    }
    const sheet = findExtendedSheet(workbook);
    if (!sheet)
      throw new BadRequestException(
        'No AIP-Extended sheet in this workbook (looked for a sheet named "… AIP-Extended")',
      );
    let parsed: ReturnType<typeof parseExtendedSheet>;
    try {
      parsed = parseExtendedSheet(sheet, year, fileName);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    const [entries, known] = await Promise.all([
      this.entries(cycleId),
      this.knownSdg(),
    ]);
    const duplicate = new Set(parsed.duplicates.map((d) => d.code));
    return {
      fileName,
      sheet: sheet.name,
      year,
      rows: parsed.rows.map((r) => {
        const hits = matchCode(r.aipCode, entries);
        return {
          row: r.row,
          aipCode: r.aipCode,
          description: r.description,
          indicator: r.indicator,
          target: r.target,
          sdgCodes: r.sdgCodes.filter((c) => known.has(c)),
          unknownSdgCodes: r.sdgCodes.filter((c) => !known.has(c)),
          duplicate: duplicate.has(r.aipCode),
          match:
            hits.length === 1 ? 'exact' : hits.length ? 'ambiguous' : 'none',
          matchIds: hits.map((h) => h.id),
          suggestionIds: hits.length
            ? []
            : nearMisses(r.aipCode, entries).map((p) => p.id),
        };
      }),
      unreadSdg: parsed.unreadSdg,
      entries,
    };
  }

  /**
   * Fill blanks on the chosen entries. A field that already holds a different
   * value is kept and returned as a conflict; SDG links are only added. Each
   * changed program gets one edit-history row.
   */
  async apply(cycleId: string, dto: ApplyAipExtendedDto, user: JwtPayload) {
    await this.cycleYear(cycleId);
    const ids = dto.rows.map((r) => r.programId);
    const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (repeated.length)
      throw new BadRequestException(
        'Each AIP entry can take one sheet row; some were chosen twice',
      );

    const [entries, known] = await Promise.all([
      this.entries(cycleId),
      this.knownSdg(),
    ]);
    const byId = new Map(entries.map((e) => [e.id, e]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length)
      throw new BadRequestException(
        `${missing.length} chosen entr${missing.length === 1 ? 'y is' : 'ies are'} not in this cycle`,
      );
    const knownCodes = new Set(known.keys());

    const filled: { programId: string; code: string; fields: string[] }[] = [];
    const conflicts: {
      sheetRow: number;
      code: string;
      field: string;
      portal: string;
      sheet: string;
    }[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const input of dto.rows) {
        const entry = byId.get(input.programId)!;
        const row: ExtendedRow = {
          file: dto.fileName ?? 'upload',
          sheet: '',
          row: input.sheetRow,
          aipCode: input.aipCode,
          description: '',
          indicator: input.indicator.trim(),
          target: input.target.trim(),
          sdgCodes: input.sdgCodes,
        };
        const fill = fillFor(row, entry, knownCodes);
        conflicts.push(
          ...fill.conflicts.map((c) => ({
            sheetRow: input.sheetRow,
            code: entry.code,
            field: c.field,
            portal: c.portal,
            sheet: c.sheet,
          })),
        );
        const change = fill.change;
        if (!change) continue;

        const changes: FieldDiff = {};
        if (change.setExpectedOutput)
          changes.expectedOutput = { from: null, to: change.setExpectedOutput };
        if (change.setTarget)
          changes.targetForBudgetYear = { from: null, to: change.setTarget };
        if (change.setExpectedOutput || change.setTarget)
          await tx.program.update({
            where: { id: entry.id },
            data: {
              ...(change.setExpectedOutput
                ? { expectedOutput: change.setExpectedOutput }
                : {}),
              ...(change.setTarget
                ? { targetForBudgetYear: change.setTarget }
                : {}),
            },
          });
        if (change.addSdgCodes.length) {
          await tx.programSDGGoal.createMany({
            data: change.addSdgCodes.map((code) => ({
              programId: entry.id,
              sdgGoalId: known.get(code)!,
            })),
            skipDuplicates: true,
          });
          changes.sdgGoals = {
            from: entry.sdgCodes,
            to: [...entry.sdgCodes, ...change.addSdgCodes].sort(),
          };
        }
        await this.audit.record(
          {
            programId: entry.id,
            action: ProgramAuditAction.PROGRAM_UPDATED,
            actor: user,
            onBehalfOfOfficeId: entry.officeId,
            summary: `Filled ${Object.keys(changes).join(', ')} from the AIP-Extended sheet (${row.file} row ${row.row})`,
            changes,
          },
          tx,
        );
        filled.push({
          programId: entry.id,
          code: entry.code,
          fields: Object.keys(changes),
        });
      }
    });

    return { filled, conflicts, unchanged: dto.rows.length - filled.length };
  }
}
