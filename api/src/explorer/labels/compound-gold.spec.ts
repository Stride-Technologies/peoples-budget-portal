import {
  compoundCases,
  compoundScore,
  compoundSlice,
  nameOf,
  readCases,
  triggersOf,
} from './compound-gold.js';

const rows = [
  {
    rowId: 'r1',
    text: 'Program: Capacity Building of Workforce\nOffice: HRMO',
  },
  {
    rowId: 'r2',
    text: 'Activity: Team Building\nPart of: Capacity Building Program\nOffice: HRMO',
  },
  { rowId: 'r3', text: 'Activity: School Building, Balatas\nOffice: CEO' },
  { rowId: 'r4', text: 'Activity: Multi-Purpose Building\nOffice: CEO' },
  { rowId: 'r5', text: 'Activity: Flood Control, Tabuco\nOffice: CEO' },
  {
    rowId: 'r6',
    text: 'Program: Technical Assistance to Barangays\nOffice: CMO',
  },
];
const compounds = [
  { phrase: 'capacity building', not: ['infrastructure'], why: 'training' },
  { phrase: 'flood control', not: [] },
  { phrase: 'technical assistance', not: ['social-welfare'], why: 'advice' },
];
const triggers = triggersOf(
  [
    { id: 'infrastructure', rules: [['keyword', '\\b(road|building)']] },
    { id: 'social-welfare', rules: [['keyword', '\\bassistance']] },
  ],
  [{ id: 'social-welfare', aliases: { en: ['assistance'] } }],
);

describe('compound cases for the gold set (decision #16)', () => {
  const cases = compoundCases(rows, compounds, triggers, 5, 'test');

  it('reads a row by its own name, not its parent', () => {
    expect(nameOf(rows[1].text)).toBe('Team Building');
    // Its parent is "Capacity Building Program", but its own name is not the compound.
    expect(cases.find((c) => c.rowId === 'r2')?.role).toBe('contrast');
  });

  it('draws the compound rows and contrast rows that use the trigger word alone', () => {
    const of = (p: string, role: string) =>
      cases
        .filter((c) => c.phrase === p && c.role === role)
        .map((c) => c.rowId)
        .sort();
    expect(of('capacity building', 'compound')).toEqual(['r1']);
    expect(of('capacity building', 'contrast')).toEqual(['r2', 'r3', 'r4']); // "building" without the phrase
    expect(cases.find((c) => c.rowId === 'r3')?.word).toBe('building');
    expect(of('flood control', 'compound')).toEqual(['r5']);
    expect(of('flood control', 'contrast')).toEqual([]); // nothing kept out, nothing to contrast
    expect(of('technical assistance', 'compound')).toEqual(['r6']);
  });

  it('uses a row once and caps each case, deterministically', () => {
    expect(new Set(cases.map((c) => c.rowId)).size).toBe(cases.length);
    expect(
      compoundCases(rows, compounds, triggers, 1, 'test').filter(
        (c) => c.role === 'contrast',
      ),
    ).toHaveLength(1);
    expect(compoundCases(rows, compounds, triggers, 5, 'test')).toEqual(cases);
  });

  it('scores the labeller: trapped on the phrase, right on the contrast', () => {
    const picks = new Map([
      ['r1', ['infrastructure.buildings']], // trapped
      ['r3', ['education.facilities', 'infrastructure.buildings']],
      ['r4', ['infrastructure']],
      ['r2', ['governance.hr']],
      ['r6', ['governance.administration']],
    ]);
    const s = compoundScore(cases, picks);
    expect(s.find((x) => x.phrase === 'capacity building')).toEqual({
      phrase: 'capacity building',
      labels: ['infrastructure'],
      trapped: 1,
      compounds: 1,
      contrastHit: 2,
      contrasts: 3,
    });
    expect(s.find((x) => x.phrase === 'technical assistance')).toMatchObject({
      trapped: 0,
      compounds: 1,
    });
    expect(s.find((x) => x.phrase === 'flood control')).toBeUndefined();
  });
});

describe('the compound slice, once Stride has decided', () => {
  it('reads the sidecar back and scores live picks against the decisions', () => {
    const cases = readCases(
      'row_id,phrase,role,labels,word\nr1,capacity building,compound,infrastructure,\nr3,capacity building,contrast,infrastructure,building\nr5,flood control,compound,,\n',
    );
    expect(cases[0]).toEqual({
      rowId: 'r1',
      phrase: 'capacity building',
      role: 'compound',
      labels: ['infrastructure'],
      word: '',
    });
    const s = compoundSlice(
      [
        {
          rowId: 'r1',
          picks: [
            { id: 'infrastructure.buildings', confidence: 0.9 },
            { id: 'governance.hr', confidence: 0.8 },
          ],
          gold: ['governance.hr'],
        },
        {
          rowId: 'r3',
          picks: [{ id: 'infrastructure.buildings', confidence: 0.9 }],
          gold: ['infrastructure.buildings'],
        },
        {
          rowId: 'r5',
          picks: [{ id: 'infrastructure.drainage-flood', confidence: 0.2 }],
          gold: ['infrastructure.drainage-flood'],
        },
      ],
      cases,
      0.35,
    );
    expect(s.compound).toEqual({
      rows: 2,
      livePicks: 2,
      liveError: 0.5,
      keptOutRows: 1,
      keptOutWrong: 1,
    });
    expect(s.contrast).toEqual({
      rows: 1,
      livePicks: 1,
      liveError: 0,
      keptOutRows: 1,
      keptOutWrong: 0,
    });
  });
});
