import { Prisma } from '../generated/prisma/index';
import {
  buildProgramRows,
  type RowProgram,
  type RowProjectActivity,
} from './export-rows';

const D = (v: string) => new Prisma.Decimal(v);
const tag = (cca: string, ...codes: string[]) => ({
  ccaAmount: D(cca),
  ccmAmount: D('0'),
  codes: codes.map((code) => ({ ccetCode: { code } })),
});

function pa(
  over: Partial<RowProjectActivity> & { id: string },
): RowProjectActivity {
  return {
    parentProjectActivityId: null,
    type: 'ACTIVITY',
    name: over.id,
    aipReferenceCode: null,
    tentativeAipReferenceCode: over.id,
    expectedOutput: null,
    fundSources: [],
    implementationStartMonth: null,
    implementationStartYear: null,
    implementationEndMonth: null,
    implementationEndYear: null,
    psEstimate: null,
    mooeEstimate: null,
    feEstimate: null,
    coEstimate: null,
    proposedBudget: D('100'),
    orderIndex: 0,
    createdAt: new Date(0),
    climateChangeTag: null,
    ...over,
  };
}

describe('buildProgramRows — climate', () => {
  const program = {
    papClass: 'OPERATIONS',
    name: 'Sustainable River Maintenance',
    aipReferenceCode: null,
    tentativeAipReferenceCode: 'P',
    expectedOutput: null,
    implementationStartMonth: null,
    implementationStartYear: null,
    implementationEndMonth: null,
    implementationEndYear: null,
    office: { acronym: 'CENRO' },
    climateChangeTag: tag('3', 'A314-02'),
    projectActivities: [
      pa({
        id: 'parent',
        type: 'PROJECT',
        climateChangeTag: tag('2', 'A224-01'),
      }),
      pa({
        id: 'child',
        parentProjectActivityId: 'parent',
        climateChangeTag: tag('1', 'M114-04', 'M114-01'),
      }),
    ],
  } as unknown as RowProgram;

  const [programRow, parentRow, childRow] = buildProgramRows([program]);

  it('carries every code of a multi-code tag', () => {
    expect(childRow.climateCodes).toEqual(['M114-04', 'M114-01']);
  });

  it('adds the program’s own tag and counts a nested tag once', () => {
    expect(parentRow.ccaTotal.toFixed(2)).toBe('3.00'); // its own 2 + child 1
    expect(programRow.ccaTotal.toFixed(2)).toBe('6.00'); // own 3 + parent subtree 3
    expect(programRow.climateCodes).toEqual([
      'A314-02',
      'A224-01',
      'M114-04',
      'M114-01',
    ]);
  });
});

describe('buildProgramRows — split by fund', () => {
  const lines = [
    {
      fundSource: 'GF' as const,
      ps: D('0'),
      mooe: D('0'),
      fe: D('0'),
      co: D('3'),
    },
    {
      fundSource: 'SHF' as const,
      ps: D('0'),
      mooe: D('1'),
      fe: D('0'),
      co: D('2'),
    },
  ];
  const base = {
    papClass: 'OPERATIONS' as const,
    name: 'Hospital Expansion',
    aipReferenceCode: null,
    tentativeAipReferenceCode: 'P',
    expectedOutput: null,
    implementationStartMonth: null,
    implementationStartYear: null,
    implementationEndMonth: null,
    implementationEndYear: null,
    office: { acronym: 'NCGH' },
  };

  it('prints a split PPA as one line per fund, totals unchanged', () => {
    const rows = buildProgramRows([
      {
        ...base,
        projectActivities: [
          pa({
            id: 'x',
            fundSources: ['GF', 'SHF'],
            mooeEstimate: D('1'),
            coEstimate: D('5'),
            proposedBudget: D('6'),
            climateChangeTag: tag('2', 'A114-01'),
            fundAllocations: lines,
          }),
        ],
      },
    ]);
    const leaves = rows.filter((r) => !r.isParent);
    expect(
      leaves.map((r) => [r.fundSources, r.totalAmount.toString()]),
    ).toEqual([
      [['GF'], '3'],
      [['SHF'], '3'],
    ]);
    expect(leaves[1]).toMatchObject({
      continuation: true,
      code: '',
      description: '',
    });
    // Climate counted once, on the first line.
    expect(leaves.reduce((s, r) => s.plus(r.ccaTotal), D('0')).toString()).toBe(
      '2',
    );
  });

  it('splits a program that states its own costs', () => {
    const rows = buildProgramRows([
      {
        ...base,
        costMode: 'DIRECT_COSTS',
        proposedTotal: D('6'),
        fundAllocations: lines,
        projectActivities: [],
      },
    ]);
    expect(rows.map((r) => r.totalAmount.toString())).toEqual(['3', '3']);
  });
});
