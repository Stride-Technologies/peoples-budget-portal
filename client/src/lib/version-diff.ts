import { GOAL } from './goal-label.ts';
/**
 * What changed between two published versions of a program, for the public
 * Version History. Reads the public snapshots only — nothing a visitor cannot
 * already open.
 *
 * Activities are matched by id (a revision keeps the id of every row it edits),
 * then by their place in the tree (parent names + name), so a row deleted and
 * re-created under the same name still reads as one row that changed. What is
 * left over is added or removed, reported at its top-most level: a new project
 * is one entry with its total and item count, not one entry per activity.
 *
 * Money is compared in whole centavos as integers — exact up to ~₱90 trillion
 * (`Number.MAX_SAFE_INTEGER`), as `addDecimalStrings` does.
 */

export interface SnapshotPA {
  id: string;
  name: string;
  type?: string;
  proposedBudget?: string | null;
  grandTotal?: string | null;
  fundSources?: string[] | null;
  parentProjectActivityId?: string | null;
  orderIndex?: number;
}

export interface VersionSnapshot {
  name?: string;
  office?: { acronym?: string | null; name?: string | null } | null;
  finishLine?: { name?: string | null } | null;
  fundSources?: string[] | null;
  expectedOutput?: string | null;
  implementationStartMonth?: number | null;
  implementationStartYear?: number | null;
  implementationEndMonth?: number | null;
  implementationEndYear?: number | null;
  proposedTotal?: string | null;
  grandTotal?: string | null;
  projectActivities?: SnapshotPA[];
}

export interface RowChange {
  name: string;
  /** The parent row's name, or null at the top of the program. */
  under: string | null;
}

export interface VersionChanges {
  total: { from: string; to: string; delta: string; up: boolean } | null;
  fields: { label: string; from: string; to: string }[];
  /** `was` is the old name when the row was also renamed (it is then not in `renamed`). */
  amounts: (RowChange & { from: string; to: string; was?: string })[];
  renamed: { from: string; to: string; under: string | null }[];
  added: (RowChange & { amount: string; items: number; children: { name: string; amount: string }[] })[];
  removed: (RowChange & { amount: string; items: number; children: { name: string; amount: string }[] })[];
  /** Per row of the newer version, by id: what happened to it (rows not listed are unchanged). */
  rowStatus: Record<string, RowStatus>;
}

export type RowStatus =
  | { kind: 'added' }
  | { kind: 'amount'; from: string; to: string }
  | { kind: 'renamed'; from: string }
  | { kind: 'renamed-amount'; from: string; amountFrom: string; amountTo: string };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "87230000" / "87230000.5" / "-3.25" → centavos. Anything else is zero. */
export function toCentavos(value: string | null | undefined): number {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec((value ?? '').trim());
  if (!m) return 0;
  const c = Number(m[2]) * 100 + Number((m[3] ?? '0').padEnd(2, '0'));
  return m[1] ? -c : c;
}

/** Centavos → "1234.50" (sign kept). */
export function fromCentavos(c: number): string {
  const a = Math.abs(c);
  return `${c < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function period(s: VersionSnapshot): string {
  const at = (m?: number | null, y?: number | null) =>
    m && y ? `${MONTHS[m - 1]} ${y}` : '';
  const a = at(s.implementationStartMonth, s.implementationStartYear);
  const b = at(s.implementationEndMonth, s.implementationEndYear);
  return a && b ? `${a} – ${b}` : a || b;
}

function programTotal(s: VersionSnapshot): number {
  return toCentavos(s.proposedTotal ?? s.grandTotal);
}

export function versionChanges(prev: VersionSnapshot, curr: VersionSnapshot): VersionChanges {
  const prevPAs = prev.projectActivities ?? [];
  const currPAs = curr.projectActivities ?? [];

  // ── The tree, both sides ──────────────────────────────────────────────────
  const tree = (pas: SnapshotPA[]) => {
    const byId = new Map(pas.map((p) => [p.id, p]));
    const kids = new Map<string | null, SnapshotPA[]>();
    for (const p of pas) {
      const k = p.parentProjectActivityId && byId.has(p.parentProjectActivityId) ? p.parentProjectActivityId : null;
      kids.set(k, [...(kids.get(k) ?? []), p]);
    }
    for (const list of kids.values()) list.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    const childrenOf = (id: string | null) => kids.get(id) ?? [];
    const parentOf = (p: SnapshotPA) =>
      p.parentProjectActivityId ? byId.get(p.parentProjectActivityId) ?? null : null;
    const path = (p: SnapshotPA): string => {
      const up = parentOf(p);
      return `${up ? path(up) + ' › ' : ''}${norm(p.name).toLowerCase()}`;
    };
    const leaves = (p: SnapshotPA): SnapshotPA[] => {
      const k = childrenOf(p.id);
      return k.length ? k.flatMap(leaves) : [p];
    };
    const amount = (p: SnapshotPA): number =>
      leaves(p).reduce((t, l) => t + toCentavos(l.proposedBudget ?? l.grandTotal), 0);
    return { byId, childrenOf, parentOf, path, leaves, amount };
  };
  const A = tree(prevPAs);
  const B = tree(currPAs);

  // ── Match: by id, then by place in the tree ───────────────────────────────
  const match = new Map<string, string>(); // curr id → prev id
  const prevTaken = new Set<string>();
  for (const p of currPAs)
    if (A.byId.has(p.id)) {
      match.set(p.id, p.id);
      prevTaken.add(p.id);
    }
  const prevByPath = new Map<string, SnapshotPA>();
  for (const p of prevPAs) if (!prevTaken.has(p.id)) prevByPath.set(A.path(p), p);
  for (const p of currPAs) {
    if (match.has(p.id)) continue;
    const q = prevByPath.get(B.path(p));
    if (q && !prevTaken.has(q.id)) {
      match.set(p.id, q.id);
      prevTaken.add(q.id);
    }
  }

  const under = (t: ReturnType<typeof tree>, p: SnapshotPA) => t.parentOf(p)?.name ?? null;
  const out: VersionChanges = { total: null, fields: [], amounts: [], renamed: [], added: [], removed: [], rowStatus: {} };

  // ── Rows ──────────────────────────────────────────────────────────────────
  for (const p of currPAs) {
    const prevId = match.get(p.id);
    if (prevId) {
      const q = A.byId.get(prevId)!;
      const renamed = norm(q.name) !== norm(p.name);
      const leafNow = B.childrenOf(p.id).length === 0;
      const leafThen = A.childrenOf(q.id).length === 0;
      let amount: { from: string; to: string } | null = null;
      if (leafNow && leafThen) {
        const from = A.amount(q);
        const to = B.amount(p);
        if (from !== to) {
          amount = { from: fromCentavos(from), to: fromCentavos(to) };
          out.amounts.push({
            name: norm(p.name),
            under: under(B, p),
            ...amount,
            ...(renamed ? { was: norm(q.name) } : {}),
          });
        }
      }
      if (renamed && !amount)
        out.renamed.push({ from: norm(q.name), to: norm(p.name), under: under(B, p) });
      if (renamed && amount)
        out.rowStatus[p.id] = { kind: 'renamed-amount', from: norm(q.name), amountFrom: amount.from, amountTo: amount.to };
      else if (renamed) out.rowStatus[p.id] = { kind: 'renamed', from: norm(q.name) };
      else if (amount) out.rowStatus[p.id] = { kind: 'amount', ...amount };
      continue;
    }
    out.rowStatus[p.id] = { kind: 'added' };
    // Added — report only the top-most new row.
    const parent = B.parentOf(p);
    if (parent && !match.has(parent.id)) continue;
    out.added.push({
      name: norm(p.name),
      under: under(B, p),
      amount: fromCentavos(B.amount(p)),
      items: B.childrenOf(p.id).length ? B.leaves(p).length : 0,
      children: B.childrenOf(p.id).length ? B.leaves(p).map((l) => ({ name: norm(l.name), amount: fromCentavos(B.amount(l)) })) : [],
    });
  }
  for (const q of prevPAs) {
    if (prevTaken.has(q.id)) continue;
    const parent = A.parentOf(q);
    if (parent && !prevTaken.has(parent.id)) continue;
    out.removed.push({
      name: norm(q.name),
      under: under(A, q),
      amount: fromCentavos(A.amount(q)),
      items: A.childrenOf(q.id).length ? A.leaves(q).length : 0,
      children: A.childrenOf(q.id).length ? A.leaves(q).map((l) => ({ name: norm(l.name), amount: fromCentavos(A.amount(l)) })) : [],
    });
  }

  // ── The program ───────────────────────────────────────────────────────────
  const from = programTotal(prev);
  const to = programTotal(curr);
  if (from !== to) {
    const d = to - from;
    out.total = { from: fromCentavos(from), to: fromCentavos(to), delta: fromCentavos(Math.abs(d)), up: d > 0 };
  }

  const field = (label: string, a: string, b: string) => {
    if (norm(a) !== norm(b)) out.fields.push({ label, from: norm(a) || '—', to: norm(b) || '—' });
  };
  const office = (s: VersionSnapshot) => s.office?.acronym || s.office?.name || '';
  // A program draws on its own funds and every PPA's (schema: Program.fundSources).
  const funds = (s: VersionSnapshot) =>
    [...new Set([...(s.fundSources ?? []), ...(s.projectActivities ?? []).flatMap((p) => p.fundSources ?? [])])]
      .sort()
      .join(', ');
  field('Name', prev.name ?? '', curr.name ?? '');
  field('Implementing office', office(prev), office(curr));
  field(GOAL, prev.finishLine?.name ?? '', curr.finishLine?.name ?? '');
  field('Fund sources', funds(prev), funds(curr));
  field('Implementation period', period(prev), period(curr));
  field('Expected output', prev.expectedOutput ?? '', curr.expectedOutput ?? '');
  return out;
}

/** Nothing to show: two versions that differ in nothing the public sees. */
export function isEmptyChange(c: VersionChanges): boolean {
  return !c.total && !c.fields.length && !c.amounts.length && !c.renamed.length && !c.added.length && !c.removed.length;
}
