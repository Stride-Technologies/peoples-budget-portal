import { Prisma } from '../generated/prisma/index';
import { snapshotExpenseClassAmount } from '../public/public.service.js';
import { GOAL } from '../common/brand.js';

/**
 * Published snapshot → open-data rows. **Named fields only.**
 *
 * A `ProgramVersion.snapshot` is the raw Prisma row with its tree, so it carries
 * staff ids (`createdByUserId`, `publishedByUserId`), import provenance, remarks
 * and line items. Nothing here spreads it: every output key is listed in a
 * column definition below, and `open-data.mapper.spec.ts` fails if a row has a
 * key that is not, or if a salted personal value gets through. A new field is
 * exposed by adding a column here — the data dictionary in METADATA.md is
 * generated from the same lists, so the two cannot drift.
 */

export interface Column {
  /** JSON / API key (camelCase). */
  name: string;
  /** CSV header (snake_case). */
  csvName: string;
  description: string;
}

const col = (name: string, csvName: string, description: string): Column => ({
  name,
  csvName,
  description,
});

const MONEY = 'Pesos, as text with two decimals.';
const IMPLEMENTATION =
  'YYYY-MM (or YYYY when no month is given); empty when not stated.';

export const PROGRAM_COLUMNS: readonly Column[] = [
  col(
    'id',
    'id',
    'Stable identifier. Use this to join, not the AIP code, which can change when an office reorders its programs.',
  ),
  col('fiscalYear', 'fiscal_year', 'The budget year.'),
  col(
    'aipCode',
    'aip_code',
    'AIP reference code: the final code when issued, otherwise the tentative one.',
  ),
  col(
    'codeIsFinal',
    'code_is_final',
    'true when aip_code is the final issued code.',
  ),
  col('name', 'name', 'Program name as published.'),
  col('description', 'description', 'Program description.'),
  col('officeCode', 'office_code', 'Implementing office acronym.'),
  col('officeName', 'office_name', 'Implementing office name.'),
  col('cluster', 'cluster', 'The office’s cluster.'),
  col('papSectorCode', 'pap_sector_code', 'DBM PAP sector code (4 digits).'),
  col('papSectorName', 'pap_sector_name', 'DBM PAP sector name.'),
  col(
    'papClass',
    'pap_class',
    'AIP section: GAS (General Administration and Support), STO (Support to Operations) or OPERATIONS; empty when unclassified.',
  ),
  col(
    'finishLineNumber',
    'finish_line_number',
    `The number of the ${GOAL.toLowerCase()} the program is filed under, 1–8.`,
  ),
  col(
    'finishLineName',
    'finish_line_name',
    `The ${GOAL.toLowerCase()}’s name.`,
  ),
  col(
    'majorFinalOutput',
    'major_final_output',
    'Major Final Output column of the printed AIP.',
  ),
  col('expectedOutput', 'expected_output', 'Performance indicator.'),
  col(
    'targetForBudgetYear',
    'target_for_budget_year',
    'Target for the budget year (free text).',
  ),
  col(
    'implementationStart',
    'implementation_start',
    `Implementation start, ${IMPLEMENTATION}`,
  ),
  col(
    'implementationEnd',
    'implementation_end',
    `Implementation end, ${IMPLEMENTATION}`,
  ),
  col(
    'costMode',
    'cost_mode',
    'DIRECT_COSTS: the program states its own cost and has no activities. ACTIVITY_CHILDREN: its cost is the sum of its top-level activities.',
  ),
  col(
    'proposedTotal',
    'proposed_total',
    `The program’s proposed budget. ${MONEY} This is the program figure; do not re-add its activities.`,
  ),
  col('ps', 'ps', `Personal Services. ${MONEY}`),
  col('mooe', 'mooe', `Maintenance and Other Operating Expenses. ${MONEY}`),
  col(
    'fe',
    'fe',
    `Financial Expenses (bank charges, interest and other financial charges). ${MONEY}`,
  ),
  col('co', 'co', `Capital Outlay. ${MONEY}`),
  col(
    'isSplitByFund',
    'is_split_by_fund',
    'true when funds.csv has per-fund amounts for this program.',
  ),
  col('version', 'version', 'Published version number.'),
  col(
    'publishedAt',
    'published_at',
    'When this version was published (ISO 8601, UTC).',
  ),
];

export const ACTIVITY_COLUMNS: readonly Column[] = [
  col('id', 'id', 'Stable identifier of the project or activity.'),
  col(
    'programId',
    'program_id',
    'The program it belongs to (programs.csv id).',
  ),
  col(
    'parentActivityId',
    'parent_activity_id',
    'The project it sits under (this file’s id); empty for a top-level row.',
  ),
  col(
    'programCode',
    'program_code',
    'The program’s AIP code, for readability.',
  ),
  col(
    'parentActivityCode',
    'parent_activity_code',
    'The parent’s AIP code; empty for a top-level row.',
  ),
  col(
    'aipCode',
    'aip_code',
    'AIP reference code: final when issued, otherwise tentative.',
  ),
  col(
    'codeIsFinal',
    'code_is_final',
    'true when aip_code is the final issued code.',
  ),
  col('type', 'type', 'PROJECT or ACTIVITY.'),
  col('name', 'name', 'Name as published.'),
  col('description', 'description', 'Description.'),
  col(
    'majorFinalOutput',
    'major_final_output',
    'Major Final Output column of the printed AIP.',
  ),
  col('expectedOutput', 'expected_output', 'Performance indicator.'),
  col(
    'targetForBudgetYear',
    'target_for_budget_year',
    'Target for the budget year (free text).',
  ),
  col(
    'implementationStart',
    'implementation_start',
    `Implementation start, ${IMPLEMENTATION}`,
  ),
  col(
    'implementationEnd',
    'implementation_end',
    `Implementation end, ${IMPLEMENTATION}`,
  ),
  col(
    'costMode',
    'cost_mode',
    'DIRECT_COSTS: states its own cost. ACTIVITY_CHILDREN: its cost is the sum of the rows under it.',
  ),
  col('proposedBudget', 'proposed_budget', `Proposed budget. ${MONEY}`),
  col('ps', 'ps', `Personal Services. ${MONEY}`),
  col('mooe', 'mooe', `Maintenance and Other Operating Expenses. ${MONEY}`),
  col(
    'fe',
    'fe',
    `Financial Expenses (bank charges, interest and other financial charges). ${MONEY}`,
  ),
  col('co', 'co', `Capital Outlay. ${MONEY}`),
  col(
    'isSplitByFund',
    'is_split_by_fund',
    'true when funds.csv has per-fund amounts for this row.',
  ),
];

export const FUND_COLUMNS: readonly Column[] = [
  col('rowType', 'row_type', 'program or activity.'),
  col('rowId', 'row_id', 'The program’s or activity’s id.'),
  col('rowCode', 'row_code', 'The program’s or activity’s AIP code.'),
  col('fundSource', 'fund_source', 'Fund code (GF, SEF, SHF, …).'),
  col(
    'fundSourceName',
    'fund_source_name',
    'Fund name. SHF is the Special Health Fund.',
  ),
  col(
    'declaredAs',
    'declared_as',
    'split: the row states an amount for this fund. total: the fund is listed but the row’s money is not divided between its funds.',
  ),
  col(
    'ps',
    'ps',
    `Personal Services from this fund when split; empty otherwise. ${MONEY}`,
  ),
  col(
    'mooe',
    'mooe',
    `MOOE from this fund when split; empty otherwise. ${MONEY}`,
  ),
  col(
    'fe',
    'fe',
    `Financial Expenses from this fund when split; empty otherwise. ${MONEY}`,
  ),
  col(
    'co',
    'co',
    `Capital Outlay from this fund when split; empty otherwise. ${MONEY}`,
  ),
  col(
    'total',
    'total',
    `ps + mooe + fe + co when split; empty otherwise. ${MONEY}`,
  ),
];

export const CLIMATE_COLUMNS: readonly Column[] = [
  col('rowType', 'row_type', 'program or activity.'),
  col('rowId', 'row_id', 'The tagged program’s or activity’s id.'),
  col('rowCode', 'row_code', 'Its AIP code.'),
  col(
    'ccetCode',
    'ccet_code',
    'Climate Change Expenditure Tagging code (local typology); empty when the tag has no code yet.',
  ),
  col('ccetPillar', 'ccet_pillar', 'ADAPTATION, MITIGATION or CROSSCUTTING.'),
  col('ccetName', 'ccet_name', 'The CCET code’s name.'),
  col(
    'ccaAmount',
    'cca_amount',
    `Climate change adaptation amount of the whole tag. ${MONEY} Repeated on every code row of the same tag: count it once per row_id.`,
  ),
  col(
    'ccmAmount',
    'ccm_amount',
    `Climate change mitigation amount of the whole tag. ${MONEY} Repeated on every code row of the same tag: count it once per row_id.`,
  ),
];

export const PROJECT_COLUMNS: readonly Column[] = [
  col('id', 'id', 'Stable identifier of the project (procurement plan).'),
  col('name', 'name', 'Project name.'),
  col(
    'classification',
    'classification',
    'GENERAL_ADMINISTRATIVE_SERVICES, SUPPORT_TO_OPERATIONS, OPERATIONS or DIGITALIZATION.',
  ),
  col('officeCode', 'office_code', 'Office acronym.'),
  col('officeName', 'office_name', 'Office name.'),
  col(
    'fundingProgram',
    'funding_program',
    'The AIP program the office says funds it, as the office wrote it (free text, not a link).',
  ),
  col('total', 'total', `Sum of its procurement line items. ${MONEY}`),
  col('publishedAt', 'published_at', 'When it was published (ISO 8601, UTC).'),
];

export const FUND_SOURCE_NAMES: Record<string, string> = {
  GF: 'General Fund',
  SEF: 'Special Education Fund',
  LDF: 'Local Development Fund',
  LDRRMF: 'Local Disaster Risk Reduction and Management Fund',
  SPA: 'Special Purpose Appropriation',
  PPP: 'Public-Private Partnership',
  NGA: 'National Government Agency',
  DONATIONS_GRANTS: 'Donations and grants',
  GAD: 'Gender and Development',
  TRUST_FUND: 'Trust Fund',
  SHF: 'Special Health Fund',
  EDF: 'Economic Development Fund',
  CCN: 'Local college fund',
  JOINT_VENTURE: 'Joint venture',
  BORROWINGS: 'Borrowings',
};

// ─── Row types ────────────────────────────────────────────────────────────

type Money = string;

export interface ProgramRow {
  id: string;
  fiscalYear: number;
  aipCode: string | null;
  codeIsFinal: boolean;
  name: string;
  description: string | null;
  officeCode: string | null;
  officeName: string | null;
  cluster: string | null;
  papSectorCode: string | null;
  papSectorName: string | null;
  papClass: string | null;
  finishLineNumber: number | null;
  finishLineName: string | null;
  majorFinalOutput: string | null;
  expectedOutput: string | null;
  targetForBudgetYear: string | null;
  implementationStart: string | null;
  implementationEnd: string | null;
  costMode: string | null;
  proposedTotal: Money;
  ps: Money;
  mooe: Money;
  fe: Money;
  co: Money;
  isSplitByFund: boolean;
  version: number | null;
  publishedAt: string | null;
}

export interface ActivityRow {
  id: string;
  programId: string;
  parentActivityId: string | null;
  programCode: string | null;
  parentActivityCode: string | null;
  aipCode: string | null;
  codeIsFinal: boolean;
  type: string | null;
  name: string;
  description: string | null;
  majorFinalOutput: string | null;
  expectedOutput: string | null;
  targetForBudgetYear: string | null;
  implementationStart: string | null;
  implementationEnd: string | null;
  costMode: string | null;
  proposedBudget: Money;
  ps: Money;
  mooe: Money;
  fe: Money;
  co: Money;
  isSplitByFund: boolean;
}

export interface FundRow {
  rowType: 'program' | 'activity';
  rowId: string;
  rowCode: string | null;
  fundSource: string;
  fundSourceName: string;
  declaredAs: 'split' | 'total';
  ps: Money | null;
  mooe: Money | null;
  fe: Money | null;
  co: Money | null;
  total: Money | null;
}

export interface ClimateRow {
  rowType: 'program' | 'activity';
  rowId: string;
  rowCode: string | null;
  ccetCode: string | null;
  ccetPillar: string | null;
  ccetName: string | null;
  ccaAmount: Money;
  ccmAmount: Money;
}

export interface ClimateTag {
  ccaAmount: Money;
  ccmAmount: Money;
  codes: Array<{ code: string; pillar: string; name: string }>;
}

export interface NestedActivity extends ActivityRow {
  funds: FundRow[];
  climateTag: ClimateTag | null;
  activities: NestedActivity[];
}

export interface NestedProgram extends ProgramRow {
  funds: FundRow[];
  climateTag: ClimateTag | null;
  activities: NestedActivity[];
}

export interface MappedProgram {
  program: ProgramRow;
  activities: ActivityRow[];
  funds: FundRow[];
  climateRows: ClimateRow[];
  nested: NestedProgram;
}

export type ProjectRow = Record<
  (typeof PROJECT_COLUMNS)[number]['name'],
  string | null
>;

/**
 * The live program fields the public detail falls back to when a snapshot
 * lacks one (`PublicService.getProgram`), plus the relations the site shows
 * live (office, finish line, sector) and the published version number.
 */
export interface LiveProgram {
  publishedName?: string | null;
  name?: string | null;
  publishedProposedTotal?: unknown;
  psProposedTotal?: unknown;
  mooeProposedTotal?: unknown;
  coProposedTotal?: unknown;
  psTotal?: unknown;
  mooeTotal?: unknown;
  coTotal?: unknown;
  publishedAt?: Date | string | null;
  version?: number | null;
  office?: unknown;
  finishLine?: unknown;
  papSector?: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
const arr = (v: unknown): Obj[] =>
  Array.isArray(v) ? v.filter((x): x is Obj => obj(x) !== null) : [];
const str = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null;
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** Decimal-safe money: a snapshot holds decimals as strings. Never `Number`. */
function money(v: unknown): Money {
  if (
    typeof v === 'string' ||
    typeof v === 'number' ||
    Prisma.Decimal.isDecimal(v)
  ) {
    try {
      return new Prisma.Decimal(v).toFixed(2);
    } catch {
      // fall through
    }
  }
  return '0.00';
}

function iso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && v) return new Date(v).toISOString();
  return null;
}

function yearMonth(year: unknown, month: unknown): string | null {
  const y = num(year);
  if (y === null) return null;
  const m = num(month);
  return m === null ? String(y) : `${y}-${String(m).padStart(2, '0')}`;
}

const code = (row: Obj) =>
  str(row.aipReferenceCode) ?? str(row.tentativeAipReferenceCode);

function fundLines(
  row: Obj,
  rowType: FundRow['rowType'],
  rowId: string,
  rowCode: string | null,
): FundRow[] {
  const base = { rowType, rowId, rowCode };
  const name = (f: string) => FUND_SOURCE_NAMES[f] ?? f;
  const allocations = arr(row.fundAllocations);
  if (allocations.length > 0) {
    return allocations.map((a) => {
      const fund = String(a.fundSource);
      const ps = money(a.ps);
      const mooe = money(a.mooe);
      // A line saved before FE existed has no key: 0.
      const fe = money(a.fe ?? 0);
      const co = money(a.co);
      return {
        ...base,
        fundSource: fund,
        fundSourceName: name(fund),
        declaredAs: 'split',
        ps,
        mooe,
        fe,
        co,
        total: new Prisma.Decimal(ps).plus(mooe).plus(fe).plus(co).toFixed(2),
      };
    });
  }
  // Unsplit (or a snapshot from before fund allocations existed): the funds
  // are listed, the money is not divided between them.
  const sources = Array.isArray(row.fundSources) ? row.fundSources : [];
  return sources.map((f) => ({
    ...base,
    fundSource: String(f),
    fundSourceName: name(String(f)),
    declaredAs: 'total',
    ps: null,
    mooe: null,
    fe: null,
    co: null,
    total: null,
  }));
}

function climate(
  row: Obj,
  rowType: ClimateRow['rowType'],
  rowId: string,
  rowCode: string | null,
): { tag: ClimateTag | null; rows: ClimateRow[] } {
  const t = obj(row.climateChangeTag);
  if (!t) return { tag: null, rows: [] };
  const ccaAmount = money(t.ccaAmount);
  const ccmAmount = money(t.ccmAmount);
  const codes = arr(t.codes)
    .map((c) => obj(c.ccetCode))
    .filter((c): c is Obj => c !== null)
    .map((c) => ({
      code: String(c.code),
      pillar: String(c.pillar),
      name: String(c.name),
    }));
  const base = { rowType, rowId, rowCode, ccaAmount, ccmAmount };
  const rows: ClimateRow[] =
    codes.length > 0
      ? codes.map((c) => ({
          ...base,
          ccetCode: c.code,
          ccetPillar: c.pillar,
          ccetName: c.name,
        }))
      : [{ ...base, ccetCode: null, ccetPillar: null, ccetName: null }];
  // Key order fixed to the column order, for readable JSON.
  return {
    tag: { ccaAmount, ccmAmount, codes },
    rows: rows.map((r) => ({
      rowType: r.rowType,
      rowId: r.rowId,
      rowCode: r.rowCode,
      ccetCode: r.ccetCode,
      ccetPillar: r.ccetPillar,
      ccetName: r.ccetName,
      ccaAmount: r.ccaAmount,
      ccmAmount: r.ccmAmount,
    })),
  };
}

// ─── Mappers ──────────────────────────────────────────────────────────────

export function mapProgram(
  snapshot: Obj,
  live: LiveProgram,
  cycle: { fiscalYear: number },
): MappedProgram {
  const office = obj(live.office) ?? obj(snapshot.office);
  const finishLine = obj(live.finishLine) ?? obj(snapshot.finishLine);
  const papSector = obj(live.papSector) ?? obj(snapshot.papSector);
  const programId = String(snapshot.id);
  const programCode = code(snapshot);

  const program: ProgramRow = {
    id: programId,
    fiscalYear: cycle.fiscalYear,
    aipCode: programCode,
    codeIsFinal: str(snapshot.aipReferenceCode) !== null,
    name: str(snapshot.name) ?? str(live.publishedName) ?? str(live.name) ?? '',
    description: str(snapshot.description),
    officeCode: str(office?.acronym),
    officeName: str(office?.name),
    cluster: str(obj(office?.cluster)?.name),
    papSectorCode: str(papSector?.code),
    papSectorName: str(papSector?.name),
    papClass: str(snapshot.papClass),
    finishLineNumber: num(finishLine?.visionNumber),
    finishLineName: str(finishLine?.name),
    majorFinalOutput: str(snapshot.majorFinalOutput),
    expectedOutput: str(snapshot.expectedOutput),
    targetForBudgetYear: str(snapshot.targetForBudgetYear),
    implementationStart: yearMonth(
      snapshot.implementationStartYear,
      snapshot.implementationStartMonth,
    ),
    implementationEnd: yearMonth(
      snapshot.implementationEndYear,
      snapshot.implementationEndMonth,
    ),
    costMode: str(snapshot.costMode),
    // The program figure, read never re-derived: a DIRECT_COSTS program has no
    // PAs to sum (ARCHITECTURE-ESSENTIALS "Data and money").
    proposedTotal: money(snapshot.proposedTotal ?? live.publishedProposedTotal),
    ps: snapshotExpenseClassAmount(
      snapshot.psProposedTotal ?? live.psProposedTotal,
      snapshot.psTotal ?? live.psTotal,
    ),
    mooe: snapshotExpenseClassAmount(
      snapshot.mooeProposedTotal ?? live.mooeProposedTotal,
      snapshot.mooeTotal ?? live.mooeTotal,
    ),
    // Snapshot only: a version published before FE existed had none, and the
    // live row may hold an unpublished one.
    fe: snapshotExpenseClassAmount(snapshot.feProposedTotal, snapshot.feTotal),
    co: snapshotExpenseClassAmount(
      snapshot.coProposedTotal ?? live.coProposedTotal,
      snapshot.coTotal ?? live.coTotal,
    ),
    isSplitByFund: arr(snapshot.fundAllocations).length > 0,
    version: live.version ?? null,
    // The snapshot is taken before publish, so its own publishedAt is stale.
    publishedAt: iso(live.publishedAt) ?? iso(snapshot.publishedAt),
  };

  const programFunds = fundLines(snapshot, 'program', programId, programCode);
  const programClimate = climate(snapshot, 'program', programId, programCode);

  const pas = arr(snapshot.projectActivities);
  const byId = new Map(pas.map((pa) => [String(pa.id), pa]));
  const childrenOf = new Map<string | null, Obj[]>();
  for (const pa of pas) {
    const parentId = str(pa.parentProjectActivityId);
    // An orphan (parent missing from the snapshot) is shown at the top level.
    const key = parentId && byId.has(parentId) ? parentId : null;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), pa]);
  }

  const activities: ActivityRow[] = [];
  const funds: FundRow[] = [...programFunds];
  const climateRows: ClimateRow[] = [...programClimate.rows];

  const walk = (parent: Obj | null): NestedActivity[] =>
    (childrenOf.get(parent ? String(parent.id) : null) ?? []).map((pa) => {
      const id = String(pa.id);
      const paCode = code(pa);
      const row: ActivityRow = {
        id,
        programId,
        parentActivityId: parent ? String(parent.id) : null,
        programCode,
        parentActivityCode: parent ? code(parent) : null,
        aipCode: paCode,
        codeIsFinal: str(pa.aipReferenceCode) !== null,
        type: str(pa.type),
        name: str(pa.name) ?? '',
        description: str(pa.description),
        majorFinalOutput: str(pa.majorFinalOutput),
        expectedOutput: str(pa.expectedOutput),
        targetForBudgetYear: str(pa.targetForBudgetYear),
        implementationStart: yearMonth(
          pa.implementationStartYear,
          pa.implementationStartMonth,
        ),
        implementationEnd: yearMonth(
          pa.implementationEndYear,
          pa.implementationEndMonth,
        ),
        costMode: str(pa.costMode),
        proposedBudget: money(pa.proposedBudget),
        ps: snapshotExpenseClassAmount(pa.psEstimate, pa.psTotal),
        mooe: snapshotExpenseClassAmount(pa.mooeEstimate, pa.mooeTotal),
        fe: snapshotExpenseClassAmount(pa.feEstimate, pa.feTotal),
        co: snapshotExpenseClassAmount(pa.coEstimate, pa.coTotal),
        isSplitByFund: arr(pa.fundAllocations).length > 0,
      };
      activities.push(row);
      const paFunds = fundLines(pa, 'activity', id, paCode);
      const paClimate = climate(pa, 'activity', id, paCode);
      funds.push(...paFunds);
      climateRows.push(...paClimate.rows);
      return {
        ...row,
        funds: paFunds,
        climateTag: paClimate.tag,
        activities: walk(pa),
      };
    });

  const nestedActivities = walk(null);

  return {
    program,
    activities,
    funds,
    climateRows,
    nested: {
      ...program,
      funds: programFunds,
      climateTag: programClimate.tag,
      activities: nestedActivities,
    },
  };
}

export interface ProjectSource {
  id: string;
  name: string;
  classification: string;
  fundingProgram: string;
  publishedAt: Date | null;
  office: { acronym: string; name: string } | null;
  lineItems: Array<{ lineTotal: Prisma.Decimal }>;
}

export function mapProject(p: ProjectSource): ProjectRow {
  return {
    id: p.id,
    name: p.name,
    classification: p.classification,
    officeCode: p.office?.acronym ?? null,
    officeName: p.office?.name ?? null,
    fundingProgram: p.fundingProgram,
    total: p.lineItems
      .reduce((acc, li) => acc.plus(li.lineTotal), new Prisma.Decimal(0))
      .toFixed(2),
    publishedAt: iso(p.publishedAt),
  };
}
