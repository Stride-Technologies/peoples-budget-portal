import { Prisma } from '../generated/prisma/index';
import {
  deriveDataWarnings,
  isProvenanceWarning,
  leavesOf,
  type WarnableProjectActivity,
} from './import-data-warnings.js';

const d = (v: string) => new Prisma.Decimal(v);

/** A leaf with nothing missing — every test starts from this and breaks one thing. */
function goodLeaf(
  overrides: Partial<WarnableProjectActivity> = {},
): WarnableProjectActivity {
  return {
    name: 'Barangay Health Station Upgrade',
    proposedBudget: d('100000.00'),
    psEstimate: null,
    mooeEstimate: null,
    feEstimate: null,
    coEstimate: null,
    fundSources: ['GENERAL_FUND'],
    expectedOutput: '1 health station upgraded',
    implementationStartYear: 2027,
    implementationEndYear: 2027,
    ...overrides,
  };
}

const derive = (
  leaves: WarnableProjectActivity[],
  papClass: string | null = 'OPERATIONS',
  fiscalYear = 2027,
) => deriveDataWarnings({ papClass, fiscalYear, leaves });

describe('deriveDataWarnings', () => {
  it('reports nothing for a complete program', () => {
    expect(derive([goodLeaf(), goodLeaf()])).toEqual([]);
  });

  it('reports a program with no PPA rows at all', () => {
    expect(derive([])).toContain(
      'This program has no project or activity rows.',
    );
  });

  describe('per-field gaps, counted against the leaf total', () => {
    const cases: [string, Partial<WarnableProjectActivity>, string][] = [
      [
        'no proposed amount',
        { proposedBudget: null },
        '1 of 3 PPAs have no proposed amount.',
      ],
      [
        'no funding source',
        { fundSources: [] },
        '1 of 3 PPAs have no funding source.',
      ],
      [
        'no start year',
        { implementationStartYear: null },
        '1 of 3 PPAs have no implementation dates set.',
      ],
      [
        'no end year',
        { implementationEndYear: null },
        '1 of 3 PPAs have no implementation dates set.',
      ],
      [
        'no expected output',
        { expectedOutput: null },
        '1 of 3 PPAs have no expected output.',
      ],
      [
        'empty expected output',
        { expectedOutput: '' },
        '1 of 3 PPAs have no expected output.',
      ],
    ];

    it.each(cases)('%s', (_label, broken, sentence) => {
      const warnings = derive([goodLeaf(broken), goodLeaf(), goodLeaf()]);
      expect(warnings).toEqual([sentence]);
    });
  });

  // A row explicitly zeroed is as unpublishable as one never filled in, and the
  // ZERO_PROPOSED_BUDGET blocker treats it that way — the sentence must agree.
  it('counts an explicit zero amount as missing', () => {
    expect(derive([goodLeaf({ proposedBudget: d('0.00') })])).toEqual([
      '1 of 1 PPAs have no proposed amount.',
    ]);
  });

  it('reports a missing AIP form section', () => {
    expect(derive([goodLeaf()], null)).toEqual([
      'No AIP form section (GAS / STO / Operations) set.',
    ]);
  });

  it('tallies every gap across every leaf at once', () => {
    const warnings = derive(
      [
        goodLeaf({ proposedBudget: null }),
        goodLeaf({ proposedBudget: null, expectedOutput: null }),
        goodLeaf(),
      ],
      null,
    );
    expect(warnings).toEqual([
      '2 of 3 PPAs have no proposed amount.',
      '1 of 3 PPAs have no expected output.',
      'No AIP form section (GAS / STO / Operations) set.',
    ]);
  });

  describe('PS+MOOE+CO against the stated total', () => {
    const withTrio = (ps: string, mooe: string, co: string, total: string) =>
      goodLeaf({
        psEstimate: d(ps),
        mooeEstimate: d(mooe),
        coEstimate: d(co),
        proposedBudget: d(total),
      });

    it('stays quiet when the split adds up', () => {
      expect(
        derive([withTrio('50000.00', '30000.00', '20000.00', '100000.00')]),
      ).toEqual([]);
    });

    it('stays quiet at exactly one centavo out — that is rounding', () => {
      expect(
        derive([withTrio('50000.00', '30000.00', '20000.01', '100000.00')]),
      ).toEqual([]);
      expect(
        derive([withTrio('50000.00', '30000.00', '19999.99', '100000.00')]),
      ).toEqual([]);
    });

    it('reports two centavos out, in both directions', () => {
      expect(
        derive([withTrio('50000.00', '30000.00', '20000.02', '100000.00')]),
      ).toEqual([
        '"Barangay Health Station Upgrade": PS+MOOE+FE+CO 100000.02 does not equal the stated total 100000.00.',
      ]);
      expect(
        derive([withTrio('50000.00', '30000.00', '19999.98', '100000.00')]),
      ).toEqual([
        '"Barangay Health Station Upgrade": PS+MOOE+FE+CO 99999.98 does not equal the stated total 100000.00.',
      ]);
    });

    it('sums a partial trio rather than skipping it', () => {
      expect(
        derive([
          goodLeaf({
            psEstimate: d('40000.00'),
            proposedBudget: d('100000.00'),
          }),
        ]),
      ).toEqual([
        '"Barangay Health Station Upgrade": PS+MOOE+FE+CO 40000.00 does not equal the stated total 100000.00.',
      ]);
    });

    it('skips a leaf with no trio at all — nothing to contradict', () => {
      expect(derive([goodLeaf()])).toEqual([]);
    });

    // Guards the money rule: 0.1 + 0.2 as floats is 0.30000000000000004, which
    // would report a phantom mismatch against a stated 0.30.
    it('does not drift on values a float would round wrong', () => {
      expect(derive([withTrio('0.10', '0.20', '0.00', '0.30')])).toEqual([]);
    });

    it('truncates a long PPA name to 60 characters', () => {
      const name = 'A'.repeat(80);
      const [warning] = derive([
        goodLeaf({ name, psEstimate: d('1.00'), proposedBudget: d('2.00') }),
      ]);
      expect(warning).toContain(`"${'A'.repeat(60)}":`);
      expect(warning).not.toContain('A'.repeat(61));
    });
  });
});

describe('historical cycles waive what the book never stated', () => {
  const bare = (overrides: Partial<WarnableProjectActivity> = {}) =>
    goodLeaf({
      fundSources: [],
      expectedOutput: null,
      implementationStartYear: 2026,
      implementationEndYear: 2026,
      ...overrides,
    });

  it('says nothing about fund source or expected output for 2026', () => {
    expect(derive([bare()], 'OPERATIONS', 2026)).toEqual([]);
  });

  it('still says both for 2027', () => {
    expect(derive([bare()], 'OPERATIONS', 2027)).toEqual([
      '1 of 1 PPAs have no funding source.',
      '1 of 1 PPAs have no expected output.',
    ]);
  });

  // The waiver covers what the printed book declines to say. A missing
  // implementation period is not that — the 2026 seed writes the budget year
  // onto every row, so a null is a real gap in any year.
  it('never waives the implementation period', () => {
    expect(
      derive([bare({ implementationStartYear: null })], 'OPERATIONS', 2026),
    ).toContain('1 of 1 PPAs have no implementation dates set.');
  });
});

describe('isProvenanceWarning', () => {
  it.each([
    'Finish line inferred from the implementing office (PSO → vision V4); the workbook does not state one.',
    'The workbook lists this program twice for CHO (r12 and r48); their PPAs were combined into one.',
    'The workbook lists these PPAs with no program heading; this program was created to hold them and needs a proper name.',
  ])('keeps the import decision: %s', (warning) => {
    expect(isProvenanceWarning(warning)).toBe(true);
  });

  // Every sentence deriveDataWarnings can produce must be strippable, or the
  // migration would leave a frozen duplicate of a now-derived warning behind.
  it('rejects every derived sentence', () => {
    const derived = [
      ...derive(
        [
          goodLeaf({
            proposedBudget: null,
            fundSources: [],
            expectedOutput: null,
            implementationStartYear: null,
          }),
        ],
        null,
      ),
      ...derive([
        goodLeaf({ psEstimate: d('1.00'), proposedBudget: d('2.00') }),
      ]),
      ...derive([]),
    ];

    expect(derived.length).toBeGreaterThan(0);
    for (const warning of derived) {
      expect(isProvenanceWarning(warning)).toBe(false);
    }
  });
});

describe('leavesOf', () => {
  const pa = (id: string, parentProjectActivityId: string | null = null) => ({
    id,
    parentProjectActivityId,
  });

  it('treats every row of a flat program as a leaf', () => {
    const rows = [pa('a'), pa('b'), pa('c')];
    expect(leavesOf(rows)).toEqual(rows);
  });

  it('excludes a parent and keeps its children', () => {
    const rows = [pa('parent'), pa('kid-1', 'parent'), pa('kid-2', 'parent')];
    expect(leavesOf(rows).map((r) => r.id)).toEqual(['kid-1', 'kid-2']);
  });

  it('keeps a row whose named parent is not in the set', () => {
    // The FK is ON DELETE SET NULL, but a partial fetch can still name a row
    // that is not present. Leafness is "nothing here hangs off it", so this is
    // a leaf — it carries its own money and its gaps must be reported.
    expect(leavesOf([pa('orphan', 'deleted-parent')]).map((r) => r.id)).toEqual(
      ['orphan'],
    );
  });

  it('keeps a childless row that merely declares itself cost-derived', () => {
    // Leafness reads the actual child set, never costMode — a parent whose
    // children were all deleted is a leaf again, which is what makes
    // EMPTY_PARENT_PPA detectable as "cost-derived leaf".
    const rows = [{ ...pa('was-a-parent'), costMode: 'ACTIVITY_CHILDREN' }];
    expect(leavesOf(rows)).toEqual(rows);
  });

  it('returns nothing for a program with no rows', () => {
    expect(leavesOf([])).toEqual([]);
  });
});

// specs/013: a program that states its own costs *is* the leaf, so its own
// gaps need sentences — otherwise the registry showed a warning-free row for a
// program the publish check refused.
describe('a direct-cost program reports its own gaps', () => {
  const ownRow = {
    proposedTotal: new Prisma.Decimal('0'),
    fundSources: [],
    expectedOutput: null,
    implementationStartYear: null,
    implementationEndYear: 2027,
  };

  it('names each missing field on the program row', () => {
    expect(
      deriveDataWarnings({
        papClass: 'OPERATIONS',
        fiscalYear: 2027,
        leaves: [],
        statesOwnCosts: true,
        ownRow,
      }),
    ).toEqual([
      'This program has no proposed amount.',
      'This program has no funding source.',
      'This program has no implementation dates set.',
      'This program has no expected output.',
    ]);
  });

  it('waives fund source and output for a historical cycle, as for PPAs', () => {
    expect(
      deriveDataWarnings({
        papClass: 'OPERATIONS',
        fiscalYear: 2026,
        leaves: [],
        statesOwnCosts: true,
        ownRow: { ...ownRow, proposedTotal: new Prisma.Decimal('5') },
      }),
    ).toEqual(['This program has no implementation dates set.']);
  });
});
