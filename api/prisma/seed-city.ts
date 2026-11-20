/**
 * Load one city into an EMPTY, migrated database: its offices and goals, then one year's
 * Annual Investment Program, published.
 *
 *   pnpm --filter api db:seed:city                              # the sample city
 *   pnpm --filter api db:seed:city -- --dir /path/to/my-city    # your own (see data/sample-city/README.md)
 *   pnpm --filter api db:seed:city -- --draft                   # leave every program a draft
 *
 * It reuses the real seeders and the real publish path, so the result is what staff would have
 * produced by hand:
 *
 * 1. reference data (`seed.ts`) with the city's offices, clusters and goals, and the first
 *    administrator (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`);
 * 2. the AIP in `aip-<year>.json` (`seed-aip.ts`), as drafts;
 * 3. unless `--draft`: every program the readiness check passes is published as that
 *    administrator (`publish-cycle.ts`), and the year's public Overview is switched on.
 *
 * Programs the readiness check holds back stay drafts, with their warnings, for staff to fix.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/index';

interface Manifest {
  /** Shown in this script's output only; the portal's names come from the `LGU_*` variables. */
  name: string;
  /** The fiscal year of `aip-<year>.json`. */
  aipYear: number;
  /** The document the AIP rows cite as their source, if the file's rows carry a `sourceRow`. */
  source?: { name: string; url?: string };
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};
const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const run = (
  script: string,
  args: string[] = [],
  env: Record<string, string> = {},
) =>
  execFileSync(tsx, [join('prisma', script), ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });

async function main(): Promise<void> {
  const given = arg('dir');
  const dir = given
    ? resolve(
        isAbsolute(given) ? given : join(process.env.INIT_CWD ?? '.', given),
      )
    : join(process.cwd(), 'prisma', 'data', 'sample-city');
  const need = (file: string) => {
    if (!existsSync(join(dir, file)))
      throw new Error(`${join(dir, file)} is missing.`);
    return join(dir, file);
  };
  const m = JSON.parse(readFileSync(need('manifest.json'), 'utf8')) as Manifest;
  if (!Number.isInteger(m.aipYear))
    throw new Error('manifest.json needs "aipYear", e.g. 2027.');
  const aipFile = need(`aip-${m.aipYear}.json`);
  ['offices.json', 'goals.json', 'clusters.json'].forEach(need);

  const admin = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!admin || !process.env.SEED_ADMIN_PASSWORD)
    throw new Error(
      'Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (api/.env): the first administrator.',
    );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    if ((await prisma.office.count()) > 0)
      throw new Error(
        'Not an empty database: this loads a city into a fresh one only.',
      );

    run('seed.ts', [], { SEED_CITY_DIR: dir });
    run('seed-aip.ts', [], {
      AIP_SEED_YEAR: String(m.aipYear),
      AIP_SEED_FILE: aipFile,
      ...(m.source
        ? {
            AIP_SEED_SOURCE_NAME: m.source.name,
            AIP_SEED_SOURCE_URL: m.source.url ?? '',
          }
        : {}),
    });
    if (!process.argv.includes('--draft')) {
      run('publish-cycle.ts', ['--year', String(m.aipYear), '--as', admin]);
      await prisma.aIPCycle.updateMany({
        where: { fiscalYear: m.aipYear },
        data: { publicAipOverviewEnabled: true },
      });
    }

    const byStatus = await prisma.program.groupBy({
      by: ['status'],
      _count: true,
      where: { deletedAt: null },
    });
    console.log(
      `${m.name} loaded: ${await prisma.office.count()} offices, ${await prisma.finishLine.count()} goals, AIP ${m.aipYear} (${byStatus.map((c) => `${c.status} ${c._count}`).join(', ')}).`,
    );
    console.log(`Sign in as ${admin}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
