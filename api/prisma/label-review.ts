/**
 * Stride's review of the least certain labels (specs/018 redesign W23).
 *
 *   pnpm --filter api db:label:review -- export [review.csv]
 *   pnpm --filter api db:label:review -- apply review.csv [--dry-run]
 *
 * `export` writes every row that has a label in review: its text, every label
 * the model proposed (with confidence and reason) and an empty `decision`
 * column. Rows come in queue order (specs/020 B1.4): the ones their nearest
 * neighbours contradict first, then the least certain, kept diverse.
 * `export --compounds 5 [--seed gold-compounds-v1]` draws compound cases
 * (specs/020, decision #16): for each reviewed compound in
 * `prisma/data/explorer-compounds.json`, up to that many rows whose name has
 * the phrase and, for a kept-out phrase, rows with its trigger word alone. The
 * sheet is blind like a gold sheet; which case a row is goes in a sidecar
 * `<file>.cases.csv`, and the labeller's score on the cases is printed.
 * `export --gold 400 [--seed gold-v1]` instead draws a gold set (B1.2): that
 * many labelled, unreviewed rows, stratified by office, live labels and all.
 * The filled gold sheet is committed to `prisma/data/explorer-gold/` and is
 * what `db:label:calibrate` fits on. Fill `decision` with the label ids the row should carry (space- or
 * comma-separated), or `none` for Not classified; leave it empty to keep the
 * row in review. `apply` replaces those rows' labels with the decision,
 * marked `decided_by = stride`, and the labelling run never touches them
 * again. Budget text only: the sheet holds no personal data.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index';
import {
  calibrated,
  officeOf,
  reviewOrder,
  stratifiedSample,
  type Curve,
} from '../src/explorer/labels/calibration';
import {
  parseCsv,
  reviewCsv,
  reviewDecisions,
} from '../src/explorer/labels/labelling';
import {
  compoundCases,
  compoundScore,
  triggersOf,
} from '../src/explorer/labels/compound-gold';
import type { Compound } from '../src/explorer/phrases';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';

const [mode, file = 'explorer-label-review.csv'] = process.argv
  .slice(2)
  .filter(
    (a, i, xs) =>
      !a.startsWith('--') &&
      a !== '--' &&
      !['--gold', '--seed', '--compounds'].includes(xs[i - 1]),
  );
const DRY_RUN = process.argv.includes('--dry-run');
const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const COMPOUNDS = flag('compounds') ? Number(flag('compounds')) : 0;
const GOLD = flag('gold') ? Number(flag('gold')) : COMPOUNDS ? 1 : 0;
const SEED = flag('seed') ?? (COMPOUNDS ? 'gold-compounds-v1' : 'gold-v1');
const CALIBRATION = join(__dirname, 'data', 'explorer-calibration.json');
class DryRun extends Error {}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function exportSheet() {
  const ids = COMPOUNDS
    ? await compoundIds()
    : GOLD
      ? await goldIds()
      : await queueIds();
  const [rows, picks] = await Promise.all([
    prisma.explorerRow.findMany({
      where: { rowId: { in: ids } },
      select: { rowId: true, rowKind: true, text: true },
      orderBy: [{ rowKind: 'asc' }, { text: 'asc' }],
    }),
    prisma.explorerAnnotation.findMany({
      where: { rowId: { in: ids } },
      select: {
        rowId: true,
        labelId: true,
        confidence: true,
        reason: true,
        inReview: true,
      },
      orderBy: { confidence: 'desc' },
    }),
  ]);
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => order.get(a.rowId)! - order.get(b.rowId)!);
  writeFileSync(
    file,
    reviewCsv(
      rows.map((r) => ({
        ...r,
        picks: picks
          .filter((p) => p.rowId === r.rowId)
          .map((p) => ({
            id: p.labelId,
            confidence: p.confidence,
            reason: p.reason,
            inReview: p.inReview,
          })),
      })),
      { blind: GOLD > 0 },
    ) + '\n',
  );
  console.log(
    `Wrote ${rows.length} rows to ${file}${GOLD ? ` (gold set, seed ${SEED})` : ' (review queue order)'}.`,
  );
}

/** Compound cases (decision #16): the rows, a sidecar of which case each is, and the labeller's score. */
async function compoundIds(): Promise<string[]> {
  const data = <T>(f: string) =>
    JSON.parse(readFileSync(join(__dirname, 'data', f), 'utf8')) as T;
  const compounds = data<{ compounds: Compound[] }>('explorer-compounds.json').compounds;
  type L = { id: string; aliases?: Record<string, string[]>; subs?: L[] };
  const triggers = triggersOf(
    data<{ topics: { id: string; rules: [string, string][] }[] }>('explorer-topics.json').topics,
    data<{ labels: L[] }>('explorer-labels.json').labels,
  );
  // A row already on a random gold sheet is decided there, not twice.
  const goldDir = join(__dirname, 'data', 'explorer-gold');
  const onGold = new Set(
    readdirSync(goldDir)
      .filter((f) => /^gold-v\d+\.csv$/.test(f))
      .flatMap((f) =>
        parseCsv(readFileSync(join(goldDir, f), 'utf8'))
          .slice(1)
          .map((r) => r[0]),
      ),
  );
  const rows = (
    await prisma.explorerRow.findMany({
      where: { labelledAt: { not: null }, reviewedAt: null },
      select: { rowId: true, text: true },
    })
  ).filter((r) => !onGold.has(r.rowId));
  const cases = compoundCases(rows, compounds, triggers, COMPOUNDS, SEED);
  const sidecar = file.replace(/\.csv$/, '') + '.cases.csv';
  writeFileSync(
    sidecar,
    ['row_id,phrase,role,labels,word', ...cases.map((c) => [c.rowId, c.phrase, c.role, c.labels.join(' '), c.word].join(','))].join('\n') + '\n',
  );
  const live = await prisma.explorerAnnotation.findMany({
    where: { rowId: { in: cases.map((c) => c.rowId) }, inReview: false },
    select: { rowId: true, labelId: true },
  });
  const picks = new Map<string, string[]>();
  for (const a of live) picks.set(a.rowId, [...(picks.get(a.rowId) ?? []), a.labelId]);
  console.log(`Compound cases: ${cases.length} rows of ${rows.length} (${cases.filter((c) => c.role === 'compound').length} compound, ${cases.filter((c) => c.role === 'contrast').length} contrast) → ${sidecar}`);
  console.log('phrase | kept out of | compound rows given that label | contrast rows given it');
  for (const s of compoundScore(cases, picks))
    console.log(`${s.phrase} | ${s.labels.join(' ')} | ${s.trapped}/${s.compounds} | ${s.contrastHit}/${s.contrasts}`);
  return cases.map((c) => c.rowId);
}

/** B1.2: `GOLD` labelled rows no one has reviewed, stratified by office. */
async function goldIds(): Promise<string[]> {
  const rows = await prisma.explorerRow.findMany({
    where: { labelledAt: { not: null }, reviewedAt: null },
    select: { rowId: true, text: true },
  });
  const sample = stratifiedSample(
    rows,
    (r) => r.rowId,
    (r) => officeOf(r.text),
    GOLD,
    SEED,
  );
  const offices = new Set(sample.map((r) => officeOf(r.text)));
  console.log(
    `Gold draw: ${sample.length} of ${rows.length} rows, ${offices.size} offices.`,
  );
  return sample.map((r) => r.rowId);
}

/** B1.4: rows with a label in review, neighbour disagreement first. */
async function queueIds(): Promise<string[]> {
  const curve: Curve | null = existsSync(CALIBRATION)
    ? (JSON.parse(readFileSync(CALIBRATION, 'utf8')) as { curve: Curve }).curve
    : null;
  const inReview = await prisma.explorerAnnotation.findMany({
    where: { inReview: true },
    select: { rowId: true },
    distinct: ['rowId'],
  });
  const wanted = new Set(inReview.map((a) => a.rowId));
  // Every labelled row is a neighbour: its gold labels when reviewed, else its live ones.
  const [vecs, anns] = await Promise.all([
    prisma.explorerRow.findMany({
      where: { labelledAt: { not: null } },
      select: {
        rowId: true,
        embedding: true,
        reviewedAt: true,
        embeddingModel: true,
      },
    }),
    prisma.explorerAnnotation.findMany({
      select: { rowId: true, labelId: true, confidence: true, inReview: true },
    }),
  ]);
  // One model's vectors only (B3.4): the most common one; others wait for db:label:embed.
  const counts = new Map<string | null, number>();
  for (const v of vecs)
    counts.set(v.embeddingModel, (counts.get(v.embeddingModel) ?? 0) + 1);
  const model = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const same = vecs.filter((v) => v.embeddingModel === model);
  if (same.length < vecs.length)
    console.log(
      `Ordering by ${model ?? '(no model)'} vectors: ${vecs.length - same.length} rows on another model are left to the end.`,
    );
  const byRow = new Map<string, typeof anns>();
  for (const a of anns) byRow.set(a.rowId, [...(byRow.get(a.rowId) ?? []), a]);
  const pool = same
    .filter((v) => !wanted.has(v.rowId) && v.embedding.length)
    .map((v) => ({
      vec: v.embedding,
      labels: (byRow.get(v.rowId) ?? [])
        .filter((a) => !a.inReview)
        .map((a) => a.labelId),
    }));
  const rows = same
    .filter((v) => wanted.has(v.rowId))
    .map((v) => {
      const own = byRow.get(v.rowId) ?? [];
      const least = Math.min(...own.map((a) => a.confidence), 1);
      return {
        rowId: v.rowId,
        vec: v.embedding,
        labels: own.map((a) => a.labelId),
        certainty: curve ? calibrated(curve, least) : least,
      };
    });
  const queue = reviewOrder(rows, pool);
  const contested = queue.filter((q) => q.disagreement >= 0.5).length;
  console.log(
    `Queue: ${queue.length} rows; ${contested} contradicted by most of their 10 nearest neighbours.`,
  );
  const queued = new Set(queue.map((q) => q.rowId));
  return [
    ...queue.map((q) => q.rowId),
    ...[...wanted].filter((id) => !queued.has(id)),
  ];
}

async function applySheet() {
  const labelIds = (
    await prisma.explorerLabel.findMany({ select: { id: true } })
  ).map((l) => l.id);
  const decisions = reviewDecisions(readFileSync(file, 'utf8'), labelIds);
  const rows = new Map(
    (
      await prisma.explorerRow.findMany({
        where: { rowId: { in: [...decisions.keys()] } },
        select: { rowId: true, rootId: true },
      })
    ).map((r) => [r.rowId, r.rootId]),
  );
  const unknown = [...decisions.keys()].filter((id) => !rows.has(id));
  if (unknown.length)
    throw new Error(
      `Rows not in explorer_rows: ${unknown.slice(0, 5).join(', ')}…`,
    );
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      for (const [rowId, ids] of decisions) {
        await tx.explorerAnnotation.deleteMany({ where: { rowId } });
        await tx.explorerAnnotation.createMany({
          data: ids.map((labelId) => ({
            rowId,
            rootId: rows.get(rowId)!,
            labelId,
            confidence: 1,
            reason: 'Decided in review',
            decidedBy: 'stride',
          })),
        });
        await tx.explorerRow.update({
          where: { rowId },
          data: { reviewedAt: now },
        });
      }
      if (DRY_RUN) throw new DryRun();
    });
    console.log(`Applied ${decisions.size} decisions.`);
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
    console.log(
      `[DRY RUN] ${decisions.size} decisions read and rolled back; nothing was changed.`,
    );
  }
}

(mode === 'export'
  ? exportSheet()
  : mode === 'apply'
    ? applySheet()
    : Promise.reject(new Error('export | apply <file>'))
)
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
