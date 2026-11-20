/**
 * Re-embed every explorer row whose vector another model made (specs/020 B3.4).
 *
 *   pnpm --filter api db:label:embed -- [--dry-run] [--all]
 *
 * After switching EMBED_MODEL (or EXPLORER_INFERENCE_EMBED) a vector from the
 * old model cannot be compared with one from the new: this rewrites them all
 * with the current embedder. Labels are untouched (`labelled_at` stays), so no
 * chat-model call is made. Writes with raw SQL in batches, never a Prisma
 * upsert (ARCHITECTURE-ESSENTIALS: ~215 KB of heap kept per upserted vector).
 * `--all` re-embeds rows already on the current model too.
 *
 * Env: DATABASE_URL, EMBED_MODEL and the backend's settings. Budget text only.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index';
import { inferenceFromEnv } from '../src/explorer/adapters/sidecar';
import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');
const BATCH = 64;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function retry<T>(fn: () => Promise<T>, tries = 8): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries || !/\b429\b|timeout|aborted|ECONNRESET/i.test(String(e)))
        throw e;
      await new Promise((r) => setTimeout(r, 15_000 * i));
    }
  }
}

async function main() {
  const { embedder } = inferenceFromEnv();
  if (!embedder) throw new Error('EMBED_MODEL unset.');
  const rows = await prisma.$queryRaw<{ row_id: string; text: string }[]>`
    select row_id, text from explorer_rows
    where ${ALL} or embedding_model is distinct from ${embedder.model}
    order by row_id`;
  const by = await prisma.$queryRaw<{ model: string | null; n: bigint }[]>`
    select embedding_model as model, count(*) as n from explorer_rows group by 1 order by 2 desc`;
  console.log(
    `Now: ${by.map((b) => `${b.model ?? '(none)'} ${b.n}`).join(', ')}. To embed with ${embedder.model}: ${rows.length}.`,
  );
  if (DRY_RUN) return;
  for (let i = 0; i < rows.length; i += BATCH) {
    const b = rows.slice(i, i + BATCH);
    const v = await retry(() =>
      embedder.embed(
        b.map((r) => r.text),
        'passage',
      ),
    );
    await prisma.$transaction(
      b.map(
        (r, j) => prisma.$executeRaw`
          update explorer_rows set embedding = ${v[j]}::real[], embedding_model = ${embedder.model},
            updated_at = now() at time zone 'utc'
          where row_id = ${r.row_id}`,
      ),
    );
    process.stdout.write(`\rEmbedded ${i + b.length}/${rows.length}`);
  }
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
