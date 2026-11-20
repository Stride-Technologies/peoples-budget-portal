import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PUBLIC_ANNUAL_DOCUMENT } from './ordinance-registry.js';

type Db = Pick<
  PrismaService,
  | 'budgetDocument'
  | 'budgetReceiptLine'
  | 'budgetIndebtedness'
  | 'budgetStatutoryObligation'
  | 'budgetPrintedTotal'
  | 'budgetObjectLine'
>;

const money = (v: { toFixed(n: number): string } | null) =>
  v === null ? null : v.toFixed(2);

/** The public Annual document of a fiscal year, or 404 (the same rule as the section). */
async function documentOf(prisma: Db, fiscalYear: number) {
  const doc = await prisma.budgetDocument.findFirst({
    where: { AND: [PUBLIC_ANNUAL_DOCUMENT, { budgetCycle: { fiscalYear } }] },
    select: { id: true, kind: true },
  });
  if (!doc) throw new NotFoundException('No public budget for that year');
  return doc;
}

/**
 * The rest of a year's public budget book (specs/017 FR-011): the Receipts
 * Program, Forms 5 and 6, and the PS ceiling as printed. Named columns only,
 * never a spread: provenance (`sourceRef`, the source file) stays staff-side.
 */
export async function annualBook(prisma: Db, fiscalYear: number) {
  const doc = await documentOf(prisma, fiscalYear);
  const [receipts, loans, obligations, totals] = await Promise.all([
    prisma.budgetReceiptLine.findMany({
      where: { documentId: doc.id },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        parentId: true,
        particulars: true,
        printedCode: true,
        accountCode: true,
        incomeClass: true,
        pastYearActual: true,
        currentFirstSemActual: true,
        currentSecondSemEstimate: true,
        currentYearTotal: true,
        amount: true,
        account: { select: { title: true } },
        office: { select: { acronym: true, name: true } },
      },
    }),
    prisma.budgetIndebtedness.findMany({
      where: { documentId: doc.id },
      orderBy: { orderIndex: 'asc' },
    }),
    prisma.budgetStatutoryObligation.findMany({
      where: { documentId: doc.id },
      orderBy: { orderIndex: 'asc' },
    }),
    prisma.budgetPrintedTotal.findMany({
      where: {
        documentId: doc.id,
        kind: { in: ['RECEIPTS', 'PS_LIMIT', 'FORM5', 'FORM6'] },
      },
      select: { kind: true, scope: true, label: true, amount: true },
    }),
  ]);
  return {
    fiscalYear,
    documentKind: doc.kind,
    receipts: receipts.map(({ account, office, ...r }) => ({
      id: r.id,
      parentId: r.parentId,
      particulars: r.particulars,
      printedCode: r.printedCode,
      accountCode: r.accountCode,
      accountTitle: account?.title ?? null,
      incomeClass: r.incomeClass,
      officeAcronym: office?.acronym ?? null,
      officeName: office?.name ?? null,
      pastYearActual: money(r.pastYearActual),
      currentFirstSemActual: money(r.currentFirstSemActual),
      currentSecondSemEstimate: money(r.currentSecondSemEstimate),
      currentYearTotal: money(r.currentYearTotal),
      amount: money(r.amount),
    })),
    indebtedness: loans.map((l) => ({
      id: l.id,
      creditor: l.creditor,
      purpose: l.purpose,
      dateContracted: l.dateContracted,
      term: l.term,
      principal: l.principal.toFixed(2),
      previousPrincipal: money(l.previousPrincipal),
      previousInterest: money(l.previousInterest),
      budgetYearPrincipal: money(l.budgetYearPrincipal),
      budgetYearInterest: money(l.budgetYearInterest),
      balance: money(l.balance),
    })),
    obligations: obligations.map((o) => ({
      id: o.id,
      section: o.section,
      particulars: o.particulars,
      amount: o.amount.toFixed(2),
    })),
    printedTotals: totals.map((t) => ({ ...t, amount: t.amount.toFixed(2) })),
  };
}

/**
 * A year's spending by object (LBP Form 2), office by office: every office's
 * totals, and one office's lines when `officeAcronym` is given.
 */
export async function annualObjects(
  prisma: Db,
  fiscalYear: number,
  officeAcronym?: string,
) {
  const doc = await documentOf(prisma, fiscalYear);
  const lines = await prisma.budgetObjectLine.findMany({
    where: { documentId: doc.id },
    orderBy: { orderIndex: 'asc' },
    select: {
      id: true,
      uacsCode: true,
      accountCode: true,
      accountTitle: true,
      expenseClass: true,
      amount: true,
      pastYearActual: true,
      currentFirstSemActual: true,
      currentSecondSemEstimate: true,
      currentYearTotal: true,
      account: { select: { title: true } },
      office: { select: { acronym: true, name: true } },
    },
  });
  // A line with no account code whose amount is another sheet's whole total is
  // that sheet printed again (FY2026's SPA prints "H. 20% LOCAL DEVELOPMENT
  // FUND" = the LDF sheet). Shown once, on its own sheet, never twice.
  const sheetCents = new Map<string, bigint>();
  for (const l of lines)
    sheetCents.set(
      l.office.acronym,
      (sheetCents.get(l.office.acronym) ?? 0n) +
        BigInt(l.amount.mul(100).toFixed(0)),
    );
  const restates = (l: (typeof lines)[number]) => {
    if (l.uacsCode) return false;
    const c = BigInt(l.amount.mul(100).toFixed(0));
    return [...sheetCents].some(
      ([acronym, total]) =>
        acronym !== l.office.acronym && total === c && c !== 0n,
    );
  };
  const shown = lines.filter((l) => !restates(l));

  // Each office's total in centavos, from Decimal: never through a float.
  const offices = new Map<
    string,
    { acronym: string; name: string; lines: number; cents: bigint }
  >();
  for (const l of shown) {
    const o = offices.get(l.office.acronym) ?? {
      ...l.office,
      lines: 0,
      cents: 0n,
    };
    o.lines++;
    o.cents += BigInt(l.amount.mul(100).toFixed(0));
    offices.set(l.office.acronym, o);
  }
  const pesos = (c: bigint) => {
    const a = c < 0n ? -c : c;
    return `${c < 0n ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
  };
  return {
    fiscalYear,
    documentKind: doc.kind,
    offices: [...offices.values()]
      .sort((a, b) => (b.cents > a.cents ? 1 : b.cents < a.cents ? -1 : 0))
      .map(({ cents, ...o }) => ({ ...o, total: pesos(cents) })),
    lines: officeAcronym
      ? shown
          .filter((l) => l.office.acronym === officeAcronym)
          .map(({ account, office: _o, ...l }) => ({
            id: l.id,
            printedCode: l.uacsCode || null,
            accountCode: l.accountCode,
            title: l.accountTitle ?? account?.title ?? null,
            expenseClass: l.expenseClass,
            pastYearActual: money(l.pastYearActual),
            currentFirstSemActual: money(l.currentFirstSemActual),
            currentSecondSemEstimate: money(l.currentSecondSemEstimate),
            currentYearTotal: money(l.currentYearTotal),
            amount: l.amount.toFixed(2),
          }))
      : [],
  };
}
