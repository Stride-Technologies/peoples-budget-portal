/**
 * The labelling run's pure parts (specs/018 redesign W22–W25, W30): what a
 * row's text is, what the model is asked, what its answer may say, and which
 * labels go live and which wait for Stride (W23). No database, no network:
 * `prisma/label-rows.ts` does the reading and writing.
 */
import { createHash } from 'node:crypto';

export type RowKind =
  | 'aip-program'
  | 'aip-pa'
  | 'budget-item'
  | 'object-line'
  | 'project';

export interface LabelRow {
  rowId: string;
  rowKind: RowKind;
  /** The record its labels also count for (a PA's program, an item's top-level PPA). */
  rootId: string;
  text: string;
}

export interface TaxonomyLabel {
  id: string;
  parentId: string | null;
  label: string;
  definition: string;
}

/** What the model said about one label on one row. */
export interface Pick {
  id: string;
  confidence: number;
  reason: string;
}

export interface Decided extends Pick {
  inReview: boolean;
}

/** Below this the label is a guess no one should count yet (W23: "very small confidence"). */
export const REVIEW_BELOW = 0.35;
/** A label the vectors do not rank near the row needs this much confidence to go live. */
export const AGREE_OR = 0.6;
/** How many nearest top-level labels count as "the vectors agree". */
export const NEAR = 5;
export const BATCH = 20;

const line = (label: string, v: string | null | undefined) =>
  v && v.trim() ? `${label}: ${v.trim().replace(/\s+/g, ' ')}` : '';
const join = (...parts: string[]) => parts.filter(Boolean).join('\n');
const few = (names: string[], n = 8) =>
  names.length > n
    ? `${names.slice(0, n).join('; ')}; and ${names.length - n} more`
    : names.join('; ');

/**
 * A row's text, from budget fields only (public record; never remarks or
 * people). The parent and the office are context, not the answer (W22): the
 * prompt says so.
 */
export const textOf = {
  program: (p: {
    name: string;
    description?: string | null;
    majorFinalOutput?: string | null;
    office: string | null;
    sector?: string | null;
    classes: string[];
    children: string[];
  }) =>
    join(
      line('Program', p.name),
      line('Description', p.description),
      line('Major final output', p.majorFinalOutput),
      line('Office', p.office),
      line('Sector', p.sector),
      line('Money in', p.classes.join(', ')),
      line('Its projects and activities', few(p.children)),
    ),
  activity: (a: {
    name: string;
    kind: string;
    description?: string | null;
    expectedOutput?: string | null;
    parents: string[];
    office: string | null;
    classes: string[];
  }) =>
    join(
      line(a.kind, a.name),
      line('Description', a.description),
      line('Expected output', a.expectedOutput),
      line('Part of', a.parents.join(' › ')),
      line('Office', a.office),
      line('Money in', a.classes.join(', ')),
    ),
  item: (i: {
    name: string;
    majorFinalOutput?: string | null;
    parents: string[];
    office: string | null;
    fund?: string | null;
    classes: string[];
    children: string[];
  }) =>
    join(
      line('Budget PPA', i.name),
      line('Major final output', i.majorFinalOutput),
      line('Part of', i.parents.join(' › ')),
      line('Office', i.office),
      line('Fund', i.fund),
      line('Money in', i.classes.join(', ')),
      line('Its sub-items', few(i.children)),
    ),
  account: (o: {
    title: string;
    code: string;
    expenseClass: string;
    office: string | null;
    fund?: string | null;
  }) =>
    join(
      line('Budget account line', `${o.title} (${o.code})`),
      line('Expense class', o.expenseClass),
      line('Office', o.office),
      line('Fund', o.fund),
    ),
  project: (p: {
    name: string;
    fundingProgram?: string | null;
    classification?: string | null;
    office: string | null;
    items: string[];
  }) =>
    join(
      line('Procurement project', p.name),
      line('Funding program', p.fundingProgram),
      line('Classification', p.classification),
      line('Office', p.office),
      line('Items bought', few(p.items)),
    ),
};

export const hashOf = (text: string) =>
  createHash('sha256').update(text).digest('hex').slice(0, 32);

/** What a label's vector is made of: its name, definition and parent's name. */
export const labelText = (l: TaxonomyLabel, parent?: TaxonomyLabel) =>
  [parent ? `${parent.label} › ${l.label}` : l.label, l.definition].join(': ');

/** The taxonomy as the prompt lists it: one line per label, sub-labels indented. */
export function taxonomyListing(labels: TaxonomyLabel[]): string {
  return labels
    .filter((l) => !l.parentId)
    .flatMap((l) => [
      `- ${l.id} — ${l.label}: ${l.definition}`,
      ...labels
        .filter((s) => s.parentId === l.id)
        .map((s) => `  - ${s.id} — ${s.label}: ${s.definition}`),
    ])
    .join('\n');
}

/** Strict JSON schema: ids are enums, so the model cannot invent a row or a label. */
export function labelSchema(rowIds: string[], labelIds: string[]) {
  return {
    name: 'labels',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['rows'],
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'labels', 'suggest'],
            properties: {
              id: { type: 'string', enum: rowIds },
              labels: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'confidence', 'reason'],
                  properties: {
                    id: { type: 'string', enum: labelIds },
                    confidence: { type: 'number' },
                    reason: { type: 'string' },
                  },
                },
              },
              suggest: { type: 'string' },
            },
          },
        },
      },
    },
  };
}

/** The model's answer, trusted only as far as the batch and the taxonomy go. */
export function parseLabels(
  text: string,
  rowIds: string[],
  labelIds: string[],
): Map<string, { picks: Pick[]; suggest: string }> {
  const rows = new Set(rowIds);
  const known = new Set(labelIds);
  const out = new Map<string, { picks: Pick[]; suggest: string }>();
  const body = JSON.parse(text) as {
    rows?: { id?: unknown; labels?: unknown; suggest?: unknown }[];
  };
  for (const r of body.rows ?? []) {
    if (typeof r.id !== 'string' || !rows.has(r.id) || out.has(r.id)) continue;
    const picks = (Array.isArray(r.labels) ? r.labels : [])
      .map((l: Partial<Pick>) => ({
        id: String(l.id),
        confidence: Math.min(1, Math.max(0, Number(l.confidence) || 0)),
        reason: String(l.reason ?? '').slice(0, 300),
      }))
      .filter((l) => known.has(l.id));
    out.set(r.id, {
      picks: [...new Map(picks.map((p) => [p.id, p])).values()],
      suggest:
        typeof r.suggest === 'string' ? r.suggest.trim().slice(0, 120) : '',
    });
  }
  return out;
}

/** Dot product of two unit vectors = their cosine. */
export const cosine = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** The row's nearest top-level labels by meaning, best first. */
export function nearest(
  row: number[],
  tops: { id: string; vec: number[] }[],
  k = NEAR,
): string[] {
  return tops
    .map((t) => ({ id: t.id, s: cosine(row, t.vec) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((t) => t.id);
}

/**
 * W23: a label goes live unless it is a very-low-confidence guess, or a
 * modest-confidence one the vectors do not back. A sub-label is judged by its
 * parent's place in the vectors.
 */
export function gate(
  picks: Pick[],
  near: string[],
  parentOf: (id: string) => string | null,
  /** specs/020 B1.3: the calibrated threshold (`calibration.ts reviewThreshold`) once a gold set exists. */
  reviewBelow = REVIEW_BELOW,
): Decided[] {
  return picks.map((p) => {
    const top = parentOf(p.id) ?? p.id;
    const agree = near.includes(top);
    return {
      ...p,
      inReview:
        p.confidence < reviewBelow ||
        (!agree && p.confidence < Math.max(AGREE_OR, reviewBelow)),
    };
  });
}

/** Split into batches of `size`. */
export const batches = <T>(xs: T[], size = BATCH): T[][] =>
  Array.from({ length: Math.ceil(xs.length / size) }, (_, i) =>
    xs.slice(i * size, i * size + size),
  );

// ─── Review CSV (W23: Stride's round trip) ────────────────────────────────────

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;

export const REVIEW_HEADER = [
  'row_id',
  'kind',
  'office',
  'text',
  'proposed',
  'picks',
  'decision',
] as const;

/** One line per row to review; `decision` (last, empty) is for Stride to fill. */
export function reviewCsv(
  rows: { rowId: string; rowKind: string; text: string; picks: Decided[] }[],
  /** A gold sheet: no readable `proposed`, so the reviewer decides from the text (specs/020 B1.2). */
  opts: { blind?: boolean } = {},
): string {
  return [
    REVIEW_HEADER.join(','),
    ...rows.map((r) =>
      [
        r.rowId,
        r.rowKind,
        cell(/^Office: (.+)$/m.exec(r.text)?.[1]?.trim() ?? ''),
        cell(r.text),
        cell(
          opts.blind
            ? ''
            : r.picks
                .map(
                  (p) =>
                    `${p.id} ${p.confidence.toFixed(2)}${p.inReview ? ' (review)' : ''}: ${p.reason}`,
                )
                .join(' | '),
        ),
        // Machine-readable picks: the gold set's calibration reads these (specs/020 B1.3).
        cell(
          JSON.stringify(
            r.picks.map((p) => ({ id: p.id, confidence: p.confidence })),
          ),
        ),
        '',
      ].join(','),
    ),
  ].join('\n');
}

/** RFC 4180 enough for our own file: quoted cells, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  const endCell = () => {
    row.push(cur);
    cur = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') endCell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else cur += c;
  }
  if (cur || row.length) endRow();
  return rows.filter((r) => r.some((c) => c.trim()));
}

/**
 * A filled-in review sheet → each decided row's labels. `none` (or `-`)
 * means Not classified; an empty decision leaves the row in review.
 */
export function reviewDecisions(
  csv: string,
  labelIds: string[],
): Map<string, string[]> {
  const [head, ...rows] = parseCsv(csv);
  const at = (name: string) => head.indexOf(name);
  if (at('row_id') < 0 || at('decision') < 0)
    throw new Error('The sheet needs its row_id and decision columns.');
  const known = new Set(labelIds);
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const d = (r[at('decision')] ?? '').trim();
    if (!d) continue;
    const ids = /^(none|-)$/i.test(d) ? [] : d.split(/[\s,;]+/).filter(Boolean);
    const bad = ids.filter((id) => !known.has(id));
    if (bad.length)
      throw new Error(
        `Row ${r[at('row_id')]}: unknown label ${bad.join(', ')}.`,
      );
    out.set(r[at('row_id')], ids);
  }
  return out;
}
