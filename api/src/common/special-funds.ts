import { FundSource } from '../generated/prisma/index';

/** Form 7's lump-sum rows, in the order the FY2026 ordinance prints them. */
export const SPECIAL_FUNDS: { fund: FundSource; name: string }[] = [
  { fund: FundSource.SPA, name: 'Special Purpose Appropriation' },
  { fund: FundSource.LDF, name: '20% Development Fund' },
  {
    fund: FundSource.LDRRMF,
    name: '5% Local Disaster Risk Reduction and Management Fund',
  },
];

export const isSpecialFund = (fund: string): fund is FundSource =>
  SPECIAL_FUNDS.some((f) => f.fund === fund);
