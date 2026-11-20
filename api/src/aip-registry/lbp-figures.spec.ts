import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FundSource } from '../generated/prisma/index';
import {
  attribute,
  gapsOf,
  moneyOnFund,
  toSheetProgram,
} from './lbp-figures.js';
import { buildOfficeSheet, programMoney } from './office-sheet.js';

const office = { name: 'City Treasurer', acronym: 'CTO' };

/** A program row as a live Prisma row or snapshot would carry it. */
function program(over: Record<string, unknown> = {}) {
  return toSheetProgram(
    {
      id: 'p1',
      officeId: 'o1',
      hostOfficeId: null,
      papClass: 'OPERATIONS',
      tentativeAipReferenceCode: '1000-2-05-1-01-001-000',
      aipReferenceCode: null,
      name: 'Revenue Program',
      costMode: 'ACTIVITY_CHILDREN',
      fundSources: [],
      fundAllocations: [],
      psProposedTotal: '0',
      mooeProposedTotal: '0',
      feProposedTotal: '0',
      coProposedTotal: '0',
      proposedTotal: '0',
      projectActivities: [],
      ...over,
    },
    office,
  );
}

const pa = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  parentProjectActivityId: null,
  tentativeAipReferenceCode: `CODE-${id}`,
  name: `Activity ${id}`,
  orderIndex: 0,
  fundSources: ['GF'],
  fundAllocations: [],
  psEstimate: null,
  mooeEstimate: null,
  feEstimate: null,
  coEstimate: null,
  proposedBudget: null,
  ...over,
});

const gf = moneyOnFund(FundSource.GF);

describe('LBP figures — fund attribution', () => {
  it('counts only the chosen fund’s line of a split row', () => {
    const p = program({
      costMode: 'DIRECT_COSTS',
      proposedTotal: '5000',
      fundAllocations: [
        { fundSource: 'GF', ps: '0', mooe: '1000', fe: '200', co: '0' },
        { fundSource: 'SEF', ps: '0', mooe: '0', co: '3800' },
      ],
    });
    const m = programMoney(p, gf);
    expect(m.total.toFixed(2)).toBe('1200.00');
    expect(m.fe.toFixed(2)).toBe('200.00');
    expect(programMoney(p, moneyOnFund(FundSource.SEF)).co.toFixed(2)).toBe(
      '3800.00',
    );
  });

  it('leaves an unsplit multi-fund row off every form, and lists it', () => {
    const p = program({
      projectActivities: [
        pa('a', { fundSources: ['GF', 'SEF'], proposedBudget: '700' }),
      ],
    });
    expect(programMoney(p, gf).total.isZero()).toBe(true);
    expect(attribute(p.activities[0], FundSource.SEF).multiFund).toBe(true);
    const gaps = gapsOf([p], 'published', new Set(['p1']));
    expect(gaps.multiFund.map((g) => g.amount.toFixed(2))).toEqual(['700.00']);
  });

  it('counts a row with no fund as General Fund only, and lists it', () => {
    const p = program({
      projectActivities: [pa('a', { fundSources: [], proposedBudget: '50' })],
    });
    expect(programMoney(p, gf).total.toFixed(2)).toBe('50.00');
    expect(programMoney(p, moneyOnFund(FundSource.SEF)).total.isZero()).toBe(
      true,
    );
    expect(gapsOf([p], 'published', new Set()).noFund).toHaveLength(1);
  });

  it('lists unpublished programs only for working figures', () => {
    const p = program();
    expect(gapsOf([p], 'working', new Set()).unpublished).toHaveLength(1);
    expect(gapsOf([p], 'published', new Set()).unpublished).toHaveLength(0);
  });

  it('reads a direct-cost program’s own row, never its (absent) PPAs', () => {
    const p = program({
      costMode: 'DIRECT_COSTS',
      fundSources: ['GF'],
      psProposedTotal: '10',
      feProposedTotal: '5',
      proposedTotal: '15',
    });
    const m = programMoney(p, gf);
    expect([m.ps, m.fe, m.total].map((d) => d.toFixed(2))).toEqual([
      '10.00',
      '5.00',
      '15.00',
    ]);
  });

  it('reads a published snapshot from before FE as FE 0', () => {
    // Snapshot JSON: strings, and no fe keys at all.
    const p = program({
      costMode: 'DIRECT_COSTS',
      fundSources: ['GF'],
      mooeProposedTotal: '2000',
      proposedTotal: '2000',
      feProposedTotal: undefined,
    });
    expect(programMoney(p, gf).fe.toFixed(2)).toBe('0.00');
  });
});

describe('office sheet — money on leaves only', () => {
  it('prints a nested parent without money, so the total counts it once', () => {
    const p = program({
      projectActivities: [
        pa('parent', {
          costMode: 'ACTIVITY_CHILDREN',
          proposedBudget: '300',
          mooeEstimate: '300',
        }),
        pa('c1', {
          parentProjectActivityId: 'parent',
          proposedBudget: '100',
          mooeEstimate: '100',
        }),
        pa('c2', {
          parentProjectActivityId: 'parent',
          orderIndex: 1,
          proposedBudget: '200',
          mooeEstimate: '200',
        }),
      ],
    });
    const sheet = buildOfficeSheet('o1', [p], gf);
    const ops = sheet.sections[2];
    expect(ops.rows.map((r) => r.description)).toEqual([
      'Revenue Program',
      'Activity parent',
      'Activity c1',
      'Activity c2',
    ]);
    expect(ops.rows[1].money.total.isZero()).toBe(true);
    expect(sheet.total.total.toFixed(2)).toBe('300.00');
    expect(sheet.total.total.equals(programMoney(p, gf).total)).toBe(true);
  });

  it('puts a component program under the band, with its own total', () => {
    const own = program({
      costMode: 'DIRECT_COSTS',
      fundSources: ['GF'],
      proposedTotal: '10',
    });
    const component = program({
      id: 'p2',
      officeId: 'o2',
      hostOfficeId: 'o1',
      costMode: 'DIRECT_COSTS',
      fundSources: ['GF'],
      proposedTotal: '5',
    });
    const sheet = buildOfficeSheet('o1', [own, component], gf);
    expect(sheet.total.total.toFixed(2)).toBe('10.00');
    expect(sheet.componentTotal.total.toFixed(2)).toBe('5.00');
    expect(sheet.grandTotal.total.toFixed(2)).toBe('15.00');
    expect(sheet.components[0].officeName).toBe('City Treasurer');
  });

  it('never coerces money through Number', () => {
    for (const file of ['lbp-figures.ts', 'office-sheet.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      expect(source).not.toMatch(/Number\(|parseFloat/);
    }
  });
});
