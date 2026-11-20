/**
 * The gate for a seeded Ordinance (specs/012 P3). Read-only; exits non-zero on
 * any hard failure. Run before `--enact` and again before `--retire-programs`.
 *
 * Hard checks:
 *   - Σ top-level totals = the book's parsed total = the book's printed total
 *   - Σ top-level totals = Σ the old Program rows' proposedTotal (where they exist),
 *     overall and per office — a difference means a hand edit since the seed,
 *     listed rather than lost
 *   - every stored total = own + Σ children; every rootItemId names its tree's root
 *   - every old Program id is a PPA id; every old PA id is a PPA id or the
 *     program's own-money row (the old mirror), so public links keep resolving
 *   - no comment lost: comments on the old Programs + on the PPAs = before
 *
 *   - special-fund sheets (specs/016, when the year has an office mapping): each
 *     fund's rows = its sheet's own printed figure (SPA: `TOTAL, SPA`); SPA's
 *     roll-up lines = the LDF and LDRRMF sheets; every such row on a live office
 *   - Σ top-level = the cycle's stated total (the office part, without the
 *     special funds), where one is recorded
 *
 *   - an Ordinance's by-object (PAOO) lines: Σ = Σ top-level PPAs, and none of
 *     them is SPA's roll-up of the LDF / LDRRMF sheets (repair:
 *     `db:repair:object-rollups`). An LEP reports both instead: its lines are
 *     OCR from a scan (specs/017).
 *
 * Reported, not failed: by-object (PAOO) Σ per office against by-PPA Σ per
 * office, and General Administration vs Economic Enterprises.
 *
 *   pnpm --filter api db:verify:document -- --year 2026 [--book prisma/data/ab-<year>-book.json] [--kind LEP]
 *
 * `--kind LEP` checks a historical year's LEP (specs/017) the same way.
 */
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  Prisma,
  PrismaClient,
  BudgetDocumentKind,
} from '../src/generated/prisma/index';
import { subtreeAmounts } from '../src/budget-documents/budget-item-view';
import {
  readBook,
  parsedTotalOf,
  isOfficeSheet,
  isRollUp,
  isRollUpName,
  ownPrintedTotal,
  specialFundOf,
} from './ab-2026-book';
import { loadSpecialFundOffices } from './budget-document-plan';
import 'dotenv/config';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

async function main() {
  const i = process.argv.indexOf('--year');
  const year = Number(process.argv[i + 1]);
  const failures: string[] = [];
  const notes: string[] = [];

  const k = process.argv.indexOf('--kind');
  const kind =
    k >= 0 && process.argv[k + 1]?.toUpperCase() === 'LEP'
      ? BudgetDocumentKind.LEP
      : BudgetDocumentKind.ORDINANCE;
  const doc = await prisma.budgetDocument.findFirst({
    where: { kind, budgetCycle: { fiscalYear: year } },
    select: { id: true, status: true },
  });
  if (!doc) throw new Error(`FY${year} has no ${kind}`);

  const items = await prisma.budgetItem.findMany({
    where: { documentId: doc.id },
    select: {
      id: true,
      parentId: true,
      rootItemId: true,
      officeId: true,
      hostOfficeId: true,
      papClass: true,
      aipReferenceCode: true,
      name: true,
      majorFinalOutput: true,
      performanceIndicator: true,
      target: true,
      ps: true,
      mooe: true,
      fe: true,
      co: true,
      unsplit: true,
      total: true,
      fundSource: true,
      orderIndex: true,
      office: { select: { acronym: true, isActive: true, form7Column: true } },
      hostOffice: { select: { form7Column: true } },
    },
  });
  const roots = items.filter((x) => x.parentId === null);
  const rootTotal = roots.reduce((s, r) => s.plus(r.total), D(0));
  const SPECIAL = new Set<string>(['SPA', 'LDF', 'LDRRMF']);
  const isSpecial = (x: { fundSource: string | null }) =>
    x.fundSource !== null && SPECIAL.has(x.fundSource);
  const officeRoots = roots.filter((r) => !isSpecial(r));

  // ── Book ──
  const b = process.argv.indexOf('--book');
  const book = readBook(b >= 0 ? resolve(process.argv[b + 1]) : undefined);
  // Special-fund sheets count once the year has an office mapping (specs/016).
  const withSpecial = loadSpecialFundOffices(year) !== null;
  const sheets = book.sheets.filter((sh) => withSpecial || isOfficeSheet(sh));
  const parsed = D(
    sheets.reduce((s, sh) => s + parsedTotalOf(sh), 0n).toString(),
  ).div(100);
  const printed = sheets.reduce(
    (s, sh) => s.plus(ownPrintedTotal(sh) ?? 0),
    D(0),
  );
  if (!rootTotal.equals(parsed))
    failures.push(
      `Σ top-level ₱${rootTotal.toFixed(2)} ≠ book parsed ₱${parsed.toFixed(2)}`,
    );
  if (!parsed.equals(printed))
    notes.push(
      `book parsed ₱${parsed.toFixed(2)} ≠ printed ₱${printed.toFixed(2)} (a property of the book)`,
    );

  // ── Special funds ──
  if (withSpecial) {
    for (const fund of SPECIAL) {
      const want = book.sheets
        .filter((sh) => specialFundOf(sh) === fund)
        .reduce((s, sh) => s.plus(ownPrintedTotal(sh) ?? 0), D(0));
      const got = roots
        .filter((r) => r.fundSource === fund)
        .reduce((s, r) => s.plus(r.total), D(0));
      (got.equals(want) ? notes : failures).push(
        `${fund}: ${roots.filter((r) => r.fundSource === fund).length} rows ₱${got.toFixed(2)}, sheet prints ₱${want.toFixed(2)}`,
      );
    }
    const spa = book.sheets.find((sh) => specialFundOf(sh) === 'SPA');
    for (const roll of spa?.uncodedMoneyRows.filter(isRollUp) ?? []) {
      const fund = /DEVELOPMENT FUND/i.test(roll.name) ? 'LDF' : 'LDRRMF';
      const sheet = book.sheets.find((sh) => specialFundOf(sh) === fund);
      if (!sheet || !D(roll.total ?? 0).equals(ownPrintedTotal(sheet) ?? 0))
        failures.push(
          `SPA roll-up "${roll.name.trim()}" ₱${roll.total} ≠ the ${fund} sheet's ₱${sheet ? ownPrintedTotal(sheet) : '—'}`,
        );
    }
    for (const x of items.filter(isSpecial))
      if (!x.office.isActive)
        failures.push(
          `${x.fundSource} row ${x.aipReferenceCode ?? x.name} is on ${x.office.acronym}, which is retired`,
        );
  }

  // ── Stated total (the ordinance's own GRAND TOTAL, where recorded) ──
  const cycle = await prisma.budgetCycle.findFirst({
    where: { fiscalYear: year },
    select: { statedTotal: true, statedOfficeTotal: true },
  });
  const stated = withSpecial ? cycle?.statedTotal : cycle?.statedOfficeTotal;
  if (stated && !stated.equals(rootTotal))
    failures.push(
      `Σ top-level ₱${rootTotal.toFixed(2)} ≠ stated ${withSpecial ? 'total' : 'office total'} ₱${stated.toFixed(2)}`,
    );
  const ee = roots
    .filter(
      (r) => (r.hostOffice ?? r.office).form7Column === 'ECONOMIC_ENTERPRISE',
    )
    .reduce((s, r) => s.plus(r.total), D(0));
  notes.push(
    `General Administration ₱${rootTotal.minus(ee).toFixed(2)} + Economic Enterprises ₱${ee.toFixed(2)}`,
  );

  // ── Tree ──
  const amounts = subtreeAmounts(items);
  const byId = new Map(items.map((x) => [x.id, x]));
  for (const x of items) {
    if (!amounts.get(x.id)!.total.equals(x.total))
      failures.push(
        `${x.id}: total ${x.total.toFixed(2)} ≠ own + children ${amounts.get(x.id)!.total.toFixed(2)}`,
      );
    const parent = x.parentId ? byId.get(x.parentId) : undefined;
    const expectedRoot = parent ? parent.rootItemId : x.id;
    if (x.rootItemId !== expectedRoot)
      failures.push(`${x.id}: root ${x.rootItemId} ≠ ${expectedRoot}`);
  }

  // ── Old Program rows ──
  const aip = await prisma.aIPCycle.findUnique({ where: { fiscalYear: year } });
  const programs = aip
    ? await prisma.program.findMany({
        where: { aipCycleId: aip.id },
        select: {
          id: true,
          officeId: true,
          proposedTotal: true,
          deletedAt: true,
          projectActivities: { select: { id: true, orderIndex: true } },
        },
      })
    : [];
  if (programs.length) {
    const oldTotal = programs.reduce(
      (s, p) => s.plus(p.proposedTotal ?? 0),
      D(0),
    );
    // The old Program rows never held the special-fund sheets.
    const officeTotal = officeRoots.reduce((s, r) => s.plus(r.total), D(0));
    if (!oldTotal.equals(officeTotal))
      failures.push(
        `Σ old programs ₱${oldTotal.toFixed(2)} ≠ Σ top-level office rows ₱${officeTotal.toFixed(2)}`,
      );
    const byOffice = (rows: { officeId: string | null; v: Prisma.Decimal }[]) =>
      rows.reduce(
        (m, r) =>
          m.set(r.officeId ?? '', (m.get(r.officeId ?? '') ?? D(0)).plus(r.v)),
        new Map<string, Prisma.Decimal>(),
      );
    const oldBy = byOffice(
      programs.map((p) => ({
        officeId: p.officeId,
        v: D(p.proposedTotal ?? 0),
      })),
    );
    const newBy = byOffice(
      officeRoots.map((r) => ({ officeId: r.officeId, v: r.total })),
    );
    for (const office of new Set([...oldBy.keys(), ...newBy.keys()])) {
      const a = oldBy.get(office) ?? D(0);
      const b = newBy.get(office) ?? D(0);
      if (!a.equals(b))
        failures.push(
          `office ${office}: old ₱${a.toFixed(2)} ≠ new ₱${b.toFixed(2)} (hand edit since the seed?)`,
        );
    }
    for (const p of programs) {
      if (!byId.has(p.id))
        failures.push(
          `old program ${p.id} has no PPA (its public link would break)`,
        );
      for (const pa of p.projectActivities) {
        const isMirror =
          pa.orderIndex === 1 &&
          byId.has(p.id) &&
          !byId
            .get(p.id)!
            .ps.plus(byId.get(p.id)!.mooe)
            .plus(byId.get(p.id)!.fe)
            .plus(byId.get(p.id)!.co)
            .plus(byId.get(p.id)!.unsplit)
            .isZero();
        if (!byId.has(pa.id) && !isMirror)
          failures.push(
            `old PA ${pa.id} has no PPA and is not its program's own-money row`,
          );
      }
    }
    const ids = programs.map((p) => p.id);
    const [onPrograms, onItems] = await Promise.all([
      prisma.programComment.count({ where: { programId: { in: ids } } }),
      prisma.programComment.count({
        where: { budgetItemId: { in: items.map((x) => x.id) } },
      }),
    ]);
    notes.push(
      `comments: ${onPrograms} on the old programs, ${onItems} on the PPAs (${doc.status === 'ENACTED' ? 'after' : 'before'} enactment)`,
    );
    if (doc.status === 'ENACTED' && onPrograms > 0)
      failures.push(
        `${onPrograms} comment(s) still on old programs after enactment`,
      );
    if (doc.status !== 'ENACTED' && onItems > 0)
      failures.push(`${onItems} comment(s) moved before enactment`);
    const [oldTags, newTags] = await Promise.all([
      prisma.programThematicTag.count({ where: { programId: { in: ids } } }),
      prisma.budgetItemThematicTag.count({
        where: { budgetItemId: { in: items.map((x) => x.id) } },
      }),
    ]);
    if (newTags < oldTags)
      failures.push(`tags: ${newTags} on PPAs < ${oldTags} on old programs`);
    notes.push(`tags: ${oldTags} on old programs, ${newTags} on PPAs`);
  }

  // ── By-object vs by-PPA, per sheet office ──
  const lines = await prisma.budgetObjectLine.groupBy({
    by: ['officeId'],
    where: { documentId: doc.id },
    _sum: { amount: true },
  });
  if (lines.length) {
    // A special-fund row's by-object lines are on its fund's own sheet, which
    // the object import files under the retired LDF / SPAF / LDRRMF office.
    const sheetOffice = new Map(
      (
        await prisma.office.findMany({
          where: { acronym: { in: ['LDF', 'SPAF', 'LDRRMF'] } },
          select: { id: true, acronym: true },
        })
      ).map((o) => [o.acronym === 'SPAF' ? 'SPA' : o.acronym, o.id]),
    );
    const ppaBy = new Map<string, Prisma.Decimal>();
    for (const r of roots) {
      const k =
        (isSpecial(r) && sheetOffice.get(r.fundSource!)) ||
        r.hostOfficeId ||
        r.officeId;
      ppaBy.set(k, (ppaBy.get(k) ?? D(0)).plus(r.total));
    }
    const objTotal = lines.reduce((s, l) => s.plus(l._sum.amount ?? 0), D(0));
    notes.push(
      `by-object Σ ₱${objTotal.toFixed(2)} vs by-PPA Σ ₱${rootTotal.toFixed(2)}`,
    );
    const offices = new Map(
      (
        await prisma.office.findMany({ select: { id: true, acronym: true } })
      ).map((o) => [o.id, o.acronym]),
    );
    const diffs = lines
      .map((l) => ({
        office: offices.get(l.officeId) ?? l.officeId,
        obj: D(l._sum.amount ?? 0),
        ppa: ppaBy.get(l.officeId) ?? D(0),
      }))
      .filter((d) => !d.obj.equals(d.ppa));
    // The by-object lines carry the special-fund sheets; the by-PPA side does
    // too once the year has an office mapping (specs/016), else leave them out.
    // SPA's roll-up lines are never stored, so nothing is counted twice: for
    // FY2026 both sides are ₱2,122,357,059, the Ordinance's GRAND TOTAL.
    const sheetOf = (acronym: string) =>
      D(
        lines.find((l) => offices.get(l.officeId) === acronym)?._sum.amount ??
          0,
      );
    const objComparable = withSpecial
      ? objTotal
      : objTotal
          .minus(sheetOf('LDF'))
          .minus(sheetOf('LDRRMF'))
          .minus(sheetOf('SPAF'));
    const strict = kind === BudgetDocumentKind.ORDINANCE;
    if (!objComparable.equals(rootTotal))
      (strict ? failures : notes).push(
        `by-object Σ ₱${objComparable.toFixed(2)}${withSpecial ? '' : ' (special-fund sheets left out)'} ≠ by-PPA Σ ₱${rootTotal.toFixed(2)}`,
      );
    const rollUps = (
      await prisma.budgetObjectLine.findMany({
        where: { documentId: doc.id, uacsCode: '' },
        select: { accountTitle: true, amount: true, sourceRef: true },
      })
    ).filter((l) => isRollUpName(l.accountTitle ?? ''));
    for (const l of rollUps)
      (strict ? failures : notes).push(
        `object line "${l.accountTitle}" ₱${D(l.amount).toFixed(2)} (${l.sourceRef ?? 'no ref'}) is SPA's roll-up of another sheet — run db:repair:object-rollups`,
      );
    if (diffs.length)
      notes.push(
        `by-object ≠ by-PPA for ${diffs.length} office(s): ${diffs.map((d) => `${d.office} ${d.obj.minus(d.ppa).toFixed(2)}`).join(', ')}`,
      );
  }

  await checkSections(doc.id, failures, notes);

  console.log(
    `FY${year} ${kind === BudgetDocumentKind.LEP ? 'LEP' : 'Ordinance'} (${doc.status}): ${items.length} PPAs, Σ top-level ₱${rootTotal.toFixed(2)}`,
  );
  notes.forEach((n) => console.log(`  · ${n}`));
  if (failures.length) {
    console.log(`\n${failures.length} failure(s):`);
    failures.slice(0, 50).forEach((f) => console.log(`  ✗ ${f}`));
    process.exitCode = 1;
  } else {
    console.log('\n✓ all checks pass');
  }
}

/**
 * The rest of the book (specs/017): every receipts program adds up to the total
 * it prints, Forms 5 and 6 to theirs, and printed codes resolve to the chart.
 * The city's own cross-figures (receipts vs appropriations, the PS ceiling) are
 * reported, not failed: they are the book's, not the import's.
 */
async function checkSections(
  documentId: string,
  failures: string[],
  notes: string[],
) {
  const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
  const totals = await prisma.budgetPrintedTotal.findMany({
    where: { documentId },
  });
  const printed = (kind: string, scope: string, label?: RegExp) =>
    totals.find(
      (t) =>
        t.kind === kind && t.scope === scope && (!label || label.test(t.label)),
    )?.amount ?? null;
  const receipts = await prisma.budgetReceiptLine.findMany({
    where: { documentId },
    select: {
      id: true,
      parentId: true,
      amount: true,
      printedCode: true,
      accountCode: true,
      office: { select: { acronym: true } },
    },
  });
  if (receipts.length) {
    const kids = new Map<string, typeof receipts>();
    for (const r of receipts)
      if (r.parentId)
        kids.set(r.parentId, [...(kids.get(r.parentId) ?? []), r]);
    const eff = (r: (typeof receipts)[number]): Prisma.Decimal =>
      r.amount ?? (kids.get(r.id) ?? []).reduce((t, c) => t.plus(eff(c)), D(0));
    const scopes = new Map<string, Prisma.Decimal>();
    for (const r of receipts)
      if (!r.parentId) {
        const k = r.office?.acronym ?? 'GF';
        scopes.set(k, (scopes.get(k) ?? D(0)).plus(eff(r)));
      }
    for (const [scope, sum] of scopes) {
      const want = printed('RECEIPTS', scope);
      if (want === null)
        notes.push(`receipts ${scope}: no printed total to check`);
      else if (!sum.equals(want))
        failures.push(
          `receipts ${scope}: lines ₱${sum.toFixed(2)} ≠ printed ₱${want.toFixed(2)}`,
        );
    }
    notes.push(
      `receipts: ${receipts.length} lines in ${scopes.size} program(s), each = its printed total` +
        (failures.some((f) => f.startsWith('receipts'))
          ? ' (except the failures below)'
          : ''),
    );
    const gf = scopes.get('GF');
    const grand = printed('FORM7', 'ALL', /^Grand total$/);
    if (gf && grand)
      notes.push(
        `receipts (GF) ₱${gf.toFixed(2)} ${gf.equals(grand) ? '=' : '≠'} Form 7 grand total ₱${grand.toFixed(2)}`,
      );
  }

  const loans = await prisma.budgetIndebtedness.aggregate({
    where: { documentId },
    _sum: { principal: true },
    _count: true,
  });
  const f5 = printed('FORM5', 'GF', /principal/i);
  if (loans._count && f5 && !D(loans._sum.principal ?? 0).equals(f5))
    failures.push(
      `Form 5: Σ principal ₱${D(loans._sum.principal ?? 0).toFixed(2)} ≠ printed ₱${f5.toFixed(2)}`,
    );
  const obl = await prisma.budgetStatutoryObligation.aggregate({
    where: { documentId },
    _sum: { amount: true },
    _count: true,
  });
  const f6 = printed('FORM6', 'GF', /^Total$/);
  if (obl._count && f6 && !D(obl._sum.amount ?? 0).equals(f6))
    failures.push(
      `Form 6: Σ ₱${D(obl._sum.amount ?? 0).toFixed(2)} ≠ printed ₱${f6.toFixed(2)}`,
    );
  if (loans._count || obl._count)
    notes.push(
      `Form 5: ${loans._count} loan(s); Form 6: ${obl._count} line(s)`,
    );

  const max = printed('PS_LIMIT', 'GF', /Maximum/i);
  const est = printed('PS_LIMIT', 'GF', /Estimated/i);
  if (max && est)
    notes.push(
      `PS ceiling (as printed): ₱${est.toFixed(2)} of ₱${max.toFixed(2)} allowed (${est.div(max).mul(100).toFixed(1)}%)${est.gt(max) ? ' — OVER' : ''}`,
    );

  // SC-004: ≥ 98% of printed account codes resolve to a chart account.
  const objects = await prisma.budgetObjectLine.findMany({
    where: { documentId, uacsCode: { not: '' } },
    select: {
      uacsCode: true,
      accountCode: true,
      accountTitle: true,
      account: { select: { title: true } },
      office: { select: { acronym: true } },
    },
  });
  const coded = [
    ...objects.map((o) => ({ code: o.uacsCode, ok: !!o.accountCode })),
    ...receipts
      .filter((r) => r.printedCode)
      .map((r) => ({ code: r.printedCode!, ok: !!r.accountCode })),
  ];
  if (coded.length) {
    const bad = coded.filter((c) => !c.ok);
    const share = ((coded.length - bad.length) / coded.length) * 100;
    (share >= 98 ? notes : failures).push(
      `account codes: ${coded.length - bad.length} of ${coded.length} resolve to the chart (${share.toFixed(1)}%)` +
        (bad.length
          ? `; not: ${[...new Set(bad.map((b) => b.code))].slice(0, 15).join(', ')}`
          : ''),
    );
    // A code that resolves but whose printed title shares no word with the
    // chart's is likely the city's typo (FY2026 CMO prints Salaries & Wages-Regular as 5-01-02-100).
    // Words compared on their first five letters (Donation ~ Donations); the
    // special-fund sheets name purposes, not accounts, so they are skipped.
    const words = (t: string) =>
      new Set(
        (t.toLowerCase().match(/[a-z]{4,}/g) ?? []).map((w) => w.slice(0, 5)),
      );
    const odd = objects.filter((o) => {
      if (!o.account || !o.accountTitle) return false;
      if (['SPAF', 'LDF', 'LDRRMF'].includes(o.office.acronym)) return false;
      const a = words(o.account.title);
      return ![...words(o.accountTitle)].some((w) => a.has(w));
    });
    if (odd.length)
      notes.push(
        `${odd.length} object line(s) whose printed title does not match its code's account: ` +
          odd
            .slice(0, 8)
            .map(
              (o) =>
                `${o.office.acronym} "${o.accountTitle}" ${o.uacsCode} (= ${o.account!.title})`,
            )
            .join('; '),
      );
  }
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
