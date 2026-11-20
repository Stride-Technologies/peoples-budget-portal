import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/index';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CatalogueService } from '../catalogue.service.js';
import { validateQuery, type Query } from '../query/query.js';
import { checkWorkbook, type Workbook } from './workbook.js';

/** Same workbook, same link: a hash of the canonical state (W20). */
export const snapshotId = (wb: Workbook) =>
  createHash('sha256')
    .update(JSON.stringify(wb))
    .digest('base64url')
    .slice(0, 12);

const ID = /^[A-Za-z0-9_-]{12}$/;

/**
 * Share links (specs/018 redesign P3, W9): a workbook is stored once, never
 * changed, and opened as a copy. Only named fields are kept (`checkWorkbook`
 * rebuilds the state), and every sheet must be a query the engine accepts.
 */
@Injectable()
export class SnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
  ) {}

  async save(body: unknown): Promise<{ id: string }> {
    const raw =
      typeof body === 'object' && body !== null
        ? (body as { workbook?: unknown }).workbook
        : undefined;
    const checked = checkWorkbook(raw);
    if (checked.errors)
      throw new BadRequestException({
        message: 'Not a workbook.',
        errors: checked.errors,
      });
    const wb = checked.workbook;
    const cat = await this.catalogue.get();
    const errors = wb.sheets.flatMap((s, i) =>
      validateQuery(s.query as Query, cat).map(
        (e) => `sheets[${i}].query.${e.path}: ${e.message}`,
      ),
    );
    if (errors.length)
      throw new BadRequestException({
        message: 'A sheet breaks a query rule.',
        errors,
      });
    const id = snapshotId(wb);
    await this.prisma.explorerSnapshot.upsert({
      where: { id },
      create: { id, state: wb as unknown as Prisma.InputJsonObject },
      update: {},
    });
    return { id };
  }

  async load(id: string): Promise<{ workbook: Workbook }> {
    const row = ID.test(id)
      ? await this.prisma.explorerSnapshot.findUnique({ where: { id } })
      : null;
    // Checked again on the way out: a row written around `save` (a direct
    // write, an older rule) is served as no link rather than as raw JSON.
    const checked = row ? checkWorkbook(row.state) : null;
    if (!checked?.workbook) throw new NotFoundException('No such workbook.');
    return { workbook: checked.workbook };
  }
}
