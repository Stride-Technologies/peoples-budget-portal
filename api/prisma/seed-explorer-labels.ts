/**
 * Load the Data Explorer's label taxonomy (specs/018 redesign W22–W24) from
 * `prisma/data/explorer-labels.json` into `explorer_labels`.
 *
 * The JSON is the source: each label's name, definition, aliases, mappings
 * and order are replaced from the file. **Status is taken from the file only
 * for a new label**; an existing label keeps the status it has, so approving
 * a label in the database is not undone by a re-seed — set `"status":
 * "approved"` in the file to approve on the next seed. Labels in the database
 * but not in the file are left alone (they may carry Stride's decisions).
 *
 *   pnpm --filter api db:seed:labels -- --dry-run
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index';
import {
  taxonomyFile,
  type TaxonomyFile,
} from '../src/explorer/labels/taxonomy';
import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');
class DryRun extends Error {}

async function main() {
  const file = taxonomyFile(
    JSON.parse(
      readFileSync(join(__dirname, 'data', 'explorer-labels.json'), 'utf8'),
    ) as TaxonomyFile,
  );
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    await prisma.$transaction(async (tx) => {
      const existing = new Map(
        (
          await tx.explorerLabel.findMany({
            select: { id: true, status: true },
          })
        ).map((l) => [l.id, l.status]),
      );
      // Parents first, so a sub-label's foreign key always resolves.
      for (const l of [
        ...file.filter((l) => !l.parentId),
        ...file.filter((l) => l.parentId),
      ]) {
        const data = {
          parentId: l.parentId,
          label: l.label,
          definition: l.definition,
          aliases: l.aliases,
          maps: l.maps,
          orderIndex: l.orderIndex,
        };
        const was = existing.get(l.id);
        await tx.explorerLabel.upsert({
          where: { id: l.id },
          create: { id: l.id, status: l.status, ...data },
          update: {
            ...data,
            ...(l.status === 'approved' ? { status: 'approved' } : {}),
          },
        });
        console.log(
          `${was ? 'updated' : 'created'} ${l.id} (${was ?? l.status})`,
        );
      }
      if (DRY_RUN) throw new DryRun();
    });
    console.log(`Done: ${file.length} labels.`);
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
    console.log('[DRY RUN] Rolled back; nothing was changed.');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
