import type { SpecialFundRecord } from '@/lib/api';
import { formatPeso } from '@/lib/currency-formatter';

const FLAG_TEXT = {
  STATED_WITHOUT_PPAS: 'stated, no PPAs',
  STATED_DIFFERS: 'stated amount differs from its programs',
} as const;

export function SpecialFundFlag({ flag }: { flag: keyof typeof FLAG_TEXT }) {
  return (
    <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
      {FLAG_TEXT[flag]}
    </span>
  );
}

/**
 * Special funds carrying a stated amount (specs/008 FR-044): their own line on
 * the staff side, flagged — the money is not in the program totals around it,
 * and it is never shown to the public. Renders nothing when no fund has one.
 */
export function SpecialFundsNotice({ funds }: { funds: SpecialFundRecord[] }) {
  const stated = funds.filter((f) => f.statedAmount !== null);
  if (stated.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <p className="font-medium text-amber-900">Special funds with a stated amount</p>
      <p className="mt-0.5 text-xs text-amber-800">
        Printed on LBP Form 7 as lump sums. Not included in the program totals
        on this page or anywhere on the public site.
      </p>
      <ul className="mt-2 space-y-1">
        {stated.map((fund) => (
          <li key={fund.fund} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-amber-950">{fund.fund}</span>
            <span className="tabular-nums text-amber-950">{formatPeso(fund.statedAmount!)}</span>
            {fund.flags.map((flag) => (
              <SpecialFundFlag key={flag} flag={flag} />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
