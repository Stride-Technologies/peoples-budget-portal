import { NotFoundException } from '@nestjs/common';
import {
  BudgetDocumentKind,
  BudgetDocumentStatus,
  Prisma,
} from '../generated/prisma/index';
import type { PrismaService } from '../prisma/prisma.service.js';

type Db = Pick<
  PrismaService,
  'budgetDocument' | 'budgetObjectLine' | 'budgetReceiptLine'
>;

export interface CompareRow {
  kind: 'object' | 'receipt';
  /** Office acronym, or "GF" for the General Fund's receipts. */
  scope: string;
  code: string;
  title: string;
  /** This document's current-year column: its estimate of the year before. */
  thisCurrentYear: string | null;
  /** The year before's own document, budget-year column. */
  previousBudgetYear: string | null;
  delta: string | null;
}

/**
 * Line each of a document's object and receipt lines up with the year before
 * (specs/017 FR-010, US5). A line's "current year" column is what the book says
 * the year before came to; the previous year's own document says what it was
 * budgeted at. The match key is office + chart account + city suffix (the
 * printed code when it resolves to no account), never stored, never a gate.
 *
 * The year before's document is its enacted Ordinance when there is one, else
 * its LEP: for FY2026 against FY2025 that is the Mayor's proposal against the
 * year's own estimate, so a delta can be the Sanggunian's change, not an error.
 */
export async function compareWithPrevious(prisma: Db, documentId: string) {
  const doc = await prisma.budgetDocument.findUnique({
    where: { id: documentId },
    select: { id: true, budgetCycle: { select: { fiscalYear: true } } },
  });
  if (!doc) throw new NotFoundException('Budget document not found');
  const fy = doc.budgetCycle.fiscalYear;
  const candidates = await prisma.budgetDocument.findMany({
    where: { budgetCycle: { fiscalYear: fy - 1 } },
    select: { id: true, kind: true, status: true },
  });
  const previous =
    candidates.find(
      (d) =>
        d.kind === BudgetDocumentKind.ORDINANCE &&
        d.status === BudgetDocumentStatus.ENACTED,
    ) ??
    candidates.find((d) => d.kind === BudgetDocumentKind.LEP) ??
    null;

  const [mine, theirs] = await Promise.all([
    linesOf(prisma, doc.id),
    previous
      ? linesOf(prisma, previous.id)
      : Promise.resolve(new Map<string, Keyed>()),
  ]);
  const rows: CompareRow[] = [];
  let matched = 0;
  let equal = 0;
  for (const [key, a] of mine) {
    const b = theirs.get(key);
    if (!b) continue;
    matched++;
    const cur = a.current;
    const prev = b.budget;
    if (cur !== null && prev !== null && cur.equals(prev)) {
      equal++;
      continue;
    }
    rows.push({
      kind: a.kind,
      scope: a.scope,
      code: a.code,
      title: a.title,
      thisCurrentYear: cur?.toFixed(2) ?? null,
      previousBudgetYear: prev?.toFixed(2) ?? null,
      delta: cur !== null && prev !== null ? cur.minus(prev).toFixed(2) : null,
    });
  }
  const abs = (r: CompareRow) => new Prisma.Decimal(r.delta ?? 0).abs();
  rows.sort((x, y) => abs(y).comparedTo(abs(x)));
  return {
    fiscalYear: fy,
    previous: previous
      ? { id: previous.id, kind: previous.kind, fiscalYear: fy - 1 }
      : null,
    counts: {
      here: mine.size,
      there: theirs.size,
      matched,
      equal,
      differ: rows.length,
    },
    rows,
  };
}

interface Keyed {
  kind: 'object' | 'receipt';
  scope: string;
  code: string;
  title: string;
  current: Prisma.Decimal | null;
  budget: Prisma.Decimal | null;
}

/** Leaf lines by match key; lines sharing a key (a code printed twice) are summed. */
async function linesOf(prisma: Db, documentId: string) {
  const [objects, receipts] = await Promise.all([
    prisma.budgetObjectLine.findMany({
      where: { documentId },
      select: {
        uacsCode: true,
        accountCode: true,
        subCode: true,
        accountTitle: true,
        amount: true,
        currentYearTotal: true,
        currentFirstSemActual: true,
        currentSecondSemEstimate: true,
        office: { select: { acronym: true } },
      },
    }),
    prisma.budgetReceiptLine.findMany({
      where: { documentId },
      select: {
        id: true,
        parentId: true,
        printedCode: true,
        accountCode: true,
        subCode: true,
        particulars: true,
        amount: true,
        currentYearTotal: true,
        currentFirstSemActual: true,
        currentSecondSemEstimate: true,
        office: { select: { acronym: true } },
      },
    }),
  ]);
  const out = new Map<string, Keyed>();
  const add = (k: Keyed, key: string) => {
    const seen = out.get(key);
    const plus = (a: Prisma.Decimal | null, b: Prisma.Decimal | null) =>
      a === null ? b : b === null ? a : a.plus(b);
    out.set(
      key,
      seen
        ? {
            ...seen,
            current: plus(seen.current, k.current),
            budget: plus(seen.budget, k.budget),
          }
        : k,
    );
  };
  const currentOf = (l: {
    currentYearTotal: Prisma.Decimal | null;
    currentFirstSemActual: Prisma.Decimal | null;
    currentSecondSemEstimate: Prisma.Decimal | null;
  }) =>
    l.currentYearTotal ??
    (l.currentFirstSemActual === null && l.currentSecondSemEstimate === null
      ? null
      : new Prisma.Decimal(l.currentFirstSemActual ?? 0).plus(
          l.currentSecondSemEstimate ?? 0,
        ));
  for (const l of objects) {
    if (!l.uacsCode) continue;
    const code = l.accountCode
      ? `${l.accountCode}${l.subCode ? `-${l.subCode}` : ''}`
      : l.uacsCode;
    add(
      {
        kind: 'object',
        scope: l.office.acronym,
        code,
        title: l.accountTitle ?? code,
        current: currentOf(l),
        budget: l.amount,
      },
      `o|${l.office.acronym}|${code}`,
    );
  }
  const parents = new Set(receipts.map((r) => r.parentId).filter(Boolean));
  for (const r of receipts) {
    if (parents.has(r.id)) continue; // headings restate their rows
    const code = r.accountCode
      ? `${r.accountCode}${r.subCode ? `-${r.subCode}` : ''}`
      : (r.printedCode ?? r.particulars.toLowerCase());
    const scope = r.office?.acronym ?? 'GF';
    add(
      {
        kind: 'receipt',
        scope,
        code,
        title: r.particulars,
        current: currentOf(r),
        budget: r.amount,
      },
      `r|${scope}|${code}`,
    );
  }
  return out;
}
