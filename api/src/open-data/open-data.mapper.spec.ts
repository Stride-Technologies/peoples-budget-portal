import {
  ACTIVITY_COLUMNS,
  CLIMATE_COLUMNS,
  FUND_COLUMNS,
  PROGRAM_COLUMNS,
  PROJECT_COLUMNS,
  mapProgram,
  mapProject,
  type MappedProgram,
} from './open-data.mapper.js';
import { toCsv } from './open-data.csv.js';
import { Prisma } from '../generated/prisma/index';
import {
  asProgramView,
  type BudgetItemNode,
} from '../budget-documents/budget-item-view.js';
import {
  SALTED_KEYS,
  SALTED_VALUES,
  programALive,
  programASnapshot,
  programBLive,
  programBSnapshot,
  programCLive,
  programCSnapshot,
} from './__fixtures__/snapshot.fixture.js';

const cycle = { fiscalYear: 2027 };
const a = mapProgram(programASnapshot, programALive, cycle);
const b = mapProgram(programBSnapshot, programBLive, cycle);
const c = mapProgram(programCSnapshot, programCLive, cycle);

/**
 * An enacted Ordinance PPA (specs/012), salted with the BudgetItem columns that
 * must never be published: provenance, import warnings, change reasons.
 */
const ppa = (
  id: string,
  parentId: string | null,
  own: number,
  total: number,
): BudgetItemNode =>
  ({
    id,
    parentId,
    rootItemId: 'ppa-root',
    officeId: 'office-1',
    hostOfficeId: null,
    papClass: 'Operations',
    aipReferenceCode: '3000-1-01-001',
    name: `Ordinance PPA ${id}`,
    majorFinalOutput: null,
    performanceIndicator: 'Clients served',
    target: '1,000',
    ps: new Prisma.Decimal(0),
    mooe: new Prisma.Decimal(own),
    fe: new Prisma.Decimal(0),
    co: new Prisma.Decimal(0),
    unsplit: new Prisma.Decimal(0),
    total: new Prisma.Decimal(total),
    fundSource: 'GF',
    orderIndex: 1,
    sourceRef: 'SALT-source-ref',
    importWarnings: [{ code: 'SALT-warning' }],
    adjustmentReason: 'SALT-adjustment',
    createdByUserId: 'SALT-user',
  }) as BudgetItemNode;
const ordinanceView = asProgramView(ppa('ppa-root', null, 100, 300), [
  ppa('ppa-root', null, 100, 300),
  ppa('ppa-child', 'ppa-root', 200, 200),
]);
const d = mapProgram(ordinanceView.snapshot, ordinanceView.live, cycle);
const all = [a, b, c, d];

const names = (cols: ReadonlyArray<{ name: string }>) =>
  cols.map((col) => col.name).sort();

const csvOf = (m: MappedProgram) =>
  [
    toCsv(PROGRAM_COLUMNS, [m.program]),
    toCsv(ACTIVITY_COLUMNS, m.activities),
    toCsv(FUND_COLUMNS, m.funds),
    toCsv(CLIMATE_COLUMNS, m.climateRows),
  ].join('');

const sum = (values: Array<string | null>) =>
  values
    .reduce((acc, v) => acc.plus(v ?? '0'), new Prisma.Decimal(0))
    .toFixed(2);

describe('open-data mapper', () => {
  it('(a) emits exactly the documented columns on every row', () => {
    for (const m of all) {
      expect(Object.keys(m.program).sort()).toEqual(names(PROGRAM_COLUMNS));
      for (const row of m.activities) {
        expect(Object.keys(row).sort()).toEqual(names(ACTIVITY_COLUMNS));
      }
      for (const row of m.funds) {
        expect(Object.keys(row).sort()).toEqual(names(FUND_COLUMNS));
      }
      for (const row of m.climateRows) {
        expect(Object.keys(row).sort()).toEqual(names(CLIMATE_COLUMNS));
      }
    }
  });

  it('(b) lets no personal or internal field into the JSON or CSV', () => {
    for (const m of all) {
      const json = JSON.stringify(m);
      const csv = csvOf(m);
      for (const value of SALTED_VALUES) {
        expect(json).not.toContain(value);
        expect(csv).not.toContain(value);
      }
      for (const key of SALTED_KEYS) {
        expect(json).not.toContain(`"${key}"`);
      }
    }
  });

  it('(c) split lines add up to the row; unsplit funds are declared as a total', () => {
    const split = a.activities.find((r) => r.isSplitByFund);
    expect(split).toBeDefined();
    const lines = a.funds.filter((f) => f.rowId === split!.id);
    expect(lines.map((f) => f.fundSource)).toEqual(['GF', 'SHF']);
    expect(lines.every((f) => f.declaredAs === 'split')).toBe(true);
    expect(sum(lines.map((f) => f.total))).toBe(split!.proposedBudget);
    expect(lines.find((f) => f.fundSource === 'SHF')!.fundSourceName).toBe(
      'Special Health Fund',
    );

    const unsplit = a.activities.find((r) =>
      r.name.startsWith('Vermicast Production'),
    );
    const unsplitLines = a.funds.filter((f) => f.rowId === unsplit?.id);
    expect(unsplitLines.map((f) => f.fundSource)).toEqual(['GF', 'SEF']);
    for (const f of unsplitLines) {
      expect(f.declaredAs).toBe('total');
      expect([f.ps, f.mooe, f.fe, f.co, f.total]).toEqual([
        null,
        null,
        null,
        null,
        null,
      ]);
    }

    const programLines = b.funds.filter((f) => f.rowType === 'program');
    expect(b.program.isSplitByFund).toBe(true);
    expect(sum(programLines.map((f) => f.total))).toBe(b.program.proposedTotal);
  });

  it('(d) an old snapshot without fundAllocations yields total lines from fundSources', () => {
    expect(c.program.isSplitByFund).toBe(false);
    expect(c.funds.map((f) => [f.fundSource, f.declaredAs])).toEqual([
      ['GF', 'total'],
      ['SHF', 'total'],
    ]);
    expect(c.climateRows).toEqual([]);
    expect(c.nested.climateTag).toBeNull();
  });

  it('(e) proposed_total is the snapshot figure, including a program with no PAs', () => {
    expect(a.program.proposedTotal).toBe('851000.00');
    expect(b.program.costMode).toBe('DIRECT_COSTS');
    expect(b.activities).toEqual([]);
    expect(b.program.proposedTotal).toBe('26200000.00');
  });

  it('(f) money is a two-place string', () => {
    const money = /^\d+\.\d{2}$/;
    for (const m of all) {
      for (const v of [
        m.program.proposedTotal,
        m.program.ps,
        m.program.mooe,
        m.program.fe,
        m.program.co,
      ]) {
        expect(v).toMatch(money);
      }
      for (const row of m.activities) {
        for (const v of [
          row.proposedBudget,
          row.ps,
          row.mooe,
          row.fe,
          row.co,
        ]) {
          expect(v).toMatch(money);
        }
      }
      for (const f of m.funds.filter((x) => x.declaredAs === 'split')) {
        for (const v of [f.ps, f.mooe, f.fe, f.co, f.total])
          expect(v).toMatch(money);
      }
    }
    expect(a.program.mooe).toBe('851000.00');
  });

  it('(f2) FE: a snapshot from before FE reads 0, never the live row', () => {
    // The fixtures predate FE: no fe keys anywhere.
    expect(a.program.fe).toBe('0.00');
    // A live FE figure on a program mid-revision must not leak.
    const revised = mapProgram(
      programASnapshot,
      { ...programALive, feProposedTotal: '999.00' } as never,
      cycle,
    );
    expect(revised.program.fe).toBe('0.00');
    const withFe = mapProgram(
      { ...programASnapshot, feProposedTotal: '2000' },
      programALive,
      cycle,
    );
    expect(withFe.program.fe).toBe('2000.00');
  });

  it('(g) nested activities carry their parent id and code', () => {
    const roots = a.activities.filter((r) => r.parentActivityId === null);
    const children = a.activities.filter((r) => r.parentActivityId !== null);
    expect(roots).toHaveLength(2);
    expect(children).toHaveLength(4);
    for (const child of children) {
      const parent = a.activities.find((r) => r.id === child.parentActivityId);
      expect(parent).toBeDefined();
      expect(child.parentActivityCode).toBe(parent!.aipCode);
      expect(child.programCode).toBe(a.program.aipCode);
    }
    // Depth-first: every child follows its parent.
    for (const child of children) {
      const pi = a.activities.findIndex((r) => r.id === child.parentActivityId);
      expect(a.activities.indexOf(child)).toBeGreaterThan(pi);
    }
    expect(a.nested.activities).toHaveLength(2);
    expect(
      a.nested.activities.reduce((n, r) => n + r.activities.length, 0),
    ).toBe(4);
  });

  it('(h) one climate row per tag × code, and one empty row for a codeless tag', () => {
    const programRows = a.climateRows.filter((r) => r.rowType === 'program');
    expect(programRows.map((r) => r.ccetCode)).toEqual(['M114-01', 'M114-04']);
    expect(programRows.every((r) => r.ccmAmount === '851000.00')).toBe(true);

    const codeless = a.climateRows.filter(
      (r) => r.rowType === 'activity' && r.ccetCode === null,
    );
    expect(codeless).toHaveLength(1);
    expect(codeless[0].ccaAmount).toBe('130000.00');
    expect([codeless[0].ccetPillar, codeless[0].ccetName]).toEqual([
      null,
      null,
    ]);

    expect(a.nested.climateTag?.codes.map((x) => x.code)).toEqual([
      'M114-01',
      'M114-04',
    ]);
  });

  it('maps a published Project to its allow-listed columns only', () => {
    const project = mapProject({
      id: 'p1',
      name: 'Laptops for barangay health stations',
      classification: 'OPERATIONS',
      fundingProgram: 'Public Health, Health Promotion',
      publishedAt: new Date('2026-10-01T00:00:00Z'),
      office: { acronym: 'CHO', name: 'City Health Office' },
      lineItems: [
        { lineTotal: new Prisma.Decimal('1000.50') },
        { lineTotal: new Prisma.Decimal('2000.25') },
      ],
      // Salted: present on the row, never in the output.
      createdByUserId: 'SALT-USER-0001',
      remarks: 'SALT-REMARK',
    } as Parameters<typeof mapProject>[0]);
    expect(Object.keys(project).sort()).toEqual(names(PROJECT_COLUMNS));
    expect(project.total).toBe('3000.75');
    expect(project.publishedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(JSON.stringify(project)).not.toContain('SALT-');
  });

  it('labels the program and keeps the published name and version', () => {
    expect(a.program).toMatchObject({
      fiscalYear: 2027,
      aipCode: '8000-2-02-19-003-006-000',
      codeIsFinal: false,
      name: 'Cost Reduction Interventions',
      officeCode: 'CAgO',
      cluster: 'Economy',
      papSectorCode: '8000',
      papClass: 'OPERATIONS',
      finishLineNumber: 1,
      implementationStart: '2027-01',
      version: 1,
      publishedAt: '2026-10-14T11:30:00.000Z',
    });
  });
});
