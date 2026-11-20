/**
 * One-off: create the launch thematic-tag catalog (specs/006) on a database
 * that never ran `prisma db seed` since the tags shipped — production, whose
 * deploys apply migrations only.
 *
 * Narrower than `db seed` on purpose: the full seed also re-upserts offices and
 * other reference data, which would overwrite edits made in the control panel.
 * This touches `thematic_tags` and nothing else, and only **creates** missing
 * tags. A tag that exists (matched on `normalizedName`, the catalog's unique
 * key) is left exactly as staff left it, including a deactivated one. Tags
 * created on attribution to the oldest active SUPER_ADMIN, or `--as <email>`.
 * Idempotent: a second run creates nothing.
 *
 * Run (production, through the migrate service):
 *   docker compose --profile tools run --rm migrate sh -c \
 *     "cd /app/api && node_modules/.bin/tsx prisma/seed-thematic-tags.ts --dry-run"
 */

import { PrismaClient, Role } from '../src/generated/prisma/index';
import { PrismaPg } from '@prisma/adapter-pg';
import { THEMATIC_TAGS } from './data/thematic-tags';
import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');
const at = process.argv.indexOf('--as');
const AS_EMAIL = at >= 0 ? process.argv[at + 1] : undefined;

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    const admin = await prisma.user.findFirst({
      where: {
        role: Role.SUPER_ADMIN,
        isActive: true,
        ...(AS_EMAIL ? { email: AS_EMAIL } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });
    if (!admin) {
      throw new Error(
        AS_EMAIL
          ? `No active SUPER_ADMIN with email ${AS_EMAIL}.`
          : 'No active SUPER_ADMIN found; pass --as <email>.',
      );
    }

    const wanted = THEMATIC_TAGS.map((name) => ({
      name,
      normalizedName: name.trim().toLowerCase(),
    }));
    const existing = new Set(
      (
        await prisma.thematicTag.findMany({
          where: { normalizedName: { in: wanted.map((t) => t.normalizedName) } },
          select: { normalizedName: true },
        })
      ).map((t) => t.normalizedName),
    );
    const missing = wanted.filter((t) => !existing.has(t.normalizedName));

    console.log(
      `Catalog: ${wanted.length} launch tag(s); ${existing.size} already present, ${missing.length} to create` +
        (missing.length ? `: ${missing.map((t) => t.name).join(', ')}` : '') +
        ` (attributed to ${admin.email}).`,
    );
    if (DRY_RUN || missing.length === 0) {
      if (DRY_RUN) console.log('[DRY RUN] Nothing was changed.');
      return;
    }
    const { count } = await prisma.thematicTag.createMany({
      data: missing.map((t) => ({ ...t, createdByUserId: admin.id })),
      skipDuplicates: true,
    });
    console.log(`Created ${count} tag(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
