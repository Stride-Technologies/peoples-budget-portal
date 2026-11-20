import { BadRequestException } from '@nestjs/common';
import {
  budgetItemFundSourceWhere,
  budgetItemPapClassWhere,
  normalizeFundSources,
  normalizePapClasses,
  programFundSourceWhere,
  programPapClassWhere,
} from './pap-class-fund-filters.js';

describe('normalizePapClasses', () => {
  it('reads one value or many, and drops duplicates', () => {
    expect(normalizePapClasses('GAS')).toEqual(['GAS']);
    expect(normalizePapClasses(['GAS', 'STO', 'GAS'])).toEqual(['GAS', 'STO']);
  });

  it('treats an absent or empty filter as no filter', () => {
    expect(normalizePapClasses(undefined)).toBeUndefined();
    expect(normalizePapClasses('')).toBeUndefined();
  });

  it('rejects an unknown class instead of dropping it', () => {
    expect(() => normalizePapClasses(['GAS', 'MOOE'])).toThrow(
      BadRequestException,
    );
  });
});

describe('normalizeFundSources', () => {
  it('accepts every fund and NONE', () => {
    expect(normalizeFundSources(['GF', 'LDRRMF', 'NONE'])).toEqual([
      'GF',
      'LDRRMF',
      'NONE',
    ]);
  });

  it('rejects an unknown fund', () => {
    expect(() => normalizeFundSources('GENERAL')).toThrow(BadRequestException);
  });
});

describe('programPapClassWhere', () => {
  it('matches the classes asked for', () => {
    expect(programPapClassWhere(['GAS', 'STO'])).toEqual({
      papClass: { in: ['GAS', 'STO'] },
    });
  });

  it('folds a program with no class into Operations, as the AIP form does', () => {
    expect(programPapClassWhere(['OPERATIONS'])).toEqual({
      OR: [{ papClass: { in: ['OPERATIONS'] } }, { papClass: null }],
    });
  });

  it('adds nothing when no class is selected', () => {
    expect(programPapClassWhere(undefined)).toBeUndefined();
    expect(programPapClassWhere([])).toBeUndefined();
  });
});

describe('programFundSourceWhere', () => {
  it('matches a fund on the program or on any of its PPAs', () => {
    expect(programFundSourceWhere(['GF', 'NGA'])).toEqual({
      OR: [
        { fundSources: { hasSome: ['GF', 'NGA'] } },
        {
          projectActivities: {
            some: { fundSources: { hasSome: ['GF', 'NGA'] } },
          },
        },
      ],
    });
  });

  it('reads NONE as no fund on the program and none on any PPA', () => {
    expect(programFundSourceWhere(['NONE'])).toEqual({
      OR: [
        {
          fundSources: { isEmpty: true },
          projectActivities: { every: { fundSources: { isEmpty: true } } },
        },
      ],
    });
  });

  it('ORs NONE with the funds selected beside it', () => {
    const where = programFundSourceWhere(['LDRRMF', 'NONE']);
    expect(where?.OR).toHaveLength(3);
  });

  it('adds nothing when no fund is selected', () => {
    expect(programFundSourceWhere(undefined)).toBeUndefined();
  });
});

describe('budgetItem filters (enacted Ordinance)', () => {
  it('folds a missing class into Operations', () => {
    expect(budgetItemPapClassWhere(['OPERATIONS'])).toEqual({
      OR: [{ papClass: { in: ['OPERATIONS'] } }, { papClass: null }],
    });
  });

  it('reads a fund across the whole tree, root included', () => {
    expect(budgetItemFundSourceWhere(['GF', 'NONE'])).toEqual({
      OR: [
        { treeItems: { some: { fundSource: { in: ['GF'] } } } },
        { treeItems: { every: { fundSource: null } } },
      ],
    });
  });
});
