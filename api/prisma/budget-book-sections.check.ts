/**
 * Assert-based check of the budget-book section readers (specs/017 T024).
 * Every case is a shape the FY2026 ordinance .xls really has.
 *
 *   pnpm --filter api db:check:book
 */
import assert from 'node:assert/strict';
import {
  parseForm5,
  parseForm6,
  parseReceiptSheet,
  resolveAccount,
} from './budget-book-sections';
import { parseObjectSheets } from './budget-document-objects';

const chart = new Set([
  '4-01-02-040',
  '4-01-02-041',
  '4-01-03-060',
  '4-01-05-030',
  '4-02-01-010',
  '4-02-02-990',
  '5-02-03-210',
  '5-02-99-990',
  '5-01-04-990',
]);

// ── Codes: dashed, compressed, oddly split, suffixed, compound ──
assert.deepEqual(resolveAccount('5-02-03-210-03', chart), {
  accountCode: '5-02-03-210',
  subCode: '03',
});
assert.deepEqual(resolveAccount('5-01-04-990-3', chart), {
  accountCode: '5-01-04-990',
  subCode: '3',
});
assert.deepEqual(resolveAccount('5-02-99-990(10)', chart), {
  accountCode: '5-02-99-990',
  subCode: '10',
});
assert.deepEqual(resolveAccount('40102-040-01', chart), {
  accountCode: '4-01-02-040',
  subCode: '01',
});
assert.deepEqual(resolveAccount('40102-041', chart), {
  accountCode: '4-01-02-041',
  subCode: null,
});
assert.deepEqual(resolveAccount('402-01-010-15', chart), {
  accountCode: '4-02-01-010',
  subCode: '15',
});
assert.deepEqual(resolveAccount('40103-060A', chart), {
  accountCode: '4-01-03-060',
  subCode: 'A',
});
assert.deepEqual(resolveAccount('40202-990-07-04', chart), {
  accountCode: '4-02-02-990',
  subCode: '07-04',
});
assert.deepEqual(resolveAccount('40105-030/40105-040', chart), {
  accountCode: '4-01-05-030',
  subCode: null,
});
assert.deepEqual(resolveAccount('1-07-030-050', chart), {
  accountCode: null,
  subCode: null,
});
assert.deepEqual(resolveAccount(null, chart), {
  accountCode: null,
  subCode: null,
});

// ── Receipts: the tree comes from the sums ──
const H = [
  'Particulars',
  'ACCOUNT CODE',
  'INCOME CLASS.',
  'PAST YEAR (ACTUAL)',
  'CURRENT YEAR 2025',
  '',
  'TOTAL',
  'BUDGET YEAR (PROPOSED)',
];
const H2 = [
  '',
  '',
  '',
  '',
  'First Semester (Actual)',
  'Second Semester (Estimate)',
  '',
  '',
];
const row = (
  label: string,
  code = '',
  cls = '',
  by: number | '' = '',
  past: number | '' = '',
) => [label, code, cls, past, '', '', '', by];
const sheet = {
  name: 'Receipts Program 2026',
  rows: [
    ['RECEIPTS PROGRAM'],
    H,
    H2,
    row('I. Beginning Balance', '', 'NR', 10),
    row('II. Local Sources', '', '', 140),
    row('A. Real Property Tax', '40102-040', '', 100),
    row('1. Current Year', '40102-040-01', 'R', 90),
    row('2. Previous Years', '40102-040-02', 'R', 30),
    // Unclassed, negative: a discount, not the heading of what follows.
    row('3. Discount', '40102-041', '', -20),
    row('B. Other', '', '', 40),
    // Classed, and its lettered rows add up to it: a heading after all.
    row('1. College', '40202-010-01A', 'R', 40, 7),
    row('a. Tuition', '', 'R', 30, 5),
    row('b. Fees', '', 'R', 10, 2),
    row('c. Drop wire', '', 'NR', 0),
    // Unclassed, but nothing under it adds up to it: a leaf (an enterprise subsidy).
    row('SUBSIDY FROM GENERAL ADMINISTRATION', '', '', 5),
    row('SUBSIDY FROM MARKET', '', '', ''),
    row('TOTAL AVAILABLE RESOURCES FOR APPROPRIATION', '', '', 155),
  ],
};
const r = parseReceiptSheet(sheet, null, 'GF');
assert.deepEqual(r.problems, []);
assert.equal(r.printedTotal, 15500n);
const parentOf = (label: string) => {
  const line = r.lines.find((l) => l.particulars === label)!;
  return r.lines.find((l) => l.key === line.parentKey)?.particulars ?? null;
};
assert.equal(parentOf('Beginning Balance'), null);
assert.equal(parentOf('Real Property Tax'), 'Local Sources');
assert.equal(parentOf('Discount'), 'Real Property Tax');
assert.equal(parentOf('Other'), 'Local Sources');
assert.equal(parentOf('College'), 'Other');
assert.equal(parentOf('Tuition'), 'College');
// A trailing ₱0 row on a closed heading's lettered list stays under it.
assert.equal(parentOf('Drop wire'), 'College');
assert.equal(parentOf('SUBSIDY FROM GENERAL ADMINISTRATION'), null);
assert.equal(parentOf('SUBSIDY FROM MARKET'), null);
const college = r.lines.find((l) => l.particulars === 'College')!;
assert.equal(college.incomeClass, 'RECURRING');
assert.equal(college.pastYearActual, '7.00');
assert.equal(college.printedCode, '40202-010-01A');

// A heading whose rows do not add up is reported, never silently accepted.
const off = structuredClone(sheet);
off.rows[6] = row('1. Current Year', '40102-040-01', 'R', 91);
assert.ok(parseReceiptSheet(off, null, 'GF').problems.length > 0);

// ── Form 5: one loan per row; an Excel serial date becomes ISO ──
const f5 = parseForm5({
  name: 'Lbp form 5',
  rows: [
    [
      'Creditior',
      'Date Contracted',
      'Term',
      'Purpose',
      'Principal Amount',
      'Previous Payments Made',
      '',
      '',
      'Amount Due',
      '',
      '',
      'Balance of Principal',
    ],
    [
      '',
      '',
      '',
      '',
      '',
      'Principal',
      'Interest',
      'Total',
      'Principal',
      'Interest',
      'Total',
    ],
    [
      'DBP(LDF)',
      44719,
      '4%, 15 years',
      'Hospital',
      348882167.69,
      57837816.1,
      60903628.56,
      0,
      25308204.48,
      19330175.52,
      0,
      265736147.11,
    ],
    ['TOTAL', '', '', '', 348882167.69],
  ],
});
assert.equal(f5.lines.length, 1);
assert.equal(f5.lines[0].dateContracted, '2022-06-07');
assert.equal(f5.lines[0].principal, '348882167.69');
assert.equal(f5.lines[0].budgetYearInterest, '19330175.52');
assert.equal(f5.printedTotal, 34888216769n);

// ── Form 6: sections, sub-totals and the total are not lines ──
const f6 = parseForm6({
  name: 'lbpForm 6',
  rows: [
    ['1. STATUTORY AND CONTRACTUAL OBLIGATIONS'],
    ['    1.2 Terminal Leave Benefits', '', '', '', '', 25463005],
    ['        Sub-Total', '', '', '', '', 25463005],
    ['2. BUDGETARY REQUIREMENTS'],
    ['    2.1  20%of NTA', '', '', '', '', 245092055],
    ['TOTAL ', '', '', '', '', 270555060],
  ],
});
assert.deepEqual(
  f6.lines.map((l) => [l.section, l.particulars, l.amount]),
  [
    [
      'STATUTORY AND CONTRACTUAL OBLIGATIONS',
      'Terminal Leave Benefits',
      '25463005.00',
    ],
    ['BUDGETARY REQUIREMENTS', '20%of NTA', '245092055.00'],
  ],
);
assert.deepEqual(
  f6.totals.map((t) => t.label),
  ['Sub-total: STATUTORY AND CONTRACTUAL OBLIGATIONS', 'Total'],
);

// ── By-object: SPA's roll-up lines are the LDF / LDRRMF sheets, not lines ──
// `SPA- 2026!r50–r60` as printed, plus LDRRM's lump sum, which must stay.
const hdr = [
  '',
  'Object of Expenditure',
  'Account Code',
  'Past Year',
  'Current Year',
  'Budget Year',
];
const objs = parseObjectSheets([
  {
    name: 'SPA- 2026',
    rows: [
      hdr,
      ['G. Research & Development Fund', '', '5-02-99-990', 400000, '', 1000],
      ['Total', '', '', 0, 0, 1000],
      [
        'H. 20% LOCAL DEVELOPMENT FUND',
        '',
        '',
        238122600.68,
        217024286,
        245092055,
      ],
      [
        'I. 5% LOCAL RISK REDUCTION MANAGEMENT FUND',
        '',
        '',
        81324055.12,
        93962127,
        106117853,
      ],
      ['TOTAL APPROPRIATIONS', '', '', 0, 0, 351210908],
    ],
  },
  {
    name: 'LDRRM-2026',
    rows: [
      hdr,
      ['A. 30% QUICK RESPONSE FUND', '', '', '', '', 31835356],
      ['TOTAL APPROPRIATIONS', '', '', '', '', 31835356],
    ],
  },
]);
assert.deepEqual(
  objs.lines.map((l) => [l.sheet, l.accountTitle, l.amount]),
  [
    ['SPA- 2026', 'G. Research & Development Fund', '1000.00'],
    ['LDRRM-2026', 'A. 30% QUICK RESPONSE FUND', '31835356.00'],
  ],
);
assert.deepEqual(
  objs.reports.map((r) => [r.sum, r.rolledUp, r.matches]),
  [
    ['1000.00', '351209908.00', true],
    ['31835356.00', undefined, true],
  ],
);

console.log('budget-book-sections: all checks pass');
