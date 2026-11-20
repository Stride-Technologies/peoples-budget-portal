import { FundSource, Prisma, type PapClass } from '../generated/prisma/index';
import {
  moneyRows,
  type SheetActivity,
  type SheetProgram,
} from '../aip-registry/lbp-figures.js';
import { FUND_SOURCE_NAMES } from '../open-data/open-data.mapper.js';

/**
 * The draft LEP an adopted AIP carries forward to (specs/012 D10), as rows to
 * write. Pure: the service loads the programs and writes the result.
 *
 *   program ──────────────► root PPA        (sourceProgramId)
 *     PA ─────────────────► child PPA       (sourceProjectActivityId), same tree
 *     a row with money ───► its own PS/MOOE/FE/CO (+ unsplit: a total stated
 *                           with no class split), on its one fund
 *     a fund-split row ───► no own money; one child per fund line
 *     unsplit, ≥2 funds ──► own money, no fund, flagged and listed
 *
 * Money is read exactly where the LBP forms read it (`moneyRows`), so
 * Σ LEP top-level totals = Σ the AIP programs' totals, to the centavo.
 */
export interface CarryProgram {
  sheet: SheetProgram;
  finishLineId: string | null;
  papSectorId: string | null;
  tagIds: { tagId: string; appliedByUserId: string }[];
  activityTags: Map<string, { tagId: string; appliedByUserId: string }[]>;
}

export interface PlannedItem {
  id: string;
  parentId: string | null;
  rootItemId: string;
  officeId: string;
  hostOfficeId: string | null;
  finishLineId: string | null;
  papSectorId: string | null;
  papClass: PapClass | null;
  aipReferenceCode: string | null;
  name: string;
  majorFinalOutput: string | null;
  performanceIndicator: string | null;
  target: string | null;
  ps: Prisma.Decimal;
  mooe: Prisma.Decimal;
  fe: Prisma.Decimal;
  co: Prisma.Decimal;
  unsplit: Prisma.Decimal;
  total: Prisma.Decimal;
  fundSource: FundSource | null;
  orderIndex: number;
  sourceProgramId: string | null;
  sourceProjectActivityId: string | null;
  importWarnings: string[];
  tags: { tagId: string; appliedByUserId: string }[];
}

export const MULTI_FUND_WARNING =
  'Carried forward from an AIP row with several funds and no split by fund. Split it, or confirm the fund, before submitting.';

const ZERO = new Prisma.Decimal(0);
const nonEmpty = (s: string) => (s === '' ? null : s);

export function planCarryForward(
  programs: CarryProgram[],
  newId: () => string,
): { items: PlannedItem[]; listed: { id: string; name: string }[] } {
  const items: PlannedItem[] = [];
  const listed: { id: string; name: string }[] = [];

  for (const p of programs) {
    const { sheet } = p;
    const money = new Set(moneyRows(sheet).map((r) => r.id));
    const rootId = newId();
    const base = {
      rootItemId: rootId,
      officeId: sheet.officeId!,
      hostOfficeId: sheet.hostOfficeId,
      finishLineId: p.finishLineId,
      papSectorId: p.papSectorId,
      papClass: sheet.papClass,
    };

    /** One row's item, plus its per-fund children when it is split. */
    const emit = (
      row: SheetProgram | SheetActivity,
      id: string,
      parentId: string | null,
      orderIndex: number,
      source: Pick<PlannedItem, 'sourceProgramId' | 'sourceProjectActivityId'>,
      tags: PlannedItem['tags'],
    ) => {
      const carries = money.has(row.id);
      const split = carries && row.fundAllocations.length > 0;
      const multi = carries && !split && row.fundSources.length > 1;
      const classes = row.ps.plus(row.mooe).plus(row.fe).plus(row.co);
      const own =
        carries && !split
          ? {
              ps: row.ps,
              mooe: row.mooe,
              fe: row.fe,
              co: row.co,
              unsplit: Prisma.Decimal.max(row.total.minus(classes), ZERO),
            }
          : { ps: ZERO, mooe: ZERO, fe: ZERO, co: ZERO, unsplit: ZERO };
      if (multi) listed.push({ id, name: row.name });
      const item: PlannedItem = {
        ...base,
        id,
        parentId,
        aipReferenceCode: row.code,
        name: row.name,
        majorFinalOutput: nonEmpty(row.majorFinalOutput),
        performanceIndicator: nonEmpty(row.expectedOutput),
        target: nonEmpty(row.target),
        ...own,
        total: ZERO, // set below, once the tree is known
        fundSource:
          carries && !split && row.fundSources.length === 1
            ? row.fundSources[0]
            : null,
        orderIndex,
        ...source,
        importWarnings: multi ? [MULTI_FUND_WARNING] : [],
        tags,
      };
      items.push(item);
      if (split)
        row.fundAllocations.forEach((line, i) =>
          items.push({
            ...item,
            id: newId(),
            parentId: id,
            aipReferenceCode: null,
            name: `${row.name} (${FUND_SOURCE_NAMES[line.fundSource] ?? line.fundSource})`,
            ps: line.ps,
            mooe: line.mooe,
            fe: line.fe,
            co: line.co,
            unsplit: ZERO,
            fundSource: line.fundSource,
            orderIndex: i,
            sourceProgramId: null,
            sourceProjectActivityId: null,
            importWarnings: [],
            tags: [],
          }),
        );
    };

    emit(
      sheet,
      rootId,
      null,
      0,
      { sourceProgramId: sheet.id, sourceProjectActivityId: null },
      p.tagIds,
    );
    // Parents before children, so every parentId is already planned.
    const idOf = new Map<string, string>([[sheet.id, rootId]]);
    const pending = [...sheet.activities];
    while (pending.length) {
      const ready = pending.filter(
        (a) => a.parentId === null || idOf.has(a.parentId),
      );
      if (!ready.length) break; // a broken parent chain: leave those rows out
      for (const a of ready) {
        const id = newId();
        idOf.set(a.id, id);
        emit(
          a,
          id,
          a.parentId ? idOf.get(a.parentId)! : rootId,
          a.orderIndex,
          { sourceProgramId: null, sourceProjectActivityId: a.id },
          p.activityTags.get(a.id) ?? [],
        );
        pending.splice(pending.indexOf(a), 1);
      }
    }
  }

  // total = own + Σ children, deepest first.
  const byId = new Map(items.map((i) => [i.id, i]));
  const ownOf = (i: PlannedItem) =>
    i.ps.plus(i.mooe).plus(i.fe).plus(i.co).plus(i.unsplit);
  for (const i of items) i.total = ownOf(i);
  for (const i of [...items].reverse())
    if (i.parentId) {
      const parent = byId.get(i.parentId)!;
      parent.total = parent.total.plus(i.total);
    }
  return { items, listed };
}
