import { FundSource } from '../generated/prisma/index';
import { specialFundOf } from './office-sheet.js';

const pa = (...fundSources: FundSource[]) => ({ fundSources });

describe('specialFundOf', () => {
  it("reads the program's own special fund first", () => {
    expect(
      specialFundOf({
        fundSources: [FundSource.GF, FundSource.LDF],
        activities: [],
      }),
    ).toBe(FundSource.LDF);
  });

  it('is null for an ordinary fund', () => {
    expect(
      specialFundOf({
        fundSources: [FundSource.GF],
        activities: [pa(FundSource.GF)],
      }),
    ).toBeNull();
  });

  it("takes the PPAs' fund only when every PPA carries it", () => {
    expect(
      specialFundOf({
        fundSources: [],
        activities: [
          pa(FundSource.LDRRMF),
          pa(FundSource.LDRRMF, FundSource.GF),
        ],
      }),
    ).toBe(FundSource.LDRRMF);
    expect(
      specialFundOf({
        fundSources: [],
        activities: [pa(FundSource.LDRRMF), pa(FundSource.GF)],
      }),
    ).toBeNull();
    expect(specialFundOf({ fundSources: [], activities: [] })).toBeNull();
  });
});
