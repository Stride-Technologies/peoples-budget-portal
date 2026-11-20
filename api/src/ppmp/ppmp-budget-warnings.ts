import { Prisma } from '../generated/prisma/index';

/**
 * Soft check: what a year's PPMPs plan to buy against the budget rows their
 * lines are linked to (specs/012 follow-up). A line's cost counts against its
 * row and every row above it (PA → parent PA → program; document PPA → its
 * parents), summed over every PPMP of the same year and kind. A row this PPMP
 * touches whose linked total is above its budgeted amount is a warning: shown,
 * never blocking. Derived per read, never stored (invariant 20).
 */
export interface BudgetNode {
  key: string;
  parentKey: string | null;
  field: 'programId' | 'projectActivityId' | 'budgetItemId';
  id: string;
  name: string;
  code: string | null;
  /** The row's budgeted amount; null = nothing to compare against. */
  budget: Prisma.Decimal | null;
}

export interface LinkedLine {
  id: string;
  ppmpId: string;
  lineTotal: Prisma.Decimal;
  key: string;
}

export interface BudgetWarning {
  field: BudgetNode['field'];
  id: string;
  name: string;
  code: string | null;
  budget: string;
  /** Every PPMP of the year, lines under this row. */
  linkedTotal: string;
  /** This PPMP's share. */
  thisPpmpTotal: string;
  over: string;
  /** This PPMP's lines that count against the row. */
  lineItemIds: string[];
  /** How many PPMPs share the row (including this one). */
  ppmpCount: number;
}

export function budgetOverruns(
  nodes: BudgetNode[],
  lines: LinkedLine[],
  ppmpId: string,
): BudgetWarning[] {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const sums = new Map<
    string,
    {
      all: Prisma.Decimal;
      mine: Prisma.Decimal;
      lines: string[];
      ppmps: Set<string>;
    }
  >();
  for (const line of lines) {
    const seen = new Set<string>();
    for (
      let k: string | null = line.key;
      k && byKey.has(k) && !seen.has(k);
      k = byKey.get(k)!.parentKey
    ) {
      seen.add(k);
      const s = sums.get(k) ?? {
        all: new Prisma.Decimal(0),
        mine: new Prisma.Decimal(0),
        lines: [],
        ppmps: new Set<string>(),
      };
      s.all = s.all.plus(line.lineTotal);
      s.ppmps.add(line.ppmpId);
      if (line.ppmpId === ppmpId) {
        s.mine = s.mine.plus(line.lineTotal);
        s.lines.push(line.id);
      }
      sums.set(k, s);
    }
  }
  const depth = (key: string) => {
    let d = 0;
    for (
      let k = byKey.get(key)?.parentKey;
      k && d < 50;
      k = byKey.get(k)?.parentKey
    )
      d++;
    return d;
  };
  const out: BudgetWarning[] = [];
  // Deepest first: a parent whose overrun is exactly its child's (same lines,
  // same amount over) says nothing new, so it is left out.
  const said = new Set<string>();
  for (const [key, s] of [...sums].sort(([a], [b]) => depth(b) - depth(a))) {
    const n = byKey.get(key)!;
    if (!s.lines.length || n.budget === null || !s.all.greaterThan(n.budget))
      continue;
    const over = s.all.minus(n.budget).toFixed(2);
    const signature = `${[...s.lines].sort().join(',')}|${s.all.toFixed(2)}|${over}`;
    if (said.has(signature)) continue;
    said.add(signature);
    out.push({
      field: n.field,
      id: n.id,
      name: n.name,
      code: n.code,
      budget: n.budget.toFixed(2),
      linkedTotal: s.all.toFixed(2),
      thisPpmpTotal: s.mine.toFixed(2),
      over,
      lineItemIds: s.lines,
      ppmpCount: s.ppmps.size,
    });
  }
  return out.sort((a, b) => new Prisma.Decimal(b.over).comparedTo(a.over));
}
