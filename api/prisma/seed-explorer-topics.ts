/**
 * Load the Data Explorer's topics (specs/018 redesign W16) from
 * `prisma/data/explorer-topics.json` into `explorer_topics` /
 * `explorer_topic_rules`.
 *
 * The JSON is the source until staff can edit topics in the control panel:
 * each topic's label, description, aliases and rules are replaced from the
 * file. Its **status is never touched** on an existing topic — a topic staff
 * approved stays approved. New topics arrive as `draft`. Topics in the
 * database but not in the file are left alone. Idempotent.
 *
 * --dry-run does the real writes in a transaction and rolls it back.
 *
 *   pnpm --filter api db:seed:topics -- --dry-run
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index';
import { RULE_KINDS, type RuleKind } from '../src/explorer/topics';
import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');

interface TopicFile {
  topics: {
    id: string;
    label: string;
    description?: string;
    aliases: Record<string, string[]>;
    rules: [string, string][];
  }[];
}

class DryRun extends Error {}

async function main() {
  const { topics } = JSON.parse(
    readFileSync(join(__dirname, 'data', 'explorer-topics.json'), 'utf8'),
  ) as TopicFile;
  for (const t of topics)
    for (const [kind, value] of t.rules) {
      if (!(RULE_KINDS as readonly string[]).includes(kind))
        throw new Error(`${t.id}: unknown rule kind "${kind}".`);
      if (kind === 'keyword') new RegExp(value, 'i'); // throws on a bad pattern
    }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    await prisma.$transaction(async (tx) => {
      const existing = new Set(
        (await tx.explorerTopic.findMany({ select: { id: true } })).map(
          (t) => t.id,
        ),
      );
      for (const t of topics) {
        const data = {
          label: t.label,
          description: t.description ?? null,
          aliases: t.aliases,
        };
        await tx.explorerTopic.upsert({
          where: { id: t.id },
          create: { id: t.id, ...data },
          update: data,
        });
        await tx.explorerTopicRule.deleteMany({ where: { topicId: t.id } });
        await tx.explorerTopicRule.createMany({
          data: t.rules.map(([kind, value]) => ({
            topicId: t.id,
            kind: kind as RuleKind,
            value,
          })),
        });
        console.log(
          `${existing.has(t.id) ? 'updated' : 'created'} ${t.id} (${t.rules.length} rules)`,
        );
      }
      if (DRY_RUN) throw new DryRun();
    });
    console.log(`Done: ${topics.length} topics.`);
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
    console.log('[DRY RUN] Rolled back; nothing was changed.');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
