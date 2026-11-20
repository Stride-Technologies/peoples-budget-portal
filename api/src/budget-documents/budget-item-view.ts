import { Prisma } from '../generated/prisma/index';
import type { LiveProgram } from '../open-data/open-data.mapper.js';

/**
 * Budget Document PPAs as the AIP readers expect to see programs (specs/012,
 * design choice 2). The public registry and detail, open data's `mapProgram`
 * and LBP's `toSheetProgram` all read a `ProgramVersion.snapshot`-shaped object
 * plus a few live relations. Feeding them that shape means an LEP or Ordinance
 * goes through the same code as the AIP, with no fork.
 *
 *   BudgetItem tree (own amounts)            snapshot (AIP shape)
 *   ─────────────────────────────            ───────────────────────────────
 *   root  own 100                            program  proposedTotal 350
 *   ├─ A  own  50                              ├─ "root" (own)   proposedBudget 100   ← synthetic leaf
 *   │  └─ A1 own 200                           ├─ A              proposedBudget 250
 *   └─ B  own   0                              │  ├─ "A" (own)   proposedBudget  50   ← synthetic leaf
 *                                              │  └─ A1          proposedBudget 200
 *                                              └─ B              proposedBudget   0
 *
 * In a Budget Document a row's money is its **own** amount; its total adds its
 * children's (docs/adr/0004). In the AIP shape a parent states no money of
 * its own: readers that print leaves only (LBP forms) would drop it. So
 * a parent with own money gets one synthetic leaf child carrying it, with the
 * id `<itemId>~own`. Nothing is counted twice: every total equals the sum of
 * its leaves.
 */

/** The fields of a BudgetItem the tree math and the view read. */
export interface BudgetItemNode {
  id: string;
  parentId: string | null;
  rootItemId: string;
  officeId: string;
  hostOfficeId: string | null;
  papClass: string | null;
  aipReferenceCode: string | null;
  name: string;
  majorFinalOutput: string | null;
  performanceIndicator: string | null;
  target: string | null;
  ps: Prisma.Decimal;
  mooe: Prisma.Decimal;
  fe: Prisma.Decimal;
  co: Prisma.Decimal;
  /** Own money stated as a total only, with no class split. */
  unsplit: Prisma.Decimal;
  total: Prisma.Decimal;
  fundSource: string | null;
  orderIndex: number;
}

export interface ClassAmounts {
  ps: Prisma.Decimal;
  mooe: Prisma.Decimal;
  fe: Prisma.Decimal;
  co: Prisma.Decimal;
  total: Prisma.Decimal;
}

export const ownTotal = (
  n: Pick<BudgetItemNode, 'ps' | 'mooe' | 'fe' | 'co' | 'unsplit'>,
) => n.ps.plus(n.mooe).plus(n.fe).plus(n.co).plus(n.unsplit);

const SUFFIX = '~own';
export const ownLeafId = (itemId: string) => `${itemId}${SUFFIX}`;
/** The real item behind an id the view emitted (a synthetic leaf → its owner). */
export const itemIdOf = (viewId: string) =>
  viewId.endsWith(SUFFIX) ? viewId.slice(0, -SUFFIX.length) : viewId;

/**
 * Per-class totals of every item's subtree (own + all descendants), bottom-up,
 * keyed by item id. `total` is what `BudgetItem.total` must hold. One pass; an
 * item whose parent is absent from `items` is treated as a root.
 */
export function subtreeAmounts(
  items: readonly BudgetItemNode[],
): Map<string, ClassAmounts> {
  const children = childrenByParent(items);
  const out = new Map<string, ClassAmounts>();
  const visit = (n: BudgetItemNode): ClassAmounts => {
    const acc: ClassAmounts = {
      ps: n.ps,
      mooe: n.mooe,
      fe: n.fe,
      co: n.co,
      total: ownTotal(n),
    };
    for (const c of children.get(n.id) ?? []) {
      const s = visit(c);
      acc.ps = acc.ps.plus(s.ps);
      acc.mooe = acc.mooe.plus(s.mooe);
      acc.fe = acc.fe.plus(s.fe);
      acc.co = acc.co.plus(s.co);
      acc.total = acc.total.plus(s.total);
    }
    out.set(n.id, acc);
    return acc;
  };
  for (const root of children.get(null) ?? []) visit(root);
  return out;
}

function childrenByParent(items: readonly BudgetItemNode[]) {
  const ids = new Set(items.map((i) => i.id));
  const map = new Map<string | null, BudgetItemNode[]>();
  for (const i of items) {
    const key = i.parentId && ids.has(i.parentId) ? i.parentId : null;
    map.set(key, [...(map.get(key) ?? []), i]);
  }
  for (const list of map.values())
    list.sort((a, b) => a.orderIndex - b.orderIndex);
  return map;
}

const s2 = (d: Prisma.Decimal) => d.toFixed(2);

export interface ProgramView {
  /** `ProgramVersion.snapshot`-shaped: the keys the AIP readers consume. */
  snapshot: Record<string, unknown>;
  /** The live relations `mapProgram` / the public detail read beside it. */
  live: LiveProgram;
}

/**
 * One root PPA and its tree, as an AIP program. `items` is the whole tree
 * (root included), as loaded by `where: { rootItemId: root.id }`.
 */
export function asProgramView(
  root: BudgetItemNode,
  items: readonly BudgetItemNode[],
  relations: {
    office?: unknown;
    finishLine?: unknown;
    papSector?: unknown;
  } = {},
): ProgramView {
  const tree = items.some((i) => i.id === root.id) ? items : [root, ...items];
  const amounts = subtreeAmounts(tree);
  const children = childrenByParent(tree);
  const rootAmounts = amounts.get(root.id) ?? {
    ps: root.ps,
    mooe: root.mooe,
    fe: root.fe,
    co: root.co,
    total: ownTotal(root),
  };

  const activities: Record<string, unknown>[] = [];
  const ownLeaf = (n: BudgetItemNode, parentViewId: string | null) => ({
    id: ownLeafId(n.id),
    parentProjectActivityId: parentViewId,
    aipReferenceCode: n.aipReferenceCode,
    type: 'ACTIVITY',
    name: n.name,
    majorFinalOutput: n.majorFinalOutput,
    expectedOutput: n.performanceIndicator,
    targetForBudgetYear: n.target,
    costMode: 'DIRECT_COSTS',
    proposedBudget: s2(ownTotal(n)),
    psEstimate: s2(n.ps),
    mooeEstimate: s2(n.mooe),
    feEstimate: s2(n.fe),
    coEstimate: s2(n.co),
    fundSources: n.fundSource ? [n.fundSource] : [],
    fundAllocations: [],
    orderIndex: -1,
  });

  const walk = (parent: BudgetItemNode, parentViewId: string | null) => {
    const kids = children.get(parent.id) ?? [];
    // A parent's own money becomes its first leaf (see the header).
    if (kids.length > 0 && !ownTotal(parent).isZero()) {
      activities.push(ownLeaf(parent, parentViewId));
    }
    for (const k of kids) {
      const a = amounts.get(k.id)!;
      const hasKids = (children.get(k.id) ?? []).length > 0;
      activities.push({
        id: k.id,
        parentProjectActivityId: parentViewId,
        aipReferenceCode: k.aipReferenceCode,
        type: hasKids ? 'PROJECT' : 'ACTIVITY',
        name: k.name,
        majorFinalOutput: k.majorFinalOutput,
        expectedOutput: k.performanceIndicator,
        targetForBudgetYear: k.target,
        costMode: hasKids ? 'ACTIVITY_CHILDREN' : 'DIRECT_COSTS',
        proposedBudget: s2(a.total),
        psEstimate: s2(a.ps),
        mooeEstimate: s2(a.mooe),
        feEstimate: s2(a.fe),
        coEstimate: s2(a.co),
        fundSources: k.fundSource ? [k.fundSource] : [],
        fundAllocations: [],
        orderIndex: k.orderIndex,
      });
      walk(k, k.id);
    }
  };
  walk(root, null);

  const hasKids = activities.length > 0;
  const snapshot: Record<string, unknown> = {
    id: root.id,
    officeId: root.officeId,
    hostOfficeId: root.hostOfficeId,
    papClass: root.papClass,
    aipReferenceCode: root.aipReferenceCode,
    tentativeAipReferenceCode: null,
    name: root.name,
    description: null,
    majorFinalOutput: root.majorFinalOutput,
    expectedOutput: root.performanceIndicator,
    targetForBudgetYear: root.target,
    costMode: hasKids ? 'ACTIVITY_CHILDREN' : 'DIRECT_COSTS',
    proposedTotal: s2(rootAmounts.total),
    psProposedTotal: s2(rootAmounts.ps),
    mooeProposedTotal: s2(rootAmounts.mooe),
    feProposedTotal: s2(rootAmounts.fe),
    coProposedTotal: s2(rootAmounts.co),
    fundSources: root.fundSource ? [root.fundSource] : [],
    fundAllocations: [],
    climateChangeTag: null,
    projectActivities: activities,
  };
  const live: LiveProgram = {
    name: root.name,
    publishedName: root.name,
    publishedProposedTotal: s2(rootAmounts.total),
    psProposedTotal: s2(rootAmounts.ps),
    mooeProposedTotal: s2(rootAmounts.mooe),
    coProposedTotal: s2(rootAmounts.co),
    version: null,
    publishedAt: null,
    office: relations.office,
    finishLine: relations.finishLine,
    papSector: relations.papSector,
  };
  return { snapshot, live };
}
