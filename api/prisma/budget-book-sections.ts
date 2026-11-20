/**
 * The rest of a budget book beside its PPAs (specs/017): the Receipts Program,
 * LBP Forms 5 and 6, and the totals the book prints (Form 7, the summaries, the
 * PS ceiling). Read from the ordinance .xls here; the OCR importer writes the
 * same `BookSections` shape for the scanned years, so one seed serves both.
 *
 * Nothing here is summed into the budget: receipts are the other side of the
 * ledger, and printed totals are only checked against.
 */
import { IncomeClass, Prisma } from '../src/generated/prisma/index';
import type { ObjectLinePlan } from './budget-document-objects';

type Cell = string | number;
export interface XlsSheet {
  name: string;
  rows: Cell[][];
}

/** The four printed columns beside the budget year (specs/017 FR-004). */
export interface YearColumns {
  pastYearActual: string | null;
  currentFirstSemActual: string | null;
  currentSecondSemEstimate: string | null;
  currentYearTotal: string | null;
}

export interface Provenance {
  sourceRef: string;
  /** A scanned book's file and page; the .xls book has one file and no pages. */
  sourceFile?: string;
  sourceUrl?: string | null;
  sourcePage?: number | null;
}

export interface ReceiptLinePlan extends YearColumns, Provenance {
  key: string;
  parentKey: string | null;
  /** Null = the General Fund's program; an acronym = that enterprise's own sheet. */
  officeAcronym: string | null;
  particulars: string;
  printedCode: string | null;
  incomeClass: IncomeClass | null;
  amount: string | null;
}

export interface IndebtednessPlan extends Provenance {
  creditor: string;
  purpose: string;
  dateContracted: string | null;
  term: string | null;
  principal: string;
  previousPrincipal: string | null;
  previousInterest: string | null;
  budgetYearPrincipal: string | null;
  budgetYearInterest: string | null;
  balance: string | null;
}

export interface ObligationPlan extends Provenance {
  section: string;
  particulars: string;
  amount: string;
}

export type PrintedTotalKind =
  | 'RECEIPTS'
  | 'FORM7'
  | 'SUMMARY'
  | 'PS_LIMIT'
  | 'FORM5'
  | 'FORM6'
  | 'OBJECT_SHEET'
  | 'BUDGET_MESSAGE';

export interface PrintedTotalPlan extends Provenance {
  kind: PrintedTotalKind;
  scope: string;
  label: string;
  amount: string;
}

export interface BookSections {
  /** A scanned book's by-object lines (the .xls book's come from `parseObjectSheets`). */
  objectLines?: ObjectLinePlan[];
  receipts: ReceiptLinePlan[];
  indebtedness: IndebtednessPlan[];
  obligations: ObligationPlan[];
  printedTotals: PrintedTotalPlan[];
  /** What the reader could not settle; each goes to the import report. */
  problems: string[];
}

// ─── Cells and money ─────────────────────────────────────────────────────────

export const text = (c: Cell | undefined) =>
  c === undefined ? '' : String(c).replace(/\s+/g, ' ').trim();

/** A cell's amount in centavos, or null when it holds no number. */
export function centavos(c: Cell | undefined): bigint | null {
  // Through Decimal, not a float: 0.29 * 100 is 28.999… in binary floating point.
  const s = typeof c === 'number' ? String(c) : text(c).replace(/,/g, '');
  if (s === '' || !/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
  return BigInt(new Prisma.Decimal(s).mul(100).toFixed(0));
}

export const pesos = (cents: bigint) => {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
};

const pesosOrNull = (c: bigint | null) => (c === null ? null : pesos(c));

// ─── Account codes ───────────────────────────────────────────────────────────

/**
 * A printed code → the chart account it names and the city's suffix under it.
 * The chart's general-ledger code is 8 digits (`5-02-03-010`); the books print
 * it dashed that way, compressed (`40102-040`), or oddly split (`402-01-010`),
 * then a suffix (`-01`, `-06A`, `(10)`). A compound code (`40105-030/40105-040`)
 * resolves to its first part. Null when the digits do not reach 8 or the
 * account is not in the chart; the printed code is always kept beside it.
 */
export function resolveAccount(
  printed: string | null,
  chart: ReadonlySet<string>,
): { accountCode: string | null; subCode: string | null } {
  if (!printed) return { accountCode: null, subCode: null };
  for (const part of printed.split('/')) {
    let p = part.trim();
    let paren: string | null = null;
    const m = /^(.*?)\(([^)]*)\)\s*$/.exec(p);
    if (m) {
      p = m[1].trim();
      paren = m[2].trim();
    }
    const tokens = p
      .split('-')
      .map((t) => t.trim())
      .filter(Boolean);
    let digits = '';
    let used = 0;
    let tail: string | null = null; // `060A`: the letter is the city's suffix
    while (used < tokens.length && digits.length < 8) {
      const t = /^(\d+)([A-Z]*)$/i.exec(tokens[used]);
      if (!t) break;
      digits += t[1];
      used++;
      if (t[2]) {
        tail = t[2];
        break;
      }
    }
    if (digits.length !== 8) continue;
    const code = `${digits[0]}-${digits.slice(1, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    if (!chart.has(code)) continue;
    const rest = [
      ...(tail ? [tail] : []),
      ...tokens.slice(used),
      ...(paren ? [paren] : []),
    ].join('-');
    return { accountCode: code, subCode: rest || null };
  }
  return { accountCode: null, subCode: null };
}

// ─── Receipts Program ────────────────────────────────────────────────────────

/** Which enterprise each enterprise receipts sheet is (the .xls names). */
export const RECEIPT_SHEET_OFFICE: Record<string, string | null> = {
  'Receipts Program 2026': null,
  'Receipts (HOSP) 2026': 'NCGH',
  'Receipts (MEPO) 2026': 'MEPO',
  'Receipts (ABAT) 2026': 'NCDA',
  'Receipts (BCS) 2026': 'BCS',
  'Receipts (CCN) 2026': 'CCN',
  'Receipts (OLLI) 2026': 'OLLI',
};
/** Restatements of the General Fund's program, split by GA vs enterprises: totals only. */
export const RECEIPT_SPLIT_SHEETS: Record<string, string> = {
  'Receipts Program 2026(GA)': 'GA',
  'Receipts Program 2026 (LEE)': 'EE',
};

interface ReceiptCols {
  code: number;
  cls: number;
  past: number;
  s1: number;
  s2: number;
  total: number;
  by: number;
  start: number;
}

function receiptColumns(rows: Cell[][]): ReceiptCols | null {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r].map(text);
    const code = row.findIndex((c) => /ACCOUNT\s*CODE/i.test(c));
    if (code < 0) continue;
    const next = (rows[r + 1] ?? []).map(text);
    const find = (re: RegExp, cells = row) =>
      cells.findIndex((c) => re.test(c));
    return {
      code,
      cls: find(/^INCOME/i),
      past: find(/PAST\s*YEAR|^PAST$/i),
      s1: find(/(First|1st)\s*Sem/i, next),
      s2: find(/(Second|2nd)\s*Sem/i, next),
      total: find(/^TOTAL$/i),
      by: find(/BUDGET\s*YEAR|^BUDGET$/i),
      start: r + 2,
    };
  }
  return null;
}

const ROMAN = /^\s*(I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]\s*(?=[A-Za-z])/;
const LOWER = /^\s*[a-z][.)]\s*(?=[A-Za-z])/;
const TOTAL_LINE = /^\s*(SUB-?\s*TOTAL|TOTAL)/i;

interface RawReceipt {
  r: number;
  label: string;
  code: string | null;
  cls: IncomeClass | null;
  past: bigint | null;
  s1: bigint | null;
  s2: bigint | null;
  total: bigint | null;
  by: bigint | null;
}

/** A row's printed marker: its kind and its place in the list (1., b., IV.). */
function markerOf(label: string): { family: string; ord: number } | null {
  const roman = /^\s*(I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]/.exec(label)?.[1];
  if (roman)
    return {
      family: 'roman',
      ord:
        ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'].indexOf(
          roman,
        ) + 1,
    };
  const d = /^\s*(\d+)[.)]/.exec(label)?.[1];
  if (d) return { family: 'digit', ord: Number(d) };
  const l = /^\s*([a-z])[.)]\s*(?=[A-Za-z])/.exec(label)?.[1];
  if (l) return { family: 'lower', ord: l.charCodeAt(0) - 96 };
  const u = /^\s*([A-Z])[.)]\s*(?=[A-Za-z])/.exec(label)?.[1];
  if (u) return { family: 'upper', ord: u.charCodeAt(0) - 64 };
  return null;
}

const colsOf = (x: RawReceipt) => [x.by, x.total, x.past, x.s1, x.s2];

/**
 * One receipts sheet → lines with their printed hierarchy. The markers
 * (I., 1., A., a.) repeat at different depths, so the tree comes from the
 * sums the book prints: a heading closes when its children add up to it. A
 * classed row (R/NR) is a heading only when the lettered rows under it add up
 * to it (City College of Naga); an unclassed row whose rows never add up to it
 * is a leaf after all (a subsidy line), and what it swallowed moves back up.
 */
export function parseReceiptSheet(
  sheet: XlsSheet,
  officeAcronym: string | null,
  prefix: string,
): {
  lines: ReceiptLinePlan[];
  printedTotal: bigint | null;
  problems: string[];
} {
  const cols = receiptColumns(sheet.rows);
  const problems: string[] = [];
  if (!cols)
    return {
      lines: [],
      printedTotal: null,
      problems: [`${sheet.name}: no header row`],
    };
  const raw: RawReceipt[] = [];
  let printedTotal: bigint | null = null;
  for (let r = cols.start; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    const label = text(row[0]);
    if (!label) continue;
    if (/TOTAL\s*AVAILABLE/i.test(label)) {
      printedTotal = centavos(row[cols.by]);
      break;
    }
    const cls = text(row[cols.cls]).toUpperCase();
    raw.push({
      r,
      label,
      code: text(row[cols.code]) || null,
      cls:
        cls === 'R'
          ? IncomeClass.RECURRING
          : cls === 'NR'
            ? IncomeClass.NON_RECURRING
            : null,
      past: centavos(row[cols.past]),
      s1: cols.s1 >= 0 ? centavos(row[cols.s1]) : null,
      s2: cols.s2 >= 0 ? centavos(row[cols.s2]) : null,
      total: cols.total >= 0 ? centavos(row[cols.total]) : null,
      by: centavos(row[cols.by]),
    });
  }

  interface Node {
    x: RawReceipt;
    children: Node[];
    col: number; // which of colsOf() the heading is matched on; -1 = a label
    target: bigint;
    acc: bigint;
  }
  const roots: Node[] = [];
  const stack: Node[] = [];
  const valueIn = (x: RawReceipt, col: number) =>
    col < 0 ? 0n : (colsOf(x)[col] ?? 0n);

  const dissolve = (n: Node, into: Node[]) => {
    // Its rows never added up to it: it is a leaf, and they are its siblings.
    const at = into.indexOf(n);
    into.splice(at + 1, 0, ...n.children);
    n.children = [];
  };
  const closeAll = () => {
    while (stack.length) {
      const n = stack.pop()!;
      // Forced closes only happen while closing everything, so the parent's
      // running sum no longer matters once its children change.
      if (n.col >= 0 && n.acc !== n.target)
        dissolve(n, stack.length ? stack[stack.length - 1].children : roots);
    }
  };

  let lastClosed: Node | null = null;
  raw.forEach((x, i) => {
    if (TOTAL_LINE.test(x.label)) {
      closeAll();
      return;
    }
    if (ROMAN.test(x.label)) closeAll();
    // A heading whose rows never add up (one misread child) would swallow the
    // rest of the sheet. A row that carries on an open heading's own numbering
    // ("2. Franchise Tax" after "1. Business Tax") ends it, as printed — unless
    // it carries on the open group's own last row ("2. Previous Years" after
    // "1. Current Year"). The mismatch is still reported below.
    const mx = markerOf(x.label);
    const top = stack[stack.length - 1];
    const lastChild = top?.children.at(-1);
    const mc = lastChild ? markerOf(lastChild.x.label) : null;
    const continuesTop =
      mx && mc && mx.family === mc.family && mx.ord === mc.ord + 1;
    if (mx && !continuesTop) {
      for (let k = stack.length - 1; k >= 0; k--) {
        const mh = markerOf(stack[k].x.label);
        if (mh && mh.family === mx.family && mx.ord === mh.ord + 1) {
          stack.length = k;
          break;
        }
      }
    }
    // A heading closes as soon as its rows add up in its column, so trailing
    // rows with nothing there ("f. Sale of drop wire" after e., "6. Share from
    // EVAT" after 5.) would float up a level. They stay with it while they
    // carry on its list (same marker kind, or a lettered row under a numbered
    // one): they add nothing to its sum, and their earlier years belong to it.
    const family = (l: string) =>
      /^\s*\d+[.)]/.test(l)
        ? 'digit'
        : LOWER.test(l.trim())
          ? 'lower'
          : /^\s*[A-Z][.)]\s/.test(l)
            ? 'upper'
            : null;
    const prev = lastClosed?.children.at(-1)?.x.label;
    const fx = family(x.label);
    const fp = prev ? family(prev) : null;
    const continues =
      lastClosed !== null &&
      lastClosed.col >= 0 &&
      fx !== null &&
      (fx === fp || (fx === 'lower' && fp === 'digit')) &&
      valueIn(x, lastClosed.col) === 0n;
    const parent = continues ? lastClosed! : stack[stack.length - 1];
    const node: Node = { x, children: [], col: -1, target: 0n, acc: 0n };
    (parent ? parent.children : roots).push(node);
    if (parent && !continues) parent.acc += valueIn(x, parent.col);
    lastClosed = continues ? lastClosed : null;

    // Could it head a group?
    const col = colsOf(x).findIndex((v) => v !== null);
    const next = raw[i + 1];
    let heads = false;
    if (!next || TOTAL_LINE.test(next.label) || ROMAN.test(next.label))
      heads = false;
    else if (x.cls === null) {
      // An unclassed row heads the rows under it only if the next one could be
      // part of it: no row is bigger than the heading it adds up to, except
      // past a negative (a discount). Discount on RPT is unclassed and is not
      // a heading of "B. Other Local Taxes".
      const v = col >= 0 ? colsOf(x)[col]! : null;
      const nv = col >= 0 ? valueIn(next, col) : 0n;
      const abs = (b: bigint) => (b < 0n ? -b : b);
      heads = v === null || v < 0n ? v === null : abs(nv) <= abs(v);
    } else if (LOWER.test(next.label) && !LOWER.test(x.label) && col >= 0) {
      let sum = 0n;
      for (let j = i + 1; j < raw.length && LOWER.test(raw[j].label); j++)
        sum += valueIn(raw[j], col);
      heads = sum === colsOf(x)[col];
    }
    if (heads) {
      node.col = col;
      node.target = col >= 0 ? colsOf(x)[col]! : 0n;
      stack.push(node);
    }
    // Close every group that now adds up.
    // The innermost one closed is the one a trailing ₱0 row continues.
    let closedHere: Node | null = null;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.col < 0 || top.children.length === 0 || top.acc !== top.target)
        break;
      const popped = stack.pop()!;
      closedHere ??= popped;
    }
    if (closedHere) lastClosed = closedHere;
  });
  closeAll();

  const lines: ReceiptLinePlan[] = [];
  const walk = (ns: Node[], parentKey: string | null) =>
    ns.forEach((n) => {
      const key = `${prefix}!r${n.x.r + 1}`;
      lines.push({
        key,
        parentKey,
        officeAcronym,
        particulars: n.x.label.replace(/^\s*([IVX]+|\d+|[A-Za-z])[.)]\s*/, ''),
        printedCode: n.x.code,
        incomeClass: n.x.cls,
        pastYearActual: pesosOrNull(n.x.past),
        currentFirstSemActual: pesosOrNull(n.x.s1),
        currentSecondSemEstimate: pesosOrNull(n.x.s2),
        currentYearTotal: pesosOrNull(n.x.total),
        amount: pesosOrNull(n.x.by),
        sourceRef: `${sheet.name.trim()}!r${n.x.r + 1}`,
      });
      walk(n.children, key);
    });
  walk(roots, null);

  // Check: the top-level lines add up to the printed total; every heading to its
  // rows. A label heading (it prints no amount) counts as the sum of its rows.
  const eff = (n: Node): bigint =>
    n.x.by ?? n.children.reduce((t, c) => t + eff(c), 0n);
  const top = roots.reduce((t, n) => t + eff(n), 0n);
  if (printedTotal !== null && top !== printedTotal)
    problems.push(
      `${sheet.name.trim()}: top-level lines add to ₱${pesos(top)}, the sheet prints ₱${pesos(printedTotal)}`,
    );
  const heads = (ns: Node[]): void =>
    ns.forEach((n) => {
      if (n.children.length && n.x.by !== null) {
        const s = n.children.reduce((t, c) => t + eff(c), 0n);
        if (s !== n.x.by)
          problems.push(
            `${sheet.name.trim()}!r${n.x.r + 1} ${n.x.label}: rows add to ₱${pesos(s)}, it prints ₱${pesos(n.x.by)}`,
          );
      }
      heads(n.children);
    });
  heads(roots);
  return { lines, printedTotal, problems };
}

// ─── LBP Forms 5 and 6 ───────────────────────────────────────────────────────

/** An Excel serial date → ISO; anything else as printed. */
function dateText(c: Cell | undefined): string | null {
  if (typeof c === 'number' && c > 20000 && c < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + c * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  return text(c) || null;
}

export function parseForm5(sheet: XlsSheet): {
  lines: IndebtednessPlan[];
  printedTotal: bigint | null;
} {
  const lines: IndebtednessPlan[] = [];
  let printedTotal: bigint | null = null;
  const head = sheet.rows.findIndex((r) => /^Credit/i.test(text(r[0])));
  if (head < 0) return { lines, printedTotal };
  const h = sheet.rows[head].map(text);
  const col = (re: RegExp) => h.findIndex((c) => re.test(c));
  const [date, term, purpose, principal, prev, due, bal] = [
    col(/Date/i),
    col(/Term/i),
    col(/Purpose/i),
    col(/Principal\s*Amount/i),
    col(/Previous\s*Payments/i),
    col(/Amount\s*Due/i),
    col(/Balance/i),
  ];
  for (let r = head + 2; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    const creditor = text(row[0]);
    if (!creditor) continue;
    if (/^TOTAL/i.test(creditor)) {
      printedTotal = centavos(row[principal]);
      break;
    }
    const p = centavos(row[principal]);
    if (p === null) continue;
    lines.push({
      creditor,
      purpose: text(row[purpose]),
      dateContracted: dateText(row[date]),
      term: text(row[term]) || null,
      principal: pesos(p),
      previousPrincipal: pesosOrNull(centavos(row[prev])),
      previousInterest: pesosOrNull(centavos(row[prev + 1])),
      budgetYearPrincipal: pesosOrNull(centavos(row[due])),
      budgetYearInterest: pesosOrNull(centavos(row[due + 1])),
      balance: pesosOrNull(centavos(row[bal])),
      sourceRef: `${sheet.name.trim()}!r${r + 1}`,
    });
  }
  return { lines, printedTotal };
}

export function parseForm6(sheet: XlsSheet): {
  lines: ObligationPlan[];
  totals: { label: string; amount: bigint; r: number }[];
} {
  const lines: ObligationPlan[] = [];
  const totals: { label: string; amount: bigint; r: number }[] = [];
  let section = '';
  // A label that wraps (OCR: "2.1 20% OF NTA FOR Development" over "Fund)")
  // carries onto the line with its amount.
  let carry = '';
  for (const [r, row] of sheet.rows.entries()) {
    const label0 = text(row[0]);
    const label =
      carry && !/^(Sub-?Total|TOTAL)/i.test(label0)
        ? `${carry} ${label0}`
        : label0;
    carry = '';
    const amount =
      row
        .slice(1)
        .map(centavos)
        .find((v) => v !== null) ?? null;
    if (!label) continue;
    if (/^\d+\.\s*[A-Z ,&]+$/.test(label) && amount === null) {
      section = label.replace(/^\d+\.\s*/, '');
      continue;
    }
    if (amount === null) {
      if (section && /^\d+\.\d+/.test(label0)) carry = label0;
      continue;
    }
    if (/^(Sub-?Total|TOTAL)/i.test(label)) {
      totals.push({
        label: /^Sub/i.test(label) ? `Sub-total: ${section}` : 'Total',
        amount,
        r,
      });
      continue;
    }
    lines.push({
      section,
      particulars: label.replace(/^\d+(\.\d+)*\s*/, ''),
      amount: pesos(amount),
      sourceRef: `${sheet.name.trim()}!r${r + 1}`,
    });
  }
  return { lines, totals };
}

// ─── Printed totals ──────────────────────────────────────────────────────────

/** The first row whose label matches, and the amount in `col` on it. */
function rowAmount(sheet: XlsSheet, label: RegExp, col: number) {
  for (const [r, row] of sheet.rows.entries()) {
    if (label.test(text(row[0])) || label.test(text(row[1]))) {
      const amount = centavos(row[col]);
      if (amount !== null) return { amount, r };
    }
  }
  return null;
}

/** Every section of the FY2026 ordinance .xls beside its PPAs and object lines. */
export function parseXlsBookSections(sheets: XlsSheet[]): BookSections {
  const out: BookSections = {
    receipts: [],
    indebtedness: [],
    obligations: [],
    printedTotals: [],
    problems: [],
  };
  const byName = new Map(sheets.map((s) => [s.name.trim(), s]));
  const total = (
    kind: PrintedTotalKind,
    scope: string,
    label: string,
    sheet: string,
    at: { amount: bigint; r: number } | null,
  ) => {
    if (!at) {
      out.problems.push(`${sheet}: printed total "${label}" not found`);
      return;
    }
    out.printedTotals.push({
      kind,
      scope,
      label,
      amount: pesos(at.amount),
      sourceRef: `${sheet}!r${at.r + 1}`,
    });
  };

  for (const [name, office] of Object.entries(RECEIPT_SHEET_OFFICE)) {
    const sheet = byName.get(name);
    if (!sheet) {
      out.problems.push(`receipts: sheet "${name}" missing`);
      continue;
    }
    const r = parseReceiptSheet(sheet, office, name);
    out.receipts.push(...r.lines);
    out.problems.push(...r.problems);
    const cols = receiptColumns(sheet.rows)!;
    total(
      'RECEIPTS',
      office ?? 'GF',
      'Total available resources for appropriation',
      name,
      rowAmount(sheet, /TOTAL AVAILABLE/i, cols.by),
    );
  }
  for (const [name, scope] of Object.entries(RECEIPT_SPLIT_SHEETS)) {
    const sheet = byName.get(name);
    if (!sheet) continue;
    total(
      'RECEIPTS',
      scope,
      'Total available resources for appropriation',
      name,
      rowAmount(sheet, /TOTAL AVAILABLE/i, receiptColumns(sheet.rows)!.by),
    );
  }

  const f5 = byName.get('Lbp form 5 2025');
  if (f5) {
    const { lines, printedTotal } = parseForm5(f5);
    out.indebtedness.push(...lines);
    const sum = lines.reduce((t, l) => t + centavos(l.principal)!, 0n);
    if (printedTotal !== null) {
      total(
        'FORM5',
        'GF',
        'Total principal',
        f5.name,
        rowAmount(f5, /^TOTAL/i, 4),
      );
      total(
        'FORM5',
        'GF',
        'Total amount due, budget year',
        f5.name,
        rowAmount(f5, /^TOTAL/i, 10),
      );
      if (sum !== printedTotal)
        out.problems.push(
          `Form 5: loans add to ₱${pesos(sum)}, it prints ₱${pesos(printedTotal)}`,
        );
    }
  }
  const f6 = byName.get('lbpForm 6 2025');
  if (f6) {
    const { lines, totals } = parseForm6(f6);
    out.obligations.push(...lines);
    for (const t of totals) total('FORM6', 'GF', t.label, f6.name.trim(), t);
    const grand = totals.find((t) => t.label === 'Total');
    const sum = lines.reduce((t, l) => t + centavos(l.amount)!, 0n);
    if (grand && sum !== grand.amount)
      out.problems.push(
        `Form 6: lines add to ₱${pesos(sum)}, it prints ₱${pesos(grand.amount)}`,
      );
  }

  const f7 = byName.get('LBP7 SUMMARY 2026');
  if (f7) {
    const n = f7.name;
    total(
      'FORM7',
      'ALL',
      'Total available for appropriation',
      n,
      rowAmount(f7, /^TOTAL AVAILABLE/i, 7),
    );
    total(
      'FORM7',
      'ALL',
      'Total appropriations',
      n,
      rowAmount(f7, /^TOTAL APPROPRIATIONS/i, 7),
    );
    total('FORM7', 'ALL', 'Grand total', n, rowAmount(f7, /^GRAND TOTAL/i, 7));
    const sectors: [string, number][] = [
      ['GPS', 3],
      ['SOCIAL', 4],
      ['ECONOMIC', 5],
      ['EE', 6],
    ];
    for (const [scope, col] of sectors)
      total(
        'FORM7',
        scope,
        'Grand total',
        n,
        rowAmount(f7, /^GRAND TOTAL/i, col),
      );
  }
  const sum = byName.get('SUMMARY  2026');
  if (sum) {
    const n = sum.name;
    total(
      'SUMMARY',
      'ALL',
      'Personal services',
      n,
      rowAmount(sum, /^TOTAL$/i, 1),
    );
    total(
      'SUMMARY',
      'ALL',
      'Maintenance and other operating expenses',
      n,
      rowAmount(sum, /^TOTAL$/i, 2),
    );
    total('SUMMARY', 'ALL', 'Capital outlay', n, rowAmount(sum, /^TOTAL$/i, 3));
    total('SUMMARY', 'ALL', 'Total', n, rowAmount(sum, /^TOTAL$/i, 4));
  }
  for (const [name, scope] of [
    ['SUMMARY (Gen. Admin) 2026', 'GA'],
    ['SUMMARY (EENT) 2026', 'EE'],
  ] as const) {
    const s = byName.get(name);
    if (s) total('SUMMARY', scope, 'Total', name, rowAmount(s, /^TOTAL$/i, 4));
  }
  const ps = byName.get('PS-CAP 2026');
  if (ps) {
    const n = ps.name;
    total(
      'PS_LIMIT',
      'GF',
      'Total regular income, past year',
      n,
      rowAmount(ps, /^Total Regular Income/i, 8),
    );
    total(
      'PS_LIMIT',
      'GF',
      'Maximum allowable PS (45%)',
      n,
      rowAmount(ps, /^MAXIMUM ALLOWABLE/i, 8),
    );
    total(
      'PS_LIMIT',
      'GF',
      'Estimated PS, budget year',
      n,
      rowAmount(ps, /Estimated\s+PS/i, 8),
    );
    const debt = ps.rows.findIndex((r) =>
      /Allowable Cost for deb/i.test(text(r[2])),
    );
    if (debt >= 0)
      total('PS_LIMIT', 'GF', 'Allowable debt service (20%)', n, {
        amount: centavos(ps.rows[debt][8])!,
        r: debt,
      });
  }
  return out;
}
