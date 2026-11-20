/**
 * An appropriation ordinance's by-PPA table, planned from the import's book JSON
 * (`ab-2026-book.json`) as Budget Document PPAs (specs/012 P3, docs/adr/0003).
 *
 * The grouping rules are the 2026 seed's, read from `ab-2026-book.ts` — which
 * rows become one program, its office, its name and code — so the Budget
 * Document and the old Program rows describe the same book. What changes is the
 * money model (docs/adr/0004): a program row's own money stays on the root PPA
 * instead of on an invented "mirror" activity.
 *
 *   book group                         planned PPAs
 *   ──────────────────────────────     ──────────────────────────────────────
 *   -000 row (own money M)             root  own M          ← was Program + mirror PA
 *   -001 row                           ├─ child             (paIndex 1)
 *   -002 row  "1. Heading"             ├─ child             (paIndex 2)
 *   -003 row  "1.1 Activity"           │  └─ child          (paIndex 3, outline)
 *   uncoded money row                  └─ child  unsplit    (total only)
 *
 * `legacy` records where each PPA sat in the old model, so the seed can reuse
 * the old ids: a root matches its Program by office + printed code (or name, for
 * a row that lost its final code), a child matches the Program's PA at
 * `orderIndex = paIndex + 1` — exactly how the old seed numbered them. A
 * special-fund row had no Program (`legacy: new`), so it never takes an id.
 *
 * Special-fund sheets (specs/016) are planned only with an office mapping. Each
 * row carries its fund, and its office is resolved in FR-003's order: the
 * code's office segment if it is a live office, the mapping's row entry, the
 * mapping's default for the fund. A row none of these settles stops the plan.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Prisma,
  type FinishLine,
  type FundSource,
  type PapClass,
} from '../src/generated/prisma/index';
import { officeCodeOf } from './aip-code-segments';
import {
  SHEET_OFFICE,
  specialFundOf,
  specialSheet,
  blankNameWarning,
  buildOfficeIndex,
  correctedProgramNameOf,
  groupSheet,
  hasMoney,
  hostCodeOf,
  ownerOf,
  paNameOf,
  paParentIndices,
  paRowsOf,
  papClassOf,
  programIdentity,
  resolveCodeOwners,
  uncodedBookRow,
  type Book,
  type BookRow,
  type BookSheet,
  type OfficeRow,
  type RowGroup,
} from './ab-2026-book';

export interface PlannedItem {
  /** Stable within one plan: `<sheet>/<group>` for a root, `…#<paIndex>` for a child. */
  key: string;
  parentKey: string | null;
  rootKey: string;
  officeId: string;
  hostOfficeId: string | null;
  finishLineId: string | null;
  papSectorId: string | null;
  papClass: PapClass | null;
  /** SPA, LDF or LDRRMF on a special-fund sheet's rows; null elsewhere. */
  fundSource: FundSource | null;
  aipReferenceCode: string | null;
  name: string;
  majorFinalOutput: string | null;
  performanceIndicator: string | null;
  target: string | null;
  ps: string;
  mooe: string;
  fe: string;
  co: string;
  unsplit: string;
  orderIndex: number;
  importWarnings: string[];
  sourceRef: string | null;
  /** The page of the source file, when it has pages (a scanned PDF). */
  sourcePage: number | null;
  /** The sheet's own file and where it is hosted; null = the book's file. */
  sourceFile: string | null;
  sourceUrl: string | null;
  legacy:
    | { kind: 'program'; officeId: string; code: string | null; name: string }
    | { kind: 'pa'; paIndex: number }
    | { kind: 'new' };
}

/**
 * `data/special-fund-offices-<fy>.json`: who runs each special-fund row, since
 * the ordinance does not say (specs/016 FR-003/004). Keyed by the row's printed
 * code, or its text when it prints none. `name` names a row the ordinance
 * prints only a code for; `basis` is for the reviewer.
 */
export interface SpecialFundOffices {
  defaults: Partial<Record<FundSource, string>>;
  rows: Record<string, { office: string; name?: string; basis?: string }>;
}

export function loadSpecialFundOffices(
  year: number,
): SpecialFundOffices | null {
  const path = resolve(__dirname, `data/special-fund-offices-${year}.json`);
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as SpecialFundOffices)
    : null;
}

/** The fake offices specs/016 retired: never an owner, even by code. */
const RETIRED_OFFICES = new Set(['LDF', 'SPAF', 'LDRRMF']);

/** One sheet's header block, for `BudgetOfficeHeader` (never written to the office itself). */
export interface OfficeProfile {
  officeId: string;
  mandateLegalBasis?: string;
  vision?: string;
  mission?: string;
  organizationalOutcomes?: string[];
  /** The sheet's own file (a scan; the header is on its page 1), else the book's. */
  sourceFile?: string | null;
  sourceUrl?: string | null;
  sheetName: string;
}

export interface BookPlan {
  items: PlannedItem[];
  profiles: OfficeProfile[];
  problems: string[];
}

const money = (v: string | null) => (v && v.trim() !== '' ? v : '0');

/**
 * A row's own money: its class split, plus whatever of its printed total the
 * split does not explain (all of it when the row prints only a total; the
 * remainder when a scan lost a class figure, which the row's warning names).
 */
function ownMoney(row: BookRow) {
  // PS, MOOE, FE, CO — every class, or an FE figure would be read as unsplit.
  const classes = [row.ps, row.mooe, row.fe ?? null, row.co].reduce(
    (s, v) => s.plus(money(v)),
    new Prisma.Decimal(0),
  );
  // A scan read whose classes add up to more than its Total (one class
  // misread; the row is flagged): keep the Total — the figure the sheet's
  // printed total checks — and leave the split out rather than store a guess.
  if (row.total !== null && classes.gt(money(row.total)))
    return { ...NO_MONEY, unsplit: money(row.total) };
  return {
    ps: money(row.ps),
    mooe: money(row.mooe),
    fe: money(row.fe ?? null),
    co: money(row.co),
    unsplit: Prisma.Decimal.max(
      new Prisma.Decimal(money(row.total)).minus(classes),
      0,
    ).toFixed(2),
  };
}

const NO_MONEY = { ps: '0', mooe: '0', fe: '0', co: '0', unsplit: '0' };

/**
 * Plan every PPA in the book. `finishLineFor` infers a finish line from the
 * office's cluster — the book states one nowhere (reported once, not per row).
 */
export function planBookItems(
  book: Book,
  offices: OfficeRow[],
  finishLineFor: (clusterId: string) => FinishLine['id'] | null,
  special: SpecialFundOffices | null = null,
): BookPlan {
  const officeByCode = buildOfficeIndex(offices);
  const officeByAcronym = new Map(
    offices.map((o) => [o.acronym.trim().toLowerCase(), o]),
  );
  const codeOwners = resolveCodeOwners(book.sheets);
  const items: PlannedItem[] = [];
  const profiles: OfficeProfile[] = [];
  const problems: string[] = [];
  const orderByOffice = new Map<string, number>();
  const nextOrder = (officeId: string) => {
    const n = (orderByOffice.get(officeId) ?? 0) + 1;
    orderByOffice.set(officeId, n);
    return n;
  };

  const unresolved: string[] = [];
  const mapped = new Set<string>();
  /** FR-003: the code's live office, the mapping's row, the fund's default. */
  const specialOwner = (fund: FundSource, key: string, code: string) => {
    const byCode = code
      ? officeByCode.resolve(officeCodeOf(code.split(';')[0]))
      : undefined;
    if (byCode && !RETIRED_OFFICES.has(byCode.acronym)) return byCode;
    const entry = special!.rows[key];
    if (entry) mapped.add(key);
    const acronym = entry?.office ?? special!.defaults[fund];
    const office = acronym
      ? officeByAcronym.get(acronym.toLowerCase())
      : undefined;
    if (!office || RETIRED_OFFICES.has(office.acronym))
      unresolved.push(
        `${fund} ${key}${acronym ? ` → ${acronym}, which is not a live office` : ': no office in the mapping'}`,
      );
    return office;
  };

  for (const [sheetIndex, raw] of book.sheets.entries()) {
    const fund = specialFundOf(raw);
    if (fund && !special) continue;
    const sheet = fund ? specialSheet(raw, special!.rows) : raw;
    const acronym = SHEET_OFFICE[sheet.officeName.trim()];
    const host = fund
      ? null
      : acronym
        ? officeByAcronym.get(acronym.toLowerCase())
        : officeByCode.resolve(hostCodeOf(sheet) ?? '');
    if (!fund && !host) {
      problems.push(
        `${sheet.officeName || '(unnamed)'}: no office — sheet skipped`,
      );
      continue;
    }
    if (host) profiles.push(profileOf(sheet, host.id));

    const { groups, orphanRows } = groupSheet(sheet);
    for (const [key, group] of groups) {
      const { anchor, name, desiredCode } = programIdentity(key, group);
      if (!anchor || paRowsOf(group).length === 0) continue;
      const owner = fund
        ? specialOwner(fund, anchor.code, anchor.code)
        : ownerOf(anchor, host!, officeByCode);
      if (!owner) continue;
      if (!owner.papSectorId) {
        problems.push(
          `${sheet.officeName}: office ${owner.acronym} has no PAP sector — ${key} skipped`,
        );
        continue;
      }
      const claimsCode =
        !fund && group.programRow
          ? codeOwners.get(anchor.code) === sheetIndex
          : true;
      const warnings: string[] = [];
      if (!claimsCode) {
        warnings.push(
          `The Annual Budget prints AIP code ${anchor.code} on another office's sheet as well.`,
        );
      }
      const namedByCity = Boolean(correctedProgramNameOf(desiredCode));
      if (!group.programRow && group.rows.length > 0 && !namedByCity) {
        warnings.push(
          anchor.groupHeading
            ? `The Annual Budget prints no coded program row for these activities; the heading "${anchor.groupHeading}" above them was used as the program name.`
            : 'The Annual Budget lists these activities with no program heading above them; the heading was synthesised.',
        );
      }
      for (const w of [
        ...(group.programRow ? [group.programRow] : []),
        ...paRowsOf(group),
      ].map(blankNameWarning))
        // A program row can also be one of its group's PA rows: say it once.
        if (w && !warnings.includes(w)) warnings.push(w);

      pushGroup(items, {
        key: `${sheetIndex}/${key}`,
        source: sheet,
        group,
        anchor,
        owner,
        host: host ?? owner,
        fund,
        name,
        code: desiredCode,
        legacyCode: claimsCode ? desiredCode : null,
        finishLineId: finishLineFor(owner.clusterId),
        orderIndex: nextOrder(owner.id),
        warnings,
      });
    }

    for (const [i, row] of orphanRows.entries()) {
      const rowOwner = fund
        ? specialOwner(fund, row.name.trim(), '')
        : ((row.componentOffice
            ? officeByCode.resolve(
                row.componentOffice.code,
                row.componentOffice.name,
              )
            : undefined) ?? host!);
      if (!rowOwner?.papSectorId) continue;
      const uncoded = uncodedBookRow(row, !fund && rowOwner.id !== host!.id);
      pushGroup(items, {
        key: `${sheetIndex}/uncoded-${i}`,
        source: sheet,
        group: { programRow: null, rows: [uncoded] },
        anchor: uncoded,
        owner: rowOwner,
        host: host ?? rowOwner,
        fund,
        name: row.name.trim() || '(untitled)',
        code: null,
        legacyCode: null,
        finishLineId: finishLineFor(rowOwner.clusterId),
        orderIndex: nextOrder(rowOwner.id),
        warnings: [
          'The Annual Budget prints this row with an amount but no AIP reference code.',
        ],
      });
    }
  }
  if (unresolved.length)
    throw new Error(
      `special-fund-offices-${book.fiscalYear}.json settles no office for ${unresolved.length} row(s):\n  ${unresolved.join('\n  ')}`,
    );
  if (special)
    for (const key of Object.keys(special.rows))
      if (!mapped.has(key))
        problems.push(
          `special-fund-offices-${book.fiscalYear}.json: "${key}" matches no row`,
        );
  return { items, profiles, problems };
}

function pushGroup(
  items: PlannedItem[],
  g: {
    key: string;
    source: Pick<BookSheet, 'sourceFile' | 'sourceUrl'>;
    group: RowGroup;
    anchor: BookRow;
    owner: OfficeRow;
    host: OfficeRow;
    fund: FundSource | null;
    name: string;
    code: string | null;
    legacyCode: string | null;
    finishLineId: string | null;
    orderIndex: number;
    warnings: string[];
  },
) {
  const paRows = paRowsOf(g.group);
  const parentAt = paParentIndices(paRows);
  // The program row's own money was a mirror PA at index 0; it is the root's now.
  const mirror = g.group.programRow && hasMoney(g.group.programRow) ? 0 : -1;
  const shared = {
    officeId: g.owner.id,
    hostOfficeId: g.anchor.isComponent ? g.host.id : null,
    finishLineId: g.finishLineId,
    papSectorId: g.owner.papSectorId,
    papClass: papClassOf(g.anchor.papClassSegment),
    fundSource: g.fund,
  };
  items.push({
    key: g.key,
    parentKey: null,
    rootKey: g.key,
    ...shared,
    aipReferenceCode: g.code,
    name: g.name,
    majorFinalOutput: g.anchor.majorFinalOutput || null,
    performanceIndicator: g.anchor.performanceIndicator || null,
    target: g.anchor.targetForBudgetYear || null,
    ...(mirror === 0 ? ownMoney(paRows[0]) : NO_MONEY),
    orderIndex: g.orderIndex,
    // An OCR doubt about the program row itself (its sum, its code) blocks too.
    importWarnings: [...g.warnings, ...(g.group.programRow?.warnings ?? [])],
    sourceRef: g.group.programRow?.sourceRow ?? null,
    sourcePage: g.group.programRow?.sourcePage ?? null,
    sourceFile: g.source.sourceFile ?? null,
    sourceUrl: g.source.sourceUrl ?? null,
    legacy: g.fund
      ? { kind: 'new' }
      : {
          kind: 'program',
          officeId: g.owner.id,
          code: g.legacyCode,
          name: g.name,
        },
  });
  const keyAt = (i: number) => (i === mirror ? g.key : `${g.key}#${i}`);
  for (const [i, row] of paRows.entries()) {
    if (i === mirror) continue;
    const parentIndex = parentAt[i];
    items.push({
      key: keyAt(i),
      parentKey: parentIndex === null ? g.key : keyAt(parentIndex),
      rootKey: g.key,
      ...shared,
      aipReferenceCode: row.code || null,
      name: paNameOf(row),
      majorFinalOutput: row.majorFinalOutput || null,
      performanceIndicator: row.performanceIndicator || null,
      target: row.targetForBudgetYear || null,
      ...ownMoney(row),
      orderIndex: i + 1,
      importWarnings: row.warnings ?? [],
      sourceRef: row.sourceRow,
      sourcePage: row.sourcePage ?? null,
      sourceFile: g.source.sourceFile ?? null,
      sourceUrl: g.source.sourceUrl ?? null,
      legacy: g.fund ? { kind: 'new' } : { kind: 'pa', paIndex: i },
    });
  }
}

function profileOf(sheet: BookSheet, officeId: string): OfficeProfile {
  const p: OfficeProfile = {
    officeId,
    sourceFile: sheet.sourceFile ?? null,
    sourceUrl: sheet.sourceUrl ?? null,
    sheetName: sheet.officeName,
  };
  if (sheet.mandateLegalBasis) p.mandateLegalBasis = sheet.mandateLegalBasis;
  if (sheet.vision) p.vision = sheet.vision;
  if (sheet.mission) p.mission = sheet.mission;
  if (sheet.organizationalOutcomes.length > 0)
    p.organizationalOutcomes = sheet.organizationalOutcomes;
  return p;
}
