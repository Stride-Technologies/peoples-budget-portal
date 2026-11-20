/**
 * Unusual year-on-year changes, for staff (specs/020 B5.2; Fazekas & Kocsis
 * 2020, Gallego et al. 2021). Rule-based and deterministic: the same data
 * always gives the same flags, and each says which rule fired and on what
 * figures. A flag is a prompt to ask the office, never a finding: the wording
 * stays neutral ("unusual change — ask the office"). Staff only until reviewed.
 */
import { Prisma } from '../generated/prisma/index';
import { peso } from './chat/chat.js';

const D = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);
/** Below this a change is noise for a city budget: ₱1M. */
export const FLOOR = D('1000000');
const MILLION = D('1000000');

export type FlagRule = 'tripled' | 'round-spike' | 'unusual-class';

export interface Flag {
  rule: FlagRule;
  office: string;
  /** The PPA or program; for `unusual-class`, the expense class. */
  subject: string;
  years: [number, number];
  prev: string;
  cur: string;
  /** Neutral, staff-facing: says what moved and asks, never accuses. */
  note: string;
}

export interface YearRow {
  office: string;
  key: string;
  year: number;
  amount: string;
}

const pairs = (rows: YearRow[]) => {
  const by = new Map<string, Map<number, Prisma.Decimal>>();
  for (const r of rows) {
    const k = `${r.office}\u0000${r.key}`;
    const m = by.get(k) ?? new Map<number, Prisma.Decimal>();
    m.set(r.year, (m.get(r.year) ?? D(0)).plus(r.amount));
    by.set(k, m);
  }
  return by;
};

/**
 * `tripled`: a PPA at least three times last year's, by at least ₱1M.
 * `round-spike`: up by half or more to a round figure (a whole ₱1M, ₱5M or
 * more) — round numbers in a costed line are worth a question. A row new this
 * year is not flagged: there is nothing to compare.
 */
export function ppaFlags(rows: YearRow[], years: [number, number]): Flag[] {
  const [y0, y1] = years;
  const out: Flag[] = [];
  for (const [k, m] of pairs(rows)) {
    const [office, subject] = k.split('\u0000');
    const prev = m.get(y0);
    const cur = m.get(y1);
    if (!prev || !cur || prev.lte(0) || cur.minus(prev).lt(FLOOR)) continue;
    const ratio = cur.div(prev);
    const base = {
      office,
      subject,
      years,
      prev: prev.toFixed(2),
      cur: cur.toFixed(2),
    };
    const moved = `${peso(prev.toFixed(2))} in ${y0} to ${peso(cur.toFixed(2))} in ${y1}`;
    if (ratio.gte(3))
      out.push({
        ...base,
        rule: 'tripled',
        note: `Unusual change — ask the office: from ${moved} (×${ratio.toFixed(1)}).`,
      });
    else if (
      ratio.gte(1.5) &&
      cur.gte(MILLION.mul(5)) &&
      cur.mod(MILLION).isZero()
    )
      out.push({
        ...base,
        rule: 'round-spike',
        note: `Unusual change — ask the office: from ${moved}, a round figure.`,
      });
  }
  return out.sort(
    (a, b) =>
      D(b.cur).minus(b.prev).comparedTo(D(a.cur).minus(a.prev)) ||
      (a.subject < b.subject ? -1 : 1),
  );
}

/**
 * `unusual-class`: an office puts ₱1M or more in an expense class that was
 * under 5% of its money the year before (or absent), e.g. a first large
 * Capital Outlay in an office that had none.
 */
export function classFlags(rows: YearRow[], years: [number, number]): Flag[] {
  const [y0, y1] = years;
  const totals = new Map<string, Prisma.Decimal>();
  for (const r of rows)
    if (r.year === y0)
      totals.set(r.office, (totals.get(r.office) ?? D(0)).plus(r.amount));
  const out: Flag[] = [];
  for (const [k, m] of pairs(rows)) {
    const [office, subject] = k.split('\u0000');
    const prev = m.get(y0) ?? D(0);
    const cur = m.get(y1) ?? D(0);
    const total = totals.get(office);
    if (!total || total.lte(0) || cur.lt(FLOOR)) continue;
    if (prev.div(total).gte(0.05)) continue;
    out.push({
      rule: 'unusual-class',
      office,
      subject,
      years,
      prev: prev.toFixed(2),
      cur: cur.toFixed(2),
      note: `Unusual change — ask the office: ${subject} was ${percentOf(prev, total)} of this office's ${y0} money; ${y1} has ${peso(cur.toFixed(2))}.`,
    });
  }
  return out.sort((a, b) => D(b.cur).comparedTo(a.cur));
}

const percentOf = (part: Prisma.Decimal, whole: Prisma.Decimal) =>
  `${part.div(whole).mul(100).toFixed(1)}%`;

/** One source per document kind: the AIP's programs, a book's PPAs. */
export const FLAG_SOURCE = {
  aip: 'aip-programs',
  lep: 'budget-ppas',
  ordinance: 'budget-ppas',
} as const;
