/**
 * The labelling run (specs/018 redesign W22–W25, W30): every budget row gets
 * the labels that say what it IS, from its own text, once.
 *
 *   pnpm --filter api db:label -- --dry-run          # what would be labelled, estimated cost
 *   pnpm --filter api db:label -- [--max-usd 10] [--limit N] [--all]
 *
 * Rows: AIP programs and their projects/activities (the published version
 * when there is one), every budget book item, account lines and Projects.
 * Incremental: a row is read again only when its text changed (`--all` also
 * re-asks the model for unchanged rows, after a taxonomy change). A row Stride
 * reviewed is never touched (W23). Labels go live at once unless the gate
 * sends them to review (`labelling.ts gate`). Writes
 * `docs/design/explorer-labels-report.md`.
 *
 * Env: DATABASE_URL, LLM_* and EMBED_* as the API uses them. Budget data only
 * leaves the database (public record, AGENTS.md "Data and AI agents").
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index';
import { inferenceFromEnv } from '../src/explorer/adapters/sidecar';
import { llmPricePerMTok } from '../src/explorer/explorer.config';
import {
  batches,
  gate,
  hashOf,
  labelSchema,
  labelText,
  nearest,
  parseLabels,
  taxonomyListing,
  textOf,
  type LabelRow,
  type TaxonomyLabel,
} from '../src/explorer/labels/labelling';
import { sha } from '../src/explorer/match';
import { FUND_SOURCE_NAMES } from '../src/open-data/open-data.mapper';
import { LIVE_PROGRAM } from '../src/programs/program-filters';
import 'dotenv/config';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DRY_RUN = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');
const MAX_USD = Number(arg('max-usd') ?? 10);
const LIMIT = arg('limit') ? Number(arg('limit')) : Infinity;
const PARALLEL = 4;
const PROMPT_VERSION = 'label.v1';
/** specs/020 B1.3: written by `db:label:calibrate`; absent → the fixed REVIEW_BELOW. */
const CALIBRATION = join(__dirname, 'data', 'explorer-calibration.json');
type Calibration = {
  fittedAt: string;
  target: number;
  threshold: number;
  goldRows: number;
  picks: number;
  curve: { x: number[]; y: number[]; n: number[] };
  ece: Record<string, { value: number; lo: number; hi: number }>;
};
const calibration: Calibration | null = existsSync(CALIBRATION)
  ? (JSON.parse(readFileSync(CALIBRATION, 'utf8')) as Calibration)
  : null;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Json = Record<string, unknown>;
const list = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const nonZero = (v: unknown) =>
  v !== null && v !== undefined && Number(v) !== 0;
const CLASS_NAMES = [
  ['ps', 'Personnel Services'],
  ['mooe', 'Maintenance and Other Operating Expenses'],
  ['fe', 'Financial Expenses'],
  ['co', 'Capital Outlay'],
] as const;
const classesOf = (r: Json) =>
  CLASS_NAMES.filter(([k]) => nonZero(r[k])).map(([, n]) => n);
const fundName = (f: string | null | undefined) =>
  f ? (FUND_SOURCE_NAMES[f] ?? f) : null;

/** Every row the explorer can count, with the text the model reads. */
async function collect(): Promise<LabelRow[]> {
  const rows: LabelRow[] = [];

  const programs = await prisma.program.findMany({
    where: LIVE_PROGRAM,
    include: {
      office: { select: { name: true } },
      papSector: { select: { name: true } },
      publishedVersion: { select: { snapshot: true } },
      projectActivities: true,
    },
  });
  for (const p of programs) {
    // What the public sees when published; the working row otherwise.
    const raw = (p.publishedVersion?.snapshot ?? p) as unknown as Json;
    const pas = list(raw.projectActivities);
    const byId = new Map(pas.map((a) => [String(a.id), a]));
    const office = p.office?.name ?? null;
    rows.push({
      rowId: p.id,
      rowKind: 'aip-program',
      rootId: p.id,
      text: textOf.program({
        name: str(raw.name) ?? p.name,
        description: str(raw.description),
        majorFinalOutput: str(raw.majorFinalOutput),
        office,
        sector: p.papSector?.name,
        classes: classesOf(raw),
        children: pas.map((a) => String(a.name)),
      }),
    });
    for (const a of pas) {
      const parents: string[] = [];
      for (
        let up = byId.get(String(a.parentProjectActivityId));
        up && parents.length < 5;
        up = byId.get(String(up.parentProjectActivityId))
      )
        parents.unshift(String(up.name));
      rows.push({
        rowId: String(a.id),
        rowKind: 'aip-pa',
        rootId: p.id,
        text: textOf.activity({
          name: String(a.name),
          kind: a.type === 'PROJECT' ? 'Project' : 'Activity',
          description: str(a.description),
          expectedOutput: str(a.expectedOutput),
          parents: [str(raw.name) ?? p.name, ...parents],
          office,
          classes: classesOf(a),
        }),
      });
    }
  }

  const items = await prisma.budgetItem.findMany({
    select: {
      id: true,
      parentId: true,
      rootItemId: true,
      name: true,
      majorFinalOutput: true,
      fundSource: true,
      ps: true,
      mooe: true,
      fe: true,
      co: true,
      office: { select: { name: true } },
    },
  });
  const itemById = new Map(items.map((i) => [i.id, i]));
  const kids = new Map<string, string[]>();
  for (const i of items)
    if (i.parentId)
      kids.set(i.parentId, [...(kids.get(i.parentId) ?? []), i.name]);
  for (const i of items) {
    const parents: string[] = [];
    for (
      let up = i.parentId ? itemById.get(i.parentId) : undefined;
      up && parents.length < 5;
      up = up.parentId ? itemById.get(up.parentId) : undefined
    )
      parents.unshift(up.name);
    rows.push({
      rowId: i.id,
      rowKind: 'budget-item',
      rootId: i.rootItemId,
      text: textOf.item({
        name: i.name,
        majorFinalOutput: i.majorFinalOutput,
        parents,
        office: i.office.name,
        fund: fundName(i.fundSource),
        classes: classesOf(i),
        children: kids.get(i.id) ?? [],
      }),
    });
  }

  const lines = await prisma.budgetObjectLine.findMany({
    select: {
      id: true,
      accountTitle: true,
      uacsCode: true,
      expenseClass: true,
      fundSource: true,
      office: { select: { name: true } },
    },
  });
  for (const l of lines)
    rows.push({
      rowId: l.id,
      rowKind: 'object-line',
      rootId: l.id,
      text: textOf.account({
        title: l.accountTitle ?? l.uacsCode,
        code: l.uacsCode,
        expenseClass: l.expenseClass,
        office: l.office.name,
        fund: fundName(l.fundSource),
      }),
    });

  const projects = await prisma.pPMP.findMany({
    select: {
      id: true,
      name: true,
      fundingProgram: true,
      classification: true,
      office: { select: { name: true } },
      lineItems: { select: { lineItemName: true } },
    },
  });
  for (const p of projects)
    rows.push({
      rowId: p.id,
      rowKind: 'project',
      rootId: p.id,
      text: textOf.project({
        name: p.name,
        fundingProgram: p.fundingProgram,
        classification: p.classification,
        office: p.office.name,
        items: p.lineItems.map((li) => li.lineItemName),
      }),
    });
  // One row per id: FY2026's book items reuse the old Program/PA ids (specs/012), and where
  // those programs are still live (dev, 617 on 2026-11-12) both kinds would share one
  // explorer_rows row, flip its text hash and be relabelled every run. Labels attach by id,
  // so one reading serves both; the book item (pushed later) wins, with the enacted text.
  return [...new Map(rows.map((r) => [r.rowId, r])).values()];
}

/** Rate limits (429) and timeouts are waited out, a few times, longer each time. */
async function retry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = (e as Error).message;
      if (i >= tries || !/\b429\b|timeout|aborted|ECONNRESET/i.test(msg))
        throw e;
      await new Promise((r) => setTimeout(r, 15_000 * i));
    }
  }
}

/** Run `fn` over `xs`, `n` at a time. */
async function pool<T>(xs: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < xs.length) await fn(xs[i++]);
    }),
  );
}

async function main() {
  const labels: TaxonomyLabel[] = await prisma.explorerLabel.findMany({
    select: { id: true, parentId: true, label: true, definition: true },
    orderBy: [{ parentId: 'asc' }, { orderIndex: 'asc' }],
  });
  if (!labels.length) throw new Error('No labels: run db:seed:labels first.');
  const byId = new Map(labels.map((l) => [l.id, l]));
  const parentOf = (id: string) => byId.get(id)?.parentId ?? null;

  const all = await collect();
  const known = new Map(
    (
      await prisma.explorerRow.findMany({
        select: {
          rowId: true,
          textHash: true,
          labelledAt: true,
          reviewedAt: true,
          embeddingModel: true,
        },
      })
    ).map((r) => [r.rowId, r]),
  );
  const changed = all.filter(
    (r) => known.get(r.rowId)?.textHash !== hashOf(r.text),
  );
  const todo = all
    .filter((r) => {
      const k = known.get(r.rowId);
      if (k?.reviewedAt) return false;
      return ALL || !k?.labelledAt || k.textHash !== hashOf(r.text);
    })
    .slice(0, LIMIT);
  const byKind = (xs: LabelRow[]) =>
    Object.entries(
      xs.reduce<Record<string, number>>(
        (m, r) => ({ ...m, [r.rowKind]: (m[r.rowKind] ?? 0) + 1 }),
        {},
      ),
    )
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
  console.log(
    `Rows: ${all.length} (${byKind(all)}). Text changed: ${changed.length}. To label: ${todo.length} (${byKind(todo)}).`,
  );

  const system = readFileSync(
    join(__dirname, '..', 'src', 'explorer', 'prompts', `${PROMPT_VERSION}.md`),
    'utf8',
  ).replace('{{TAXONOMY}}', taxonomyListing(labels));
  const price = llmPricePerMTok();
  // ponytail: ~4 chars a token; the real count comes back with each call.
  const estIn = batches(todo).reduce(
    (s, b) =>
      s + (system.length + b.reduce((t, r) => t + r.text.length + 60, 0)) / 4,
    0,
  );
  const estUsd = (estIn * price.in + todo.length * 60 * price.out) / 1e6;
  console.log(
    `Estimated cost: US$${estUsd.toFixed(2)} at ${price.in}/${price.out} per M tokens (ceiling US$${MAX_USD}).`,
  );
  if (DRY_RUN || !todo.length) return;

  // specs/020 B3.1: whichever backend EXPLORER_INFERENCE* names (openai by default).
  const { llm, embedder } = inferenceFromEnv();
  if (!embedder) throw new Error('EMBED_MODEL unset: the gate needs vectors.');

  // Vectors: the rows about to be labelled whose text changed or whose vector is another
  // model's (B3.4), and the taxonomy (cheap; every run).
  const toEmbed = todo.filter(
    (r) =>
      known.get(r.rowId)?.textHash !== hashOf(r.text) ||
      known.get(r.rowId)?.embeddingModel !== embedder.model,
  );
  const vectors = new Map<string, number[]>();
  for (const b of batches(toEmbed, 256)) {
    const v = await retry(() =>
      embedder.embed(
        b.map((r) => r.text),
        'passage',
      ),
    );
    b.forEach((r, i) => vectors.set(r.rowId, v[i]));
    // Raw SQL, not `upsert`: Prisma 7 kept ~215 KB per upserted vector on the heap and the
    // 12,896-row dev run died at the 2 GB limit (2026-11-12); raw writes stay flat.
    await prisma.$transaction(
      b.map(
        (r) => prisma.$executeRaw`
          insert into explorer_rows (row_id, row_kind, root_id, text, text_hash, embedding, embedding_model, updated_at)
          values (${r.rowId}, ${r.rowKind}, ${r.rootId}, ${r.text}, ${hashOf(r.text)},
                  ${vectors.get(r.rowId)!}::real[], ${embedder.model}, now() at time zone 'utc')
          on conflict (row_id) do update set
            row_kind = excluded.row_kind, root_id = excluded.root_id, text = excluded.text,
            text_hash = excluded.text_hash, embedding = excluded.embedding,
            embedding_model = excluded.embedding_model,
            labelled_at = null, updated_at = now() at time zone 'utc'`,
      ),
    );
    process.stdout.write(`\rEmbedded ${vectors.size}/${toEmbed.length}`);
  }
  if (toEmbed.length) console.log();
  const missing = todo.filter((r) => !vectors.has(r.rowId)).map((r) => r.rowId);
  for (const r of await prisma.explorerRow.findMany({
    where: { rowId: { in: missing } },
    select: { rowId: true, embedding: true },
  }))
    vectors.set(r.rowId, r.embedding);

  const tops = labels.filter((l) => !l.parentId);
  const topVecs = (
    await retry(() => embedder.embed(tops.map((l) => labelText(l))))
  ).map((vec, i) => ({ id: tops[i].id, vec }));

  const labelIds = labels.map((l) => l.id);
  let spent = 0;
  let done = 0;
  let unanswered = 0;
  let stopped = false;
  const suggestions: { label: string; text: string }[] = [];

  await pool(batches(todo), PARALLEL, async (batch) => {
    if (stopped) return;
    if (spent >= MAX_USD) {
      stopped = true;
      return;
    }
    const ids = batch.map((r) => r.rowId);
    const user = JSON.stringify({
      rows: batch.map((r) => ({ id: r.rowId, text: r.text })),
    });
    let res: Awaited<ReturnType<typeof llm.complete>>;
    try {
      res = await retry(() =>
        llm.complete({ system, user, schema: labelSchema(ids, labelIds) }),
      );
    } catch (e) {
      console.error(
        `\nBatch failed (left for the next run): ${(e as Error).message}`,
      );
      unanswered += batch.length;
      return;
    }
    spent +=
      ((res.tokensIn ?? 0) * price.in + (res.tokensOut ?? 0) * price.out) / 1e6;
    let answer: ReturnType<typeof parseLabels> = new Map();
    try {
      answer = parseLabels(res.text, ids, labelIds);
    } catch {
      /* unparseable: every row stays unlabelled, the next run asks again */
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.explorerModelCall.create({
        data: {
          kind: 'label',
          model: res.model,
          promptHash: sha(system),
          input: { promptVersion: PROMPT_VERSION, rows: ids },
          rawOutput: res.text,
          ok: answer.size === batch.length,
          latencyMs: res.latencyMs,
          tokensIn: res.tokensIn ?? null,
          tokensOut: res.tokensOut ?? null,
        },
      }),
      prisma.explorerAnnotation.deleteMany({
        where: { rowId: { in: [...answer.keys()] }, decidedBy: 'model' },
      }),
      ...batch.flatMap((r) => {
        const a = answer.get(r.rowId);
        if (!a) return [];
        if (a.suggest) {
          const top = a.picks.map((p) => parentOf(p.id) ?? p.id)[0];
          if (top) suggestions.push({ label: top, text: a.suggest });
        }
        const decided = gate(
          a.picks,
          nearest(vectors.get(r.rowId) ?? [], topVecs),
          parentOf,
          calibration?.threshold,
        );
        return [
          prisma.explorerAnnotation.createMany({
            data: decided.map((d) => ({
              rowId: r.rowId,
              rootId: r.rootId,
              labelId: d.id,
              confidence: d.confidence,
              reason: d.reason,
              inReview: d.inReview,
            })),
          }),
          prisma.explorerRow.update({
            where: { rowId: r.rowId },
            data: { labelledAt: now },
          }),
        ];
      }),
    ]);
    unanswered += batch.length - answer.size;
    done += answer.size;
    process.stdout.write(
      `\rLabelled ${done}/${todo.length} · US$${spent.toFixed(3)}`,
    );
  });
  console.log(
    `\n${stopped ? `Stopped at the US$${MAX_USD} ceiling. ` : ''}Labelled ${done}; ${unanswered} left for the next run. Spent about US$${spent.toFixed(3)}.`,
  );
  await report(labels, suggestions);
}

/** The state of every label, for Stride: rows live, rows in review, Not classified per kind. */
async function report(
  labels: TaxonomyLabel[],
  suggestions: { label: string; text: string }[],
) {
  const [rows, counts] = await Promise.all([
    prisma.explorerRow.findMany({
      select: { rowId: true, rowKind: true, labelledAt: true },
    }),
    prisma.explorerAnnotation.groupBy({
      by: ['labelId', 'inReview'],
      _count: { _all: true },
    }),
  ]);
  const live = await prisma.explorerAnnotation.findMany({
    where: { inReview: false },
    select: { rowId: true },
  });
  const labelled = new Set(live.map((a) => a.rowId));
  const n = (id: string, review: boolean) =>
    counts.find((c) => c.labelId === id && c.inReview === review)?._count
      ._all ?? 0;
  const kinds = [...new Set(rows.map((r) => r.rowKind))];
  const out = [
    '# Data Explorer labels — run report',
    '',
    `Generated by \`pnpm --filter api db:label\` on ${new Date().toISOString().slice(0, 10)} (specs/018 redesign W22–W25, W30). Rows counted per label; a row can carry several. Review rows count nowhere until Stride decides them (\`db:label:review\`).`,
    '',
    '## Coverage',
    '',
    '| Kind | Rows | Labelled (live) | Not classified | Not yet read |',
    '|---|--:|--:|--:|--:|',
    ...kinds.map((k) => {
      const of = rows.filter((r) => r.rowKind === k);
      const yes = of.filter((r) => labelled.has(r.rowId)).length;
      const unread = of.filter((r) => !r.labelledAt).length;
      return `| ${k} | ${of.length} | ${yes} | ${of.length - yes - unread} | ${unread} |`;
    }),
    '',
    '## Labels',
    '',
    '| Label | Live | In review |',
    '|---|--:|--:|',
    ...labels
      .filter((l) => !l.parentId)
      .flatMap((l) => [
        `| **${l.label}** \`${l.id}\` | ${n(l.id, false)} | ${n(l.id, true)} |`,
        ...labels
          .filter((s) => s.parentId === l.id)
          .map(
            (s) =>
              `| ↳ ${s.label} \`${s.id}\` | ${n(s.id, false)} | ${n(s.id, true)} |`,
          ),
      ]),
    '',
    '## Confidence calibration (specs/020 B1.3)',
    '',
    ...(calibration
      ? [
          `Isotonic fit on ${calibration.goldRows} gold rows (${calibration.picks} picks), ${calibration.fittedAt}. Review below stated confidence **${calibration.threshold}** keeps live labels under ${calibration.target * 100}% error. ECE (95% bootstrap CI): ${Object.entries(
            calibration.ece,
          )
            .map(
              ([k, v]) =>
                `${k} ${v.value.toFixed(3)} [${v.lo.toFixed(3)}, ${v.hi.toFixed(3)}]`,
            )
            .join('; ')}.`,
          '',
          '| Stated confidence ≥ | P(right) | Picks |',
          '|--:|--:|--:|',
          ...calibration.curve.x.map(
            (x, i) =>
              `| ${x.toFixed(2)} | ${calibration.curve.y[i].toFixed(3)} | ${calibration.curve.n[i]} |`,
          ),
        ]
      : [
          'No gold set yet: the gate uses the fixed REVIEW_BELOW. Draw one with `db:label:review -- export --gold 400`, have Stride decide it, commit it to `prisma/data/explorer-gold/`, then run `db:label:calibrate`.',
        ]),
    '',
    '## Sub-labels the model would add (this run)',
    '',
    ...(suggestions.length
      ? Object.entries(
          suggestions.reduce<Record<string, Record<string, number>>>((m, s) => {
            const k = s.text.toLowerCase();
            (m[s.label] ??= {})[k] = (m[s.label][k] ?? 0) + 1;
            return m;
          }, {}),
        ).map(
          ([label, texts]) =>
            `- **${label}**: ${Object.entries(texts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12)
              .map(([t, c]) => `${t} (${c})`)
              .join(', ')}`,
        )
      : ['None this run.']),
    '',
  ].join('\n');
  writeFileSync(
    join(__dirname, '..', '..', 'docs', 'design', 'explorer-labels-report.md'),
    out,
  );
  console.log('Wrote docs/design/explorer-labels-report.md');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
