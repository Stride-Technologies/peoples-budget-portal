/**
 * One row shape for every document kind (specs/018 design §3). The AIP reads
 * dimensions from the live program (the public registry's own rule: live rows
 * for joins, published snapshots for every figure) and money through the LBP
 * normaliser; an ordinance reads its top-level PPAs. Nothing here re-derives a
 * program's figure from its PAs (ARCHITECTURE-ESSENTIALS "proposedBudget").
 */
import { FundSource, Prisma } from '../generated/prisma/index';
import {
  attribute,
  loadLbpPrograms,
  moneyRows,
  type Money,
} from '../aip-registry/lbp-figures.js';
import { ZERO } from '../aip-registry/excel-style.js';
import { LIVE_PROGRAM, PUBLICLY_VISIBLE } from '../programs/program-filters.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MULTI_FUND_ID } from './catalogue.service.js';

export type Visibility = 'public' | 'staff';

export interface Row {
  id: string;
  label: string;
  officeId: string | null;
  sectorId: string | null;
  finishLineId: string | null;
  subFinishLineId: string | null;
  themeIds: string[];
  money: Money;
  /** Money by fund code (`GF`, `SHF`…) or `_multi` for an unsplit multi-fund row. */
  byFund: Record<string, Prisma.Decimal>;
}

const add = (
  m: Record<string, Prisma.Decimal>,
  key: string,
  v: Prisma.Decimal,
) => {
  if (!v.isZero()) m[key] = (m[key] ?? ZERO).plus(v);
};

/** A public year of the AIP: one row per program the public can list. */
export async function loadAipRows(
  prisma: PrismaService,
  cycleId: string,
  visibility: Visibility,
): Promise<Row[]> {
  const where = {
    aipCycleId: cycleId,
    ...(visibility === 'staff' ? LIVE_PROGRAM : PUBLICLY_VISIBLE),
  };
  const [live, { programs }] = await Promise.all([
    prisma.program.findMany({
      where,
      select: {
        id: true,
        officeId: true,
        papSectorId: true,
        finishLineId: true,
        subFinishLineId: true,
        thematicTags: { select: { tagId: true } },
        projectActivities: {
          select: { thematicTags: { select: { tagId: true } } },
        },
      },
    }),
    loadLbpPrograms(
      prisma,
      cycleId,
      'ALL',
      visibility === 'staff' ? 'working' : 'published',
    ),
  ]);
  const dims = new Map(live.map((p) => [p.id, p]));
  const rows: Row[] = [];
  for (const program of programs) {
    const d = dims.get(program.id);
    if (!d) continue; // a program the figure loader read but the visibility filter did not
    const byFund: Record<string, Prisma.Decimal> = {};
    for (const row of moneyRows(program)) {
      let placed = false;
      for (const fund of Object.values(FundSource)) {
        const a = attribute(row, fund);
        if (a.money) {
          add(byFund, fund, a.money.total);
          placed = true;
        }
        if (a.multiFund) break;
      }
      if (!placed) add(byFund, MULTI_FUND_ID, row.total);
    }
    rows.push({
      id: program.id,
      label: program.name,
      officeId: d.officeId,
      sectorId: d.papSectorId,
      finishLineId: d.finishLineId,
      subFinishLineId: d.subFinishLineId,
      themeIds: [
        ...new Set(
          [
            ...d.thematicTags,
            ...d.projectActivities.flatMap((pa) => pa.thematicTags),
          ].map((t) => t.tagId),
        ),
      ],
      money: {
        ps: program.ps,
        mooe: program.mooe,
        fe: program.fe,
        co: program.co,
        total: program.total,
      },
      byFund,
    });
  }
  return rows;
}

/**
 * A budget document (ordinance; LEP once specs/017 lands): one row per
 * top-level PPA, its `total` the book's rolled-up figure (what the ordinance
 * registry sums), expense classes and funds summed from the tree's own
 * amounts. `unsplit` money has no class and lands in the total only.
 */
export async function loadDocumentRows(
  prisma: PrismaService,
  documentId: string,
): Promise<Row[]> {
  const items = await prisma.budgetItem.findMany({
    where: { documentId },
    select: {
      id: true,
      parentId: true,
      rootItemId: true,
      name: true,
      officeId: true,
      papSectorId: true,
      finishLineId: true,
      ps: true,
      mooe: true,
      fe: true,
      co: true,
      unsplit: true,
      total: true,
      fundSource: true,
      thematicTags: { select: { tagId: true } },
    },
  });
  const rows = new Map<string, Row>();
  for (const it of items.filter((i) => i.parentId === null))
    rows.set(it.id, {
      id: it.id,
      label: it.name,
      officeId: it.officeId,
      sectorId: it.papSectorId,
      finishLineId: it.finishLineId,
      subFinishLineId: null,
      themeIds: [],
      money: { ps: ZERO, mooe: ZERO, fe: ZERO, co: ZERO, total: it.total },
      byFund: {},
    });
  for (const it of items) {
    const row = rows.get(it.rootItemId);
    if (!row) continue;
    row.money = {
      ps: row.money.ps.plus(it.ps),
      mooe: row.money.mooe.plus(it.mooe),
      fe: row.money.fe.plus(it.fe),
      co: row.money.co.plus(it.co),
      total: row.money.total,
    };
    add(
      row.byFund,
      it.fundSource ?? FundSource.GF,
      it.ps.plus(it.mooe).plus(it.fe).plus(it.co).plus(it.unsplit),
    );
    for (const t of it.thematicTags)
      if (!row.themeIds.includes(t.tagId)) row.themeIds.push(t.tagId);
  }
  return [...rows.values()];
}
