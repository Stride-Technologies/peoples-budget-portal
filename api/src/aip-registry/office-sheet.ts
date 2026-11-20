import { PapClass, type FundSource } from '../generated/prisma/index';
import { isSpecialFund } from '../common/special-funds.js';
import {
  addMoney,
  leafIds,
  moneyRows,
  zeroMoney,
  type Costed,
  type Money,
  type SheetActivity,
  type SheetProgram,
} from './lbp-figures.js';

/**
 * One office's "Mandate, Vision/Mission, Major Final Output, Performance
 * Indicators and Targets" sheet as rows — the layout the Word Annual Budget
 * export prints and LBP Form 4 copies (specs/008 FR-010). Both writers read
 * this, so the two cannot drift; each passes its own `moneyOf` (every fund for
 * the Word book, one fund for Form 4).
 *
 * Money sits on leaves only: a PPA with children prints its name and no amount,
 * because its children carry it. Printing the parent's rolled-up figure as well
 * counted a nested program's money twice in its office total.
 */

/** The three appropriation sections, headed the way the sheet heads them. */
export const SHEET_SECTIONS: { papClass: PapClass; label: string }[] = [
  { papClass: PapClass.GAS, label: 'General Administration and Support (GAS)' },
  { papClass: PapClass.STO, label: 'Support to Operations (STO)' },
  { papClass: PapClass.OPERATIONS, label: 'Operations' },
];

export const COMPONENT_BAND = 'COMPONENT PROGRAMS';

export interface SheetRow {
  code: string;
  description: string;
  majorFinalOutput: string;
  performanceIndicator: string;
  target: string;
  money: Money;
  /** Programs print bold, their activities do not — as the sheet does. */
  bold: boolean;
  /** Continues the Major Final Output of the row above (one merged cell). */
  mergedMfo: boolean;
}

export interface SheetSection {
  /** The section's own row code when the data has one (AB 2026 does), else ''. */
  code: string;
  label: string;
  rows: SheetRow[];
  /** The section's rows plus its heading's own money, if any. */
  total: Money;
}

export interface ComponentGroup {
  /** The proposing office's name; null when it is the sheet's own office. */
  officeName: string | null;
  rows: SheetRow[];
}

export interface OfficeSheet {
  sections: SheetSection[];
  /** The office's own programs. */
  total: Money;
  components: ComponentGroup[];
  componentTotal: Money;
  /** total + componentTotal. */
  grandTotal: Money;
}

/**
 * The special fund a program prints under in the Annual Budget book, or null
 * (specs/016 US2.3). The city prints SPA, LDF and LDRRMF rows on those funds'
 * own sheets, not their office's, though each row is owned by an office.
 *
 * The program's own fund decides; a program with none (its PPAs carry the
 * money) belongs to a special fund only when every PPA is charged to it.
 */
export function specialFundOf(program: {
  fundSources: FundSource[];
  activities: { fundSources: FundSource[] }[];
}): FundSource | null {
  const own = program.fundSources.find(isSpecialFund);
  if (own) return own;
  const [first, ...rest] = program.activities;
  return (
    first?.fundSources.find(
      (f) => isSpecialFund(f) && rest.every((a) => a.fundSources.includes(f)),
    ) ?? null
  );
}

/** A PAP-class heading program: `…-000-000` in the last two code segments. */
export function isSectionHeading(program: { code: string }): boolean {
  const parts = program.code.split('-');
  return parts.length === 7 && parts[5] === '000' && parts[6] === '000';
}

/** A program's whole figure under `moneyOf` — its money rows summed. */
export function programMoney(
  program: SheetProgram,
  moneyOf: (row: Costed) => Money,
): Money {
  return moneyRows(program).map(moneyOf).reduce(addMoney, zeroMoney());
}

/** Depth-first, by `orderIndex` within each parent — the printed order. */
function inTreeOrder(activities: SheetActivity[]): SheetActivity[] {
  const byParent = new Map<string | null, SheetActivity[]>();
  for (const a of activities)
    byParent.set(a.parentId, [...(byParent.get(a.parentId) ?? []), a]);
  const out: SheetActivity[] = [];
  const walk = (parent: string | null) => {
    for (const a of (byParent.get(parent) ?? []).sort(
      (l, r) => l.orderIndex - r.orderIndex,
    )) {
      out.push(a);
      walk(a.id);
    }
  };
  walk(null);
  return out;
}

/**
 * A program and its activities, flattened in printed order.
 *
 * Every row of the source is a row of the sheet — the book prints "A.1
 * Administrative and Support Services" and "A.1.1. Salaries, Wages and
 * Personnel Benefits" as two rows. The one exception is the seed's mirror PA:
 * a first activity repeating the program's name was the program line itself in
 * the book, so it prints as that one row, carrying the mirror's money.
 */
function rowsFor(
  programs: SheetProgram[],
  moneyOf: (row: Costed) => Money,
): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const program of programs) {
    const ordered = inTreeOrder(program.activities);
    const leaves = leafIds(program);
    const first = ordered[0];
    const mirror =
      first && first.name === program.name && first.parentId === null
        ? first
        : null;
    const rest = mirror ? ordered.slice(1) : ordered;

    const money = mirror
      ? leaves.has(mirror.id)
        ? moneyOf(mirror)
        : zeroMoney()
      : ordered.length === 0 || program.statesOwnCosts
        ? moneyOf(program)
        : zeroMoney();

    rows.push({
      code: program.code,
      description: program.name,
      majorFinalOutput:
        program.majorFinalOutput || mirror?.majorFinalOutput || '',
      performanceIndicator:
        program.expectedOutput || mirror?.expectedOutput || '',
      target: program.target || mirror?.target || '',
      money,
      bold: true,
      mergedMfo: false,
    });
    for (const activity of rest)
      rows.push({
        code: activity.code,
        description: activity.name,
        majorFinalOutput: activity.majorFinalOutput,
        performanceIndicator: activity.expectedOutput,
        target: activity.target,
        money: leaves.has(activity.id) ? moneyOf(activity) : zeroMoney(),
        bold: false,
        mergedMfo: false,
      });
  }
  // A run of rows sharing an MFO prints it once, merged down the run.
  let previous = '';
  for (const row of rows) {
    row.mergedMfo = !!row.majorFinalOutput && row.majorFinalOutput === previous;
    previous = row.majorFinalOutput;
  }
  return rows;
}

const sumRows = (rows: SheetRow[]) =>
  rows.map((r) => r.money).reduce(addMoney, zeroMoney());

/**
 * `programs` are the office's sheet programs — its own, plus component
 * programs other offices propose under it (`hostOfficeId`), in print order.
 */
export function buildOfficeSheet(
  officeId: string,
  programs: SheetProgram[],
  moneyOf: (row: Costed) => Money,
): OfficeSheet {
  const own = programs.filter((p) => !p.hostOfficeId);
  const component = programs.filter((p) => p.hostOfficeId);

  let total = zeroMoney();
  const sections = SHEET_SECTIONS.map((section) => {
    const inSection = own.filter(
      (p) => (p.papClass ?? PapClass.OPERATIONS) === section.papClass,
    );
    // The book prints the section as a real row carrying its own reference
    // code. Where the data has that row it heads the section; a heading that
    // carries money still counts toward the total.
    const heading = inSection.find(isSectionHeading);
    const rows = rowsFor(
      inSection.filter((p) => p !== heading),
      moneyOf,
    );
    const sectionTotal = heading
      ? addMoney(sumRows(rows), programMoney(heading, moneyOf))
      : sumRows(rows);
    total = addMoney(total, sectionTotal);
    return {
      code: heading?.code ?? '',
      label: heading?.name ?? section.label,
      rows,
      total: sectionTotal,
    };
  });

  const groups = new Map<string, SheetProgram[]>();
  for (const program of component) {
    const key = program.officeId ?? 'none';
    groups.set(key, [...(groups.get(key) ?? []), program]);
  }
  const components = [...groups.values()].map((group) => ({
    // A program hosted by its own office is the city's `004` bucket; it needs
    // no sub-heading, because the sheet is already its office's.
    officeName:
      group[0].officeName && group[0].officeId !== officeId
        ? group[0].officeName
        : null,
    rows: rowsFor(group, moneyOf),
  }));
  const componentTotal = components
    .map((g) => sumRows(g.rows))
    .reduce(addMoney, zeroMoney());

  return {
    sections,
    total,
    components,
    componentTotal,
    grandTotal: addMoney(total, componentTotal),
  };
}
