import { FundSource, Prisma } from '../generated/prisma/index';
import { toSheetProgram } from '../aip-registry/lbp-figures.js';
import {
  MULTI_FUND_WARNING,
  planCarryForward,
  type CarryProgram,
} from './lep-carry-forward.js';

const office = { name: 'City Health', acronym: 'CHO' };
const pa = (over: Record<string, unknown>) => ({
  parentProjectActivityId: null,
  name: 'Activity',
  orderIndex: 0,
  fundSources: ['GF'],
  fundAllocations: [],
  psEstimate: '0',
  mooeEstimate: '0',
  feEstimate: '0',
  coEstimate: '0',
  proposedBudget: '0',
  ...over,
});
const program = (over: Record<string, unknown>): CarryProgram => ({
  sheet: toSheetProgram(
    {
      id: 'p1',
      officeId: 'o1',
      hostOfficeId: null,
      papClass: 'OPERATIONS',
      tentativeAipReferenceCode: '3000-001',
      name: 'Health Program',
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
  ),
  finishLineId: 'fl-4',
  papSectorId: 'sec-3000',
  tagIds: [{ tagId: 'tag-1', appliedByUserId: 'u1' }],
  activityTags: new Map([['a2', [{ tagId: 'tag-2', appliedByUserId: 'u1' }]]]),
});

let n = 0;
const ids = () => `i${++n}`;
const sum = (xs: Prisma.Decimal[]) =>
  xs.reduce((a, b) => a.plus(b), new Prisma.Decimal(0)).toFixed(2);

describe('planCarryForward (specs/012 D10)', () => {
  beforeEach(() => (n = 0));

  // A program over a project (a1) with a split leaf (a2: GF 100 + SHF 50) and
  // an unsplit two-fund leaf (a3: 30); and a DIRECT_COSTS program (₱1,000 GF).
  const tree = program({
    proposedTotal: '180.00',
    projectActivities: [
      pa({
        id: 'a1',
        name: 'Project',
        proposedBudget: '180.00',
        fundSources: [],
      }),
      pa({
        id: 'a2',
        parentProjectActivityId: 'a1',
        name: 'Vaccines',
        fundSources: ['GF', 'SHF'],
        fundAllocations: [
          { fundSource: 'GF', ps: '0', mooe: '100.00', fe: '0', co: '0' },
          { fundSource: 'SHF', ps: '0', mooe: '50.00', fe: '0', co: '0' },
        ],
        mooeEstimate: '150.00',
        proposedBudget: '150.00',
      }),
      pa({
        id: 'a3',
        parentProjectActivityId: 'a1',
        name: 'Outreach',
        orderIndex: 1,
        fundSources: ['GF', 'SEF'],
        mooeEstimate: '30.00',
        proposedBudget: '30.00',
      }),
    ],
  });
  const direct = {
    ...program({
      id: 'p2',
      name: 'Clinic Operations',
      costMode: 'DIRECT_COSTS',
      fundSources: ['GF'],
      psProposedTotal: '1000.00',
      proposedTotal: '1000.00',
    }),
    tagIds: [],
  };

  it('keeps the AIP total to the centavo, top level and per tree', () => {
    const { items } = planCarryForward([tree, direct], ids);
    const roots = items.filter((i) => i.parentId === null);
    expect(roots.map((r) => r.total.toFixed(2))).toEqual(['180.00', '1000.00']);
    expect(sum(roots.map((r) => r.total))).toBe('1180.00');
    // Own money appears once: Σ own over every item = Σ roots.
    expect(
      sum(
        items.map((i) =>
          i.ps.plus(i.mooe).plus(i.fe).plus(i.co).plus(i.unsplit),
        ),
      ),
    ).toBe('1180.00');
  });

  it('splits a fund-split row into one PPA per fund under it', () => {
    const { items } = planCarryForward([tree], ids);
    const vaccines = items.find((i) => i.sourceProjectActivityId === 'a2')!;
    expect(vaccines.mooe.toFixed(2)).toBe('0.00');
    const kids = items.filter((i) => i.parentId === vaccines.id);
    expect(kids.map((k) => [k.fundSource, k.mooe.toFixed(2)])).toEqual([
      [FundSource.GF, '100.00'],
      [FundSource.SHF, '50.00'],
    ]);
  });

  it('flags and lists an unsplit row with several funds', () => {
    const { items, listed } = planCarryForward([tree], ids);
    const outreach = items.find((i) => i.sourceProjectActivityId === 'a3')!;
    expect(outreach).toMatchObject({
      fundSource: null,
      importWarnings: [MULTI_FUND_WARNING],
    });
    expect(outreach.mooe.toFixed(2)).toBe('30.00');
    expect(listed).toEqual([{ id: outreach.id, name: 'Outreach' }]);
  });

  it('keeps the tree, the sources, the classification and the tags', () => {
    const { items } = planCarryForward([tree, direct], ids);
    const [root] = items;
    expect(root).toMatchObject({
      sourceProgramId: 'p1',
      rootItemId: root.id,
      finishLineId: 'fl-4',
      papSectorId: 'sec-3000',
      papClass: 'OPERATIONS',
      aipReferenceCode: '3000-001',
      tags: [{ tagId: 'tag-1', appliedByUserId: 'u1' }],
    });
    const project = items.find((i) => i.sourceProjectActivityId === 'a1')!;
    expect(project.parentId).toBe(root.id);
    expect(items.find((i) => i.sourceProjectActivityId === 'a2')).toMatchObject(
      {
        parentId: project.id,
        rootItemId: root.id,
        tags: [{ tagId: 'tag-2', appliedByUserId: 'u1' }],
      },
    );
    const clinic = items.find((i) => i.sourceProgramId === 'p2')!;
    expect(clinic).toMatchObject({ fundSource: FundSource.GF });
    expect(clinic.ps.toFixed(2)).toBe('1000.00');
  });
});
